import robotsParser from 'robots-parser';
import { setTimeout as delay } from 'node:timers/promises';
import { analyzeHtml, type Evidence, type Venue } from './analyze';
import { BOT, canonicalAlias, inScope, permissionFor, websiteUrl, type CrawlPolicy, type SitePolicy } from './policy';
import { isAccessChallenge, publicHttp, type PageResponse, type Transport } from './http';
import { discoveredSite, inspectSourcePage, publicFactsSite, type SourceAssessment, type SourceProof } from './source-policy';

export interface CrawlResult {
  placeId: string; slug: string; website: string | null;
  outcome: 'no_website' | 'invalid_url' | 'permission_missing' | 'planned' | 'completed' | 'partial' | 'blocked' | 'cancelled';
  evidence: Evidence[];
  pages: { url: string; outcome: string; retrievedAt: string; contentHash?: string }[];
  coverage: 'not_started' | 'bounded_html_only';
  reason?: string;
  sourceAssessment?: SourceAssessment;
  entryUrl?: string;
  partialReasons?: string[];
}
const errorCode = (error: unknown) => error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'FETCH_FAILED';

export class CardCrawler {
  private lastRequest = new Map<string, number>();
  private robots = new Map<string, Promise<ReturnType<typeof robotsParser>>>();
  private stopped = new Map<string, string>();
  private requests = new Map<string, number>();
  private cached = new Map<string, PageResponse>();
  private cachedBytes = 0;
  private sourceAssessments = new Map<string, Promise<SourceAssessment>>();
  private automaticSites = new Map<string, SitePolicy>();
  private factualVenues = new Map<string, Set<string>>();
  constructor(private policy: CrawlPolicy, private options: {
    transport?: Transport; wait?: (ms: number) => Promise<unknown>; now?: () => number;
    signal?: AbortSignal; maxRequestsPerOrigin?: number; discoverSources?: boolean; allowPublicFacts?: boolean;
  } = {}) {}

  /** Includes only live permissions actually discovered during this run. */
  policySnapshot(): CrawlPolicy {
    return { ...this.policy, sites: [...this.policy.sites, ...this.automaticSites.values()] };
  }

  private async get(url: URL, site: SitePolicy, interval = site.minDelayMs): Promise<PageResponse> {
    const bucket = url.hostname.replace(/^www\./, '');
    if (this.options.signal?.aborted) throw new Error('CANCELLED');
    if (this.stopped.has(bucket)) throw new Error(this.stopped.get(bucket));
    const cached = this.cached.get(url.href);
    if (cached) return cached;
    const count = this.requests.get(bucket) ?? 0;
    if (count >= (this.options.maxRequestsPerOrigin ?? 100)) throw new Error('ORIGIN_REQUEST_LIMIT');
    const now = this.options.now ?? Date.now;
    const remaining = (this.lastRequest.get(bucket) ?? -Infinity) + interval - now();
    if (remaining > 0) await (this.options.wait ?? ((ms) => delay(ms, undefined, { signal: this.options.signal })))(remaining);
    this.lastRequest.set(bucket, now());
    this.requests.set(bucket, count + 1);
    let response: PageResponse;
    const userAgent = `${BOT}/1.0 (sports-card evidence;${this.policy.contactUrl ? ` +${this.policy.contactUrl}` : ' public HTML only'})`;
    try { response = await (this.options.transport ?? publicHttp)(url, userAgent, this.options.signal); }
    catch (error) { this.stopped.set(bucket, errorCode(error)); throw error; }
    response = { ...response, retrievedAt: new Date().toISOString() };
    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      const reason = `HTTP_${response.status}`;
      this.stopped.set(bucket, reason); throw new Error(reason);
    }
    while (this.cached.size && this.cachedBytes + response.body.length > 20_000_000) {
      const first = this.cached.keys().next().value!;
      this.cachedBytes -= this.cached.get(first)!.body.length;
      this.cached.delete(first);
    }
    this.cached.set(url.href, response);
    this.cachedBytes += response.body.length;
    return response;
  }

  private async robotRules(site: SitePolicy) {
    let promise = this.robots.get(site.origin);
    if (!promise) {
      promise = (async () => {
        let url = new URL('/robots.txt', site.origin);
        for (let hops = 0; hops <= 3; hops++) {
          const response = await this.get(url, site);
          if (response.status === 404 || response.status === 410) return robotsParser(url.href, '');
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const target = websiteUrl(new URL(response.headers.location, url).href);
            if (!canonicalAlias(url, target) || target.pathname !== '/robots.txt') throw new Error('ROBOTS_REDIRECT_BLOCKED');
            url = target; continue;
          }
          const text = response.body.toString('utf8').replace(/^\uFEFF/, '');
          if (response.status !== 200 || text.trimStart().startsWith('<')
            || (!/^text\/plain(?:;|$)/i.test(response.headers['content-type'] ?? '') && !/^\s*user-agent\s*:/im.test(text)))
            throw new Error('ROBOTS_UNAVAILABLE');
          return robotsParser(url.href, text);
        }
        throw new Error('ROBOTS_REDIRECT_LIMIT');
      })();
      this.robots.set(site.origin, promise);
    }
    return promise;
  }

  private async discoverSource(origin: string): Promise<SourceAssessment> {
    let pending = this.sourceAssessments.get(origin);
    if (!pending) {
      pending = this.assessSource(origin);
      this.sourceAssessments.set(origin, pending);
    }
    return pending;
  }

  private async assessSource(origin: string): Promise<SourceAssessment> {
    const result: SourceAssessment = { origin, decision: 'uncertain', reason: 'no_explicit_reuse_permission', checked: [] };
    // This provisional scope is ONLY for a bounded policy inspection, never claim publication.
    const probe: SitePolicy = { origin, basis: 'reviewed_terms', evidence: 'Policy inspection only; not a reuse permission',
      reviewedAt: new Date().toISOString().slice(0, 10), validUntil: new Date().toISOString().slice(0, 10),
      allowedPaths: ['/'], minDelayMs: 3000, maxPages: 4 };
    try {
      const queue = [new URL('/', origin).href], visited = new Set<string>();
      const proofs: SourceProof[] = [];
      let incomplete = false;
      while (queue.length && visited.size < probe.maxPages) {
        const href = queue.shift()!;
        if (visited.has(href)) continue;
        visited.add(href);
        const url = new URL(href);
        const rules = await this.robotRules({ ...probe, origin: url.origin });
        const crawlDelay = (rules.getCrawlDelay(BOT) ?? rules.getCrawlDelay('*') ?? 0) * 1000;
        if (!Number.isFinite(crawlDelay) || crawlDelay > 60_000) throw new Error('CRAWL_DELAY_TOO_LONG');
        const interval = Math.max(probe.minDelayMs, crawlDelay);
        let retrievedAt = new Date().toISOString();
        if (!inScope(url, probe) || rules.isAllowed(href, BOT) === false) {
          result.checked.push({ url: href, outcome: 'robots_or_scope_blocked', retrievedAt });
          result.decision = 'blocked'; result.reason = 'SOURCE_POLICY_ROBOTS_BLOCKED'; return result;
        }
        const response = await this.get(url, probe, interval);
        retrievedAt = response.retrievedAt ?? retrievedAt;
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const target = websiteUrl(new URL(response.headers.location, url).href);
          if (!canonicalAlias(url, target) || !inScope(target, { ...probe, origin: target.origin }))
            throw new Error('SOURCE_POLICY_REDIRECT_BLOCKED');
          probe.origin = target.origin;
          queue.unshift(target.href);
          result.checked.push({ url: href, outcome: 'redirect', retrievedAt }); continue;
        }
        if (response.status !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] ?? '')) {
          result.checked.push({ url: href, outcome: `HTTP_${response.status}_or_unsupported_content`, retrievedAt });
          incomplete = true; continue;
        }
        if (isAccessChallenge(response)) {
          this.stopped.set(url.hostname.replace(/^www\./, ''), 'ACCESS_CHALLENGE'); throw new Error('ACCESS_CHALLENGE');
        }
        const parsed = inspectSourcePage(response.body, href, retrievedAt, response.headers['content-type']);
        const restricted = parsed.restricted || /\b(?:nosnippet|noarchive|noai)\b/i.test(response.headers['x-robots-tag'] ?? '')
          || response.headers['tdm-reservation']?.trim() === '1';
        result.checked.push({ url: href, outcome: restricted ? 'content_restricted' : 'policy_checked', retrievedAt, contentHash: parsed.contentHash });
        if (restricted || parsed.blocked) {
          result.decision = 'blocked'; result.reason = restricted ? 'SOURCE_POLICY_CONTENT_RESTRICTED' : 'SOURCE_POLICY_EXPLICIT_BAN'; return result;
        }
        proofs.push(...parsed.proofs);
        if (!/\bnofollow\b/i.test(response.headers['x-robots-tag'] ?? ''))
          for (const link of parsed.links) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
      if (incomplete || queue.length) { result.reason = 'SOURCE_POLICY_INCOMPLETE'; return result; }
      if (proofs.length) {
        result.proof = proofs[0];
        result.policy = discoveredSite(probe.origin, proofs[0]);
        result.decision = 'allowed'; result.reason = 'explicit_scoped_reuse_permission';
        this.automaticSites.set(probe.origin, result.policy);
      } else if (this.options.allowPublicFacts) {
        result.policy = publicFactsSite(probe.origin, new Date().toISOString());
        result.decision = 'facts_only'; result.reason = 'PUBLIC_FACTS_NO_DETECTED_RESTRICTIONS';
        this.automaticSites.set(probe.origin, result.policy);
      }
    } catch (error) {
      result.decision = 'blocked'; result.reason = errorCode(error);
    }
    return result;
  }

  async scan(venue: Venue, dryRun = false): Promise<CrawlResult> {
    const result: CrawlResult = { placeId: venue.id, slug: venue.slug, website: venue.website,
      outcome: 'no_website', evidence: [], pages: [], coverage: 'not_started' };
    if (!venue.website?.trim()) return result;
    let entry: URL;
    try { entry = websiteUrl(venue.website.trim()); }
    catch { return { ...result, outcome: 'invalid_url' }; }
    let site = permissionFor(entry, this.policySnapshot());
    const canDiscover = this.options.discoverSources && !this.policy.sites.some((item) => item.origin === entry.origin);
    if (dryRun) return { ...result, outcome: site || canDiscover ? 'planned' : 'permission_missing',
      ...(!site && canDiscover ? { reason: 'SOURCE_POLICY_CHECK_PENDING' } : {}) };
    if (canDiscover) {
      result.sourceAssessment = await this.discoverSource(entry.origin);
      if (result.sourceAssessment.decision === 'blocked') return { ...result,
        outcome: this.options.signal?.aborted ? 'cancelled' : 'blocked', reason: result.sourceAssessment.reason };
      if (result.sourceAssessment.policy && result.sourceAssessment.policy.origin !== entry.origin) {
        entry = websiteUrl(new URL(entry.pathname, result.sourceAssessment.policy.origin).href);
        result.entryUrl = entry.href;
      }
      site = permissionFor(entry, this.policySnapshot());
    }
    if (!site) return { ...result, outcome: 'permission_missing', reason: result.sourceAssessment?.reason };
    if (site.basis === 'public_facts') {
      const bucket = new URL(site.origin).hostname.replace(/^www\./, '');
      const ids = this.factualVenues.get(bucket) ?? new Set<string>();
      if (ids.size >= 5 && !ids.has(venue.id)) return { ...result, outcome: 'blocked', reason: 'PUBLIC_FACT_VENUE_LIMIT' };
      ids.add(venue.id); this.factualVenues.set(bucket, ids);
    }
    try {
      let rules = await this.robotRules(site);
      const crawlDelay = (rules.getCrawlDelay(BOT) ?? rules.getCrawlDelay('*') ?? 0) * 1000;
      if (!Number.isFinite(crawlDelay) || crawlDelay > 60_000) throw new Error('CRAWL_DELAY_TOO_LONG');
      let interval = Math.max(site.minDelayMs, crawlDelay);
      const queue = [entry.href], visited = new Set<string>();
      result.coverage = 'bounded_html_only';
      let incomplete = false;
      const partialReasons = new Set<string>();
      while (queue.length && visited.size < site.maxPages) {
        const href = queue.shift()!;
        if (visited.has(href)) continue;
        visited.add(href);
        const url = new URL(href);
        let retrievedAt = new Date().toISOString();
        if (!inScope(url, site) || rules.isAllowed(href, BOT) === false) {
          result.pages.push({ url: href, outcome: 'robots_or_scope_blocked', retrievedAt }); incomplete = true;
          partialReasons.add('robots_or_scope_blocked'); continue;
        }
        const response = await this.get(url, site, interval);
        retrievedAt = response.retrievedAt ?? retrievedAt;
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const target = websiteUrl(new URL(response.headers.location, url).href);
          if (!inScope(target, site) && canonicalAlias(url, target) && canDiscover) {
            let targetSite = permissionFor(target, this.policySnapshot());
            if (!targetSite && !this.policy.sites.some((item) => item.origin === target.origin)) {
              const assessment = await this.discoverSource(target.origin);
              if (assessment.policy) { targetSite = assessment.policy; result.sourceAssessment = assessment; }
            }
            if (targetSite && inScope(target, targetSite)) {
              site = targetSite;
              result.entryUrl = new URL(websiteUrl(venue.website).pathname, site.origin).href;
              rules = await this.robotRules(site);
              const nextDelay = (rules.getCrawlDelay(BOT) ?? rules.getCrawlDelay('*') ?? 0) * 1000;
              if (!Number.isFinite(nextDelay) || nextDelay > 60_000) throw new Error('CRAWL_DELAY_TOO_LONG');
              interval = Math.max(site.minDelayMs, nextDelay);
            }
          }
          if (!inScope(target, site)) { result.pages.push({ url: href, outcome: 'redirect_blocked', retrievedAt }); incomplete = true; partialReasons.add('redirect_blocked'); }
          else { queue.unshift(target.href); result.pages.push({ url: href, outcome: 'redirect', retrievedAt }); }
          continue;
        }
        if (response.status !== 200) { result.pages.push({ url: href, outcome: `HTTP_${response.status}`, retrievedAt }); incomplete = true; partialReasons.add('http_error'); continue; }
        if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] ?? '')) {
          result.pages.push({ url: href, outcome: 'unsupported_content_type', retrievedAt }); incomplete = true; partialReasons.add('unsupported_content_type'); continue;
        }
        if (isAccessChallenge(response)) {
          this.stopped.set(url.hostname.replace(/^www\./, ''), 'ACCESS_CHALLENGE'); throw new Error('ACCESS_CHALLENGE');
        }
        if (/\b(?:nosnippet|noarchive|noai)\b/i.test(response.headers['x-robots-tag'] ?? '')
          || response.headers['tdm-reservation']?.trim() === '1') {
          result.pages.push({ url: href, outcome: 'content_restricted', retrievedAt }); incomplete = true; partialReasons.add('content_restricted'); continue;
        }
        const parsed = analyzeHtml(response.body, href, venue, site, retrievedAt, response.headers['content-type']);
        result.pages.push({ url: href, outcome: parsed.restricted ? 'content_restricted' : 'analyzed', retrievedAt, contentHash: parsed.contentHash });
        incomplete ||= parsed.restricted;
        if (parsed.restricted) partialReasons.add('content_restricted');
        result.evidence.push(...parsed.evidence);
        if (!/\bnofollow\b/i.test(response.headers['x-robots-tag'] ?? ''))
          for (const link of parsed.links) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
      incomplete ||= queue.length > 0;
      if (queue.length) partialReasons.add('page_limit');
      // Different pages can contradict one another; retain both pieces of evidence.
      for (const item of result.evidence) {
        if (result.evidence.some((other) => other.provider === item.provider
          && other.suggestedStatus !== 'unknown' && item.suggestedStatus !== 'unknown'
          && (other.suggestedStatus === 'not_accepted') !== (item.suggestedStatus === 'not_accepted'))) {
          item.reasons.push('conflicting_sources');
          item.decision = 'ambiguous';
        }
      }
      result.outcome = incomplete ? 'partial' : 'completed';
      if (incomplete) result.partialReasons = [...partialReasons];
    } catch (error) {
      result.outcome = this.options.signal?.aborted ? 'cancelled' : 'blocked';
      result.reason = errorCode(error);
    }
    return result;
  }
}

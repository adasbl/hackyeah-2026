import { CARD_PROVIDER_SLUGS, type CardProviderSlug } from '@repo/types';
import type { placeCardClaims } from '../../db/schema';
import type { Evidence, Venue } from './analyze';
import type { CrawlResult } from './crawl';
import { canonicalAlias, inScope, permissionFor, websiteUrl, type CrawlPolicy } from './policy';
import { factConditions } from './fact-conditions';

export interface ClaimDecision {
  provider: CardProviderSlug;
  action: 'publish' | 'invalidate' | 'skip';
  reason: string;
  evidence: Evidence | null;
  permissionValidUntil?: string;
  factOnly?: boolean;
  factualConditions?: string | null;
}
export type ExistingClaim = Pick<typeof placeCardClaims.$inferSelect,
  'status' | 'sourceType' | 'expiresAt' | 'verifiedAt' | 'sourceUrl' | 'sourceQuote' | 'conditions' | 'confidence'>
  & { updatedAt?: Date };
export type ClaimPatch = Pick<typeof placeCardClaims.$inferInsert,
  'status' | 'sourceType' | 'expiresAt' | 'verifiedAt' | 'sourceUrl' | 'sourceQuote' | 'conditions' | 'confidence'>;

export function decideClaims(result: CrawlResult, venue: Venue, policy: CrawlPolicy, now = new Date()): ClaimDecision[] {
  if (result.placeId !== venue.id || result.website !== venue.website) throw new Error('CARD_SCAN_TARGET_MISMATCH');
  const incomplete = (): ClaimDecision[] => CARD_PROVIDER_SLUGS.map((provider) => ({
    provider, action: 'skip', reason: 'incomplete_scan', evidence: null,
  }));
  const bounded = result.outcome === 'partial' && result.partialReasons?.length === 1
    && result.partialReasons[0] === 'page_limit' && result.pages.every((page) => ['analyzed', 'redirect'].includes(page.outcome));
  if ((result.outcome !== 'completed' && !bounded) || !venue.website) return incomplete();
  const original = websiteUrl(venue.website);
  const entry = result.entryUrl ? websiteUrl(result.entryUrl) : original;
  if (!canonicalAlias(original, entry) || entry.pathname !== original.pathname) throw new Error('CARD_SCAN_TARGET_MISMATCH');
  const site = entry ? permissionFor(entry, policy, now) : null;
  return CARD_PROVIDER_SLUGS.map((provider) => {
    const skip = (reason: string): ClaimDecision => ({ provider, action: 'skip', reason, evidence: null });
    if (!site) return skip('permission_missing');
    const evidence = result.evidence.filter((item) => item.provider === provider && inScope(websiteUrl(item.sourceUrl), site)
      && result.pages.some((page) => page.url === item.sourceUrl && page.outcome === 'analyzed'
        && page.contentHash === item.contentHash && page.retrievedAt === item.retrievedAt));
    const known = evidence.filter((item) => item.suggestedStatus !== 'unknown');
    if (!known.length) return skip('no_explicit_evidence');
    const fresh = (item: Evidence) => now.getTime() - Date.parse(item.retrievedAt) <= 86_400_000
      && Date.parse(item.retrievedAt) <= now.getTime();
    const confirmed = known.filter((item) => fresh(item) && item.reasons.every((reason) => reason === 'conflicting_sources')
      && item.identitySignals.includes('name') && (item.identitySignals.includes('phone')
        || (item.identitySignals.includes('street_house_number') && item.identitySignals.includes('city'))));
    const conflict = confirmed.some((item) => item.suggestedStatus === 'not_accepted')
      && confirmed.some((item) => ['accepted', 'conditional'].includes(item.suggestedStatus));
    if (conflict) return { provider, action: 'invalidate', reason: 'conflicting_sources', evidence: known[0] };
    const eligible = known.filter((item) => item.decision === 'eligible' && !item.reasons.length && fresh(item));
    // A second ambiguous mention may contain a restriction or concern a different branch.
    if (evidence.some((item) => item.decision !== 'eligible')) return skip('ambiguous_context');
    if (!eligible.length) return skip('identity_or_freshness_unconfirmed');
    const conditional = eligible.filter((item) => item.suggestedStatus === 'conditional');
    if (new Set(conditional.map((item) => item.conditions)).size > 1) return skip('different_conditions');
    const selected = conditional[0] ?? eligible[0];
    const factOnly = site.basis === 'public_facts';
    const factualConditions = factOnly && selected.conditions ? factConditions(selected.conditions) : null;
    if (factOnly && selected.suggestedStatus === 'conditional' && !factualConditions) return skip('unrecognized_factual_conditions');
    if (selected.suggestedStatus === 'not_accepted' && selected.conditions) return skip('restricted_rejection_not_global');
    return { provider, action: 'publish', reason: 'explicit_venue_statement', evidence: selected,
      permissionValidUntil: site.validUntil, factOnly, factualConditions };
  });
}

export function claimPatch(decision: ClaimDecision, existing: ExistingClaim | undefined, now = new Date()): ClaimPatch | null {
  if (decision.action === 'skip' || !decision.evidence) return null;
  // Keep current direct confirmations; automated runs can refresh automated or expired records.
  if (existing && existing.status !== 'unknown' && existing.sourceType !== 'automated'
    && (!existing.expiresAt || existing.expiresAt > now)) return null;
  const evidence = decision.evidence;
  if (existing?.sourceType === 'automated' && existing.verifiedAt && existing.verifiedAt > new Date(evidence.retrievedAt)) return null;
  if (existing?.sourceType === 'automated' && existing.status === 'unknown' && !existing.verifiedAt
    && existing.updatedAt && existing.updatedAt > new Date(evidence.retrievedAt)) return null;
  if (decision.action === 'invalidate') {
    if (!existing || existing.sourceType !== 'automated' || existing.status === 'unknown') return null;
    return { status: 'unknown', sourceType: 'automated', confidence: 'low', conditions: null,
      sourceUrl: evidence.sourceUrl, sourceQuote: 'Sprzeczne deklaracje na stronie obiektu.', verifiedAt: null, expiresAt: now };
  }
  const verifiedAt = new Date(evidence.retrievedAt);
  return { status: evidence.suggestedStatus, sourceType: 'automated', confidence: 'medium',
    conditions: evidence.suggestedStatus === 'conditional' ? decision.factOnly ? decision.factualConditions : evidence.conditions : null,
    sourceUrl: evidence.sourceUrl, sourceQuote: decision.factOnly ? null : evidence.excerpt, verifiedAt,
    expiresAt: new Date(Math.min(verifiedAt.getTime() + 30 * 86_400_000,
      decision.permissionValidUntil ? Date.parse(`${decision.permissionValidUntil}T23:59:59.999Z`) : Infinity)) };
}

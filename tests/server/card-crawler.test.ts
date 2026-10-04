import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeHtml, identitySignals, type Venue } from '../../src/server/card-crawler/analyze';
import { CardCrawler } from '../../src/server/card-crawler/crawl';
import { isPublicAddress, publicHttp, type PageResponse, type Transport } from '../../src/server/card-crawler/http';
import { crawlPolicySchema, inScope, permissionFor, websiteUrl, type CrawlPolicy } from '../../src/server/card-crawler/policy';

const venue: Venue = { id: 'id', slug: 'test-gym', name: 'Test Gym', website: 'https://gym.example/oddzial',
  city: 'Warszawa', addressStreet: 'Testowa', addressHouseNumber: '2', phone: '+48123456789' };
const today = new Date().toISOString().slice(0, 10);
const policy: CrawlPolicy = crawlPolicySchema.parse({ version: 1, contactUrl: 'https://finder.example/crawler', sites: [{
  origin: 'https://gym.example', basis: 'permission', evidence: 'Written permission from the owner',
  reviewedAt: today, validUntil: '2099-12-31', allowedPaths: ['/'], minDelayMs: 2000, maxPages: 5,
}] });
const site = policy.sites[0];
const response = (body = '', status = 200, headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' }): PageResponse => ({
  status, headers, body: Buffer.from(body),
});
const page = (text: string) => Buffer.from(`<html><body><main><p>Test Gym, Testowa 2, Warszawa</p><p>${text}</p></main></body></html>`);
const analyze = (text: string) => analyzeHtml(page(text), venue.website!, venue, site).evidence;
function harness(routes: Record<string, PageResponse>, customPolicy = policy, maxRequestsPerOrigin = 100) {
  const requests: string[] = [], waits: number[] = [];
  let now = 0;
  const transport: Transport = async (url) => {
    requests.push(url.href);
    assert.ok(routes[url.href], `Unexpected request ${url.href}`);
    return routes[url.href];
  };
  const crawler = new CardCrawler(customPolicy, { transport, now: () => now,
    wait: async (ms) => { waits.push(ms); now += ms; }, maxRequestsPerOrigin });
  return { crawler, requests, waits };
}
const robots = response('User-agent: *\nAllow: /', 200, { 'content-type': 'text/plain' });

test('explicit acceptance with venue identity is eligible for automatic publication', () => {
  const findings = analyze('Honorujemy karty MultiSport i Medicover Sport');
  assert.deepEqual(findings.map((f) => f.provider), ['multisport', 'medicover-sport']);
  assert.ok(findings.every((f) => f.suggestedStatus === 'accepted' && f.decision === 'eligible'));
  assert.ok(findings.every((f) => f.identitySignals.includes('street_house_number')));
});
test('variants and limits are retained for conditional claims', () => {
  const [finding] = analyze('Honorujemy MultiSport Plus z dopłatą 10 zł za 60 minut');
  assert.equal(finding.suggestedStatus, 'conditional');
  assert.match(finding.excerpt, /Plus.*10 zł.*60 minut/);
});
test('negations and questions cannot become positive evidence', () => {
  assert.equal(analyze('Nie honorujemy MultiSport')[0].suggestedStatus, 'not_accepted');
  for (const text of ['Czy honorujemy MultiSport?', 'Wkrótce będziemy honorować MultiSport',
    'Dawniej honorujemy MultiSport', 'Honorujemy MultiSport, ale nie we wszystkich oddziałach',
    'Nie honorujemy MultiSport, honorujemy BeActive']) {
    assert.ok(analyze(text).every((f) => !['accepted', 'conditional'].includes(f.suggestedStatus)), text);
  }
  assert.equal(analyze('Akceptujemy wyłącznie MultiSport Plus')[0].suggestedStatus, 'conditional');
});
test('provider names, logos, script content and generic card mentions are not acceptance', () => {
  assert.equal(analyze('MultiSport')[0].suggestedStatus, 'unknown');
  assert.equal(analyze('Akceptujemy karty sportowe').length, 0);
  const parsed = analyzeHtml(Buffer.from('<img alt="Honorujemy MultiSport"><script>Honorujemy BeActive</script><footer>Honorujemy PZU Sport</footer>'), venue.website!, venue, site);
  assert.equal(parsed.evidence.length, 0);
});
test('inline markup, HTML entities and Unicode work', () => {
  const [finding] = analyze('Honorujemy <strong>BeActive</strong>&nbsp;bezpłatnie');
  assert.equal(finding.provider, 'beactive');
  assert.equal(finding.suggestedStatus, 'accepted');
});
test('branch identity cannot be inferred from the network name alone', () => {
  const parsed = analyzeHtml(Buffer.from('<p>Test Gym honoruje MultiSport</p>'), venue.website!, venue, site);
  assert.ok(parsed.evidence[0].reasons.includes('branch_identity_unconfirmed'));
  assert.ok(!identitySignals('Testowa 20, Warszawa', venue).includes('street_house_number'));
  assert.ok(!identitySignals('12 klientów 345 wizyt 6789 punktów', venue).includes('phone'));
});
test('evidence length is bounded and long ambiguous blocks cannot publish automatically', () => {
  const [finding] = analyze('Honorujemy MultiSport ' + 'warunki '.repeat(100));
  assert.equal(finding.suggestedStatus, 'unknown');
  assert.ok(finding.excerpt.length <= 240);
});
test('links stay on authorized origin and respect nofollow and path boundaries', () => {
  const parsed = analyzeHtml(Buffer.from('<a href="/cennik">Cennik</a><a href="https://other.example/cennik">Oferta</a>'
    + '<a href="/faq" rel="nofollow">FAQ</a><a href="/login">Karty</a><a href="/regulamin?token=secret">Regulamin</a>'), venue.website!, venue, site);
  assert.deepEqual(parsed.links, ['https://gym.example/cennik']);
  assert.equal(inScope(new URL('https://gym.example/oddzial2'), { ...site, allowedPaths: ['/oddzial'] }), false);
});
test('noarchive and nosnippet directives suppress content evidence', () => {
  const result = analyzeHtml(Buffer.from('<meta name="robots" content="noarchive"><p>Honorujemy MultiSport</p>'), venue.website!, venue, site);
  assert.equal(result.restricted, true);
  assert.equal(result.evidence.length, 0);
});
test('unsafe URLs and expired permissions are rejected', () => {
  for (const value of ['file:///tmp/test', 'https://user:pass@gym.example', 'https://gym.example/?token=secret', 'https://gym.example:5432'])
    assert.throws(() => websiteUrl(value));
  assert.equal(permissionFor(new URL(venue.website!), { ...policy, sites: [{ ...site, validUntil: '2000-01-01' }] }), null);
  assert.equal(permissionFor(new URL(venue.website!), { ...policy, sites: [{ ...site, reviewedAt: '2090-01-01' }] }), null);
});
test('private, mapped, reserved and local network addresses are blocked', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '192.0.2.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1'])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(publicHttp(new URL('http://127.0.0.1/'), 'TestBot'), /PRIVATE_NETWORK_BLOCKED/);
});
test('without permission and in dry-run no HTTP requests are sent', async () => {
  const { crawler, requests } = harness({});
  assert.equal((await crawler.scan(venue, true)).outcome, 'planned');
  assert.equal((await crawler.scan({ ...venue, website: 'https://other.example/' })).outcome, 'permission_missing');
  assert.equal((await crawler.scan({ ...venue, website: null })).outcome, 'no_website');
  assert.deepEqual(requests, []);
});
test('robots disallow blocks the page, and specific bot rules win over wildcard', async () => {
  const { crawler, requests } = harness({ 'https://gym.example/robots.txt': response('User-agent: *\nAllow: /\nUser-agent: FitPassEvidenceBot\nDisallow: /', 200, { 'content-type': 'text/plain' }) });
  const result = await crawler.scan(venue);
  assert.equal(result.pages[0].outcome, 'robots_or_scope_blocked');
  assert.deepEqual(requests, ['https://gym.example/robots.txt']);
});
test('crawl-delay and HTTP cache apply across different venues on one domain', async () => {
  const { crawler, requests, waits } = harness({
    'https://gym.example/robots.txt': response('User-agent: *\nCrawl-delay: 4\nAllow: /', 200, { 'content-type': 'text/plain' }),
    [venue.website!]: response('<p>Honorujemy MultiSport</p>'),
  });
  assert.equal((await crawler.scan(venue)).evidence.length, 1);
  await crawler.scan({ ...venue, id: 'another-id' });
  assert.deepEqual(waits, [4000]);
  assert.equal(requests.length, 2);
});
test('missing robots allows licensed pages; unavailable robots does not', async () => {
  const ok = harness({ 'https://gym.example/robots.txt': response('', 404), [venue.website!]: response('') });
  assert.equal((await ok.crawler.scan(venue)).outcome, 'completed');
  for (const robot of [response('', 403), response('', 500), response('<html>404</html>')]) {
    const blocked = harness({ 'https://gym.example/robots.txt': robot });
    assert.equal((await blocked.crawler.scan(venue)).outcome, 'blocked');
    assert.equal(blocked.requests.length, 1);
  }
});
test('external redirects are not followed and redirected paths must pass robots again', async () => {
  const external = harness({ 'https://gym.example/robots.txt': robots,
    [venue.website!]: response('', 302, { location: 'http://127.0.0.1/' }) });
  assert.equal((await external.crawler.scan(venue)).pages[0].outcome, 'redirect_blocked');
  assert.equal(external.requests.length, 2);
  const hidden = harness({ 'https://gym.example/robots.txt': response('User-agent: *\nDisallow: /private', 200, { 'content-type': 'text/plain' }),
    [venue.website!]: response('', 302, { location: '/private' }) });
  assert.equal((await hidden.crawler.scan(venue)).pages[1].outcome, 'robots_or_scope_blocked');
  assert.equal(hidden.requests.length, 2);
});
test('HTTP 429 stops subsequent requests to the domain, without retries', async () => {
  const { crawler, requests } = harness({ 'https://gym.example/robots.txt': robots, [venue.website!]: response('', 429) });
  assert.equal((await crawler.scan(venue)).reason, 'HTTP_429');
  assert.equal((await crawler.scan(venue)).reason, 'HTTP_429');
  assert.equal(requests.length, 2);
});
test('CAPTCHA is reported and never bypassed', async () => {
  const { crawler, requests } = harness({ 'https://gym.example/robots.txt': robots, [venue.website!]: response('<html>Verify you are human CAPTCHA</html>') });
  assert.equal((await crawler.scan(venue)).reason, 'ACCESS_CHALLENGE');
  assert.equal(requests.length, 2);
});
test('bounded crawling reports partial coverage and contradictions', async () => {
  const { crawler, requests } = harness({
    'https://gym.example/robots.txt': robots,
    [venue.website!]: response('<p>Honorujemy MultiSport</p><a href="/cennik">Cennik</a><a href="/faq">FAQ</a>'),
    'https://gym.example/cennik': response('<p>Nie honorujemy MultiSport</p>'),
  }, { ...policy, sites: [{ ...site, maxPages: 2 }] });
  const result = await crawler.scan(venue);
  assert.equal(result.outcome, 'partial');
  assert.ok(result.evidence.every((e) => e.reasons.includes('conflicting_sources')));
  assert.equal(requests.length, 3);
});
test('origin-wide budget stops a domain even across multiple database entries', async () => {
  const { crawler, requests } = harness({ 'https://gym.example/robots.txt': robots, [venue.website!]: response('<a href="/cennik">Cennik</a>') }, policy, 2);
  assert.equal((await crawler.scan(venue)).reason, 'ORIGIN_REQUEST_LIMIT');
  assert.equal(requests.length, 2);
});
test('HTML header directives and cancellation are respected', async () => {
  const restricted = harness({ 'https://gym.example/robots.txt': robots, [venue.website!]: response('<p>Honorujemy MultiSport</p>', 200,
    { 'content-type': 'text/html', 'x-robots-tag': 'nosnippet' }) });
  assert.equal((await restricted.crawler.scan(venue)).evidence.length, 0);
  const controller = new AbortController(); controller.abort();
  const cancelled = await new CardCrawler(policy, { signal: controller.signal }).scan(venue);
  assert.equal(cancelled.outcome, 'cancelled');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { CardCrawler } from '../../src/server/card-crawler/crawl';
import { claimPatch, decideClaims } from '../../src/server/card-crawler/claims';
import { factConditions } from '../../src/server/card-crawler/fact-conditions';
import { inspectSourcePage, discoveredSite } from '../../src/server/card-crawler/source-policy';
import type { Venue } from '../../src/server/card-crawler/analyze';
import type { PageResponse } from '../../src/server/card-crawler/http';
import { isAccessChallenge } from '../../src/server/card-crawler/http';
import { crawlPolicySchema, type CrawlPolicy } from '../../src/server/card-crawler/policy';

const origin = 'https://gym.example';
const cc0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const licensed = `<p>Treści tej witryny są udostępniane na <a href="${cc0}">CC0 1.0</a>.</p>`;
const permitted = '<p>Zezwalamy na automatyczne pobieranie informacji o kartach sportowych z tej witryny '
  + 'oraz ich publikowanie i komercyjne wykorzystanie bez dodatkowych warunków.</p>';
const cards = '<p>Test Gym, Testowa 2, Warszawa</p><p>Honorujemy MultiSport</p>';
const venue: Venue = { id: 'id', slug: 'test-gym', name: 'Test Gym', website: `${origin}/oddzial`,
  city: 'Warszawa', addressStreet: 'Testowa', addressHouseNumber: '2', phone: null };
const policy: CrawlPolicy = { version: 1, sites: [] };
const now = new Date().toISOString();
const inspect = (html: string) => inspectSourcePage(Buffer.from(html), `${origin}/`, now, 'text/html; charset=utf-8');
const response = (html: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html' }): PageResponse => ({
  body: Buffer.from(html), status, headers,
});
const robots = response('User-agent: *\nAllow: /', 200, { 'content-type': 'text/plain' });
function harness(routes: Record<string, PageResponse>, customPolicy = policy, maxRequestsPerOrigin = 100, allowPublicFacts = false) {
  const requests: string[] = [], waits: number[] = [], userAgents: string[] = [];
  let clock = 0;
  const crawler = new CardCrawler(customPolicy, { discoverSources: true, allowPublicFacts, now: () => clock, maxRequestsPerOrigin,
    wait: async (ms) => { waits.push(ms); clock += ms; },
    transport: async (url, userAgent) => {
      requests.push(url.href); userAgents.push(userAgent);
      assert.ok(routes[url.href], `Unexpected request ${url.href}`);
      return routes[url.href];
    } });
  return { crawler, requests, waits, userAgents };
}

test('only a scoped CC0 declaration or unconditional automation AND reuse permission creates proof', () => {
  assert.equal(inspect(licensed).proofs[0].basis, 'license');
  assert.equal(inspect(permitted).proofs[0].basis, 'permission');
  assert.match(inspect(licensed).proofs[0].contentHash, /^[a-f0-9]{64}$/);
  assert.equal(inspect(licensed).proofs[0].licenseUrl, cc0);
  assert.equal(inspect('<p>All content on this website is licensed under <a href="' + cc0 + '">CC0</a>.</p>').proofs.length, 1);
});

test('badges, asset licences, other domains, conditional, hypothetical and hidden permissions are not proof', () => {
  for (const html of [
    `<footer><a href="${cc0}">CC0</a></footer>`,
    `<p>Zdjęcie jest na <a href="${cc0}">CC0</a></p>`,
    licensed.replace(cc0, 'https://evil.example/publicdomain/zero/1.0/'),
    licensed.replace('Treści tej witryny', 'Treści cudzej witryny'),
    licensed.replace('są udostępniane', 'nie są udostępniane'),
    `<blockquote>${licensed}</blockquote>`, `<script>${licensed}</script>`, `<div hidden>${permitted}</div>`,
    '<p>Przykład: ' + permitted.replace(/<\/?p>/g, '') + '</p>',
    permitted.replace('bez dodatkowych warunków', 'pod warunkiem uzyskania zgody'),
    permitted.replace('publikowanie', 'analizowanie'),
    permitted.replace('komercyjne wykorzystanie', 'niekomercyjne wykorzystanie'),
    licensed.replace('CC0', 'CC BY 4.0'),
    `<div>Treści tej witryny są na licencji CC-BY.<p>Zdjęcie jest na <a href="${cc0}">CC0</a>.</p></div>`,
    `<p>Treści tej witryny są na licencji CC-BY. Zdjęcie jest na <a href="${cc0}">CC0</a>.</p>`,
    `<p>Treści tej witryny opisują <a href="${cc0}">CC0</a>.</p>`,
  ]) assert.equal(inspect(html).proofs.length, 0, html);
});

test('prohibitions override a licence and inverse wording is recognized', () => {
  for (const text of ['Zabrania się automatycznego pobierania danych', 'Scraping is prohibited',
    'Automatyczne pobieranie jest zabronione', 'Scraping wymaga naszej uprzedniej zgody', 'Publikowanie jest niedozwolone']) {
    assert.equal(inspect(licensed + `<p>${text}</p>`).blocked, true, text);
    assert.equal(inspect(licensed + `<p>${text}</p>`).proofs.length, 0);
  }
});

test('policy links respect origin, nofollow, fragments, query exclusions, HTML limits and directives', () => {
  const html = '<a href="/regulamin#dane">Regulamin</a><a href="https://other.example/terms">Terms</a>'
    + '<a href="/licencja" rel="nofollow">Licencja</a><a href="/terms.pdf">Terms</a><a href="/privacy?token=x">Privacy</a>';
  assert.deepEqual(inspect(html).links, [`${origin}/regulamin`]);
  assert.equal(inspect('<meta name="robots" content="nosnippet">' + licensed).proofs.length, 0);
  assert.equal(inspect('<meta name="robots" content="nofollow">' + html).links.length, 0);
});

test('empty registry can automatically lead all the way to a publish decision without moderation', async () => {
  const { crawler, requests, waits, userAgents } = harness({
    [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(licensed), [venue.website!]: response(cards),
  });
  const result = await crawler.scan(venue);
  assert.equal(result.sourceAssessment?.decision, 'allowed');
  assert.equal(result.outcome, 'completed');
  assert.equal(decideClaims(result, venue, crawler.policySnapshot())[0].action, 'publish');
  assert.deepEqual(requests, [`${origin}/robots.txt`, `${origin}/`, venue.website]);
  assert.deepEqual(waits, [3000, 3000]);
  assert.ok(userAgents.every((value) => value.startsWith('FitPassEvidenceBot/1.0') && !value.includes('undefined')));
  const repeat = await crawler.scan({ ...venue, id: 'another' });
  assert.equal(repeat.sourceAssessment?.decision, 'allowed');
  assert.equal(requests.length, 3);
});

test('legal pages are inspected before approval and prohibitions stop evidence crawling', async () => {
  const { crawler, requests } = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response(licensed + '<a href="/regulamin">Regulamin</a>'),
    [`${origin}/regulamin`]: response('<p>Zabrania się automatycznego pobierania danych</p>') });
  const result = await crawler.scan(venue);
  assert.equal(result.sourceAssessment?.decision, 'blocked');
  assert.equal(result.reason, 'SOURCE_POLICY_EXPLICIT_BAN');
  assert.equal(crawler.policySnapshot().sites.length, 0);
  assert.ok(!requests.includes(venue.website!));
});

test('a terms-page permission is discovered without interpreting absence of a ban as permission', async () => {
  const { crawler } = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response('<a href="/regulamin">Regulamin</a>'),
    [`${origin}/regulamin`]: response(permitted), [venue.website!]: response(cards) });
  assert.equal((await crawler.scan(venue)).sourceAssessment?.decision, 'allowed');
  const empty = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(cards) });
  const result = await empty.crawler.scan(venue);
  assert.equal(result.sourceAssessment?.decision, 'uncertain');
  assert.equal(result.outcome, 'permission_missing');
  assert.equal(result.evidence.length, 0);
  assert.equal(empty.requests.length, 2);
});

test('dry-run and manual-only mode do not perform eligibility HTTP requests', async () => {
  const auto = harness({});
  const plan = await auto.crawler.scan(venue, true);
  assert.equal(plan.outcome, 'planned');
  assert.equal(plan.reason, 'SOURCE_POLICY_CHECK_PENDING');
  assert.equal(auto.requests.length, 0);
  const manual = new CardCrawler(policy, { transport: async () => { throw new Error('MUST_NOT_FETCH'); } });
  assert.equal((await manual.scan(venue)).outcome, 'permission_missing');
});

test('robots restrictions block probing, and inaccessible terms prevent approval', async () => {
  const disallowed = harness({ [`${origin}/robots.txt`]: response('User-agent: *\nDisallow: /', 200, { 'content-type': 'text/plain' }) });
  assert.equal((await disallowed.crawler.scan(venue)).sourceAssessment?.decision, 'blocked');
  assert.equal(disallowed.requests.length, 1);
  const hidden = harness({ [`${origin}/robots.txt`]: response('User-agent: *\nDisallow: /regulamin', 200, { 'content-type': 'text/plain' }),
    [`${origin}/`]: response(licensed + '<a href="/regulamin">Regulamin</a>') });
  assert.equal((await hidden.crawler.scan(venue)).sourceAssessment?.decision, 'blocked');
  assert.equal(hidden.requests.length, 2);
});

test('bounded or failed policy inspection never publishes a partial permission', async () => {
  const incomplete = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response(licensed + '<a href="/terms">Terms</a>'), [`${origin}/terms`]: response('', 404) });
  assert.equal((await incomplete.crawler.scan(venue)).sourceAssessment?.decision, 'uncertain');
  const many = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response(licensed + [1, 2, 3, 4].map((i) => `<a href="/terms${i}">Terms</a>`).join('')),
    ...Object.fromEntries([1, 2, 3].map((i) => [`${origin}/terms${i}`, response('')])),
  });
  assert.equal((await many.crawler.scan(venue)).reason, 'SOURCE_POLICY_INCOMPLETE');
  assert.equal(many.requests.length, 5);
  assert.equal(many.crawler.policySnapshot().sites.length, 0);
});

test('source assessment uses the same anti-abuse, redirect and budget safeguards as evidence reads', async () => {
  for (const status of [401, 403, 429, 500]) {
    const stopped = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response('', status) });
    assert.equal((await stopped.crawler.scan(venue)).reason, `HTTP_${status}`);
    await stopped.crawler.scan(venue);
    assert.equal(stopped.requests.length, 2);
  }
  const external = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response('', 302, { location: 'http://127.0.0.1/' }) });
  assert.equal((await external.crawler.scan(venue)).reason, 'SOURCE_POLICY_REDIRECT_BLOCKED');
  assert.equal(external.requests.length, 2);
  const capped = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(licensed) }, policy, 2);
  assert.equal((await capped.crawler.scan(venue)).reason, 'ORIGIN_REQUEST_LIMIT');
});

test('explicit registry limits and expired permissions are not silently widened by discovery', async () => {
  const proof = inspect(licensed).proofs[0];
  const site = discoveredSite(origin, proof);
  assert.equal(crawlPolicySchema.parse({ version: 1, sites: [site] }).sites.length, 1);
  const scoped = harness({}, { ...policy, sites: [{ ...site, allowedPaths: ['/other'] }] });
  assert.equal((await scoped.crawler.scan(venue)).outcome, 'permission_missing');
  assert.equal(scoped.requests.length, 0);
  const expired = harness({}, { ...policy, sites: [{ ...site, validUntil: '2000-01-01' }] });
  assert.equal((await expired.crawler.scan(venue)).outcome, 'permission_missing');
});

test('policy CAPTCHA, response directives, cancellation and redirected robots paths are respected', async () => {
  for (const restricted of [response('Verify you are human CAPTCHA'),
    response(licensed, 200, { 'content-type': 'text/html', 'x-robots-tag': 'nosnippet' }),
    response('<meta name="FitPassEvidenceBot" content="noarchive">' + licensed)]) {
    const { crawler } = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: restricted });
    assert.equal((await crawler.scan(venue)).sourceAssessment?.decision, 'blocked');
    assert.equal(crawler.policySnapshot().sites.length, 0);
  }
  const redirected = harness({ [`${origin}/robots.txt`]: response('User-agent: *\nDisallow: /private', 200, { 'content-type': 'text/plain' }),
    [`${origin}/`]: response('', 302, { location: '/private' }) });
  assert.equal((await redirected.crawler.scan(venue)).reason, 'SOURCE_POLICY_ROBOTS_BLOCKED');
  assert.equal(redirected.requests.length, 2);
  const controller = new AbortController(); controller.abort();
  const result = await new CardCrawler(policy, { discoverSources: true, signal: controller.signal }).scan(venue);
  assert.equal(result.outcome, 'cancelled');
});

test('relaxed mode extracts public facts without claiming a licence or publishing raw quotes', async () => {
  const { crawler } = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response('Public venue page'),
    [venue.website!]: response(cards + '<p>Honorujemy BeActive Plus, dopłata 10 zł za 60 minut</p>') }, policy, 100, true);
  const result = await crawler.scan(venue);
  assert.equal(result.sourceAssessment?.decision, 'facts_only');
  assert.equal(result.sourceAssessment?.proof, undefined);
  const decisions = decideClaims(result, venue, crawler.policySnapshot());
  const positive = claimPatch(decisions.find((item) => item.provider === 'multisport')!, undefined)!;
  assert.equal(positive.status, 'accepted');
  assert.equal(positive.sourceQuote, null);
  const conditional = claimPatch(decisions.find((item) => item.provider === 'beactive')!, undefined)!;
  assert.equal(conditional.status, 'conditional');
  assert.equal(conditional.conditions, 'Wariant: Plus; Dopłata: 10 PLN; Czas: 60 min');
  assert.equal(conditional.sourceQuote, null);
  assert.match(result.evidence[0].excerpt, /Honorujemy/);
});

test('relaxed mode still rejects bans, unfinished assessments and more than five venues on one origin', async () => {
  const denied = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response('<p>Scraping is prohibited</p>') }, policy, 100, true);
  assert.equal((await denied.crawler.scan(venue)).sourceAssessment?.decision, 'blocked');
  const unfinished = harness({ [`${origin}/robots.txt`]: robots,
    [`${origin}/`]: response('<a href="/terms">Terms</a>'), [`${origin}/terms`]: response('', 404) }, policy, 100, true);
  assert.equal((await unfinished.crawler.scan(venue)).sourceAssessment?.decision, 'uncertain');
  const capped = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(''), [venue.website!]: response(cards) }, policy, 100, true);
  for (let i = 0; i < 5; i++) assert.equal((await capped.crawler.scan({ ...venue, id: `id-${i}` })).outcome, 'completed');
  assert.equal((await capped.crawler.scan({ ...venue, id: 'sixth' })).reason, 'PUBLIC_FACT_VENUE_LIMIT');
  assert.equal(capped.requests.length, 3);
});

test('canonical redirects recheck robots on HTTPS/www and preserve original DB identity', async () => {
  const initial = 'http://gym.example';
  const canonical = 'https://www.gym.example';
  const { crawler, requests } = harness({
    [`${initial}/robots.txt`]: response('', 301, { location: `${canonical}/robots.txt` }),
    [`${canonical}/robots.txt`]: robots,
    [`${initial}/`]: response('', 301, { location: `${canonical}/` }),
    [`${canonical}/`]: response(''), [`${canonical}/oddzial`]: response(cards),
  }, policy, 100, true);
  const sourceVenue = { ...venue, website: `${initial}/oddzial` };
  const result = await crawler.scan(sourceVenue);
  assert.equal(result.website, sourceVenue.website);
  assert.equal(result.entryUrl, `${canonical}/oddzial`);
  assert.equal(result.outcome, 'completed');
  assert.equal(decideClaims(result, sourceVenue, crawler.policySnapshot())[0].action, 'publish');
  assert.equal(requests.filter((url) => url === `${canonical}/robots.txt`).length, 1);
  assert.ok(requests.indexOf(`${canonical}/robots.txt`) < requests.indexOf(`${canonical}/`));
  assert.throws(() => decideClaims({ ...result, entryUrl: `${canonical}/other` }, sourceVenue, crawler.policySnapshot()), /TARGET_MISMATCH/);
});

test('wrong robots Content-Type can be tolerated only when the body is actually robots text', async () => {
  const { crawler } = harness({ [`${origin}/robots.txt`]: response('User-agent: *\nAllow: /', 200, { 'content-type': 'text/html' }),
    [`${origin}/`]: response(''), [venue.website!]: response(cards) }, policy, 100, true);
  assert.equal((await crawler.scan(venue)).outcome, 'completed');
  const bad = harness({ [`${origin}/robots.txt`]: response('<html><p>User-agent: *</p></html>') }, policy, 100, true);
  assert.equal((await bad.crawler.scan(venue)).reason, 'ROBOTS_UNAVAILABLE');
});

test('factual conditions preserve simple restrictions but never drop unfamiliar limits', () => {
  assert.equal(factConditions('Honorujemy MultiSport Plus z dopłatą 10 zł za 60 minut'), 'Wariant: Plus; Dopłata: 10 PLN; Czas: 60 min');
  assert.match(factConditions('Akceptujemy BeActive Classic. Wymagana rezerwacja')!, /Rezerwacja: wymagana/);
  for (const value of ['Honorujemy MultiSport Plus tylko w soboty', 'Honorujemy MultiSport Plus, limit 1 wejście dziennie',
    'Honorujemy MultiSport Plus, dopłata 10 zł za zajęcia indywidualne']) assert.equal(factConditions(value), null);
});

test('relaxed mode respects machine-readable and textual mining reservations', async () => {
  for (const reserved of [response('<meta name="tdm-reservation" content="1">'),
    response('', 200, { 'content-type': 'text/html', 'tdm-reservation': '1' }),
    response('<meta name="robots" content="noai">'), response('<p>Text and data mining is prohibited</p>'),
    response('<p>Zabrania się eksploracji tekstów i danych</p>')]) {
    const { crawler } = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: reserved }, policy, 100, true);
    assert.equal((await crawler.scan(venue)).sourceAssessment?.decision, 'blocked');
    assert.equal(crawler.policySnapshot().sites.length, 0);
  }
});

test('contact-form CAPTCHA code is not an access challenge, but interstitials still are', async () => {
  const contact = response('<title>Kontakt</title><p>Test Gym, Testowa 2, Warszawa</p>'
    + '<script src="https://www.google.com/recaptcha/api.js"></script><div class="g-recaptcha"></div><p>Napisz do nas</p>');
  assert.equal(isAccessChallenge(contact), false);
  for (const challenge of [response('<title>Just a moment...</title>'), response('<form id="challenge-form"></form>'),
    response('<p>Verify you are human CAPTCHA</p>'), response('', 200, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' })])
    assert.equal(isAccessChallenge(challenge), true);
  const { crawler } = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(''),
    [venue.website!]: response(cards + '<a href="/kontakt">Kontakt</a>'), [`${origin}/kontakt`]: contact }, policy, 100, true);
  const result = await crawler.scan(venue);
  assert.equal(result.outcome, 'completed');
  assert.equal(decideClaims(result, venue, crawler.policySnapshot())[0].action, 'publish');
});

test('branch-specific canonical redirects assess the destination before reading evidence', async () => {
  const canonical = 'https://www.gym.example';
  const { crawler, requests } = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(''),
    [venue.website!]: response('', 301, { location: `${canonical}/oddzial` }),
    [`${canonical}/robots.txt`]: robots, [`${canonical}/`]: response(''), [`${canonical}/oddzial`]: response(cards) }, policy, 100, true);
  const result = await crawler.scan(venue);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.entryUrl, `${canonical}/oddzial`);
  assert.equal(decideClaims(result, venue, crawler.policySnapshot())[0].action, 'publish');
  assert.ok(requests.indexOf(`${canonical}/robots.txt`) < requests.indexOf(`${canonical}/oddzial`));
  assert.ok(requests.indexOf(`${canonical}/`) < requests.indexOf(`${canonical}/oddzial`));
  const denied = harness({ [`${origin}/robots.txt`]: robots, [`${origin}/`]: response(''),
    [venue.website!]: response('', 301, { location: `${canonical}/oddzial` }),
    [`${canonical}/robots.txt`]: response('User-agent: *\nDisallow: /', 200, { 'content-type': 'text/plain' }) }, policy, 100, true);
  assert.equal((await denied.crawler.scan(venue)).outcome, 'partial');
  assert.ok(!denied.requests.includes(`${canonical}/oddzial`));
});

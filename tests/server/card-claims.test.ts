import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeHtml, type Venue } from '../../src/server/card-crawler/analyze';
import { claimPatch, decideClaims, type ExistingClaim } from '../../src/server/card-crawler/claims';
import type { CrawlResult } from '../../src/server/card-crawler/crawl';
import type { CrawlPolicy } from '../../src/server/card-crawler/policy';

const now = new Date('2026-10-04T12:00:00Z');
const venue: Venue = { id: 'venue-id', slug: 'test-gym', name: 'Test Gym', website: 'https://gym.example/oddzial',
  city: 'Warszawa', addressStreet: 'Testowa', addressHouseNumber: '2', phone: '+48123456789' };
const policy: CrawlPolicy = { version: 1, contactUrl: 'https://finder.example/crawler', sites: [{
  origin: 'https://gym.example', basis: 'permission', evidence: 'Written permission from the owner',
  reviewedAt: '2026-10-04', validUntil: '2026-12-31', allowedPaths: ['/'], minDelayMs: 2000, maxPages: 5,
}] };
function scan(text: string, identity = 'Test Gym, Testowa 2, Warszawa'): CrawlResult {
  const parsed = analyzeHtml(Buffer.from(`<p>${identity}</p>${text}`), venue.website!, venue, policy.sites[0], now.toISOString());
  return { placeId: venue.id, slug: venue.slug, website: venue.website, outcome: 'completed', coverage: 'bounded_html_only',
    evidence: parsed.evidence, pages: [{ url: venue.website!, outcome: 'analyzed', retrievedAt: now.toISOString(), contentHash: parsed.contentHash }] };
}
const existing: ExistingClaim = { status: 'accepted', sourceType: 'automated', confidence: 'medium',
  conditions: null, sourceUrl: venue.website, sourceQuote: 'Honorujemy MultiSport',
  verifiedAt: new Date('2026-10-03T12:00:00Z'), expiresAt: new Date('2026-11-02T12:00:00Z') };

test('positive proof publishes directly without moderator state', () => {
  const [decision] = decideClaims(scan('<p>Honorujemy MultiSport</p>'), venue, policy, now);
  assert.equal(decision.action, 'publish');
  const patch = claimPatch(decision, undefined, now)!;
  assert.equal(patch.status, 'accepted');
  assert.equal(patch.sourceType, 'automated');
  assert.equal(patch.confidence, 'medium');
  assert.equal(patch.verifiedAt?.toISOString(), now.toISOString());
  assert.equal(patch.expiresAt?.toISOString(), '2026-11-03T12:00:00.000Z');
});
test('adjacent conditions and variants become conditional claims', () => {
  const [decision] = decideClaims(scan('<p>Honorujemy MultiSport Plus</p><p>Dopłata 10 zł, limit 60 minut</p>'), venue, policy, now);
  const patch = claimPatch(decision, undefined, now)!;
  assert.equal(patch.status, 'conditional');
  assert.match(patch.conditions!, /Plus.*Dopłata 10 zł.*60 minut/);
});
test('explicit rejection is recorded; missing information does not imply rejection', () => {
  const [negative] = decideClaims(scan('<p>Nie honorujemy MultiSport</p>'), venue, policy, now);
  assert.equal(claimPatch(negative, undefined, now)?.status, 'not_accepted');
  const missing = decideClaims(scan('<p>Akceptujemy karty bankowe</p>'), venue, policy, now);
  assert.ok(missing.every((decision) => decision.action === 'skip'));
});
test('unknown identity, stale dates, questions, and logos do not create claims', () => {
  const cases = [scan('<p>Honorujemy MultiSport</p>', 'Inny Klub, Inna 20, Kraków'),
    scan('<p>Czy honorujemy MultiSport?</p>'), scan('<img alt="Honorujemy MultiSport">'),
    scan('<time datetime="2020-01-01"></time><p>Honorujemy MultiSport</p>')];
  assert.ok(cases.every((result) => decideClaims(result, venue, policy, now)[0].action === 'skip'));
});
test('partial or failed scans, missing rights, and tampered page proof never publish', () => {
  const proof = scan('<p>Honorujemy MultiSport</p>');
  for (const outcome of ['partial', 'blocked', 'cancelled', 'permission_missing', 'invalid_url'] as const)
    assert.equal(decideClaims({ ...proof, outcome }, venue, policy, now)[0].action, 'skip');
  assert.equal(decideClaims(proof, venue, { ...policy, sites: [] }, now)[0].action, 'skip');
  assert.equal(decideClaims({ ...proof, pages: [] }, venue, policy, now)[0].action, 'skip');
  assert.throws(() => decideClaims({ ...proof, placeId: 'different-place' }, venue, policy, now), /TARGET_MISMATCH/);
});
test('conflicts invalidate existing automated claims, without guessing a new status', () => {
  const [decision] = decideClaims(scan('<p>Honorujemy MultiSport</p><p>Nie honorujemy MultiSport</p>'), venue, policy, now);
  assert.equal(decision.action, 'invalidate');
  const patch = claimPatch(decision, existing, now)!;
  assert.equal(patch.status, 'unknown');
  assert.equal(patch.verifiedAt, null);
  assert.equal(claimPatch(decision, undefined, now), null);
  assert.equal(decideClaims(scan('<p>Honorujemy MultiSport</p><p>Nie honorujemy MultiSport</p>', 'Inny Klub'), venue, policy, now)[0].action, 'skip');
});
test('ambiguous second mentions and incompatible conditions block publishing', () => {
  for (const text of ['<p>Honorujemy MultiSport</p><p>MultiSport w wybranych obiektach</p>',
    '<p>Honorujemy MultiSport Plus, dopłata 10 zł</p><p>Honorujemy MultiSport Plus, dopłata 20 zł</p>'])
    assert.equal(decideClaims(scan(text), venue, policy, now)[0].action, 'skip');
});
test('current direct confirmation is preserved, while expired or unknown claims can refresh', () => {
  const [decision] = decideClaims(scan('<p>Honorujemy MultiSport</p>'), venue, policy, now);
  assert.equal(claimPatch(decision, { ...existing, sourceType: 'venue' }, now), null);
  assert.ok(claimPatch(decision, { ...existing, sourceType: 'venue', expiresAt: new Date('2026-09-01') }, now));
  assert.ok(claimPatch(decision, { ...existing, sourceType: 'venue', status: 'unknown' }, now));
  assert.equal(claimPatch(decision, { ...existing, verifiedAt: new Date('2026-10-05') }, now), null);
  assert.equal(claimPatch(decision, { ...existing, status: 'unknown', verifiedAt: null,
    updatedAt: new Date('2026-10-05') }, now), null);
});
test('expiry cannot outlive source permission', () => {
  const shortPermission = { ...policy, sites: [{ ...policy.sites[0], validUntil: '2026-10-06' }] };
  const [decision] = decideClaims(scan('<p>Honorujemy MultiSport</p>'), venue, shortPermission, now);
  assert.equal(claimPatch(decision, undefined, now)?.expiresAt?.toISOString(), '2026-10-06T23:59:59.999Z');
});
test('conditions for multiple providers in one sentence require clear association', () => {
  const result = scan('<p>Honorujemy MultiSport i PZU Sport, dopłata 10 zł dotyczy PZU Sport</p>');
  assert.ok(decideClaims(result, venue, policy, now).every((decision) => decision.action === 'skip'));
});

test('only page-budget partial scans can publish; actual failures remain blocked', () => {
  const result = scan('<p>Honorujemy MultiSport</p>');
  assert.equal(decideClaims({ ...result, outcome: 'partial', partialReasons: ['page_limit'] }, venue, policy, now)[0].action, 'publish');
  for (const partialReasons of [[], ['page_limit', 'http_error'], ['content_restricted'], ['robots_or_scope_blocked']])
    assert.equal(decideClaims({ ...result, outcome: 'partial', partialReasons }, venue, policy, now)[0].action, 'skip');
  assert.equal(decideClaims({ ...result, outcome: 'partial', partialReasons: ['page_limit'],
    pages: [...result.pages, { url: venue.website!, outcome: 'HTTP_404', retrievedAt: now.toISOString() }] }, venue, policy, now)[0].action, 'skip');
});

test('public facts do not publish unrecognized conditions or rejection of only one variant', () => {
  const factual = { ...policy, sites: [{ ...policy.sites[0], basis: 'public_facts' as const }] };
  assert.equal(decideClaims(scan('<p>Honorujemy MultiSport Plus tylko w soboty</p>'), venue, factual, now)[0].reason, 'unrecognized_factual_conditions');
  assert.equal(decideClaims(scan('<p>Nie honorujemy MultiSport Plus</p>'), venue, factual, now)[0].action, 'skip');
});

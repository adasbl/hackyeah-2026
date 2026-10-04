import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema';
import { saveCardClaims } from '../../src/db/save-card-claims';
import type { Venue } from '../../src/server/card-crawler/analyze';
import { CardCrawler } from '../../src/server/card-crawler/crawl';
import type { CrawlPolicy } from '../../src/server/card-crawler/policy';
import { createPlacesService } from '../../src/server/places';

test('database: public factual reading leads to visible, idempotent, atomic claims without moderation', {
  skip: process.env.CARD_CLAIMS_INTEGRATION_TEST !== '1', timeout: 90_000,
}, async () => {
  config({ path: '.env.local', quiet: true });
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  assert.ok(url, 'DATABASE_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '[::1]'].includes(host) ? false : 'require',
    max: 1, prepare: false, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  const initialPolicy: CrawlPolicy = { version: 1, sites: [] };
  const venue: Venue = { id: randomUUID(), slug: `crawler-test-${randomUUID()}`, name: 'Test Gym',
    website: 'https://gym.example/oddzial', city: 'Warszawa', addressStreet: 'Testowa', addressHouseNumber: '2', phone: '+48123456789' };
  const crawler = new CardCrawler(initialPolicy, { discoverSources: true, allowPublicFacts: true, wait: async () => {},
    transport: async (target) => {
      const body = target.pathname === '/robots.txt' ? 'User-agent: *\nAllow: /' : target.pathname === '/'
        ? '<p>Publiczna strona testowego obiektu, bez deklaracji licencji.</p>'
        : '<p>Test Gym, Testowa 2, Warszawa</p><p>Honorujemy MultiSport</p>'
          + '<p>Honorujemy BeActive Plus, dopłata 10 zł</p><p>Nie honorujemy PZU Sport</p>';
      return { status: 200, body: Buffer.from(body),
        headers: { 'content-type': target.pathname === '/robots.txt' ? 'text/plain' : 'text/html' } };
    } });
  const result = await crawler.scan(venue);
  const policy = crawler.policySnapshot();
  const now = new Date();
  assert.equal(result.sourceAssessment?.decision, 'facts_only');
  assert.equal(result.outcome, 'completed');
  const rollback = new Error('EXPECTED_TEST_ROLLBACK');
  try {
    await assert.rejects(db.transaction(async (tx) => {
      await tx.insert(schema.places).values({ ...venue, category: 'silownia', location: { x: 21, y: 52 }, isPublished: true });
      const first = await saveCardClaims(tx, venue, result, policy, now);
      assert.equal(first.written, 3);
      const read = () => tx.select().from(schema.placeCardClaims).where(eq(schema.placeCardClaims.placeId, venue.id)).orderBy(schema.placeCardClaims.id);
      const initial = await read();
      assert.ok(initial.every((claim) => claim.sourceQuote === null));
      assert.equal(initial.find((claim) => claim.status === 'conditional')?.conditions, 'Wariant: Plus; Dopłata: 10 PLN');
      assert.equal((await saveCardClaims(tx, venue, result, policy, now)).unchanged, 3);
      assert.deepEqual(await read(), initial);
      const detail = await createPlacesService(tx).getPlaceBySlug(venue.slug);
      assert.equal(detail?.cards.find((item) => item.provider === 'multisport')?.status, 'accepted');
      assert.equal(detail?.cards.find((item) => item.provider === 'beactive')?.status, 'conditional');
      assert.equal(detail?.cards.find((item) => item.provider === 'pzu-sport')?.status, 'not_accepted');
      assert.equal(detail?.cards.find((item) => item.provider === 'medicover-sport')?.status, 'unknown');
      await tx.update(schema.placeCardClaims).set({ sourceType: 'venue' }).where(eq(schema.placeCardClaims.id, initial[0].id));
      assert.equal((await saveCardClaims(tx, venue, result, policy, now)).skipped.filter((item) => item.reason === 'existing_confirmation_preserved').length, 1);
      const beforeIdentityChange = await read();
      await tx.update(schema.places).set({ website: 'https://different.example/' }).where(eq(schema.places.id, venue.id));
      await assert.rejects(saveCardClaims(tx, venue, result, policy, now), /CARD_SCAN_PLACE_CHANGED/);
      assert.deepEqual(await read(), beforeIdentityChange);
      throw rollback;
    }), (error) => error === rollback);
    assert.equal((await db.select().from(schema.places).where(eq(schema.places.id, venue.id))).length, 0);
    assert.equal((await db.select().from(schema.placeCardClaims).where(eq(schema.placeCardClaims.placeId, venue.id))).length, 0);
  } finally { await client.end({ timeout: 5 }); }
});

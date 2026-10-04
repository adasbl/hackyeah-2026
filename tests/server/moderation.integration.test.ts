import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema';
import { createCardContributionsService } from '../../src/server/card-contributions';
import { createModerationService } from '../../src/server/moderation';

// Osobne rekordy testowe; wszystkie zapisy wycofywane na końcu transakcji.
test('Supabase: kolejka, uprawnienia, decyzje, konflikty i historia moderacji', {
  skip: process.env.MODERATION_INTEGRATION_TEST !== '1', timeout: 120_000,
}, async () => {
  config({ path: '.env.local', quiet: true });
  assert.ok(process.env.DATABASE_MIGRATION_URL, 'DATABASE_MIGRATION_URL_MISSING');
  const client = postgres(process.env.DATABASE_MIGRATION_URL, { ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
  const database = drizzle(client, { schema });
  const rollback = new Error('EXPECTED_TEST_ROLLBACK');
  const userId = randomUUID();
  const { adminUsers, places, cardProviders, placeCardClaims, cardContributions } = schema;
  try {
    await assert.rejects(database.transaction(async (tx) => {
      await tx.insert(adminUsers).values({ userId });
      const [place] = await tx.insert(places).values({
        slug: `moderation-test-${randomUUID()}`, name: 'Test moderacji (rollback)', category: 'basen',
        location: { x: 21.01, y: 52.23 }, isPublished: true,
      }).returning();
      await tx.insert(cardProviders).values({ slug: 'multisport', name: 'MultiSport' }).onConflictDoNothing();
      const [provider] = await tx.select().from(cardProviders).where(eq(cardProviders.slug, 'multisport'));
      await tx.insert(placeCardClaims).values({ placeId: place.id, providerId: provider.id, status: 'accepted', sourceType: 'venue', confidence: 'high' });
      const readPlace = async () => (await tx.select().from(places).where(eq(places.id, place.id)))[0];
      const readClaim = async () => (await tx.select().from(placeCardClaims).where(eq(placeCardClaims.placeId, place.id)))[0];
      const readEntries = () => tx.select().from(cardContributions).where(eq(cardContributions.placeId, place.id));
      const originalClaim = await readClaim();
      const submissions = createCardContributionsService(tx);
      const moderation = createModerationService(tx);
      const input = { placeSlug: place.slug, provider: 'multisport' as const, status: 'conditional' as const, conditions: 'Dopłata 10 zł', sourceUrl: 'https://example.org/karty' };
      assert.equal(await submissions.save(input), true);
      assert.deepEqual(await readPlace(), place);
      assert.deepEqual(await readClaim(), originalClaim);
      const [first] = await readEntries();
      assert.equal(first.reviewStatus, 'pending');
      assert.equal(first.reviewedAt, null);
      const queue = await moderation.list(userId, 'pending');
      const queued = queue.items.find(({ contribution }) => contribution.id === first.id);
      assert.ok(queued, 'Zgłoszenie jest widoczne dla administratora');
      assert.equal(queued.currentClaim?.status, 'accepted');
      assert.equal(queued.contribution.status, 'conditional');
      const decision = { id: first.id, decision: 'approved' as const, expectedUpdatedAt: place.updatedAt.toISOString(), note: 'Sprawdzone źródło' };

      await assert.rejects(moderation.list(randomUUID(), 'pending'), /ADMIN_REQUIRED/);
      await assert.rejects(moderation.review(randomUUID(), decision), /ADMIN_REQUIRED/);
      assert.deepEqual(await readClaim(), originalClaim);
      assert.equal(await moderation.review(userId, { ...decision, decision: 'rejected' }), 'rejected');
      assert.deepEqual(await readClaim(), originalClaim);
      assert.deepEqual(await readPlace(), place);
      assert.equal(await moderation.review(userId, decision), 'already_reviewed');

      await submissions.save(input);
      const pending = (await readEntries()).find((entry) => entry.reviewStatus === 'pending')!;
      // Zmiana po otwarciu panelu nie może zostać nadpisana starą decyzją.
      await tx.update(places).set({ updatedAt: new Date(place.updatedAt.getTime() + 5000) }).where(eq(places.id, place.id));
      assert.equal(await moderation.review(userId, { ...decision, id: pending.id }), 'conflict');
      assert.deepEqual(await readClaim(), originalClaim);
      assert.equal((await readEntries()).find((entry) => entry.id === pending.id)?.reviewStatus, 'pending');
      const freshDecision = { ...decision, id: pending.id, expectedUpdatedAt: (await readPlace()).updatedAt.toISOString() };
      assert.equal(await moderation.review(userId, freshDecision), 'approved');
      const approvedClaim = await readClaim();
      assert.equal(approvedClaim.status, 'conditional');
      assert.equal(approvedClaim.conditions, 'Dopłata 10 zł');
      assert.equal(approvedClaim.sourceType, 'community');
      const approvedEntry = (await readEntries()).find((entry) => entry.id === pending.id)!;
      assert.equal(approvedEntry.reviewedBy, userId);
      assert.ok(approvedEntry.reviewedAt);
      assert.equal(approvedEntry.reviewNote, 'Sprawdzone źródło');
      assert.equal(approvedEntry.previousClaim?.status, 'accepted');
      const history = await moderation.list(userId, 'approved');
      assert.ok(history.items.some(({ contribution }) => contribution.id === pending.id));
      assert.equal(await moderation.review(userId, { ...freshDecision, decision: 'rejected' }), 'already_reviewed');
      assert.deepEqual(await readClaim(), approvedClaim);

      await submissions.save(input);
      const last = (await readEntries()).find((entry) => entry.reviewStatus === 'pending')!;
      await tx.update(places).set({ isPublished: false }).where(eq(places.id, place.id));
      assert.equal(await submissions.save(input), false);
      assert.equal(await moderation.review(userId, { ...freshDecision, id: last.id }), 'unpublished');
      assert.equal(await moderation.review(userId, { ...freshDecision, id: last.id, decision: 'rejected' }), 'rejected');
      await tx.update(adminUsers).set({ isActive: false }).where(eq(adminUsers.userId, userId));
      await assert.rejects(moderation.review(userId, freshDecision), /ADMIN_REQUIRED/);
      await assert.rejects(moderation.list(userId, 'pending'), /ADMIN_REQUIRED/);

      // Polityki RLS nie udostępniają danych ani praw administracyjnych przez publiczne API.
      await tx.execute(sql`set local role anon`);
      assert.equal((await tx.select().from(adminUsers)).length, 0);
      assert.equal((await tx.select().from(cardContributions)).length, 0);
      await tx.execute(sql`reset role`);
      throw rollback;
    }), (error) => error === rollback);
    assert.equal((await database.select().from(adminUsers).where(eq(adminUsers.userId, userId))).length, 0);
  } finally { await client.end({ timeout: 5 }); }
});

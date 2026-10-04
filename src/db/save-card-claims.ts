import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { claimPatch, decideClaims } from '../server/card-crawler/claims';
import type { Venue } from '../server/card-crawler/analyze';
import type { CrawlResult } from '../server/card-crawler/crawl';
import type { CrawlPolicy } from '../server/card-crawler/policy';
import * as schema from './schema';

type Database = Pick<PostgresJsDatabase<typeof schema>, 'transaction'>;
export interface ClaimSaveResult {
  written: number; invalidated: number; unchanged: number;
  skipped: { provider: string; reason: string }[];
}

/** Serialize runs per place and re-check identity under a row lock before any writes. */
export async function saveCardClaims(database: Database, venue: Venue, result: CrawlResult, policy: CrawlPolicy,
  now = new Date()): Promise<ClaimSaveResult> {
  const decisions = decideClaims(result, venue, policy, now);
  const summary: ClaimSaveResult = { written: 0, invalidated: 0, unchanged: 0, skipped: [] };
  if (!decisions.some((decision) => decision.action !== 'skip')) {
    summary.skipped = decisions.map((decision) => ({ provider: decision.provider, reason: decision.reason }));
    return summary;
  }
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`card-crawl:${venue.id}`}))`);
    const [current] = await tx.select().from(schema.places).where(eq(schema.places.id, venue.id)).for('update');
    if (!current || (['name', 'website', 'city', 'addressStreet', 'addressHouseNumber', 'phone'] as const)
      .some((key) => current[key] !== venue[key])) throw new Error('CARD_SCAN_PLACE_CHANGED');
    const providers = await tx.select().from(schema.cardProviders);
    for (const decision of decisions) {
      if (decision.action === 'skip') { summary.skipped.push({ provider: decision.provider, reason: decision.reason }); continue; }
      const provider = providers.find((row) => row.slug === decision.provider);
      if (!provider) throw new Error('CARD_PROVIDER_MISSING');
      const where = and(eq(schema.placeCardClaims.placeId, venue.id), eq(schema.placeCardClaims.providerId, provider.id));
      const [existing] = await tx.select().from(schema.placeCardClaims).where(where).for('update');
      const patch = claimPatch(decision, existing, now);
      if (!patch) { summary.skipped.push({ provider: decision.provider, reason: 'existing_confirmation_preserved' }); continue; }
      if (existing && Object.entries(patch).every(([key, value]) => {
        const previous = existing[key as keyof typeof patch];
        return previous instanceof Date && value instanceof Date ? previous.getTime() === value.getTime() : previous === value;
      })) { summary.unchanged++; continue; }
      if (existing) await tx.update(schema.placeCardClaims).set(patch).where(where);
      else await tx.insert(schema.placeCardClaims).values({ ...patch, placeId: venue.id, providerId: provider.id });
      if (decision.action === 'invalidate') summary.invalidated++;
      else summary.written++;
    }
    return summary;
  });
}

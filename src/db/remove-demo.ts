import { mkdir, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DEMO_DATASET, DEMO_MARKER, SEED_PLACES } from './seed-data';

const OUTPUT = '.local/db-cleanup';
const slugs = SEED_PLACES.map(({ place }) => place.slug);
const isDemo = (place: typeof schema.places.$inferSelect) => slugs.includes(place.slug)
  && place.osmTags[DEMO_MARKER] === DEMO_DATASET && place.osmId === null && place.osmType === null;

async function main() {
  config({ path: '.env.local', quiet: true });
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--verify'].includes(arg))
    || (args.includes('--apply') && args.includes('--verify'))) throw new Error('DEMO_CLEANUP_INVALID_ARGUMENT');
  const apply = args.includes('--apply');
  const verify = args.includes('--verify');
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : 'require', prepare: false, max: 1, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await mkdir(OUTPUT, { recursive: true });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('seed:demo:cleanup'))`);
      const before = await tx.select().from(schema.places).orderBy(schema.places.id).for('update');
      const claims = await tx.select().from(schema.placeCardClaims).orderBy(schema.placeCardClaims.id).for('update');
      const providers = await tx.select().from(schema.cardProviders).orderBy(schema.cardProviders.id);
      const targets = before.filter(isDemo);
      if (before.some((place) => slugs.includes(place.slug) && !isDemo(place))) throw new Error('DEMO_CLEANUP_IDENTITY_CONFLICT');
      if (verify && targets.length) throw new Error('DEMO_CLEANUP_VERIFY_FAILED');
      const ids = targets.map((place) => place.id);
      const targetClaims = claims.filter((claim) => ids.includes(claim.placeId));
      let backup: string | null = null;
      let deleted = 0;
      if (apply && targets.length) {
        backup = `${OUTPUT}/demo-before-${stamp}.json`;
        await writeFile(backup, JSON.stringify({ generatedAt: new Date().toISOString(), dataset: DEMO_DATASET,
          places: targets, claims: targetClaims, providers }, null, 2), { flag: 'wx' });
        // Dokładne ID + znacznik zestawu + slugi + brak tożsamości OSM. FK usuwa tylko powiązane claims.
        const removed = await tx.delete(schema.places).where(and(
          inArray(schema.places.id, ids), inArray(schema.places.slug, slugs),
          sql`${schema.places.osmTags}->>${DEMO_MARKER} = ${DEMO_DATASET}`,
          isNull(schema.places.osmId), isNull(schema.places.osmType),
        )).returning({ id: schema.places.id });
        if (removed.length !== targets.length) throw new Error('DEMO_CLEANUP_DELETE_MISMATCH');
        deleted = removed.length;
      }
      const after = await tx.select().from(schema.places).orderBy(schema.places.id);
      const afterClaims = await tx.select().from(schema.placeCardClaims).orderBy(schema.placeCardClaims.id);
      if (apply) {
        if (JSON.stringify(after) !== JSON.stringify(before.filter((place) => !ids.includes(place.id)))) throw new Error('DEMO_CLEANUP_UNRELATED_PLACE_CHANGED');
        if (JSON.stringify(afterClaims) !== JSON.stringify(claims.filter((claim) => !ids.includes(claim.placeId)))) throw new Error('DEMO_CLEANUP_CLAIM_MISMATCH');
      }
      const afterProviders = await tx.select().from(schema.cardProviders).orderBy(schema.cardProviders.id);
      if (JSON.stringify(afterProviders) !== JSON.stringify(providers)) throw new Error('DEMO_CLEANUP_PROVIDER_CHANGED');
      return { generatedAt: new Date().toISOString(), applied: apply, verified: verify,
        plannedPlaces: targets.length, plannedClaims: targetClaims.length,
        deletedPlaces: deleted, deletedClaims: apply ? targetClaims.length : 0,
        remainingDemoPlaces: after.filter(isDemo).length,
        remainingPlaces: after.length, publishedPlaces: after.filter((place) => place.isPublished).length,
        osmPlaces: after.filter((place) => place.osmId !== null).length,
        providersPreserved: providers.length, backup,
        targetSlugs: targets.map((place) => place.slug) };
    });
    // Raport dopiero po zatwierdzeniu transakcji.
    await writeFile(`${OUTPUT}/demo-result-${stamp}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
    await writeFile(`${OUTPUT}/demo-result.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'DEMO_CLEANUP_FAILED';
  console.error(`Usuwanie danych DEMO nie powiodło się (${code}).`);
  process.exitCode = 1;
});

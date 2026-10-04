import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema';
import { preparePolandPbf } from './osm-pbf';
import { POLAND_IMPORT_CATEGORIES } from './osm-poland';
import { normalizeWebsite } from './osm-publication';

const DIRECTORY = '.local/osm';
const CACHE = `${DIRECTORY}/polska-sport.json`;
const text = z.string().nullable();
const recordSchema = z.object({
  osmType: z.enum(['node', 'way', 'relation']), osmId: z.number().int().positive().safe(),
  osmVersion: z.number().int().positive().nullable(), osmChangesetId: z.number().int().positive().safe().nullable(),
  osmTimestamp: z.string().datetime().nullable().transform((value) => value ? new Date(value) : null),
  osmUserName: z.null(), osmUserId: z.null(), osmTags: z.record(z.string(), z.string()),
  slug: z.string(), name: z.string().trim().min(1), brand: text, brandWikidataId: text, description: text,
  category: z.enum(POLAND_IMPORT_CATEGORIES), addressStreet: text, addressHouseNumber: text,
  addressFloor: text, level: text, postalCode: text, city: text, citySlug: text,
  location: z.object({ x: z.number().finite().min(-180).max(180), y: z.number().finite().min(-90).max(90) }),
  openingHoursRaw: text, openingHours: z.array(z.object({ days: z.string(), hours: z.string() })),
  website: text.refine((value) => !value || normalizeWebsite(value) === value), phone: text,
  paymentMethods: z.array(z.string()), amenities: z.array(z.string()), prices: z.array(z.never()),
  isPublished: z.literal(false),
}).strict().refine((row) => row.slug === `osm-${row.osmType}-${row.osmId}`, 'OSM_SLUG_MISMATCH');
const snapshotSchema = z.object({
  formatVersion: z.literal(1), preparedAt: z.string().datetime(),
  source: z.object({ file: z.string(), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  categories: z.array(z.enum(POLAND_IMPORT_CATEGORIES)).min(1),
  attribution: z.literal('© OpenStreetMap contributors'), license: z.literal('https://www.openstreetmap.org/copyright'),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/), records: z.array(recordSchema).min(1),
  summary: z.record(z.string(), z.unknown()), multipleCategories: z.array(z.unknown()),
});
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run db:import:osm:poland -- --file <plik.osm.pbf> --prepare-only\n'
      + 'npm run db:import:osm:poland -- --from-cache --dry-run\n'
      + 'npm run db:import:osm:poland -- --from-cache --apply [--publish]\n'
      + 'Opcjonalnie: --categories silownia,basen,fitness,wspinaczka,tenis,squash,taniec');
    return;
  }
  let file = '.local/osm/poland-latest.osm.pbf';
  let categories: (typeof POLAND_IMPORT_CATEGORIES[number])[] = [...POLAND_IMPORT_CATEGORIES];
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '--categories') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('OSM_POLAND_MISSING_ARGUMENT');
      if (arg === '--file') file = value;
      else categories = z.array(z.enum(POLAND_IMPORT_CATEGORIES)).min(1).parse([...new Set(value.split(','))]);
    } else if (['--prepare-only', '--from-cache', '--dry-run', '--apply', '--publish'].includes(arg)) flags.add(arg);
    else throw new Error('OSM_POLAND_INVALID_ARGUMENT');
  }
  const apply = flags.has('--apply'), dryRun = flags.has('--dry-run'), publish = flags.has('--publish');
  if ((apply && dryRun) || (flags.has('--prepare-only') && (apply || dryRun || publish || flags.has('--from-cache')))
    || (publish && !apply && !dryRun) || (flags.has('--from-cache') && (args.includes('--file') || args.includes('--categories')))) throw new Error('OSM_POLAND_INVALID_ARGUMENT');
  await mkdir(DIRECTORY, { recursive: true });
  if (!flags.has('--from-cache')) {
    file = resolve(file);
    const before = await stat(file).catch(() => { throw new Error('OSM_POLAND_PBF_FILE_MISSING'); });
    if (!before.isFile() || before.size === 0) throw new Error('OSM_POLAND_INVALID_PBF_FILE');
    const prepared = await preparePolandPbf(file, { categories, progress: console.log });
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('OSM_PBF_CHANGED_DURING_READ');
    if (!prepared.records.length) throw new Error('OSM_NO_VALID_SPORTS_PLACES');
    const snapshot = { formatVersion: 1, preparedAt: new Date().toISOString(),
      source: { file, bytes: after.size, sha256: prepared.sourceHash }, categories,
      attribution: '© OpenStreetMap contributors', license: 'https://www.openstreetmap.org/copyright',
      recordHash: hash(prepared.records), records: prepared.records,
      summary: prepared.summary, multipleCategories: prepared.multipleCategories };
    // Sprawdzenie formatu przed zapisem cache.
    snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(`${DIRECTORY}/polska-sport-${stamp}.json`, JSON.stringify(snapshot, null, 2), { flag: 'wx' });
    await writeFile(CACHE, JSON.stringify(snapshot, null, 2));
  }
  const raw = JSON.parse(await readFile(CACHE, 'utf8'));
  if (raw.recordHash !== hash(raw.records)) throw new Error('OSM_POLAND_CACHE_INTEGRITY_ERROR');
  const snapshot = snapshotSchema.parse(raw);
  const identities = snapshot.records.map((row) => row.slug);
  if (new Set(identities).size !== identities.length
    || snapshot.records.some((row) => !snapshot.categories.includes(row.category))) throw new Error('OSM_POLAND_CACHE_SCOPE_ERROR');
  console.log(JSON.stringify({ ...snapshot.summary, source: snapshot.source, cache: CACHE }, null, 2));
  // Domyślnie sam plan: bez połączenia z bazą i bez zapisu.
  if (!apply && !dryRun) return;
  config({ path: '.env.local', quiet: true });
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : 'require', prepare: false, max: 1, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  const rollback = new Error('OSM_POLAND_DRY_RUN_ROLLBACK');
  const insertedSlugs: string[] = [];
  try {
    const enumRows = await db.execute<{ value: string }>(sql`select e.enumlabel as value from pg_enum e
      join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
      where t.typname = 'place_category' and n.nspname = 'public'`);
    const enumValues = new Set(enumRows.map((row) => row.value));
    if (snapshot.records.some((row) => !enumValues.has(row.category))) throw new Error('OSM_POLAND_CATEGORY_MIGRATION_REQUIRED');
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('osm:polska:sport'))`);
        for (let offset = 0; offset < snapshot.records.length; offset += 100) {
          const rows = await tx.insert(schema.places).values(snapshot.records.slice(offset, offset + 100)
            .map((record) => ({ ...record, isPublished: publish })))
            .onConflictDoNothing({ target: [schema.places.osmType, schema.places.osmId] })
            .returning({ slug: schema.places.slug });
          insertedSlugs.push(...rows.map((row) => row.slug));
        }
        if (dryRun) throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    const result = { generatedAt: new Date().toISOString(), sourceHash: snapshot.source.sha256,
      recordHash: snapshot.recordHash, candidates: snapshot.records.length,
      inserted: insertedSlugs.length, alreadyExisting: snapshot.records.length - insertedSlugs.length,
      committed: apply, published: apply && publish ? insertedSlugs.length : 0,
      insertedSlugs, note: 'Istniejące rekordy i informacje o kartach nie są nadpisywane.' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(`${DIRECTORY}/polska-import-result-${stamp}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, insertedSlugs: undefined }, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OSM_POLAND_IMPORT_FAILED';
  console.error(`Import Polski nie powiódł się (${code}).`);
  if (code === 'OSM_POLAND_CATEGORY_MIGRATION_REQUIRED') console.error('Zastosuj migrację dodającą kategorie tenis i taniec przed importem.');
  process.exitCode = 1;
});

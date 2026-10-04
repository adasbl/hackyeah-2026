import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema';
import { osmBoundarySchema } from './osm-area-cache';
import { createLocalityLookup, planCityUpdates } from './osm-localities';
import { preparePolandLocalities } from './osm-localities-pbf';

const DIRECTORY = '.local/osm/cities';
const CACHE = `${DIRECTORY}/polska-localities.json`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshotSchema = z.object({
  formatVersion: z.literal(1), preparedAt: z.string().datetime(), method: z.literal('osm-admin-level-8-point-in-polygon'),
  source: z.object({ file: z.string(), bytes: z.number().positive().int(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  attribution: z.literal('© OpenStreetMap contributors'), license: z.literal('https://www.openstreetmap.org/copyright'),
  boundaryHash: z.string().regex(/^[a-f0-9]{64}$/), boundaries: z.array(osmBoundarySchema).min(1),
  summary: z.record(z.string(), z.unknown()), rejected: z.array(z.unknown()),
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run db:fill:osm:cities -- --file <poland.osm.pbf> --prepare-only\n'
      + 'npm run db:fill:osm:cities -- --from-cache [--dry-run]\n'
      + 'npm run db:fill:osm:cities -- --from-cache --apply\n'
      + 'Zakres: opublikowane obiekty OSM. Domyślnie plan bez zapisu do bazy.');
    return;
  }
  let file = '.local/osm/poland-latest.osm.pbf';
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('OSM_CITIES_MISSING_ARGUMENT');
      file = value;
    } else if (['--prepare-only', '--from-cache', '--apply', '--dry-run'].includes(args[i])) flags.add(args[i]);
    else throw new Error('OSM_CITIES_INVALID_ARGUMENT');
  }
  const apply = flags.has('--apply');
  if ((apply && flags.has('--dry-run')) || (flags.has('--from-cache') && args.includes('--file'))
    || (flags.has('--prepare-only') && (apply || flags.has('--dry-run') || flags.has('--from-cache')))) throw new Error('OSM_CITIES_INVALID_ARGUMENT');
  await mkdir(DIRECTORY, { recursive: true });
  if (!flags.has('--from-cache')) {
    file = resolve(file);
    const before = await stat(file).catch(() => { throw new Error('OSM_CITIES_PBF_FILE_MISSING'); });
    if (!before.isFile() || !before.size) throw new Error('OSM_CITIES_INVALID_PBF_FILE');
    const prepared = await preparePolandLocalities(file, console.log);
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('OSM_PBF_CHANGED_DURING_READ');
    const snapshot = { formatVersion: 1, preparedAt: new Date().toISOString(), method: 'osm-admin-level-8-point-in-polygon',
      source: { file, bytes: after.size, sha256: prepared.sourceHash },
      attribution: '© OpenStreetMap contributors', license: 'https://www.openstreetmap.org/copyright',
      boundaryHash: hash(prepared.boundaries), boundaries: prepared.boundaries, summary: prepared.summary, rejected: prepared.rejected };
    // Duży cache walidujemy przy odczycie; osobny cache nie zmienia paczki importu obiektów.
    await writeFile(CACHE, JSON.stringify(snapshot));
    console.log(JSON.stringify({ cache: CACHE, ...prepared.summary, sourceHash: prepared.sourceHash }, null, 2));
    if (flags.has('--prepare-only')) return;
  }
  const raw = JSON.parse(await readFile(CACHE, 'utf8'));
  if (raw.boundaryHash !== hash(raw.boundaries)) throw new Error('OSM_CITIES_CACHE_INTEGRITY_ERROR');
  const snapshot = snapshotSchema.parse(raw);
  const identities = snapshot.boundaries.map((b) => `${b.osmType}/${b.osmId}`);
  if (new Set(identities).size !== identities.length) throw new Error('OSM_CITIES_DUPLICATE_BOUNDARY');
  const lookup = createLocalityLookup(snapshot.boundaries);
  config({ path: '.env.local', quiet: true });
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : 'require',
    prepare: false, max: 1, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scope = and(eq(schema.places.isPublished, true), isNotNull(schema.places.osmType), isNotNull(schema.places.osmId));
  try {
    const result = await db.transaction(async (tx) => {
      if (apply) await tx.execute(sql`select pg_advisory_xact_lock(hashtext('osm:polska:sport'))`);
      const query = tx.select().from(schema.places).where(scope).orderBy(asc(schema.places.id));
      const rows = await (apply ? query.for('update') : query);
      const plan = planCityUpdates(rows, lookup);
      const backup = apply && plan.updates.length ? `${DIRECTORY}/before-${stamp}.json` : null;
      const report = { generatedAt: new Date().toISOString(), applied: apply,
        sourceHash: snapshot.source.sha256, boundaryHash: snapshot.boundaryHash, method: snapshot.method,
        places: rows.length, missingCityBefore: rows.filter((row) => !row.city?.trim()).length,
        planned: plan.updates.length, inferredCities: plan.updates.filter((row) => row.boundary).length,
        repairedSlugs: plan.updates.filter((row) => !row.boundary).length,
        skipped: plan.skipped, backup, updates: plan.updates, unresolved: plan.unresolved, updated: 0, missingCityAfter: 0 };
      const targetIds = new Set(plan.updates.map((u) => u.before.id));
      if (backup) await writeFile(backup, JSON.stringify({ ...report, before: rows.filter((row) => targetIds.has(row.id)) }, null, 2), { flag: 'wx' });
      if (apply) {
        for (let offset = 0; offset < plan.updates.length; offset += 100) {
          const batch = plan.updates.slice(offset, offset + 100).map((u) => ({
            id: u.before.id, city: u.city, city_slug: u.citySlug, old_city: u.before.city, old_city_slug: u.before.citySlug,
          }));
          const updated = await tx.execute<{ id: string }>(sql`
            update public.places as p set city = u.city, city_slug = u.city_slug, updated_at = now()
            from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
              as u(id uuid, city text, city_slug text, old_city text, old_city_slug text)
            where p.id = u.id and p.city is not distinct from u.old_city
              and p.city_slug is not distinct from u.old_city_slug
              and p.is_published = true and p.osm_type is not null and p.osm_id is not null
            returning p.id`);
          if (updated.length !== batch.length) throw new Error('OSM_CITIES_UPDATE_MISMATCH');
          report.updated += updated.length;
        }
        const after = await tx.select().from(schema.places).where(scope).orderBy(asc(schema.places.id));
        const expected = new Map(plan.updates.map((u) => [u.before.id, u]));
        if (after.length !== rows.length) throw new Error('OSM_CITIES_SCOPE_CHANGED');
        for (let i = 0; i < rows.length; i++) {
          const previous = rows[i], current = after[i], update = expected.get(previous.id);
          const target = update ? { ...previous, city: update.city, citySlug: update.citySlug, updatedAt: current.updatedAt } : previous;
          if (JSON.stringify(current) !== JSON.stringify(target)) throw new Error('OSM_CITIES_UNRELATED_FIELD_CHANGED');
        }
        report.missingCityAfter = after.filter((row) => !row.city?.trim()).length;
      } else report.missingCityAfter = report.missingCityBefore;
      return report;
    });
    await writeFile(`${DIRECTORY}/result-${stamp}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, updates: undefined, unresolved: undefined, cache: CACHE }, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OSM_CITIES_FAILED';
  console.error(`Uzupełnianie miejscowości nie powiodło się (${code}).`); process.exitCode = 1;
});

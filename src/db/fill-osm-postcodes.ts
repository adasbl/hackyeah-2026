import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema';
import { osmBoundarySchema, osmPointSchema } from './osm-area-cache';
import { planPostcodeUpdates } from './osm-postcodes';
import { preparePolandPostcodes } from './osm-postcodes-pbf';

const DIRECTORY = '.local/osm/postcodes', CACHE = `${DIRECTORY}/polska-postcodes.json`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const codeSchema = z.string().regex(/^\d{2}-\d{3}$/);
const snapshotSchema = z.object({
  formatVersion: z.literal(1), preparedAt: z.string().datetime(),
  source: z.object({ file: z.string(), bytes: z.number().positive().int(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  attribution: z.literal('© OpenStreetMap contributors'), license: z.literal('https://www.openstreetmap.org/copyright'),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  targets: z.array(z.object({ slug: z.string().min(1), location: osmPointSchema }).strict()),
  areas: z.array(z.object({ kind: z.enum(['address_area', 'postal_boundary']), postcode: codeSchema,
    geometry: osmBoundarySchema }).strict().refine((area) => area.postcode === area.geometry.name)),
  addresses: z.array(z.object({ osmType: z.literal('node'), osmId: z.number().positive().int().safe(),
    postcode: codeSchema, location: osmPointSchema, street: z.string().trim().min(1),
    houseNumber: z.string().trim().min(1), city: z.string().nullable() }).strict()),
  summary: z.record(z.string(), z.unknown()), rejected: z.array(z.unknown()),
});
async function readSnapshot() {
  const raw = JSON.parse(await readFile(CACHE, 'utf8'));
  if (raw.dataHash !== hash({ targets: raw.targets, areas: raw.areas, addresses: raw.addresses })) throw new Error('OSM_POSTCODES_CACHE_INTEGRITY_ERROR');
  const snapshot = snapshotSchema.parse(raw);
  for (const identities of [snapshot.targets.map((t) => t.slug), snapshot.addresses.map((a) => `${a.osmType}/${a.osmId}`),
    snapshot.areas.map((a) => `${a.geometry.osmType}/${a.geometry.osmId}`)]) {
    if (new Set(identities).size !== identities.length) throw new Error('OSM_POSTCODES_DUPLICATE_SOURCE');
  }
  return snapshot;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run db:fill:osm:postcodes -- --file <poland.osm.pbf> --prepare-only\n'
      + 'npm run db:fill:osm:postcodes -- --from-cache [--dry-run]\n'
      + 'npm run db:fill:osm:postcodes -- --from-cache --apply\n'
      + 'Zakres: opublikowane obiekty OSM. Przygotowanie odczytuje współrzędne z bazy. Bez --apply nie ma UPDATE.');
    return;
  }
  let file = '.local/osm/poland-latest.osm.pbf';
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('OSM_POSTCODES_MISSING_ARGUMENT');
      file = value;
    } else if (['--prepare-only', '--from-cache', '--apply', '--dry-run'].includes(args[i])) flags.add(args[i]);
    else throw new Error('OSM_POSTCODES_INVALID_ARGUMENT');
  }
  const apply = flags.has('--apply');
  if ((apply && flags.has('--dry-run')) || (flags.has('--from-cache') && args.includes('--file'))
    || (flags.has('--prepare-only') && (apply || flags.has('--dry-run') || flags.has('--from-cache')))) throw new Error('OSM_POSTCODES_INVALID_ARGUMENT');
  await mkdir(DIRECTORY, { recursive: true });
  let snapshot = flags.has('--from-cache') ? await readSnapshot() : null;
  config({ path: '.env.local', quiet: true });
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : 'require',
    prepare: false, max: 1, connect_timeout: 15, idle_timeout: 20 });
  const db = drizzle(client, { schema });
  const scope = and(eq(schema.places.isPublished, true), isNotNull(schema.places.osmType), isNotNull(schema.places.osmId));
  try {
    if (!snapshot) {
      const rows = await db.select({ slug: schema.places.slug, location: schema.places.location, postalCode: schema.places.postalCode })
        .from(schema.places).where(scope).orderBy(asc(schema.places.id));
      const targets = rows.filter((row) => !row.postalCode?.trim()).map(({ slug, location }) => ({ slug, location }));
      if (!targets.length) { console.log('Wszystkie opublikowane obiekty OSM mają kod pocztowy.'); return; }
      file = resolve(file);
      const before = await stat(file).catch(() => { throw new Error('OSM_POSTCODES_PBF_FILE_MISSING'); });
      if (!before.isFile() || !before.size) throw new Error('OSM_POSTCODES_INVALID_PBF_FILE');
      console.log(`Przygotowanie kodów dla ${targets.length} obiektów bez kodu pocztowego.`);
      const prepared = await preparePolandPostcodes(file, targets, console.log);
      const after = await stat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('OSM_PBF_CHANGED_DURING_READ');
      const data = { targets: prepared.targets, areas: prepared.areas, addresses: prepared.addresses };
      const envelope = { formatVersion: 1, preparedAt: new Date().toISOString(),
        source: { file, bytes: after.size, sha256: prepared.sourceHash },
        attribution: '© OpenStreetMap contributors', license: 'https://www.openstreetmap.org/copyright',
        dataHash: hash(data), ...data, summary: prepared.summary, rejected: prepared.rejected };
      snapshotSchema.parse(envelope);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeFile(`${DIRECTORY}/polska-postcodes-${stamp}.json`, JSON.stringify(envelope), { flag: 'wx' });
      await writeFile(CACHE, JSON.stringify(envelope));
      console.log(JSON.stringify({ cache: CACHE, ...prepared.summary, sourceHash: prepared.sourceHash }, null, 2));
      if (flags.has('--prepare-only')) return;
      snapshot = await readSnapshot();
    }
    const cache = snapshot;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = await db.transaction(async (tx) => {
      if (apply) await tx.execute(sql`select pg_advisory_xact_lock(hashtext('osm:polska:sport'))`);
      const query = tx.select().from(schema.places).where(scope).orderBy(asc(schema.places.id));
      const rows = await (apply ? query.for('update') : query);
      const plan = planPostcodeUpdates(rows, cache);
      const backup = apply && plan.updates.length ? `${DIRECTORY}/before-${stamp}.json` : null;
      const report = { generatedAt: new Date().toISOString(), applied: apply,
        sourceHash: cache.source.sha256, dataHash: cache.dataHash, places: rows.length,
        missingBefore: rows.filter((row) => !row.postalCode?.trim()).length, planned: plan.updates.length,
        skipped: plan.skipped, invalidExistingPreserved: plan.invalidExisting,
        updates: plan.updates, unresolved: plan.unresolved, backup, updated: 0, missingAfter: 0 };
      const targetIds = new Set(plan.updates.map((u) => u.before.id));
      if (backup) await writeFile(backup, JSON.stringify({ ...report, before: rows.filter((row) => targetIds.has(row.id)) }, null, 2), { flag: 'wx' });
      if (apply) {
        for (let offset = 0; offset < plan.updates.length; offset += 100) {
          const batch = plan.updates.slice(offset, offset + 100).map((u) => ({ id: u.before.id, postal_code: u.postalCode, old_postal_code: u.before.postalCode }));
          const updated = await tx.execute<{ id: string }>(sql`
            update public.places as p set postal_code = u.postal_code, updated_at = now()
            from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as u(id uuid, postal_code text, old_postal_code text)
            where p.id = u.id and p.postal_code is not distinct from u.old_postal_code
              and nullif(btrim(p.postal_code), '') is null
              and p.is_published = true and p.osm_type is not null and p.osm_id is not null
            returning p.id`);
          if (updated.length !== batch.length) throw new Error('OSM_POSTCODES_UPDATE_MISMATCH');
          report.updated += updated.length;
        }
        const after = await tx.select().from(schema.places).where(scope).orderBy(asc(schema.places.id));
        const expected = new Map(plan.updates.map((u) => [u.before.id, u]));
        if (after.length !== rows.length) throw new Error('OSM_POSTCODES_SCOPE_CHANGED');
        for (let i = 0; i < rows.length; i++) {
          const previous = rows[i], current = after[i], update = expected.get(previous.id);
          const target = update ? { ...previous, postalCode: update.postalCode, updatedAt: current.updatedAt } : previous;
          if (JSON.stringify(current) !== JSON.stringify(target)) throw new Error('OSM_POSTCODES_UNRELATED_FIELD_CHANGED');
        }
        report.missingAfter = after.filter((row) => !row.postalCode?.trim()).length;
      } else report.missingAfter = report.missingBefore;
      return report;
    });
    await writeFile(`${DIRECTORY}/result-${stamp}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, updates: undefined, unresolved: undefined, cache: CACHE }, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}
main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OSM_POSTCODES_FAILED';
  console.error(`Uzupełnianie kodów pocztowych nie powiodło się (${code}).`); process.exitCode = 1;
});

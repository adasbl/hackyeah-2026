import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema';
import { parseOsmResponse, prepareWarsawFitnessPlaces, responseHash, WARSAW_BOUNDARY_ID } from './osm-warsaw';
import { assessPlace, findDuplicateCandidates, technicalPublicationBlockers, technicalPublicationPatch, type ReviewPlace } from './osm-publication';
import { publicationBlockers, publicationDecisionsSchema, publicationPatch } from './osm-publication-decisions';

const OUTPUT = '.local/osm/review';
const MANIFEST = 'docs/osm-publication-decisions.json';
const snapshotSchema = z.object({ boundaryId: z.literal(WARSAW_BOUNDARY_ID), responseHash: z.string(), response: z.unknown() });

async function main() {
  config({ path: '.env.local', quiet: true });
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--verify', '--technical'].includes(arg)) || (args.includes('--apply') && args.includes('--verify'))) throw new Error('OSM_PUBLICATION_INVALID_ARGUMENT');
  const apply = args.includes('--apply');
  const verify = args.includes('--verify');
  const technical = args.includes('--technical');
  const manifestText = await readFile(MANIFEST, 'utf8');
  const manifest = publicationDecisionsSchema.parse(JSON.parse(manifestText));
  const manifestHash = createHash('sha256').update(manifestText).digest('hex');
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile('.local/osm/warszawa-fitness.json', 'utf8')));
  const response = parseOsmResponse(snapshot.response);
  if (responseHash(response) !== snapshot.responseHash || snapshot.responseHash !== manifest.snapshotHash) throw new Error('OSM_PUBLICATION_SNAPSHOT_MISMATCH');
  const imported = prepareWarsawFitnessPlaces(response, snapshot.boundaryId).records;
  const scope = new Set(imported.map((record) => record.slug));
  if ([...manifest.approved, ...manifest.held].some((item) => !scope.has(item.slug))) throw new Error('OSM_PUBLICATION_OUTSIDE_IMPORT');
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : 'require', prepare: false, max: 1, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await mkdir(OUTPUT, { recursive: true });
    // Ta sama blokada co importer; blokady wierszy chronią również przed równoległą edycją redakcyjną.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('osm:warszawa:fitness'))`);
      const all: (ReviewPlace & { rowRevision: string })[] = await tx.select({
        ...getTableColumns(schema.places), rowRevision: sql<string>`xmin::text`,
      }).from(schema.places).for('update');
      const saved = all.filter((place) => scope.has(place.slug));
      if (saved.length !== scope.size || saved.some((place) => !imported.some((item) =>
        item.slug === place.slug && item.osmType === place.osmType && item.osmId === place.osmId))) throw new Error('OSM_PUBLICATION_IMPORT_MISMATCH');
      const targets = technical ? saved : manifest.approved.map((decision) => saved.find((row) => row.slug === decision.slug)!);
      const plan = targets.map((place) => {
        const decision = manifest.approved.find((item) => item.slug === place.slug);
        const patch = technical ? technicalPublicationPatch(place) : publicationPatch(place, decision!, manifest.checkedOn);
        // Idempotencja: opublikowanych wpisów nie nadpisujemy nawet po ponowieniu.
        if (place.isPublished && !verify) return { place, patch: null, decision };
        return { place, patch, decision };
      });
      const projected = all.map((place) => {
        const item = plan.find((candidate) => candidate.place.id === place.id);
        return item?.patch ? { ...place, ...item.patch } : place;
      });
      const blockers = plan.filter((item) => item.patch).flatMap(({ place }) => {
        const projectedPlace = projected.find((row) => row.id === place.id)!;
        return (technical ? technicalPublicationBlockers(projectedPlace)
          : publicationBlockers(projectedPlace, projected, manifest.checkedOn)).map((reason) => ({ slug: place.slug, reason }));
      });
      // Zmiana istniejącego pełnego adresu mogłaby zostawić stary punkt mapy.
      for (const { place, decision, patch } of plan) {
        if (!technical && patch && decision && ((place.addressStreet && place.addressStreet !== decision.street)
          || (place.addressHouseNumber && place.addressHouseNumber.toLowerCase() !== decision.houseNumber.toLowerCase()))) blockers.push({ slug: place.slug, reason: 'existing_address_conflict' });
      }
      if (!technical && blockers.length) {
        console.log(JSON.stringify({ blockers }, null, 2));
        throw new Error('OSM_PUBLICATION_BLOCKED');
      }
      const eligible = plan.filter((item) => !blockers.some((blocker) => blocker.slug === item.place.slug));
      const changes = eligible.filter((item) => item.patch && !item.place.isPublished);
      if (apply && changes.length) {
        // Pełne rekordy oraz wersja decyzji zapisane PRZED zatwierdzeniem transakcji.
        await writeFile(`${OUTPUT}/publication-before-${stamp}.json`, JSON.stringify({
          generatedAt: new Date().toISOString(), mode: technical ? 'technical' : 'source_verified', manifestHash, manifest,
          places: changes.map((item) => item.place), plan: changes.map(({ place, patch }) => ({ slug: place.slug, patch })),
        }, null, 2), { flag: 'wx' });
        for (const { place, patch } of changes) {
          const updated = await tx.update(schema.places).set(patch!)
            .where(and(eq(schema.places.id, place.id), eq(schema.places.isPublished, false), sql`xmin::text = ${place.rowRevision}`))
            .returning({ id: schema.places.id });
          if (updated.length !== 1) throw new Error('OSM_PUBLICATION_CONCURRENT_CHANGE');
        }
      }
      const current = await tx.select().from(schema.places).where(inArray(schema.places.slug, [...scope]));
      const published = current.filter((row) => row.isPublished);
      if ((apply || verify) && !technical && published.some((row) => !manifest.approved.some((item) => item.slug === row.slug))) throw new Error('OSM_PUBLICATION_UNREVIEWED_RECORD');
      if ((apply || verify) && eligible.some((item) => !published.some((row) => row.slug === item.place.slug))) throw new Error('OSM_PUBLICATION_VERIFY_FAILED');
      if (verify) {
        for (const { place, patch } of eligible) {
          if (technical ? technicalPublicationBlockers(place).length > 0
            : Object.entries(patch!).some(([key, value]) => JSON.stringify(place[key as keyof ReviewPlace]) !== JSON.stringify(value))) throw new Error('OSM_PUBLICATION_DATA_MISMATCH');
        }
      }
      const duplicates = findDuplicateCandidates(current);
      const rows = current.map((place) => {
        const decision = manifest.approved.find((item) => item.slug === place.slug);
        const held = manifest.held.find((item) => item.slug === place.slug);
        const assessment = assessPlace(place, duplicates);
        return { slug: place.slug, name: place.name, isPublished: place.isPublished,
          disposition: place.isPublished ? 'published' : held?.reason ?? (assessment.blockers.length ? 'blocked' : 'not_source_verified'),
          blockers: assessment.blockers, warnings: assessment.warnings,
          technicalBlockers: blockers.filter((item) => item.slug === place.slug).map((item) => item.reason),
          sourceUrl: decision?.sourceUrl ?? held?.sourceUrl ?? null, notes: decision?.notes ?? held?.notes ?? null };
      });
      const cardClaims = await tx.select({ count: sql<number>`count(*)::integer` }).from(schema.placeCardClaims)
        .where(inArray(schema.placeCardClaims.placeId, published.map((place) => place.id)));
      return { generatedAt: new Date().toISOString(), mode: technical ? 'technical' : 'source_verified', manifestHash, snapshotHash: manifest.snapshotHash,
        summary: { total: current.length, approved: manifest.approved.length, newlyPublished: apply ? changes.length : 0,
          technicallyBlocked: new Set(blockers.map((item) => item.slug)).size,
          published: published.length, drafts: current.length - published.length, planned: changes.length,
          applied: apply, verified: verify, cardClaimsForPublishedOsm: cardClaims[0].count }, places: rows };
    });
    // Raport sukcesu powstaje dopiero PO COMMIT; ponowny --verify sprawdza osobnym połączeniem.
    await writeFile(`${OUTPUT}/publication-result-${stamp}.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
    await writeFile(`${OUTPUT}/publication-result.json`, JSON.stringify(result, null, 2));
    await writeFile(`${OUTPUT}/publication-result.md`, [
      '# Warszawa — wynik przeglądu i publikacji', '',
      `Publikacja danych w bazie, nie wdrożenie kodu aplikacji. Raport: ${result.generatedAt}.`, '',
      `Łącznie ${result.summary.total}; publiczne ${result.summary.published}; szkice ${result.summary.drafts}.`, '',
      technical ? 'Tryb techniczny: kompletność adresu, przegląd stron i możliwe duplikaty nie blokują publikacji. Zgodność ze źródłami nie jest potwierdzona dla całego zbioru.'
        : 'Tryb źródłowy: niepotwierdzone wpisy pozostają szkicami.', '',
      'Punkty mapy pochodzą z OSM, nie z pomiaru wejścia. Nie dodano cen, akceptacji kart ani dat weryfikacji w trybie technicznym.', '',
      '| Obiekt | Decyzja | Źródło |', '| --- | --- | --- |',
      ...result.places.map((row) => `| ${row.name.replace(/\|/g, '\\|')} (${row.slug}) | ${row.disposition} | ${row.sourceUrl ? `[strona](${row.sourceUrl})` : '—'} |`), '',
    ].join('\n'));
    console.log(JSON.stringify({ mode: result.mode, ...result.summary, report: `${OUTPUT}/publication-result.md`, manifest: MANIFEST }, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OSM_PUBLICATION_FAILED';
  console.error(`Publikacja OSM nie powiodła się (${code}).`);
  process.exitCode = 1;
});

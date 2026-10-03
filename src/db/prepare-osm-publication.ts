import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema';
import { parseOsmResponse, prepareWarsawFitnessPlaces, responseHash, WARSAW_BOUNDARY_ID } from './osm-warsaw';
import { assessPlace, draftCorrections, findDuplicateCandidates, parseOpeningHours, type ReviewPlace } from './osm-publication';
import { publicationDecisionsSchema, publicationPatch } from './osm-publication-decisions';

const OUTPUT = '.local/osm/review';
const snapshotSchema = z.object({
  boundaryId: z.literal(WARSAW_BOUNDARY_ID), responseHash: z.string(),
  fetchedAt: z.string().datetime(), response: z.unknown(),
});
const venueReviewSchema = z.array(z.object({
  slug: z.string(), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrl: z.string().url(), status: z.enum(['address_matches', 'source_conflict', 'website_unreachable']),
  notes: z.string(), suggestedCorrections: z.record(z.string(), z.unknown()).optional(),
}));
const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

async function main() {
  config({ path: '.env.local', quiet: true });
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) throw new Error('OSM_REVIEW_INVALID_ARGUMENT');
  const apply = args.includes('--apply');
  const earlierReviews = venueReviewSchema.parse(JSON.parse(await readFile('docs/osm-venue-review.json', 'utf8')));
  const decisions = publicationDecisionsSchema.parse(JSON.parse(await readFile('docs/osm-publication-decisions.json', 'utf8')));
  const venueReviews = [
    ...earlierReviews.filter((review) => !decisions.approved.some((item) => item.slug === review.slug)),
    ...decisions.approved.map((item) => ({ slug: item.slug, checkedOn: decisions.checkedOn,
      sourceUrl: item.sourceUrl, status: 'address_matches' as const, notes: item.notes })),
  ];
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile('.local/osm/warszawa-fitness.json', 'utf8')));
  const response = parseOsmResponse(snapshot.response);
  if (responseHash(response) !== snapshot.responseHash) throw new Error('OSM_CACHE_INTEGRITY_ERROR');
  if (decisions.snapshotHash !== snapshot.responseHash) throw new Error('OSM_PUBLICATION_SNAPSHOT_MISMATCH');
  const { records: imported } = prepareWarsawFitnessPlaces(response, snapshot.boundaryId);
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL_MISSING');
  const hostname = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '::1'].includes(hostname) ? false : 'require', prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    const saved: (ReviewPlace & { rowRevision: string })[] = [];
    for (const type of ['node', 'way', 'relation'] as const) {
      const ids = imported.filter((record) => record.osmType === type).map((record) => record.osmId!);
      if (ids.length) saved.push(...await db.select({
        ...getTableColumns(schema.places), rowRevision: sql<string>`xmin::text`,
      }).from(schema.places)
        .where(and(eq(schema.places.osmType, type), inArray(schema.places.osmId, ids))));
    }
    if (saved.length !== imported.length) throw new Error('OSM_IMPORT_INCOMPLETE');
    saved.sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.slug.localeCompare(b.slug));
    const plan = saved.filter((place) => !place.isPublished)
      .map((place) => ({ place, patch: draftCorrections(place) }))
      .filter(({ patch }) => Object.keys(patch).length);
    await mkdir(OUTPUT, { recursive: true });
    let changed = 0;
    if (apply && plan.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeFile(`${OUTPUT}/before-${stamp}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), places: plan.map(({ place }) => place) }, null, 2));
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('osm:warszawa:fitness'))`);
        for (const { place, patch } of plan) {
          const updated = await tx.update(schema.places).set(patch)
            .where(and(eq(schema.places.id, place.id), eq(schema.places.isPublished, false), sql`xmin::text = ${place.rowRevision}`))
            .returning({ id: schema.places.id });
          if (updated.length !== 1) throw new Error('OSM_REVIEW_CONCURRENT_CHANGE');
          changed++;
        }
      });
    }
    const processed = saved.map((place) => place.isPublished ? place : ({ ...place, ...draftCorrections(place) }));
    const duplicatePairs = findDuplicateCandidates(processed);
    const rows = processed.map((place) => {
      const sourceReview = venueReviews.find((review) => review.slug === place.slug) ?? null;
      const assessment = assessPlace(place, duplicatePairs);
      const decision = decisions.approved.find((item) => item.slug === place.slug);
      if (decision && place.isPublished && !assessment.blockers.length) {
        const confirmed = publicationPatch(place, decision, decisions.checkedOn);
        assessment.verified = Object.entries(confirmed).every(([key, value]) =>
          JSON.stringify(place[key as keyof ReviewPlace]) === JSON.stringify(value));
        if (assessment.verified) assessment.reviewGroup = 'published_verified';
      }
      if (sourceReview?.status === 'source_conflict') {
        assessment.blockers.push('venue_source_conflict');
        assessment.reviewGroup = 'needs_correction';
      }
      if (sourceReview?.status === 'website_unreachable') assessment.warnings.push('website_unreachable');
      const heldDecision = decisions.held.find((item) => item.slug === place.slug);
      if (heldDecision) {
        assessment.blockers.push(`publication_hold:${heldDecision.reason}`);
        assessment.reviewGroup = 'needs_correction';
      }
      if (place.isPublished && !assessment.verified) assessment.reviewGroup = 'published_unverified';
      return {
      id: place.id, slug: place.slug, name: place.name, category: place.category,
      address: [place.addressStreet, place.addressHouseNumber].filter(Boolean).join(' '),
      website: place.website, phone: place.phone, openingHoursRaw: place.openingHoursRaw,
      openingHours: place.openingHours, isPublished: place.isPublished,
      osmUrl: `https://www.openstreetmap.org/${place.osmType}/${place.osmId}`,
      location: place.location, sourceReview, ...assessment,
      publicationDecision: heldDecision ?? decision ?? null,
    }; });
    const issueCounts: Record<string, number> = {};
    rows.forEach((row) => [...row.blockers, ...row.warnings].forEach((issue) => {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }));
    const candidates = rows.filter((row) => row.reviewGroup === 'candidate_for_review' && !row.isPublished);
    const summary = {
      total: rows.length, candidateForReview: candidates.length,
      needsCorrection: rows.filter((row) => row.blockers.length).length,
      duplicatePairs: duplicatePairs.length, proposedCorrections: plan.length,
      changedDrafts: changed, applied: apply,
      hoursParsed: processed.filter((place) => parseOpeningHours(place.openingHoursRaw).status === 'parsed').length,
      alreadyPublished: saved.filter((place) => place.isPublished).length, issueCounts,
      checkedVenueWebsites: venueReviews.length,
      sourceVerifiedPublished: rows.filter((row) => row.verified && row.isPublished).length,
      publishedWithoutSourceVerification: rows.filter((row) => row.isPublished && !row.verified).length,
    };
    const report = { generatedAt: new Date().toISOString(), snapshotHash: snapshot.responseHash,
      snapshotFetchedAt: snapshot.fetchedAt, summary, duplicatePairs, places: rows,
      correctionPlan: plan.map(({ place, patch }) => ({ slug: place.slug, patch })) };
    await writeFile(`${OUTPUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
    // Lista do redakcyjnego przeglądu, bez automatycznego zatwierdzania rekordów.
    await writeFile(`${OUTPUT}/publication-candidates.json`, `${JSON.stringify({
      generatedAt: report.generatedAt, snapshotHash: snapshot.responseHash,
      candidates: candidates.map((row) => ({ slug: row.slug, name: row.name,
        suggestedCategory: row.suggestedCategory, warnings: row.warnings, decision: 'pending' })),
    }, null, 2)}\n`);
    const lines = [
      '# Warszawa — przygotowanie danych OSM do publikacji', '',
      `Raport: ${report.generatedAt}. Snapshot: ${snapshot.fetchedAt}.`, '',
      `Rekordy: ${summary.total}. Kandydaci do przeglądu: ${summary.candidateForReview}. Wymagają korekty: ${summary.needsCorrection}. Pary możliwych duplikatów: ${summary.duplicatePairs}.`, '',
      `Godziny przetworzone: ${summary.hoursParsed}. Zapisane korekty szkiców: ${summary.changedDrafts}.`, '',
      'Kandydat oznacza rekord bez wykrytych blokad, a nie zweryfikowany obiekt. Statusy kart wymagają osobnego potwierdzenia. Ten skrypt nie zmienia is_published; publikację opisuje publication-result.md i osobny manifest decyzji.', '',
      '## Przegląd stron placówek', '', '| Obiekt | Wynik | Ustalenia | Źródło |', '| --- | --- | --- | --- |',
      ...venueReviews.map((review) => `| ${escape(rows.find((row) => row.slug === review.slug)?.name ?? review.slug)} | ${review.status} | ${escape(review.notes)} | [strona](${review.sourceUrl}), ${review.checkedOn} |`), '',
      '## Problemy', '', '| Problem | Liczba |', '| --- | ---: |',
      ...Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).map(([issue, count]) => `| ${issue} | ${count} |`), '',
      '## Możliwe duplikaty', '', '| Pierwszy rekord | Drugi rekord | Odległość | Powód |', '| --- | --- | ---: | --- |',
      ...duplicatePairs.map((pair) => `| ${pair.first} | ${pair.second} | ${pair.distanceMetres} m | ${pair.reasons.join(', ')} |`), '',
      '## Kandydaci do przeglądu', '', '| Obiekt OSM | Adres | Strona | Proponowana kategoria | Uwagi |', '| --- | --- | --- | --- | --- |',
      ...candidates.map((row) => `| [${escape(row.name).replace(/[\[\]]/g, '')}](${row.osmUrl}) | ${escape(row.address)} | ${row.website ? `[strona](${row.website})` : '—'} | ${row.suggestedCategory} | ${row.warnings.join(', ')} |`), '',
      '## Wymagają korekty', '', '| Obiekt OSM | Adres | Blokady | Uwagi |', '| --- | --- | --- | --- |',
      ...rows.filter((row) => row.blockers.length).map((row) => `| [${escape(row.name).replace(/[\[\]]/g, '')}](${row.osmUrl}) | ${escape(row.address)} | ${row.blockers.join(', ')} | ${row.warnings.join(', ')} |`), '',
    ];
    await writeFile(`${OUTPUT}/report.md`, lines.join('\n'));
    console.log(JSON.stringify({ ...summary, report: `${OUTPUT}/report.md`, details: `${OUTPUT}/report.json` }, null, 2));
  } finally { await client.end({ timeout: 5 }); }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OSM_REVIEW_FAILED';
  console.error(`Przygotowanie OSM nie powiodło się (${code}).`);
  process.exitCode = 1;
});

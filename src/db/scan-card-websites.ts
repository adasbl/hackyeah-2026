import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import { CardCrawler } from '../server/card-crawler/crawl';
import { saveCardClaims } from './save-card-claims';
import { crawlPolicySchema } from '../server/card-crawler/policy';
import * as schema from './schema';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run db:scan:cards -- [--policy <plik.json>] [--dry-run | --crawl] [--report-only] [--strict-sources | --manual-sources-only] [--city <slug>] [--limit <liczba>]\n'
      + 'Domyślnie: plan bez HTTP i zapisów. --crawl automatycznie zapisuje jednoznaczne statusy kart.\n'
      + 'Źródła spoza rejestru: automatyczna ocena robots.txt i publicznych warunków/licencji. Niejasne źródła są pomijane.\n'
      + 'Domyślnie dopuszcza ograniczony odczyt faktów bez publikowania cytatów. --strict-sources przywraca wymóg jawnego uprawnienia.\n'
      + '--manual-sources-only: wyłącza odkrywanie uprawnień. --report-only: HTTP i raport bez zapisów. Wyniki: .local/card-evidence/*.jsonl.');
    return;
  }
  let policyFile = 'docs/card-crawler-policy.example.json';
  let city: string | undefined, limit: number | undefined;
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (['--policy', '--city', '--limit'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('MISSING_ARGUMENT');
      if (arg === '--policy') policyFile = value;
      if (arg === '--city') city = z.string().regex(/^[a-z0-9-]+$/).parse(value);
      if (arg === '--limit') limit = z.coerce.number().int().positive().max(100_000).parse(value);
    } else if (['--crawl', '--dry-run', '--report-only', '--manual-sources-only', '--strict-sources'].includes(arg)) flags.add(arg);
    else throw new Error('INVALID_ARGUMENT');
  }
  if (flags.has('--crawl') && flags.has('--dry-run')) throw new Error('INVALID_ARGUMENT');
  if (flags.has('--report-only') && !flags.has('--crawl')) throw new Error('INVALID_ARGUMENT');
  const policy = crawlPolicySchema.parse(JSON.parse(await readFile(policyFile, 'utf8')));
  const dryRun = !flags.has('--crawl');
  const writeClaims = !dryRun && !flags.has('--report-only');
  config({ path: '.env.local', quiet: true });
  const discoverSources = !flags.has('--manual-sources-only');
  const allowPublicFacts = discoverSources && !flags.has('--strict-sources');
  if (process.env.CARD_CRAWLER_CONTACT_URL) policy.contactUrl = crawlPolicySchema.shape.contactUrl.parse(process.env.CARD_CRAWLER_CONTACT_URL);
  if (!dryRun && policy.contactUrl && /(^|\.)example\.(?:com|org|net)$/.test(new URL(policy.contactUrl).hostname))
    throw new Error('REAL_CONTACT_URL_REQUIRED');
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_URL_MISSING');
  const host = new URL(url).hostname;
  const client = postgres(url, { ssl: ['localhost', '127.0.0.1', '[::1]'].includes(host) ? false : 'require',
    prepare: false, max: 1, connect_timeout: 15, idle_timeout: 20 });
  const db = drizzle(client, { schema });
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const query = tx.select({ id: schema.places.id, slug: schema.places.slug, name: schema.places.name,
        website: schema.places.website, city: schema.places.city, addressStreet: schema.places.addressStreet,
        addressHouseNumber: schema.places.addressHouseNumber, phone: schema.places.phone })
        .from(schema.places).where(city ? sql`${isNotNull(schema.places.website)} and ${eq(schema.places.citySlug, city)}`
          : isNotNull(schema.places.website)).orderBy(asc(schema.places.id)).$dynamic();
      return limit ? query.limit(limit) : query;
    });
    const directory = '.local/card-evidence';
    await mkdir(directory, { recursive: true });
    const report = `${directory}/${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.jsonl`;
    const file = await open(report, 'wx');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    const crawler = new CardCrawler(policy, { signal: controller.signal, discoverSources, allowPublicFacts });
    const counts: Record<string, number> = {};
    let evidence = 0, processed = 0, written = 0, invalidated = 0, unchanged = 0, writeFailures = 0;
    const sourceAssessments: Record<string, number> = {};
    try {
      await file.write(`${JSON.stringify({ type: 'manifest', version: 1, startedAt: new Date().toISOString(),
        dryRun, scope: { city: city ?? null, limit: limit ?? null, placesWithWebsite: rows.length }, policy,
        discoverSources, allowPublicFacts, databaseWrites: writeClaims, coverage: 'bounded_public_html', claimsAutomaticallyPublished: writeClaims })}\n`);
      for (const venue of rows) {
        const result = await crawler.scan(venue, dryRun);
        // Save the HTTP evidence first, so a failed database write can be investigated.
        await file.write(`${JSON.stringify({ type: 'place', ...result })}\n`);
        if (writeClaims && !controller.signal.aborted) {
          try {
            const saved = await saveCardClaims(db, venue, result, crawler.policySnapshot());
            written += saved.written; invalidated += saved.invalidated; unchanged += saved.unchanged;
            await file.write(`${JSON.stringify({ type: 'database_write', placeId: venue.id, ...saved })}\n`);
          } catch (error) {
            writeFailures++;
            const reason = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CARD_CLAIM_WRITE_FAILED';
            await file.write(`${JSON.stringify({ type: 'database_write_failed', placeId: venue.id, reason })}\n`);
          }
        }
        counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
        if (result.sourceAssessment) {
          const decision = result.sourceAssessment.decision;
          sourceAssessments[decision] = (sourceAssessments[decision] ?? 0) + 1;
        }
        evidence += result.evidence.length;
        processed++;
        if (processed % 25 === 0) console.log(JSON.stringify({ processed, total: rows.length, counts, evidence, written, writeFailures }));
        if (controller.signal.aborted) break;
      }
      const summary = { type: 'summary', completedAt: new Date().toISOString(), processed, total: rows.length,
        cancelled: controller.signal.aborted, counts, sourceAssessments, evidence, written, invalidated, unchanged, writeFailures, report };
      await file.write(`${JSON.stringify(summary)}\n`);
      console.log(JSON.stringify(summary, null, 2));
      if (controller.signal.aborted) process.exitCode = 130;
      else if (writeFailures) process.exitCode = 1;
    } finally {
      process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
      await file.close();
    }
  } finally { await client.end({ timeout: 5 }); }
}
main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CARD_SCAN_FAILED';
  console.error(`Skanowanie stron nie powiodło się (${code}).`); process.exitCode = 1;
});

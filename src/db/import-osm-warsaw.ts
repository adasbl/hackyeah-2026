import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "./schema";
import {
  osmResponseSchema,
  OVERPASS_ENDPOINTS,
  parseOsmResponse,
  prepareWarsawFitnessPlaces,
  responseHash,
  WARSAW_BOUNDARY_ID,
  warsawFitnessQuery,
  warsawFitnessQueries,
} from "./osm-warsaw";

const CACHE_DIRECTORY = ".local/osm";
const CACHE_PATH = `${CACHE_DIRECTORY}/warszawa-fitness.json`;
const snapshotSchema = z.object({
  fetchedAt: z.string().datetime(),
  boundaryId: z.number().int().positive().safe(),
  endpoints: z.array(z.enum(OVERPASS_ENDPOINTS)).min(1),
  query: z.string(),
  responseHash: z.string().regex(/^[a-f0-9]{64}$/),
  attribution: z.literal("© OpenStreetMap contributors"),
  license: z.literal("https://www.openstreetmap.org/copyright"),
  response: osmResponseSchema,
});

type Snapshot = z.infer<typeof snapshotSchema>;

async function fetchOverpass(query: string) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Pobieranie z ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "hackyeah-2026/0.1 (Warsaw fitness data importer)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!response.ok) throw new Error(`OSM_HTTP_${response.status}`);
      return { endpoint, response: parseOsmResponse(await response.json()) };
    } catch (error) {
      const code = error instanceof Error ? error.message : "OSM_FETCH_FAILED";
      console.warn(`Endpoint nie zwrócił kompletnej odpowiedzi (${code}).`);
    }
  }
  throw new Error("OSM_OVERPASS_UNAVAILABLE");
}

async function downloadSnapshot(): Promise<Snapshot> {
  const boundary = {
    type: "relation" as const,
    id: WARSAW_BOUNDARY_ID,
    tags: {
      boundary: "administrative",
      admin_level: "8",
      wikidata: "Q270",
      name: "Warszawa",
    },
  };
  console.log(`Granica Warszawy: relation/${boundary.id}`);
  const queries = warsawFitnessQueries(boundary.id);
  const results: Awaited<ReturnType<typeof fetchOverpass>>[] = [];
  for (const [index, queryPart] of queries.entries()) {
    console.log(`Porcja ${index + 1}/${queries.length}`);
    results.push(await fetchOverpass(queryPart));
  }
  const timestamps = results
    .map(({ response }) => response.osm3s?.timestamp_osm_base)
    .filter((value): value is string => Boolean(value))
    .sort();
  const response = parseOsmResponse({
    elements: [boundary, ...results.flatMap((result) => result.response.elements)],
    osm3s: timestamps.length ? { timestamp_osm_base: timestamps[0] } : undefined,
  });
  console.log(`Odpowiedź Overpass: ${response.elements.length} elementów`);
  const snapshot: Snapshot = {
    fetchedAt: new Date().toISOString(),
    boundaryId: boundary.id,
    endpoints: results.map((result) => result.endpoint),
    query: warsawFitnessQuery(boundary.id),
    responseHash: responseHash(response),
    attribution: "© OpenStreetMap contributors",
    license: "https://www.openstreetmap.org/copyright",
    response,
  };
  prepareWarsawFitnessPlaces(snapshot.response, snapshot.boundaryId);
  await mkdir(CACHE_DIRECTORY, { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const args = process.argv.slice(2);
  const allowed = new Set(["--download-only", "--from-cache", "--dry-run", "--verify"]);
  if (args.some((arg) => !allowed.has(arg))) throw new Error("OSM_INVALID_ARGUMENT");
  if (args.includes("--verify") && (args.includes("--dry-run") || args.includes("--download-only"))) {
    throw new Error("OSM_INVALID_ARGUMENT");
  }
  const snapshot = args.includes("--from-cache") || args.includes("--verify")
    ? snapshotSchema.parse(JSON.parse(await readFile(CACHE_PATH, "utf8")))
    : await downloadSnapshot();
  if (snapshot.query !== warsawFitnessQuery(snapshot.boundaryId)
    || snapshot.responseHash !== responseHash(snapshot.response)) {
    throw new Error("OSM_CACHE_INTEGRITY_ERROR");
  }
  const prepared = prepareWarsawFitnessPlaces(snapshot.response, snapshot.boundaryId);
  const { records } = prepared;
  console.log(JSON.stringify({
    fetchedAt: snapshot.fetchedAt,
    osmBaseTimestamp: snapshot.response.osm3s?.timestamp_osm_base,
    boundaryId: snapshot.boundaryId,
    candidates: prepared.candidates,
    accepted: records.length,
    gyms: records.filter((record) => record.category === "silownia").length,
    fitness: records.filter((record) => record.category === "fitness").length,
    excluded: prepared.excluded,
    withFullAddress: records.filter((record) => record.addressStreet && record.addressHouseNumber).length,
    cache: CACHE_PATH,
  }, null, 2));
  if (args.includes("--download-only")) return;

  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL_MISSING");
  const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const client = postgres(databaseUrl, {
    ssl: local ? false : "require",
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });
  const db = drizzle(client, { schema });
  try {
    if (args.includes("--verify")) {
      let found = 0;
      for (const type of ["node", "way", "relation"] as const) {
        const ids = records.filter((record) => record.osmType === type).map((record) => record.osmId!);
        if (!ids.length) continue;
        found += (await db.select({ id: schema.places.id }).from(schema.places)
          .where(and(eq(schema.places.osmType, type), inArray(schema.places.osmId, ids)))).length;
      }
      console.log(JSON.stringify({ expected: records.length, found }, null, 2));
      if (found !== records.length) throw new Error("OSM_IMPORT_INCOMPLETE");
      return;
    }

    const rollback = new Error("OSM_DRY_RUN_ROLLBACK");
    let inserted = 0;
    try {
      await db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('osm:warszawa:fitness'))`);
        for (let offset = 0; offset < records.length; offset += 100) {
          inserted += (await transaction.insert(schema.places)
            .values(records.slice(offset, offset + 100))
            .onConflictDoNothing({ target: [schema.places.osmType, schema.places.osmId] })
            .returning({ id: schema.places.id })).length;
        }
        if (args.includes("--dry-run")) throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    console.log(JSON.stringify({
      inserted,
      alreadyExisting: records.length - inserted,
      committed: !args.includes("--dry-run"),
      published: 0,
    }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "OSM_IMPORT_FAILED";
  console.error(`Import OSM nie powiódł się (${code}).`);
  process.exitCode = 1;
});

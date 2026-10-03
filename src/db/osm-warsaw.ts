import { createHash } from "node:crypto";
import { z } from "zod";
import type { places } from "./schema";

export const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const WARSAW_BOUNDARY_QUERY = `[out:json][timeout:30];
rel["boundary"="administrative"]["admin_level"="8"]["wikidata"="Q270"];
out tags;`;
export const WARSAW_BOUNDARY_ID = 336074;

const FITNESS_SPORTS = [
  "fitness",
  "bodybuilding",
  "weightlifting",
  "crossfit",
  "aerobics",
  "pilates",
] as const;

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const osmElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int().positive().safe(),
  tags: z.record(z.string(), z.string()).default({}),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: coordinatesSchema.optional(),
  version: z.number().int().positive().optional(),
  changeset: z.number().int().positive().safe().optional(),
  timestamp: z.string().datetime().optional(),
}).passthrough();

export const osmResponseSchema = z.object({
  elements: z.array(osmElementSchema),
  remark: z.string().optional(),
  osm3s: z.object({ timestamp_osm_base: z.string().optional() }).passthrough().optional(),
}).passthrough();

export type OsmElement = z.infer<typeof osmElementSchema>;
export type OsmResponse = z.infer<typeof osmResponseSchema>;

export function parseOsmResponse(value: unknown): OsmResponse {
  const response = osmResponseSchema.parse(value);
  // Overpass potrafi zwrócić HTTP 200 razem z niekompletnym wynikiem i polem remark.
  if (response.remark) throw new Error("OSM_PARTIAL_RESPONSE");
  return response;
}

export function findWarsawBoundary(response: OsmResponse): OsmElement {
  const matches = response.elements.filter((element) =>
    element.type === "relation"
    && element.tags.boundary === "administrative"
    && element.tags.admin_level === "8"
    && element.tags.wikidata === "Q270");
  if (matches.length !== 1) throw new Error("OSM_WARSAW_BOUNDARY_AMBIGUOUS");
  return matches[0];
}

export function warsawFitnessQuery(boundaryId: number): string {
  return warsawFitnessQueries(boundaryId).join("\n\n");
}

/** Osobne, małe zapytania są bardziej niezawodne na publicznych instancjach. */
export function warsawFitnessQueries(boundaryId: number): string[] {
  if (!Number.isSafeInteger(boundaryId) || boundaryId <= 0) {
    throw new Error("OSM_INVALID_BOUNDARY_ID");
  }
  const sports = FITNESS_SPORTS.join("|");
  const areaId = 3_600_000_000 + boundaryId;
  const selectors = [
    `nwr["leisure"="fitness_centre"](area.warsaw);`,
    `nwr["leisure"="sports_centre"]["sport"~"(^|;)[ ]*(${sports})[ ]*(;|$)",i](area.warsaw);`,
    `nwr["sport"~"(^|;)[ ]*(${sports})[ ]*(;|$)",i]["indoor"="yes"](area.warsaw);`,
  ];
  return selectors.map((selector) => `[out:json][timeout:60];
area(${areaId})->.warsaw;
${selector}
out meta center;`);
}

function text(value: string | undefined): string | null {
  return value?.trim() || null;
}

function sports(tags: Record<string, string>): string[] {
  return (tags.sport ?? "").split(";").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

/** Odrzuca stacje plenerowe oraz jawnie bezpłatne obiekty plenerowe. */
export function exclusionReason(tags: Record<string, string>): string | null {
  if (tags.leisure === "fitness_station") return "outdoor_fitness_station";
  if (["yes", "construction"].includes(tags.disused)
    || ["yes", "construction"].includes(tags.abandoned)
    || tags.proposed === "yes") return "inactive";
  if (tags.shop && tags.shop !== "no" && tags.leisure !== "fitness_centre") return "shop";
  const outdoor = tags.indoor === "no" || tags.outdoor === "yes" || tags.location === "outdoor";
  if (outdoor && tags.fee === "no") return "free_outdoor";
  return null;
}

function categoryFor(element: OsmElement): "silownia" | "fitness" | null {
  if (exclusionReason(element.tags)) return null;
  const taggedSports = sports(element.tags);
  const eligible = element.tags.leisure === "fitness_centre"
    || element.tags.amenity === "gym"
    || taggedSports.some((sport) => FITNESS_SPORTS.includes(sport as typeof FITNESS_SPORTS[number]));
  if (!eligible) return null;
  const name = `${element.tags.name ?? ""} ${element.tags.brand ?? ""}`.toLowerCase();
  return element.tags.amenity === "gym"
    || taggedSports.some((sport) => ["bodybuilding", "weightlifting", "crossfit"].includes(sport))
    || /siłown|silown|\bgym\b|crossfit/.test(name)
    ? "silownia"
    : "fitness";
}

function normalizedWebsite(value: string | undefined): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeWarsawFitnessPlace(
  element: OsmElement,
): typeof places.$inferInsert | null {
  const category = categoryFor(element);
  if (!category) return null;
  const point = element.type === "node"
    ? { lat: element.lat, lon: element.lon }
    : element.center;
  const parsedPoint = coordinatesSchema.safeParse(point);
  if (!parsedPoint.success) return null;
  const tags = element.tags;
  const name = text(tags["name:pl"]) ?? text(tags.name) ?? text(tags.brand) ?? text(tags.operator);
  return {
    osmType: element.type,
    osmId: element.id,
    osmVersion: element.version ?? null,
    osmChangesetId: element.changeset ?? null,
    osmTimestamp: element.timestamp ? new Date(element.timestamp) : null,
    // Nie przechowujemy nazwy ani identyfikatora autora edycji OSM.
    osmUserName: null,
    osmUserId: null,
    osmTags: tags,
    slug: `osm-${element.type}-${element.id}`,
    name: name ?? `Obiekt fitness bez nazwy (OSM ${element.type}/${element.id})`,
    brand: text(tags.brand),
    brandWikidataId: text(tags["brand:wikidata"]),
    description: text(tags["description:pl"]) ?? text(tags.description),
    category,
    addressStreet: text(tags["addr:street"]),
    addressHouseNumber: text(tags["addr:housenumber"]),
    addressFloor: text(tags["addr:floor"]),
    level: text(tags.level),
    postalCode: /^\d{2}-\d{3}$/.test(tags["addr:postcode"] ?? "")
      ? tags["addr:postcode"]
      : null,
    city: "Warszawa",
    citySlug: "warszawa",
    location: { x: parsedPoint.data.lon, y: parsedPoint.data.lat },
    openingHoursRaw: text(tags.opening_hours),
    openingHours: [],
    paymentMethods: Object.entries(tags)
      .filter(([key, value]) => key.startsWith("payment:") && value === "yes")
      .map(([key]) => key.slice("payment:".length))
      .sort(),
    website: normalizedWebsite(tags.website ?? tags["contact:website"]),
    phone: text(tags.phone) ?? text(tags["contact:phone"]),
    amenities: [],
    prices: [],
    isPublished: false,
  };
}

export function prepareWarsawFitnessPlaces(response: OsmResponse, boundaryId: number) {
  if (findWarsawBoundary(response).id !== boundaryId) throw new Error("OSM_WRONG_BOUNDARY");
  const unique = new Map<string, OsmElement>();
  for (const element of response.elements) {
    if (element.type === "relation" && element.id === boundaryId) continue;
    const key = `${element.type}/${element.id}`;
    const previous = unique.get(key);
    if (!previous || (element.version ?? 0) > (previous.version ?? 0)) unique.set(key, element);
  }
  const records: (typeof places.$inferInsert)[] = [];
  const excluded: Record<string, number> = {};
  for (const element of unique.values()) {
    const reason = exclusionReason(element.tags);
    const place = reason ? null : normalizeWarsawFitnessPlace(element);
    if (place) records.push(place);
    else {
      const key = reason ?? "invalid_or_unclassified";
      excluded[key] = (excluded[key] ?? 0) + 1;
    }
  }
  if (!records.length) throw new Error("OSM_NO_FITNESS_PLACES");
  return { records, candidates: unique.size, excluded };
}

export function responseHash(response: OsmResponse): string {
  return createHash("sha256").update(JSON.stringify(response)).digest("hex");
}

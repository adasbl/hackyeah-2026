import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exclusionReason,
  normalizeWarsawFitnessPlace,
  prepareWarsawFitnessPlaces,
  type OsmElement,
  warsawFitnessQuery,
  warsawFitnessQueries,
} from "../../src/db/osm-warsaw";

function element(tags: Record<string, string>, overrides: Partial<OsmElement> = {}): OsmElement {
  return {
    type: "node",
    id: 123,
    lat: 52.23,
    lon: 21.01,
    version: 2,
    timestamp: "2026-10-03T10:00:00Z",
    tags,
    ...overrides,
  };
}

test("zapytanie używa obszaru Warszawy i nie pobiera fitness_station", () => {
  const query = warsawFitnessQuery(336075);
  assert.match(query, /area\(3600336075\)/);
  assert.match(query, /fitness_centre/);
  assert.doesNotMatch(query, /fitness_station/);
  assert.equal(warsawFitnessQueries(336075).length, 3);
});

test("odrzuca stację plenerową i bezpłatny obiekt plenerowy", () => {
  assert.equal(exclusionReason({ leisure: "fitness_station" }), "outdoor_fitness_station");
  assert.equal(exclusionReason({ leisure: "fitness_centre", outdoor: "yes", fee: "no" }), "free_outdoor");
});

test("normalizuje siłownię jako szkic bez statusów kart", () => {
  const place = normalizeWarsawFitnessPlace(element({
    leisure: "fitness_centre",
    sport: "bodybuilding;fitness",
    name: "Test Gym",
    "addr:street": "Testowa",
    "addr:housenumber": "1",
  }));
  assert.ok(place);
  assert.equal(place.category, "silownia");
  assert.equal(place.citySlug, "warszawa");
  assert.equal(place.isPublished, false);
  assert.deepEqual(place.location, { x: 21.01, y: 52.23 });
  assert.equal(place.osmUserName, null);
});

test("usuwa duplikaty tego samego elementu i zachowuje najnowszą wersję", () => {
  const boundary = element({ boundary: "administrative", admin_level: "8", wikidata: "Q270" }, {
    type: "relation", id: 336075, lat: undefined, lon: undefined,
  });
  const older = element({ leisure: "fitness_centre", name: "Stara nazwa" }, { version: 1 });
  const newer = element({ leisure: "fitness_centre", name: "Nowa nazwa" }, { version: 2 });
  const result = prepareWarsawFitnessPlaces({ elements: [boundary, older, newer] }, 336075);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].name, "Nowa nazwa");
});

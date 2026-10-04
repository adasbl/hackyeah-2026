import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_PROVIDER_SLUGS, CARD_STATUSES, CATEGORY_SLUGS } from "@repo/types";
import { places } from "../../src/db/schema";
import {
  DEMO_DATASET, DEMO_MARKER, SEED_PLACES, SEED_PROVIDERS,
} from "../../src/db/seed-data";

test("seed zawiera 4 operatorów, 20 miejsc, 15 publikacji i 60 informacji o kartach", () => {
  assert.deepEqual(SEED_PROVIDERS.map(({ slug }) => slug), [...CARD_PROVIDER_SLUGS]);
  assert.equal(SEED_PLACES.length, 20);
  assert.equal(SEED_PLACES.filter(({ place }) => place.isPublished).length, 15);
  assert.equal(SEED_PLACES.reduce((count, { claims }) => count + claims.length, 0), 60);
  assert.equal(new Set(SEED_PLACES.map(({ place }) => place.slug)).size, 20);
  // Dane demo obejmują pierwotnych 6 kategorii; nowe (tenis, taniec) pochodzą z danych w bazie.
  const used = new Set(SEED_PLACES.map(({ place }) => place.category));
  assert.deepEqual(used, new Set(["silownia", "basen", "fitness", "joga", "wspinaczka", "squash"]));
  for (const category of used) assert.ok((CATEGORY_SLUGS as readonly string[]).includes(category));
});

test("każde miejsce jest jawnie fikcyjne i ma poprawny punkt WGS84", () => {
  for (const { place } of SEED_PLACES) {
    assert.ok(place.slug.startsWith("demo-"));
    assert.ok(place.name.startsWith("[DEMO]"));
    assert.equal(place.osmTags?.[DEMO_MARKER], DEMO_DATASET);
    assert.equal(place.osmId, undefined);
    assert.doesNotThrow(() => places.location.mapToDriverValue(place.location));
    assert.equal(place.phone, null);
  }
});

test("opublikowane miejsca mają adres i karty, szkice dopuszczają brak danych", () => {
  for (const { place, claims } of SEED_PLACES) {
    if (place.isPublished) {
      assert.ok(place.addressStreet && place.addressHouseNumber);
      assert.ok(place.postalCode && place.city && place.citySlug);
      assert.equal(claims.length, 4);
      assert.equal(new Set(claims.map(({ providerSlug }) => providerSlug)).size, 4);
    } else {
      assert.equal(place.city, null);
      assert.equal(place.addressStreet, null);
      assert.deepEqual(place.openingHours, []);
      assert.deepEqual(place.prices, []);
      assert.deepEqual(claims, []);
    }
  }
});

test("statusy pokrywają kontrakt API, nieznane nie udają potwierdzenia", () => {
  const claims = SEED_PLACES.flatMap(({ claims }) => claims);
  assert.deepEqual(new Set(claims.map(({ status }) => status)), new Set(CARD_STATUSES));
  assert.ok(SEED_PLACES.some(({ claims }) =>
    claims.length === 4 && claims.every(({ status }) => status === "accepted")));
  for (const claim of claims) {
    assert.ok(CARD_PROVIDER_SLUGS.includes(claim.providerSlug));
    if (claim.status === "unknown") {
      assert.equal(claim.verifiedAt, null);
      assert.equal(claim.expiresAt, null);
      assert.equal(claim.confidence, "low");
    } else {
      assert.ok(claim.verifiedAt instanceof Date);
      assert.ok(claim.expiresAt instanceof Date);
      assert.ok(claim.expiresAt > claim.verifiedAt);
      assert.equal(new URL(claim.sourceUrl!).hostname, "example.com");
    }
    if (claim.status === "conditional") assert.ok(claim.conditions);
  }
});

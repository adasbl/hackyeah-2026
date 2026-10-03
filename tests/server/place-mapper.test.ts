import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { places } from '../../src/db/schema';
import { toPlaceDetails, type ClaimRow } from '../../src/server/place-mapper';

const date = new Date('2026-10-03T10:00:00Z');
const place: typeof places.$inferSelect = {
  id: '00000000-0000-0000-0000-000000000001', slug: 'test-basen', name: 'Basen',
  category: 'basen', description: null, brand: null, brandWikidataId: null,
  osmType: null, osmId: null, osmVersion: null, osmChangesetId: null, osmTimestamp: null,
  osmUserName: 'internal-user', osmUserId: 123, osmTags: {},
  addressStreet: 'ul. Łąkowa', addressHouseNumber: '12A', addressFloor: null, level: null,
  postalCode: '00-001', city: 'Łódź', citySlug: 'lodz', location: { x: 19.45, y: 51.77 },
  openingHoursRaw: null, openingHours: [], checkDate: null, openingHoursCheckDate: null,
  paymentMethods: [], website: null, phone: null, amenities: [], isPublished: true,
  prices: [
    { label: 'Normalny', amount: 30, currency: 'PLN', note: null },
    { label: 'Ulgowy', amount: 20, currency: 'PLN', note: null },
  ],
  createdAt: date, updatedAt: date,
};

test('mapowanie zachowuje kierunek współrzędnych, adres, najniższą cenę i daty', () => {
  const result = toPlaceDetails(place, []);
  assert.deepEqual(result.location, { lat: 51.77, lng: 19.45 });
  assert.equal(result.address.street, 'ul. Łąkowa 12A');
  assert.equal(result.priceFrom?.amount, 20);
  assert.equal(result.updatedAt, date.toISOString());
  assert.equal('osmUserName' in result, false);
});

test('brakujące karty są unknown, a potwierdzenie zachowuje źródło i warunki', () => {
  const claim: ClaimRow = {
    id: 'claim', placeId: place.id, providerId: 'provider', providerSlug: 'multisport',
    status: 'conditional', conditions: 'Do 60 minut', sourceType: 'venue',
    sourceUrl: 'https://example.com/warunki', sourceQuote: 'MultiSport do 60 minut',
    confidence: 'high', verifiedAt: date, expiresAt: null, createdAt: date, updatedAt: date,
  };
  const result = toPlaceDetails(place, [claim]);
  assert.equal(result.cards.length, 4);
  assert.equal(result.cards[0].status, 'conditional');
  assert.equal(result.cards[0].conditions, claim.conditions);
  assert.equal(result.cards[0].sourceUrl, claim.sourceUrl);
  assert.equal(result.cards[0].verifiedAt, date.toISOString());
  assert.ok(result.cards.slice(1).every((card) => card.status === 'unknown'
    && card.sourceUrl === null && card.verifiedAt === null));
});

test('brak opcjonalnych danych nie wymyśla adresu, ceny ani godzin', () => {
  const result = toPlaceDetails({ ...place, addressStreet: null, addressHouseNumber: null,
    city: null, citySlug: null, postalCode: null, prices: [] }, []);
  assert.deepEqual(result.address, { street: '', postalCode: '', city: '', citySlug: '' });
  assert.equal(result.priceFrom, null);
  assert.deepEqual(result.openingHours, []);
});

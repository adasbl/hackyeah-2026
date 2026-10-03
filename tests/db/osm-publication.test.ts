import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { publicationBlockers, publicationDecisionsSchema, publicationPatch } from '../../src/db/osm-publication-decisions';
import {
  assessPlace, draftCorrections, findDuplicateCandidates, normalizePhone, parseOpeningHours,
  technicalPublicationBlockers, technicalPublicationPatch,
  type ReviewPlace,
} from '../../src/db/osm-publication';

function place(overrides: Partial<ReviewPlace> = {}): ReviewPlace {
  return {
    id: '00000000-0000-4000-8000-000000000001', slug: 'osm-node-1', name: 'Klub',
    category: 'fitness', description: null, brand: null, brandWikidataId: null,
    osmType: 'node', osmId: 1, osmVersion: 1, osmChangesetId: null, osmTimestamp: null,
    osmUserName: null, osmUserId: null, osmTags: { leisure: 'fitness_centre' },
    addressStreet: 'Testowa', addressHouseNumber: '1', addressFloor: null, level: null,
    postalCode: null, city: 'Warszawa', citySlug: 'warszawa', location: { x: 21, y: 52.2 },
    openingHoursRaw: null, openingHours: [], checkDate: null, openingHoursCheckDate: null,
    paymentMethods: [], website: null, phone: null, amenities: [], prices: [], isPublished: false,
    createdAt: new Date('2026-10-03T12:00:00Z'), updatedAt: new Date('2026-10-03T12:00:00Z'),
    ...overrides,
  };
}

test('godziny zachowują przerwy, zamknięcie w niedzielę i wyjątek świąteczny', () => {
  assert.deepEqual(parseOpeningHours('Mo-Fr 08:00-12:00,13:00-17:30; Sa 09:00-14:00; Su off; PH off'), {
    status: 'parsed', entries: [
      { days: 'pon–pt', hours: '08:00–12:00, 13:00–17:30' },
      { days: 'sob', hours: '09:00–14:00' },
      { days: 'nd', hours: 'zamknięte' },
      { days: 'święta', hours: 'zamknięte' },
    ],
  });
});

test('publikacja techniczna dopuszcza braki i nie nadaje weryfikacji źródłowej', () => {
  const row = place({ name: 'Obiekt fitness bez nazwy (OSM node/1)', addressStreet: null,
    addressHouseNumber: null, osmTags: { access: 'private', 'disused:leisure': 'fitness_centre' } });
  assert.deepEqual(technicalPublicationBlockers(row), []);
  assert.deepEqual(technicalPublicationPatch(row), { isPublished: true, website: null });
  assert.equal(technicalPublicationBlockers(place({ openingHours: null as unknown as ReviewPlace['openingHours'] })).length, 1);
  assert.ok(technicalPublicationBlockers(place({ location: { x: 21, y: NaN } })).length);
  assert.ok(technicalPublicationBlockers(place({ prices: [{ label: 'x', amount: Infinity, currency: 'PLN', note: null }] })).length);
});

test('publikacja techniczna usuwa niebezpieczny link i pomija bezpłatny plener', () => {
  const row = place({ website: 'javascript:alert(1)' });
  const patch = technicalPublicationPatch(row);
  assert.equal(patch.website, null);
  assert.deepEqual(technicalPublicationBlockers({ ...row, ...patch }), []);
  assert.ok(technicalPublicationBlockers(place({ osmTags: { outdoor: 'yes', fee: 'no' } })).includes('excluded_free_outdoor'));
  assert.ok(technicalPublicationBlockers(place({ osmTags: { leisure: 'fitness_station' } })).includes('excluded_free_outdoor'));
});

test('nie wyświetla części harmonogramu po utracie wyjątków lub priorytetów', () => {
  for (const raw of [
    'Mo-Fr 08:00-17:00; Mo 10:00-11:00',
    'Mo-Fr 08:00-17:00; Dec 24 off',
    'Mo 22:00-02:00', 'Mo-Su 00:00-00:00', 'Mo 08:60-17:00',
    'PH off; Mo-Su 08:00-17:00', 'Mo-Su,PH 08:00-17:00',
  ]) assert.deepEqual(parseOpeningHours(raw), { status: 'needs_review', entries: [] });
  assert.equal(parseOpeningHours('24/7').status, 'parsed');
  assert.equal(parseOpeningHours(null).status, 'missing');
});

test('zachowuje ręczne godziny i nie zmienia kategorii ani publikacji', () => {
  const patch = draftCorrections(place({
    name: '  Klub   Testowy ', phone: '123 456 789',
    openingHoursRaw: '24/7', openingHours: [{ days: 'pon', hours: '10:00–12:00' }],
  }));
  assert.deepEqual(patch, { name: 'Klub Testowy', phone: '+48123456789' });
  assert.equal(normalizePhone('+49 (123) 456-789'), '+49123456789');
  assert.equal(normalizePhone('123 456 789; 987 654 321'), '123 456 789; 987 654 321');
});

test('oddziały tej samej sieci daleko od siebie nie są duplikatami', () => {
  assert.equal(findDuplicateCandidates([
    place({ name: 'Sieć' }),
    place({ slug: 'osm-node-2', name: 'Sieć', location: { x: 21.1, y: 52.2 } }),
  ]).length, 0);
  const close = place({ slug: 'osm-way-2', osmType: 'way', location: { x: 21.0001, y: 52.2 } });
  const pairs = findDuplicateCandidates([place(), close]);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].distanceMetres < 50);
  assert.ok(assessPlace(close, pairs).blockers.includes('possible_duplicate'));
});

test('sprzeczne tagi, prywatny dostęp i brak adresu blokują kandydata', () => {
  const result = assessPlace(place({
    addressStreet: null,
    osmTags: { leisure: 'fitness_centre', indoor: 'no', access: 'private', sport: 'yoga' },
  }), []);
  assert.deepEqual(result.blockers, ['incomplete_address', 'outdoor_uncertain', 'restricted_access']);
  assert.equal(result.suggestedCategory, 'joga');
  assert.equal(result.verified, false);
});

test('duplikaty w dwóch częściach tego samego budynku wykrywa także powyżej 50 m', () => {
  const pairs = findDuplicateCandidates([place(), place({
    id: '00000000-0000-0000-0000-000000000002', slug: 'osm-way-2', osmType: 'way', location: { x: 21.0015, y: 52.2 },
  })]);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].distanceMetres > 50);
});

const manifest = publicationDecisionsSchema.parse(JSON.parse(readFileSync('docs/osm-publication-decisions.json', 'utf8')));

test('decyzje są jednoznaczne i nie pozwalają zmieniać surowych tagów, punktu ani cen', () => {
  assert.ok(manifest.approved.length > 0);
  assert.equal(publicationDecisionsSchema.safeParse({ ...manifest, approved: [...manifest.approved, manifest.approved[0]] }).success, false);
  assert.equal(publicationDecisionsSchema.safeParse({ ...manifest, approved: [{ ...manifest.approved[0], location: { x: 0, y: 0 } }] }).success, false);
  for (const venue of manifest.approved) {
    const patch = publicationPatch(place(), venue, manifest.checkedOn);
    for (const protectedField of ['osmTags', 'openingHoursRaw', 'osmId', 'location', 'prices', 'amenities']) assert.equal(protectedField in patch, false);
  }
});

test('publikacja nie kopiuje niepotwierdzonych godzin OSM ani telefonu', () => {
  const { hours: _hours, phone: _phone, ...venue } = manifest.approved[0];
  void _hours; void _phone;
  const patch = publicationPatch(place({ openingHoursRaw: '24/7', phone: '+48123456789' }), venue, manifest.checkedOn);
  assert.deepEqual(patch.openingHours, []);
  assert.equal(patch.openingHoursCheckDate, null);
  assert.equal(patch.phone, null);
  assert.throws(() => publicationPatch(place(), { ...venue, hours: 'Mo 22:00-02:00' }, manifest.checkedOn));
  const conditional = manifest.approved.find((item) => item.slug === 'osm-node-8890564221')!;
  assert.match(publicationPatch(place(), conditional, manifest.checkedOn).openingHours![0].days, /kluczem/);
});

test('publikacja blokuje stare przeglądy, obiekty prywatne i punkt poza Warszawą', () => {
  const row = place({ osmTags: { access: 'private' }, location: { x: 19, y: 50 } });
  const blockers = publicationBlockers(row, [row], '2026-09-01', new Date('2026-10-04T12:00:00Z'));
  assert.ok(blockers.includes('restricted_access'));
  assert.ok(blockers.includes('stale_or_future_review'));
  assert.ok(blockers.includes('invalid_location'));
  assert.deepEqual(publicationBlockers(place(), [place()], '2026-10-04', new Date('2026-10-04T12:00:00Z')), []);
});

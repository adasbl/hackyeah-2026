import type { CategorySlug } from '@repo/types';
import type { places } from './schema';
import { slugify } from '../lib/catalog';
import { cleanText, normalizePhone, normalizeWebsite, parseOpeningHours } from './osm-publication';
import { normalizePolishPostcode } from './osm-postcode-format';

export const POLAND_IMPORT_CATEGORIES = ['silownia', 'basen', 'fitness', 'wspinaczka', 'tenis', 'squash', 'taniec'] as const;
export type ImportCategory = typeof POLAND_IMPORT_CATEGORIES[number];
export interface PbfEntity {
  type: 'node' | 'way' | 'relation'; id: number; tags?: Record<string, string>;
  lat?: number; lon?: number; refs?: number[];
  members?: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[];
  info?: { version?: number; timestamp?: number | string; changeset?: number; visible?: boolean };
}
export interface Point { x: number; y: number }
const LABELS: Record<ImportCategory, string> = {
  silownia: 'Siłownia', basen: 'Basen / pływalnia', fitness: 'Fitness',
  wspinaczka: 'Ścianka wspinaczkowa', tenis: 'Korty tenisowe', squash: 'Squash / padel', taniec: 'Taniec',
};

export function polandExclusionReason(tags: Record<string, string>): string | null {
  if (tags.leisure === 'fitness_station') return 'outdoor_fitness_station';
  if (['private', 'no'].includes(tags.access)) return 'restricted_access';
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags.proposed === 'yes'
    || tags.construction === 'yes' || Object.keys(tags).some((key) => /^(disused|abandoned|demolished|proposed|construction):/.test(key))) return 'inactive';
  if (tags.shop && tags.shop !== 'no') return 'shop';
  const outdoor = tags.indoor === 'no' || tags.outdoor === 'yes' || tags.location === 'outdoor';
  if (outdoor && tags.fee === 'no') return 'free_outdoor';
  if (tags.natural || tags.waterway || tags.highway || tags.playground || tags.route) return 'not_sports_facility';
  return null;
}

/** Jedna kategoria główna zgodna z obecną tabelą; pozostałe zostają w tagach i raporcie. */
export function classifyPolandSports(tags: Record<string, string>): ImportCategory[] {
  const sports = new Set((tags.sport ?? '').toLowerCase().split(';').map((value) => value.trim()));
  const categories = new Set<ImportCategory>();
  const facility = ['sports_centre', 'sports_hall', 'pitch', 'fitness_centre', 'swimming_pool', 'water_park'].includes(tags.leisure)
    || tags.indoor === 'yes' || tags.club === 'sport';
  const has = (...values: string[]) => values.some((value) => sports.has(value));
  if (tags.amenity === 'gym' || (facility && has('bodybuilding', 'weightlifting', 'powerlifting', 'gym', 'crossfit'))) categories.add('silownia');
  if (tags.leisure === 'fitness_centre') {
    const name = `${tags['name:pl'] ?? tags.name ?? ''} ${tags.brand ?? ''}`;
    categories.add(/siłown|silown|\bgym\b|crossfit/i.test(name) ? 'silownia' : 'fitness');
  }
  if (facility && has('fitness', 'aerobics', 'pilates')) categories.add('fitness');
  if (['swimming_pool', 'water_park'].includes(tags.leisure) || tags.amenity === 'swimming_pool'
    || (facility && has('swimming'))) categories.add('basen');
  if ((facility && has('climbing', 'bouldering')) || tags.climbing === 'wall') categories.add('wspinaczka');
  if (facility && has('tennis')) categories.add('tenis');
  if (facility && has('squash', 'padel')) categories.add('squash');
  if (has('dance', 'dancing') || tags.amenity === 'dancing_school' || tags.club === 'dance'
    || (tags.amenity === 'school' && ['dance', 'dancing'].includes(tags.school))) categories.add('taniec');
  // Basen sam w sobie jest bardziej jednoznaczny niż dodatkowy sport w kompleksie.
  if (['swimming_pool', 'water_park'].includes(tags.leisure)) return ['basen', ...[...categories].filter((category) => category !== 'basen')];
  return POLAND_IMPORT_CATEGORIES.filter((category) => categories.has(category));
}

export function validPoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= 180 && Math.abs(point.y) <= 90;
}

export function normalizePolandPlace(entity: PbfEntity, point: Point, category: CategorySlug): typeof places.$inferInsert {
  if (!validPoint(point) || !Number.isSafeInteger(entity.id) || entity.id <= 0) throw new Error('OSM_INVALID_ID_OR_LOCATION');
  const tags = entity.tags ?? {};
  const text = (key: string) => cleanText(tags[key] ?? null);
  const name = text('name:pl') ?? text('name') ?? text('brand') ?? text('operator');
  const city = text('addr:city') ?? text('addr:town') ?? text('addr:village');
  const timestamp = entity.info?.timestamp;
  const date = timestamp ? new Date(timestamp) : null;
  return {
    osmType: entity.type, osmId: entity.id, osmVersion: entity.info?.version ?? null,
    osmChangesetId: entity.info?.changeset ?? null,
    osmTimestamp: date && Number.isFinite(date.getTime()) ? date : null,
    osmUserName: null, osmUserId: null, osmTags: tags,
    slug: `osm-${entity.type}-${entity.id}`,
    name: name ?? `${LABELS[category as ImportCategory] ?? 'Obiekt sportowy'} bez nazwy (OSM ${entity.type}/${entity.id})`,
    brand: text('brand'), brandWikidataId: text('brand:wikidata'),
    description: text('description:pl') ?? text('description'), category,
    addressStreet: text('addr:street'), addressHouseNumber: text('addr:housenumber'),
    addressFloor: text('addr:floor'), level: text('level'),
    postalCode: tags['addr:country'] && tags['addr:country'].toUpperCase() !== 'PL' ? null : normalizePolishPostcode(tags['addr:postcode']),
    city, citySlug: city ? slugify(city) : null, location: point,
    openingHoursRaw: text('opening_hours'), openingHours: parseOpeningHours(text('opening_hours')).entries,
    website: normalizeWebsite(text('website') ?? text('contact:website')),
    phone: normalizePhone(text('phone') ?? text('contact:phone')),
    paymentMethods: Object.entries(tags).filter(([key, value]) => key.startsWith('payment:') && value === 'yes')
      .map(([key]) => key.slice('payment:'.length)).sort(),
    amenities: [], prices: [], isPublished: false,
  };
}

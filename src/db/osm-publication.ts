import type { OpeningHoursEntry } from '@repo/types';
import { CATEGORY_SLUGS } from '@repo/types';
import { z } from 'zod';
import type { places } from './schema';

export type ReviewPlace = typeof places.$inferSelect;
// Wyłącznie pola konsumowane przez mapper, listę, mapę i stronę szczegółów.
const renderablePlaceSchema = z.object({
  id: z.string().uuid(), slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().trim().min(1),
  category: z.enum(CATEGORY_SLUGS), description: z.string().nullable(),
  addressStreet: z.string().nullable(), addressHouseNumber: z.string().nullable(),
  postalCode: z.string().nullable(), city: z.string().nullable(), citySlug: z.string().nullable(),
  location: z.object({ x: z.number().finite().min(-180).max(180), y: z.number().finite().min(-90).max(90) }),
  openingHours: z.array(z.object({ days: z.string(), hours: z.string() })),
  prices: z.array(z.object({ label: z.string(), amount: z.number().finite().nonnegative(), currency: z.literal('PLN'), note: z.string().nullable() })),
  amenities: z.array(z.string()), website: z.string().nullable(), phone: z.string().nullable(),
  createdAt: z.date(), updatedAt: z.date(),
});

/** Nie wymaga kompletnego adresu, potwierdzenia strony ani redakcyjnej deduplikacji. */
export function technicalPublicationBlockers(place: ReviewPlace): string[] {
  const parsed = renderablePlaceSchema.safeParse(place);
  const blockers = parsed.success ? [] : parsed.error.issues.map((issue) => `invalid_field:${issue.path.join('.')}`);
  if (place.website && !normalizeWebsite(place.website)) blockers.push('unsafe_website');
  const tags = place.osmTags;
  const outdoor = tags.indoor === 'no' || tags.outdoor === 'yes' || tags.location === 'outdoor';
  if (tags.leisure === 'fitness_station' || (outdoor && tags.fee === 'no')) blockers.push('excluded_free_outdoor');
  return blockers;
}

/** Nie nadaje dat weryfikacji, nie zgaduje braków i nie nadpisuje opublikowanych poprawek. */
export function technicalPublicationPatch(place: ReviewPlace): Partial<ReviewPlace> {
  return { isPublished: true, website: normalizeWebsite(place.website) };
}
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_LABELS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

export function cleanText(value: string | null): string | null {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

/** Obsługuje wyłącznie jednoznaczny tygodniowy podzbiór opening_hours. */
export function parseOpeningHours(raw: string | null): {
  status: 'missing' | 'parsed' | 'needs_review'; entries: OpeningHoursEntry[];
} {
  const value = cleanText(raw);
  if (!value) return { status: 'missing', entries: [] };
  if (value === '24/7') return { status: 'parsed', entries: [{ days: 'codziennie', hours: 'całą dobę' }] };
  const invalid = { status: 'needs_review' as const, entries: [] };
  const entries: OpeningHoursEntry[] = [];
  const seen = new Set<string>();
  for (const rule of value.split(';')) {
    const match = rule.trim().match(/^(?:((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+)?(off|closed|(?:\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
    if (!match) return invalid;
    const selector = (match[1] ?? 'Mo-Su').replace(/\s/g, '');
    if ((selector.includes('PH') && selector !== 'PH') || (seen.has('PH') && selector !== 'PH')) return invalid;
    const selected: string[] = [];
    const labels: string[] = [];
    for (const part of selector.split(',')) {
      if (part === 'PH') { selected.push('PH'); labels.push('święta'); continue; }
      const [first, last = first] = part.split('-');
      const start = DAYS.indexOf(first), end = DAYS.indexOf(last);
      if (start < 0 || end < start) return invalid;
      selected.push(...DAYS.slice(start, end + 1));
      labels.push(start === end ? DAY_LABELS[start] : `${DAY_LABELS[start]}–${DAY_LABELS[end]}`);
    }
    // Reguły nakładające się wymagają pełnej interpretacji priorytetów OSM.
    if (new Set(selected).size !== selected.length || selected.some((day) => seen.has(day))) return invalid;
    selected.forEach((day) => seen.add(day));
    let hours = 'zamknięte';
    if (!['off', 'closed'].includes(match[2])) {
      const intervals: string[] = [];
      let previousEnd = -1;
      for (const interval of match[2].split(',')) {
        const [from, until] = interval.trim().split('-');
        const parseTime = (time: string) => {
          const [hour, minute] = time.split(':').map(Number);
          return hour <= 24 && minute < 60 && (hour !== 24 || minute === 0)
            ? hour * 60 + minute : NaN;
        };
        const start = parseTime(from), end = parseTime(until);
        // Nocne i zerowe przedziały pozostają do przeglądu.
        if (!Number.isFinite(start + end) || start >= end || start < previousEnd) return invalid;
        previousEnd = end;
        intervals.push(`${from.padStart(5, '0')}–${until.padStart(5, '0')}`);
      }
      hours = intervals.join(', ');
    }
    entries.push({ days: selector === 'Mo-Su' ? 'codziennie' : labels.join(', '), hours });
  }
  return { status: 'parsed', entries };
}

export function normalizePhone(value: string | null): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const normalized = raw.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^\+\d{8,15}$/.test(normalized)) return normalized;
  if (/^\d{9}$/.test(normalized)) return `+48${normalized}`;
  return raw;
}

export function normalizeWebsite(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function draftCorrections(place: ReviewPlace): Partial<ReviewPlace> {
  const patch: Partial<ReviewPlace> = {};
  for (const key of ['name', 'addressStreet', 'addressHouseNumber', 'postalCode', 'phone'] as const) {
    const cleaned = key === 'phone' ? normalizePhone(place[key]) : cleanText(place[key]);
    if (cleaned !== place[key] && (key !== 'name' || cleaned)) patch[key] = cleaned!;
  }
  const website = normalizeWebsite(place.website);
  // Nie usuwamy niepoprawnego adresu strony; raport wskaże go do poprawy.
  if (website && website !== place.website) patch.website = website;
  if (!place.openingHours.length) {
    const parsed = parseOpeningHours(place.openingHoursRaw);
    if (parsed.status === 'parsed') patch.openingHours = parsed.entries;
  }
  return patch;
}

function comparable(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');
}

function distanceMetres(a: ReviewPlace, b: ReviewPlace): number {
  const rad = Math.PI / 180;
  const dLat = (b.location.y - a.location.y) * rad;
  const dLng = (b.location.x - a.location.x) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.location.y * rad)
    * Math.cos(b.location.y * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export interface DuplicateCandidate {
  first: string; second: string; distanceMetres: number; reasons: string[];
}

export function findDuplicateCandidates(records: ReviewPlace[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i], b = records[j];
      const distance = distanceMetres(a, b);
      if (distance > 250) continue;
      const reasons: string[] = [];
      const named = !a.name.startsWith('Obiekt fitness bez nazwy') && !b.name.startsWith('Obiekt fitness bez nazwy');
      if (named && comparable(a.name) === comparable(b.name)) reasons.push('same_name');
      if (a.phone && b.phone && normalizePhone(a.phone) === normalizePhone(b.phone)) reasons.push('same_phone');
      if (a.website && b.website && normalizeWebsite(a.website) === normalizeWebsite(b.website)) reasons.push('same_website');
      if (a.addressStreet && b.addressStreet && a.addressHouseNumber && b.addressHouseNumber
        && comparable(a.addressStreet) === comparable(b.addressStreet)
        && comparable(a.addressHouseNumber) === comparable(b.addressHouseNumber)) reasons.push('same_address');
      // Dwa budynki tego samego klubu mogą mieć środki oddalone o ponad 50 m.
      const strongMatch = reasons.includes('same_address')
        && (reasons.includes('same_name') || reasons.includes('same_phone'));
      if (reasons.length && (distance <= 50 || strongMatch)) candidates.push({ first: a.slug, second: b.slug, distanceMetres: Math.round(distance), reasons });
    }
  }
  return candidates;
}

export function assessPlace(place: ReviewPlace, duplicates: DuplicateCandidate[]) {
  const tags = place.osmTags;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sports = (tags.sport ?? '').toLowerCase().split(';').map((sport) => sport.trim()).filter(Boolean);
  if (!cleanText(place.name) || place.name.startsWith('Obiekt fitness bez nazwy')) blockers.push('missing_name');
  if (!cleanText(place.addressStreet) || !cleanText(place.addressHouseNumber)) blockers.push('incomplete_address');
  if (tags.indoor === 'no' || tags.outdoor === 'yes' || tags.location === 'outdoor') blockers.push('outdoor_uncertain');
  if (tags.leisure === 'fitness_station') blockers.push('outdoor_fitness_station');
  if (['private', 'no'].includes(tags.access)) blockers.push('restricted_access');
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags.proposed === 'yes'
    || Object.keys(tags).some((key) => /^(disused|abandoned|demolished|proposed|construction):/.test(key))) blockers.push('inactive_or_planned');
  if (duplicates.some((pair) => pair.first === place.slug || pair.second === place.slug)) blockers.push('possible_duplicate');
  if (!place.website && !place.phone) warnings.push('no_contact');
  if (place.website && !normalizeWebsite(place.website)) blockers.push('invalid_website');
  if (place.phone && !/^\+\d{8,15}$/.test(normalizePhone(place.phone) ?? '')) warnings.push('phone_needs_review');
  if (parseOpeningHours(place.openingHoursRaw).status === 'needs_review') warnings.push('hours_need_review');
  if (!place.openingHoursRaw && !place.openingHours.length) warnings.push('missing_hours');
  if (place.osmType !== 'node') warnings.push('approximate_location');
  const strength = sports.some((sport) => ['bodybuilding', 'weightlifting', 'powerlifting', 'strengthlifting', 'gym', 'siłownia', 'crossfit'].includes(sport));
  const fitness = sports.some((sport) => ['fitness', 'aerobics'].includes(sport));
  const suggestedCategory = strength ? 'silownia'
    : sports.includes('yoga') && !fitness && !sports.includes('pilates') ? 'joga'
    : place.category;
  if (suggestedCategory !== place.category) warnings.push('category_change_suggested');
  if (!sports.length || sports.includes('multi')) warnings.push('category_uncertain');
  if (sports.some((sport) => ['swimming', 'boxing', 'kickboxing', 'pole_dance'].includes(sport))) warnings.push('mixed_offer');
  if (sports.includes('yoga') && !strength && !fitness) warnings.push('yoga_studio');
  if (sports.includes('pilates') && !strength && !fitness) warnings.push('pilates_studio');
  return {
    blockers, warnings, suggestedCategory,
    reviewGroup: blockers.length ? 'needs_correction' : 'candidate_for_review',
    // Dane OSM i obecność strony nie stanowią potwierdzenia aktualności obiektu.
    verified: false,
  };
}

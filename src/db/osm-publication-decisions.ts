import { z } from 'zod';
import { assessPlace, findDuplicateCandidates, normalizeWebsite, parseOpeningHours, type ReviewPlace } from './osm-publication';

const text = z.string().trim().min(1);
const sourceUrl = z.string().url().refine((value) => normalizeWebsite(value) === value && value.startsWith('https://'));
const schedule = z.array(z.object({ days: text, hours: text }).strict()).min(1);
export const publicationDecisionsSchema = z.object({
  checkedOn: z.iso.date(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), policy: text,
  approved: z.array(z.object({
    slug: z.string().regex(/^osm-(node|way|relation)-\d+$/), name: text,
    street: text, houseNumber: text, postalCode: z.string().regex(/^\d{2}-\d{3}$/).optional(),
    phone: z.string().regex(/^\+\d{8,15}$/).optional(),
    category: z.enum(['silownia', 'fitness']), sourceUrl, notes: text,
    hours: text.optional(), schedule: schedule.optional(), description: text.optional(),
  }).strict().refine((item) => !(item.hours && item.schedule), 'Jedno źródło harmonogramu')),
  held: z.array(z.object({
    slug: text, reason: text, sourceUrl: sourceUrl.optional(), canonicalSlug: text.optional(), notes: text,
  }).strict()),
}).strict().superRefine((manifest, ctx) => {
  const slugs = [...manifest.approved, ...manifest.held].map((item) => item.slug);
  if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: 'custom', message: 'Powtórzona lub sprzeczna decyzja' });
});

export type PublicationDecisions = z.infer<typeof publicationDecisionsSchema>;
export type ApprovedVenue = PublicationDecisions['approved'][number];

export function publicationPatch(place: ReviewPlace, decision: ApprovedVenue, checkedOn: string): Partial<ReviewPlace> {
  const parsed = decision.hours ? parseOpeningHours(decision.hours) : null;
  if (parsed && parsed.status !== 'parsed') throw new Error('OSM_PUBLICATION_INVALID_HOURS');
  return {
    name: decision.name, addressStreet: decision.street, addressHouseNumber: decision.houseNumber,
    postalCode: decision.postalCode ?? place.postalCode,
    phone: decision.phone ?? null, website: decision.sourceUrl, category: decision.category,
    description: decision.description ?? place.description,
    // Nie potwierdzono godzin na stronie? Nie publikujemy starego harmonogramu OSM.
    openingHours: decision.schedule ?? parsed?.entries ?? [],
    checkDate: checkedOn, openingHoursCheckDate: parsed || decision.schedule ? checkedOn : null,
    isPublished: true,
  };
}

const comparable = (value: string | null) => (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');

export function publicationBlockers(place: ReviewPlace, projected: ReviewPlace[], checkedOn: string, now = new Date()): string[] {
  const date = Date.parse(`${checkedOn}T00:00:00Z`);
  const age = now.getTime() - date;
  const blockers = assessPlace(place, findDuplicateCandidates(projected)).blockers;
  if (!Number.isFinite(date) || age > 14 * 86_400_000 || age < -86_400_000) blockers.push('stale_or_future_review');
  if (place.citySlug !== 'warszawa' || place.city !== 'Warszawa') blockers.push('wrong_city');
  if (!Number.isFinite(place.location.x + place.location.y)
    || place.location.x < 20.75 || place.location.x > 21.3 || place.location.y < 52 || place.location.y > 52.4) blockers.push('invalid_location');
  // Szeroki próg wykrywania duplikatów: ten sam pełny adres i nazwa nawet w odległych częściach budynku.
  if (projected.some((other) => other.id !== place.id
    && comparable(other.name) === comparable(place.name)
    && comparable(other.addressStreet) === comparable(place.addressStreet)
    && comparable(other.addressHouseNumber) === comparable(place.addressHouseNumber))) blockers.push('same_venue_address');
  return [...new Set(blockers)];
}

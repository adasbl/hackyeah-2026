import { z } from 'zod';
import { CARD_PROVIDER_SLUGS, CATEGORY_SLUGS, type CardProviderSlug, type CategorySlug } from '@repo/types';

export const PAGE_SIZE = 10;

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const schema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.enum(CATEGORY_SLUGS).optional().catch(undefined),
  cards: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : []))
    .pipe(z.array(z.string()))
    .transform((arr) => [...new Set(arr.filter((c): c is CardProviderSlug => (CARD_PROVIDER_SLUGS as readonly string[]).includes(c)))]),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export interface SearchFilters {
  q?: string;
  category?: CategorySlug;
  cards: CardProviderSlug[];
  page: number;
}

/** Waliduje parametry URL – błędne wartości są po cichu ignorowane, żeby link nigdy nie zwracał błędu. */
export function parseSearchParams(raw: RawParams): SearchFilters {
  const parsed = schema.safeParse({
    q: first(raw.q) || undefined,
    category: first(raw.category) || undefined,
    cards: first(raw.cards) || undefined,
    page: first(raw.page),
  });
  if (!parsed.success) return { cards: [], page: 1 };
  return parsed.data;
}

/** Buduje URL wyszukiwania w formacie /warszawa?cards=multisport&category=basen */
export function buildSearchUrl(citySlug: string, f: Partial<SearchFilters>) {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.category) params.set('category', f.category);
  if (f.cards?.length) params.set('cards', f.cards.join(','));
  if (f.page && f.page > 1) params.set('page', String(f.page));
  const qs = params.toString().replace(/%2C/g, ',');
  return `/${citySlug}${qs ? `?${qs}` : ''}`;
}

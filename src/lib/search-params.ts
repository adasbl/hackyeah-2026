import { z } from 'zod';
import {
  CARD_PROVIDER_SLUGS,
  CATEGORY_SLUGS,
  PLACES_SORTS,
  type CardProviderSlug,
  type CategorySlug,
  type PlacesSort,
} from '@repo/types';

export const PAGE_SIZE = 10;

/** Promienie do wyboru w „W pobliżu mnie” (metry). */
export const RADIUS_OPTIONS = [1000, 2000, 5000, 10_000, 25_000] as const;
export const DEFAULT_RADIUS = 5000;

/** Widok wyników: lista (domyślnie) albo duża mapa. */
export const RESULT_VIEWS = ['list', 'map'] as const;
export type ResultView = (typeof RESULT_VIEWS)[number];

/** Specjalna „pozycja” w polu miasta: wyszukiwanie wokół lokalizacji użytkownika. */
export const NEAR_ME_SLUG = '@near';

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Współrzędne w URL zaokrąglamy do ~100 m – link nie zdradza dokładnego adresu, a do wyszukiwania to wystarcza. */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).transform(roundCoord).optional().catch(undefined);

const schema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.enum(CATEGORY_SLUGS).optional().catch(undefined),
  cards: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : []))
    .pipe(z.array(z.string()))
    .transform((arr) => [...new Set(arr.filter((c): c is CardProviderSlug => (CARD_PROVIDER_SLUGS as readonly string[]).includes(c)))]),
  open: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  radius: z.coerce.number().int().min(100).max(100_000).optional().catch(undefined),
  sort: z.enum(PLACES_SORTS).optional().catch(undefined),
  view: z.enum(RESULT_VIEWS).catch('list').default('list'),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export interface SearchFilters {
  q?: string;
  category?: CategorySlug;
  cards: CardProviderSlug[];
  /** Tylko otwarte teraz. */
  open: boolean;
  /** Punkt odniesienia dla „w pobliżu” i sortowania po odległości. */
  lat?: number;
  lng?: number;
  radius?: number;
  sort: PlacesSort;
  view: ResultView;
  page: number;
}

/** Waliduje parametry URL – błędne wartości są po cichu ignorowane, żeby link nigdy nie zwracał błędu. */
export function parseSearchParams(raw: RawParams): SearchFilters {
  const parsed = schema.safeParse({
    q: first(raw.q) || undefined,
    category: first(raw.category) || undefined,
    cards: first(raw.cards) || undefined,
    open: first(raw.open) || undefined,
    lat: first(raw.lat) || undefined,
    lng: first(raw.lng) || undefined,
    radius: first(raw.radius) || undefined,
    sort: first(raw.sort) || undefined,
    view: first(raw.view) || undefined,
    page: first(raw.page),
  });
  if (!parsed.success) return { cards: [], open: false, sort: 'name', view: 'list', page: 1 };
  const { lat, lng, radius, sort, ...rest } = parsed.data;
  // Punkt ma sens tylko w komplecie; bez punktu nie ma promienia ani sortowania po odległości.
  const hasPoint = lat !== undefined && lng !== undefined;
  return {
    ...rest,
    ...(hasPoint ? { lat, lng, radius } : {}),
    sort: hasPoint ? (sort ?? 'distance') : 'name',
  };
}

export const hasLocation = (f: Partial<SearchFilters>): f is Partial<SearchFilters> & { lat: number; lng: number } =>
  f.lat !== undefined && f.lng !== undefined;

/** Buduje URL wyszukiwania w formacie /warszawa?cards=multisport&category=basen */
export function buildSearchUrl(citySlug: string, f: Partial<SearchFilters>) {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.category) params.set('category', f.category);
  if (f.cards?.length) params.set('cards', f.cards.join(','));
  if (f.open) params.set('open', '1');
  if (hasLocation(f)) {
    params.set('lat', String(roundCoord(f.lat)));
    params.set('lng', String(roundCoord(f.lng)));
    if (f.radius) params.set('radius', String(f.radius));
    // Przy punkcie domyślne jest sortowanie po odległości – zapisujemy tylko odstępstwo.
    if (f.sort === 'name') params.set('sort', 'name');
  }
  if (f.view === 'map') params.set('view', 'map');
  // Mapa pokazuje wszystkie wyniki naraz – numer strony dotyczy tylko listy.
  if (f.view !== 'map' && f.page && f.page > 1) params.set('page', String(f.page));
  const qs = params.toString().replace(/%2C/g, ',');
  return `/${citySlug}${qs ? `?${qs}` : ''}`;
}

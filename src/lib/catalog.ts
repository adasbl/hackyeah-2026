import type {
  CardProvider,
  CardProviderSlug,
  CardStatus,
  Category,
  CategorySlug,
  Confidence,
  SourceType,
} from '@repo/types';

export const CARD_PROVIDERS: CardProvider[] = [
  { slug: 'multisport', name: 'MultiSport' },
  { slug: 'beactive', name: 'BeActive' },
  { slug: 'medicover-sport', name: 'Medicover Sport' },
  { slug: 'pzu-sport', name: 'PZU Sport' },
];

/** gradient: klasy Tailwind dla kafelka ikony kategorii */
export const CATEGORIES: (Category & { gradient: string; soft: string })[] = [
  { slug: 'silownia', name: 'Siłownia', gradient: 'from-rose-500 to-orange-400', soft: 'bg-rose-50 text-rose-600' },
  { slug: 'basen', name: 'Basen', gradient: 'from-sky-500 to-cyan-400', soft: 'bg-sky-50 text-sky-600' },
  { slug: 'fitness', name: 'Fitness', gradient: 'from-fuchsia-500 to-pink-400', soft: 'bg-fuchsia-50 text-fuchsia-600' },
  { slug: 'joga', name: 'Joga', gradient: 'from-emerald-500 to-teal-400', soft: 'bg-emerald-50 text-emerald-600' },
  { slug: 'wspinaczka', name: 'Ścianka wspinaczkowa', gradient: 'from-amber-500 to-yellow-400', soft: 'bg-amber-50 text-amber-600' },
  { slug: 'squash', name: 'Squash', gradient: 'from-indigo-500 to-violet-400', soft: 'bg-indigo-50 text-indigo-600' },
];

export const CITIES = [
  { slug: 'warszawa', name: 'Warszawa' },
  { slug: 'krakow', name: 'Kraków' },
  { slug: 'gdansk', name: 'Gdańsk' },
  { slug: 'wroclaw', name: 'Wrocław' },
  { slug: 'poznan', name: 'Poznań' },
];

/** Specjalny slug oznaczający wyszukiwanie w całej Polsce. */
export const ALL_CITIES_SLUG = 'polska';
export const ALL_CITIES_LABEL = 'Cała Polska';

export const STATUS_META: Record<CardStatus, { label: string; short: string; className: string; dot: string; description: string }> = {
  accepted: {
    label: 'Akceptowana',
    short: 'tak',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-500',
    description: 'Potwierdzone – obiekt akceptuje kartę.',
  },
  conditional: {
    label: 'Pod warunkami',
    short: 'warunki',
    className: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    dot: 'bg-amber-500',
    description: 'Karta jest akceptowana z ograniczeniami (godziny, dopłata, strefy).',
  },
  not_accepted: {
    label: 'Nieakceptowana',
    short: 'nie',
    className: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    dot: 'bg-rose-500',
    description: 'Potwierdzone – obiekt nie akceptuje karty.',
  },
  unknown: {
    label: 'Brak danych',
    short: '?',
    className: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
    description: 'Nie mamy wystarczających danych, żeby to potwierdzić.',
  },
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  venue: 'Informacja od obiektu',
  public_source: 'Źródło publiczne',
  automated: 'Automatyczna analiza strony',
  community: 'Zgłoszenie społeczności',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'wysoka',
  medium: 'średnia',
  low: 'niska',
};

export const providerName = (slug: CardProviderSlug) => CARD_PROVIDERS.find((p) => p.slug === slug)?.name ?? slug;
export const categoryOf = (slug: CategorySlug) => CATEGORIES.find((c) => c.slug === slug)!;

const PL_CHARS: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_CHARS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function cityName(slug: string) {
  if (slug === ALL_CITIES_SLUG) return ALL_CITIES_LABEL;
  const known = CITIES.find((c) => c.slug === slug);
  if (known) return known.name;
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const dateFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const isExpired = (expiresAt: string | null, now = new Date()) => !!expiresAt && new Date(expiresAt) < now;

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

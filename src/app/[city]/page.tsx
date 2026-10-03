import { SearchX, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Backdrop } from '@/components/backdrop';
import { PlacesMapLazy } from '@/components/map/places-map-lazy';
import { PlaceCard } from '@/components/place-card';
import { FilterChips, SortToggle, ViewToggle } from '@/components/search/results-toolbar';
import { SearchForm } from '@/components/search-form';
import { ALL_CITIES_SLUG, categoryOf, cityLocative, cityName, providerName } from '@/lib/catalog';
import { getCityOptions, searchMapPoints, searchPlaces } from '@/lib/data/places';
import { formatDistance, MAP_LIMIT, toMapPlace } from '@/lib/geo';
import { buildSearchUrl, hasLocation, PAGE_SIZE, parseSearchParams, RADIUS_OPTIONS } from '@/lib/search-params';

type Props = {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CITY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;


export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city } = await params;
  const f = parseSearchParams(await searchParams);
  const what = f.category ? categoryOf(f.category).name : 'Obiekty sportowe';
  const cards = f.cards.length ? ` z kartą ${f.cards.map(providerName).join(', ')}` : '';
  const cities = await getCityOptions();
  const name = cities.find((option) => option.slug === city)?.name ?? cityName(city);
  const where = hasLocation(f) && city === ALL_CITIES_SLUG ? 'w pobliżu' : name;
  return { title: `${what}${cards} – ${where}` };
}

export default async function SearchResultsPage({ params, searchParams }: Props) {
  const { city } = await params;
  if (!CITY_SLUG.test(city)) notFound();

  const filters = parseSearchParams(await searchParams);
  const located = hasLocation(filters);
  const baseQuery = {
    city,
    category: filters.category,
    cards: filters.cards,
    q: filters.q,
    openNow: filters.open || undefined,
    lat: filters.lat,
    lng: filters.lng,
    radius: filters.radius,
  };
  const [{ items, total }, mapResults, cityOptions] = await Promise.all([
    searchPlaces({ ...baseQuery, sort: filters.sort, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    // Mapa pokazuje wszystkie wyniki (do MAP_LIMIT, grupowane w klastry), nie tylko bieżącą stronę listy.
    filters.view === 'map' ? searchMapPoints({ ...baseQuery, limit: MAP_LIMIT }) : Promise.resolve({ items: [], total: 0 }),
    getCityOptions(),
  ]);
  const mapFilters = {
    category: filters.category,
    cards: filters.cards,
    q: filters.q,
    openNow: filters.open || undefined,
    lat: filters.lat,
    lng: filters.lng,
    radius: filters.radius,
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const name = cityOptions.find((option) => option.slug === city)?.name ?? cityName(city);
  const hasFilters = !!(filters.category || filters.cards.length || filters.q || filters.open || located);
  const pageLink = (page: number) => buildSearchUrl(city, { ...filters, page });

  const nearby = located && filters.radius;
  const isList = filters.view === 'list';
  // „Obiekty sportowe w całej Polsce”, „Basen w Warszawie”, „Obiekty sportowe w promieniu 5 km”
  const placeLabel = nearby ? `w promieniu ${formatDistance(filters.radius!)}` : cityLocative(city, name);
  const nextRadius = filters.radius ? RADIUS_OPTIONS.find((r) => r > filters.radius!) : undefined;
  const mapKey = [city, filters.category, filters.cards.join(), filters.q, filters.open, filters.lat, filters.lng, filters.radius].join('|');

  return (
    <div className="relative isolate">
      <Backdrop />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* relative z-20: rozwijane listy formularza muszą być nad mapą (obie sekcje mają własne warstwy przez animację) */}
        <div className="relative z-20 animate-fade-up">
          <SearchForm
            key={`${city}|${filters.category}|${filters.cards.join()}|${filters.lat}|${filters.lng}|${filters.radius}`}
            variant="compact"
            cityOptions={cityOptions}
            initialCitySlug={city}
            initialCategory={filters.category}
            initialCards={filters.cards}
            preserved={{ q: filters.q, open: filters.open, lat: filters.lat, lng: filters.lng, radius: filters.radius, sort: filters.sort, view: filters.view }}
          />
        </div>

        <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {filters.category ? categoryOf(filters.category).name : 'Obiekty sportowe'} {placeLabel}
            </h1>
            <p className="mt-1 text-sm text-slate-500" aria-live="polite">
              {total === 0 ? 'Brak wyników' : `${total} ${plural(total, 'obiekt', 'obiekty', 'obiektów')}`}
              {filters.cards.length > 0 && <> · karty: {filters.cards.map(providerName).join(' + ')}</>}
              {filters.open && <> · otwarte teraz</>}
              {located && filters.sort === 'distance' && <> · od najbliższych</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters && (
              <Link
                href={buildSearchUrl(city, { cards: [], open: false, sort: 'name', view: filters.view, page: 1 })}
                className="flex h-12 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
                Wyczyść filtry
              </Link>
            )}
            <ViewToggle city={city} filters={filters} />
          </div>
        </div>

        {/* Lista: filtry + sortowanie nad wynikami. Mapa: filtry leżą na samej mapie, a sortowanie nie ma sensu. */}
        {(isList || items.length === 0) && (
          <div className="relative z-10 mb-5 flex flex-wrap items-start justify-between gap-3">
            <FilterChips city={city} filters={filters} />
            {isList && items.length > 0 && <SortToggle city={city} filters={filters} />}
          </div>
        )}

        {items.length === 0 ? (
          <div className="animate-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center backdrop-blur">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <SearchX className="size-7" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold">Nic tu nie znaleźliśmy</p>
            <p className="mt-1 text-sm text-slate-500">
              {filters.open
                ? 'O tej porze nic pasującego nie jest otwarte. Wyłącz „Otwarte teraz” albo zmień filtry.'
                : nearby
                  ? 'W tym promieniu nie ma pasujących obiektów. Zwiększ promień albo zmień filtry.'
                  : 'Zmień kartę lub kategorię albo poszukaj w całej Polsce.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Link href={`/${city}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  Wyczyść filtry
                </Link>
              )}
              {filters.open && (
                <Link
                  href={buildSearchUrl(city, { ...filters, open: false, page: 1 })}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Pokaż także zamknięte
                </Link>
              )}
              {nearby && nextRadius && (
                <Link
                  href={buildSearchUrl(city, { ...filters, radius: nextRadius, page: 1 })}
                  className="rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25"
                >
                  Zwiększ promień do {formatDistance(nextRadius)}
                </Link>
              )}
              {!nearby && city !== ALL_CITIES_SLUG && (
                <Link
                  href={buildSearchUrl(ALL_CITIES_SLUG, { ...filters, page: 1 })}
                  className="rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25"
                >
                  Szukaj w całej Polsce
                </Link>
              )}
            </div>
          </div>
        ) : !isList ? (
          <div className="animate-fade-up">
            <PlacesMapLazy
              key={mapKey}
              initialPlaces={mapResults.items.map(toMapPlace)}
              initialTotal={mapResults.total}
              filters={mapFilters}
              overlay={<FilterChips city={city} filters={filters} variant="overlay" />}
            />
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {items.map((p, i) => (
                <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${80 + i * 50}ms` }}>
                  <PlaceCard place={p} />
                </li>
              ))}
            </ul>
          </>
        )}

        {isList && pages > 1 && (
          <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Strony wyników">
            {pageItems(filters.page, pages).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="grid size-10 place-items-center text-slate-400" aria-hidden>
                  …
                </span>
              ) : (
                <Link
                  key={n}
                  href={pageLink(n)}
                  aria-current={n === filters.page ? 'page' : undefined}
                  className={`grid size-10 place-items-center rounded-xl text-sm font-semibold transition ${
                    n === filters.page
                      ? 'bg-ink text-white shadow-md'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink'
                  }`}
                >
                  {n}
                </Link>
              ),
            )}
          </nav>
        )}

      </div>
    </div>
  );
}

/** Numery stron z „…”: 1 … 4 5 6 … 15 – przy wielu stronach pasek się nie rozjeżdża. */
function pageItems(current: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(n - sorted[i - 1] === 2 ? n - 1 : null);
    out.push(n);
  });
  return out;
}

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10,
    t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

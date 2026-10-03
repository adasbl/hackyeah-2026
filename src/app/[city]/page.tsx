import { SearchX, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Backdrop } from '@/components/backdrop';
import { PlacesMapLazy } from '@/components/map/places-map-lazy';
import { PlaceCard } from '@/components/place-card';
import { SearchForm } from '@/components/search-form';
import { ALL_CITIES_SLUG, categoryOf, cityName, providerName } from '@/lib/catalog';
import { getCityOptions, searchPlaces } from '@/lib/data/places';
import { MAP_LIMIT, toMapPlace } from '@/lib/geo';
import { buildSearchUrl, PAGE_SIZE, parseSearchParams } from '@/lib/search-params';

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
  return { title: `${what}${cards} – ${cityName(city)}` };
}

export default async function SearchResultsPage({ params, searchParams }: Props) {
  const { city } = await params;
  if (!CITY_SLUG.test(city)) notFound();

  const filters = parseSearchParams(await searchParams);
  const baseQuery = { city, category: filters.category, cards: filters.cards, q: filters.q };
  const [{ items, total }, mapResults, cityOptions] = await Promise.all([
    searchPlaces({ ...baseQuery, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    // Mapa pokazuje wszystkie wyniki (do MAP_LIMIT), nie tylko bieżącą stronę listy.
    searchPlaces({ ...baseQuery, limit: MAP_LIMIT }),
    getCityOptions(),
  ]);
  const mapFilters = { category: filters.category, cards: filters.cards, q: filters.q };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(filters.category || filters.cards.length || filters.q);
  const pageLink = (page: number) => buildSearchUrl(city, { ...filters, page });

  return (
    <div className="relative isolate">
      <Backdrop />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* relative z-20: rozwijane listy formularza muszą być nad mapą (obie sekcje mają własne warstwy przez animację) */}
        <div className="relative z-20 animate-fade-up">
          <SearchForm
            key={`${city}|${filters.category}|${filters.cards.join()}`}
            variant="compact"
            cityOptions={cityOptions}
            initialCitySlug={city}
            initialCategory={filters.category}
            initialCards={filters.cards}
          />
        </div>

        <div className="mb-5 mt-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {filters.category ? categoryOf(filters.category).name : 'Obiekty sportowe'}
              <span className="text-slate-400"> · </span>
              {city === ALL_CITIES_SLUG ? 'cała Polska' : cityName(city)}
            </h1>
            <p className="mt-1 text-sm text-slate-500" aria-live="polite">
              {total === 0 ? 'Brak wyników' : `${total} ${plural(total, 'obiekt', 'obiekty', 'obiektów')}`}
              {filters.cards.length > 0 && <> · karty: {filters.cards.map(providerName).join(' + ')}</>}
            </p>
          </div>
          {hasFilters && (
            <Link
              href={`/${city}`}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
              Wyczyść filtry
            </Link>
          )}
        </div>

        {items.length === 0 ? (
          <div className="animate-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center backdrop-blur">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <SearchX className="size-7" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold">Nic tu nie znaleźliśmy</p>
            <p className="mt-1 text-sm text-slate-500">Zmień kartę lub kategorię albo poszukaj w całej Polsce.</p>
            <div className="mt-6 flex justify-center gap-2">
              {hasFilters && (
                <Link href={`/${city}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  Wyczyść filtry
                </Link>
              )}
              {city !== ALL_CITIES_SLUG && (
                <Link
                  href={buildSearchUrl(ALL_CITIES_SLUG, { ...filters, page: 1 })}
                  className="rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25"
                >
                  Szukaj w całej Polsce
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 animate-fade-up">
              <PlacesMapLazy
                key={`${city}|${filters.category}|${filters.cards.join()}|${filters.q}`}
                initialPlaces={mapResults.items.map(toMapPlace)}
                initialTotal={mapResults.total}
                filters={mapFilters}
              />
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {items.map((p, i) => (
                <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${80 + i * 50}ms` }}>
                  <PlaceCard place={p} />
                </li>
              ))}
            </ul>
          </>
        )}

        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Strony wyników">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
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
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

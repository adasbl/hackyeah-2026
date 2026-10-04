'use client';

import { Clock, List, Loader2, LocateFixed, Map as MapIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import type { PlacesSort } from '@repo/types';
import { preloadPlacesMap } from '@/components/map/places-map-lazy';
import { ALL_CITIES_SLUG } from '@/lib/catalog';
import { buildSearchUrl, DEFAULT_RADIUS, hasLocation, type ResultView, type SearchFilters } from '@/lib/search-params';
import { RadiusSelect } from './radius-select';
import { SortMenu } from './sort-menu';
import { GEO_ERROR_LABEL, useGeolocation } from './use-geolocation';

interface Props {
  city: string;
  filters: SearchFilters;
}

/** Nawigacja w obrębie wyników: zmiana filtra wraca na 1. stronę i nie przewija strony do góry. */
function useResultsNav({ city, filters }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const url = (patch: Partial<SearchFilters>, targetCity = city) => buildSearchUrl(targetCity, { ...filters, page: 1, ...patch });
  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  return { url, go, pending };
}

const chipBase =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition active:scale-[0.98]';
const chipStyles = {
  toolbar: {
    off: 'border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:border-slate-300 hover:text-ink',
    on: 'border-brand-500/40 bg-brand-50 text-brand-700 shadow-sm ring-2 ring-brand-500/15',
  },
  // Na mapie: mocniejszy cień i nieprzezroczyste tło, żeby było czytelne na kolorowym podkładzie.
  overlay: {
    off: 'border-white/80 bg-white/95 text-slate-700 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.35)] hover:text-ink',
    on: 'border-brand-500/50 bg-white text-brand-700 shadow-[0_6px_20px_-6px_rgba(30,64,175,0.45)] ring-2 ring-brand-500/25',
  },
};

/** „Otwarte teraz” i „W pobliżu mnie” (+ promień). Wariant `overlay` leży na mapie. */
export function FilterChips({ city, filters, variant = 'toolbar', showClear = false }: Props & { variant?: 'toolbar' | 'overlay'; showClear?: boolean }) {
  const { url, go, pending } = useResultsNav({ city, filters });
  const { state: geo, locate } = useGeolocation();
  const located = hasLocation(filters);
  const s = chipStyles[variant];

  async function nearMe() {
    const point = await locate();
    // „W pobliżu” = obszar wyznacza promień, nie miasto – szukamy w całej Polsce wokół punktu.
    if (point) go(url({ ...point, radius: DEFAULT_RADIUS, sort: 'distance' }, ALL_CITIES_SLUG));
  }

  const geoError = GEO_ERROR_LABEL[geo];

  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={url({ open: !filters.open })} scroll={false} aria-pressed={filters.open} className={`${chipBase} ${filters.open ? s.on : s.off}`}>
          <Clock className="size-4" aria-hidden />
          Otwarte teraz
          {filters.open && <X className="-mr-1 size-3.5 opacity-70" aria-hidden />}
        </Link>

        {located && filters.radius ? (
          <div className={`${chipBase} ${s.on} gap-0 p-0`}>
            <span className="flex items-center gap-1.5 pl-3.5 pr-2">
              <LocateFixed className="size-4" aria-hidden />W pobliżu
            </span>
            <div className="h-full py-1">
              <RadiusSelect value={filters.radius} onChange={(radius) => go(url({ radius }))} />
            </div>
            <Link
              href={url({ lat: undefined, lng: undefined, radius: undefined, sort: 'name' })}
              scroll={false}
              aria-label="Wyłącz wyszukiwanie w pobliżu"
              className="grid h-full place-items-center rounded-r-full pl-1.5 pr-3 opacity-70 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          <button type="button" onClick={nearMe} disabled={pending || geo === 'locating'} className={`${chipBase} ${s.off} disabled:opacity-70`}>
            {geo === 'locating' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
            {geo === 'locating' ? 'Ustalam lokalizację…' : 'W pobliżu mnie'}
          </button>
        )}
        {showClear && (
          <Link
            href={url({ category: undefined, cards: [], q: undefined, open: false, lat: undefined, lng: undefined, radius: undefined, sort: 'name' })}
            scroll={false}
            className={`${chipBase} ${s.off}`}
          >
            <X className="size-4" aria-hidden />
            Wyczyść filtry
          </Link>
        )}
        {pending && <Loader2 className="size-4 shrink-0 animate-spin text-brand-600" aria-label="Wczytywanie" />}
      </div>
      {geoError && (
        <p className={`text-sm text-rose-700 ${variant === 'overlay' ? 'rounded-lg bg-white/95 px-2.5 py-1 shadow-sm' : ''}`} role="alert">
          {geoError}
        </p>
      )}
    </div>
  );
}

/** Sortowanie listy: po nazwie albo od najbliższych (pyta o lokalizację, jeśli jej jeszcze nie ma). */
export function SortSelect({ city, filters }: Props) {
  const { url, go, pending } = useResultsNav({ city, filters });
  const { state: geo, locate } = useGeolocation();
  const located = hasLocation(filters);

  async function sortBy(sort: PlacesSort) {
    if (sort === filters.sort) return;
    if (sort === 'distance' && !located) {
      // Sortowanie po odległości bez promienia – zostajemy w wybranym mieście.
      const point = await locate();
      if (point) go(url({ ...point, radius: undefined, sort: 'distance' }));
      return;
    }
    go(url({ sort }));
  }

  const busy = pending || geo === 'locating';
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-48">
      <SortMenu value={filters.sort} busy={busy} onChange={sortBy} />
      {busy && <span className="sr-only" role="status">{geo === 'locating' ? 'Ustalam lokalizację…' : 'Wczytywanie wyników…'}</span>}
      {GEO_ERROR_LABEL[geo] && (
        <p className="text-sm text-rose-700" role="alert">
          {GEO_ERROR_LABEL[geo]}
        </p>
      )}
    </div>
  );
}

/** Przełącznik Lista / Mapa – zapisany w URL (view=map), więc odświeżenie i „wstecz” go pamiętają. */
export function ViewToggle({ city, filters }: Props) {
  useEffect(() => {
    if (filters.view !== 'list') return;
    // Ciężki kod pobieramy po renderze listy, kiedy przeglądarka ma wolną chwilę.
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preloadPlacesMap, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preloadPlacesMap, 750);
    return () => clearTimeout(id);
  }, [filters.view]);

  const views: { value: ResultView; label: string; icon: React.ReactNode }[] = [
    { value: 'list', label: 'Lista', icon: <List className="size-5" aria-hidden /> },
    { value: 'map', label: 'Mapa', icon: <MapIcon className="size-5" aria-hidden /> },
  ];
  return (
    <nav aria-label="Widok wyników" className="inline-flex h-14 shrink-0 items-center gap-1 rounded-2xl border border-slate-800 bg-ink p-1 shadow-lg shadow-slate-900/15 sm:h-16 sm:p-1.5">
      {views.map((v) => {
        const active = filters.view === v.value;
        return (
          <Link
            key={v.value}
            href={buildSearchUrl(city, { ...filters, view: v.value })}
            // Dynamiczna strona potrzebuje pełnego prefetch, razem z wynikami z serwera.
            prefetch={!active}
            onPointerEnter={v.value === 'map' ? preloadPlacesMap : undefined}
            onFocus={v.value === 'map' ? preloadPlacesMap : undefined}
            onTouchStart={v.value === 'map' ? preloadPlacesMap : undefined}
            scroll={false}
            aria-current={active ? 'page' : undefined}
            aria-label={v.label}
            className={`flex h-full min-w-12 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold transition focus-visible:outline-white focus-visible:outline-offset-[-3px] sm:min-w-28 sm:px-5 ${
              active ? 'bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-md shadow-brand-600/30 ring-1 ring-inset ring-white/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {v.icon}
            <span className="sr-only sm:not-sr-only">{v.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

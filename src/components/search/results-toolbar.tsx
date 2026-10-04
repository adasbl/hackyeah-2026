'use client';

import { ArrowDownAZ, ChevronDown, Clock, List, Loader2, LocateFixed, Map as MapIcon, Navigation, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import type { PlacesSort } from '@repo/types';
import { ALL_CITIES_SLUG } from '@/lib/catalog';
import { buildSearchUrl, DEFAULT_RADIUS, hasLocation, type ResultView, type SearchFilters } from '@/lib/search-params';
import { RadiusSelect } from './radius-select';
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
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium backdrop-blur transition active:scale-[0.98]';
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
export function FilterChips({ city, filters, variant = 'toolbar' }: Props & { variant?: 'toolbar' | 'overlay' }) {
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
    <div className="flex flex-col items-start gap-2">
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
  const selectId = useId();
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
    <div className="flex w-full flex-col gap-2 sm:w-48">
      <label htmlFor={selectId} className="pl-1 text-xs font-bold uppercase tracking-wider text-slate-600">Sortowanie</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : filters.sort === 'distance' ? <Navigation className="size-5" aria-hidden /> : <ArrowDownAZ className="size-5" aria-hidden />}
        </span>
        <select
          id={selectId}
          value={filters.sort}
          onChange={(event) => sortBy(event.target.value as PlacesSort)}
          disabled={busy}
          aria-busy={busy}
          className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white/90 pl-12 pr-10 text-[15px] font-semibold text-ink shadow-sm backdrop-blur transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-70"
        >
          <option value="name">Nazwa</option>
          <option value="distance">Najbliżej</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
      </div>
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
  const views: { value: ResultView; label: string; icon: React.ReactNode }[] = [
    { value: 'list', label: 'Lista', icon: <List className="size-6" aria-hidden /> },
    { value: 'map', label: 'Mapa', icon: <MapIcon className="size-6" aria-hidden /> },
  ];
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <span className="pl-1 text-xs font-bold uppercase tracking-wider text-slate-600">Widok wyników</span>
      <nav aria-label="Widok wyników" className="inline-flex h-12 items-center gap-1 rounded-2xl border border-slate-800 bg-ink p-1 shadow-lg shadow-slate-900/15">
        {views.map((v) => {
          const active = filters.view === v.value;
          return (
            <Link
              key={v.value}
              href={buildSearchUrl(city, { ...filters, view: v.value })}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`flex h-full min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold transition focus-visible:outline-white focus-visible:outline-offset-[-3px] ${
                active ? 'bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-md shadow-brand-600/30 ring-1 ring-inset ring-white/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {v.icon}
              {v.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

'use client';

import { Check, ChevronDown, CreditCard, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import type { CardProviderSlug, CategorySlug } from '@repo/types';
import { ALL_CITIES_SLUG, CARD_PROVIDERS, categoryOf, cityName, providerName } from '@/lib/catalog';
import type { CityOption } from '@/lib/data/places';
import { buildSearchUrl, DEFAULT_RADIUS, hasLocation, NEAR_ME_SLUG, resolveSearchInput, type SearchFilters } from '@/lib/search-params';
import { CategorySelect } from './search/category-select';
import { CityCombobox } from './search/city-combobox';
import { GEO_ERROR_LABEL, useGeolocation } from './search/use-geolocation';

interface Props {
  cityOptions: CityOption[];
  initialCitySlug?: string;
  initialCategory?: CategorySlug;
  initialCards?: CardProviderSlug[];
  variant?: 'hero' | 'compact';
  /** Aktualna fraza oraz filtry „otwarte teraz”, „w pobliżu”, sortowanie i widok. */
  preserved?: Partial<Omit<SearchFilters, 'category' | 'cards' | 'page'>>;
}

export function SearchForm({ cityOptions, initialCitySlug, initialCategory, initialCards = [], variant = 'hero', preserved }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialCity = cityOptions.find((c) => c.slug === initialCitySlug);
  // Wyniki „w pobliżu” (cała Polska + punkt + promień) pokazujemy w polu miasta jako „W pobliżu mnie”.
  const initialNear = initialCitySlug === ALL_CITIES_SLUG && preserved && hasLocation(preserved) && preserved.radius ? preserved : null;
  const [city, setCity] = useState<{ slug: string | null; text: string }>(
    initialNear
      ? { slug: NEAR_ME_SLUG, text: 'W pobliżu mnie' }
      : initialCitySlug === ALL_CITIES_SLUG && preserved?.q
        ? { slug: null, text: preserved.q }
        : { slug: initialCity?.slug ?? initialCitySlug ?? null, text: initialCity?.name ?? (initialCitySlug ? cityName(initialCitySlug) : '') },
  );
  const [nearPoint, setNearPoint] = useState(initialNear ? { lat: initialNear.lat, lng: initialNear.lng } : null);
  const { state: geo, locate } = useGeolocation();

  async function pickNearMe() {
    const point = await locate();
    if (!point) return; // komunikat o błędzie pokazuje się pod formularzem, pole zostaje bez zmian
    setNearPoint(point);
    setCity({ slug: NEAR_ME_SLUG, text: 'W pobliżu mnie' });
  }
  const [category, setCategory] = useState<CategorySlug | ''>(initialCategory ?? '');
  const [cards, setCards] = useState<CardProviderSlug[]>(initialCards);
  // Na stronie wyników formularz jest zwinięty do paska na każdym ekranie.
  const [expanded, setExpanded] = useState(false);
  const formId = useId();
  const summaryRef = useRef<HTMLButtonElement>(null);

  const toggleCard = (slug: CardProviderSlug) =>
    setCards((prev) =>
      prev.includes(slug)
        ? prev.filter((c) => c !== slug)
        : CARD_PROVIDERS.map((p) => p.slug).filter((s) => s === slug || prev.includes(s)),
    );

  function search(url: string) {
    setExpanded(false);
    summaryRef.current?.focus();
    startTransition(() => router.push(url, { scroll: true }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (city.slug === NEAR_ME_SLUG && nearPoint) {
      const radius = initialNear?.radius ?? DEFAULT_RADIUS;
      const url = buildSearchUrl(ALL_CITIES_SLUG, {
        q: preserved?.q,
        open: preserved?.open,
        view: preserved?.view,
        ...nearPoint,
        radius,
        sort: 'distance',
        category: category || undefined,
        cards,
      });
      search(url);
      return;
    }
    const { city: slug, q } = resolveSearchInput(city, cityOptions);
    // Inny obszar usuwa punkt „w pobliżu”; „otwarte teraz” i widok zostają.
    const keep = slug === initialCitySlug && !initialNear ? preserved : { open: preserved?.open, view: preserved?.view };
    const nextQuery = q ?? (city.slug === initialCitySlug && slug !== ALL_CITIES_SLUG ? preserved?.q : undefined);
    search(buildSearchUrl(slug, { ...keep, q: nextQuery, category: category || undefined, cards }));
  }

  const hero = variant === 'hero';
  const collapsible = !hero;

  // Podsumowanie AKTUALNIE zastosowanych filtrów (z adresu strony), nie tych w trakcie edycji.
  const summaryCity = initialNear ? 'W pobliżu mnie' : preserved?.q || (initialCity?.name ?? (initialCitySlug ? cityName(initialCitySlug) : 'Cała Polska'));
  const summaryDetails = [
    initialCategory ? categoryOf(initialCategory).name : 'Wszystkie kategorie',
    initialCards.length ? initialCards.map(providerName).join(', ') : 'dowolna karta',
  ].join(' · ');

  return (
    <>
      {collapsible && (
        <button
          ref={summaryRef}
          type="button"
          disabled={pending}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={formId}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 text-left shadow-[0_20px_50px_-30px_rgba(30,64,175,0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl transition hover:bg-white disabled:opacity-70"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-300 text-slate-500">
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <SlidersHorizontal className="size-5" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-semibold text-ink">{summaryCity}</span>
            <span className="block truncate text-sm leading-relaxed text-slate-500">{summaryDetails}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 pr-1 text-sm font-medium text-brand-600">
            {pending ? 'Szukam…' : expanded ? 'Zwiń' : 'Zmień'}
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </button>
      )}
      <form
        id={formId}
        onSubmit={submit}
        role="search"
        aria-label="Wyszukaj obiekt sportowy"
        className={`relative rounded-2xl border border-white/70 bg-white/80 shadow-[0_30px_80px_-30px_rgba(30,64,175,0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl ${
          hero ? 'p-4 sm:p-6' : 'p-3 sm:p-4'
        } ${collapsible ? `mt-2 ${expanded ? 'animate-pop' : 'hidden'}` : ''}`}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
          <CityCombobox options={cityOptions} value={city} onChange={setCity} onPickNearMe={pickNearMe} locating={geo === 'locating'} />
          <CategorySelect value={category} onChange={setCategory} />
          <button
            type="submit"
            disabled={pending}
            className="order-last flex min-h-16 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 sm:order-none"
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Search className="size-5" aria-hidden />}
            <span>Szukaj</span>
          </button>

          <fieldset className="mt-2 min-w-0 border-t border-slate-100 pt-4 sm:col-span-3">
            <legend className="sr-only">Karta sportowa</legend>
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink" aria-hidden>
              <CreditCard className="size-3.5" />
              Twoja karta sportowa
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {CARD_PROVIDERS.map((p) => {
                const on = cards.includes(p.slug);
                return (
                  <button
                    key={p.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCard(p.slug)}
                    className={`group relative flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                      on
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                        : 'border-slate-200 bg-white text-ink hover:border-brand-500 hover:bg-brand-50/50'
                    }`}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${
                        on
                          ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm'
                          : 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-500/15 group-hover:bg-brand-100'
                      }`}
                    >
                      {on ? <Check className="size-4 animate-pop" strokeWidth={3} /> : <CreditCard className="size-4" />}
                    </span>
                    <span className="leading-tight">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
        {GEO_ERROR_LABEL[geo] && (
          <p className="mt-2 px-2 text-sm text-rose-700" role="alert">
            {GEO_ERROR_LABEL[geo]}
          </p>
        )}
      </form>
    </>
  );
}

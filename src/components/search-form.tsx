'use client';

import { Check, CreditCard, Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CardProviderSlug, CategorySlug } from '@repo/types';
import { ALL_CITIES_SLUG, CARD_PROVIDERS, cityName, slugify } from '@/lib/catalog';
import type { CityOption } from '@/lib/data/places';
import { buildSearchUrl } from '@/lib/search-params';
import { CategorySelect } from './search/category-select';
import { CityCombobox } from './search/city-combobox';

interface Props {
  cityOptions: CityOption[];
  initialCitySlug?: string;
  initialCategory?: CategorySlug;
  initialCards?: CardProviderSlug[];
  variant?: 'hero' | 'compact';
}

export function SearchForm({ cityOptions, initialCitySlug, initialCategory, initialCards = [], variant = 'hero' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialCity = cityOptions.find((c) => c.slug === initialCitySlug);
  const [city, setCity] = useState<{ slug: string | null; text: string }>({
    slug: initialCity?.slug ?? initialCitySlug ?? null,
    text: initialCity?.name ?? (initialCitySlug ? cityName(initialCitySlug) : ''),
  });
  const [category, setCategory] = useState<CategorySlug | ''>(initialCategory ?? '');
  const [cards, setCards] = useState<CardProviderSlug[]>(initialCards);

  const toggleCard = (slug: CardProviderSlug) =>
    setCards((prev) =>
      prev.includes(slug)
        ? prev.filter((c) => c !== slug)
        : CARD_PROVIDERS.map((p) => p.slug).filter((s) => s === slug || prev.includes(s)),
    );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const typed = slugify(city.text);
    const slug = city.slug ?? (cityOptions.find((c) => slugify(c.name) === typed)?.slug || typed || ALL_CITIES_SLUG);
    startTransition(() => router.push(buildSearchUrl(slug, { category: category || undefined, cards })));
  }

  const hero = variant === 'hero';

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Wyszukaj obiekt sportowy"
      className={`relative rounded-3xl border border-white/70 bg-white/80 shadow-[0_30px_80px_-30px_rgba(30,64,175,0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl ${
        hero ? 'p-3 sm:p-4' : 'p-2.5 sm:p-3'
      }`}
    >
      <div className="grid gap-2 sm:grid-cols-[1.35fr_1fr_auto]">
        <CityCombobox options={cityOptions} value={city} onChange={setCity} />
        <CategorySelect value={category} onChange={setCategory} />
        <button
          type="submit"
          disabled={pending}
          className="group relative order-last flex h-16 items-center justify-center gap-2 overflow-hidden rounded-xl sm:order-none bg-gradient-to-br from-brand-500 to-violet-600 px-7 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 active:scale-[0.98] disabled:opacity-70"
        >
          <span
            className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100"
            aria-hidden
          />
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
          <span>Szukaj</span>
        </button>

        <fieldset className="rounded-2xl bg-slate-50/80 p-2 sm:col-span-3">
          <legend className="sr-only">Karta sportowa</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CARD_PROVIDERS.map((p) => {
              const on = cards.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCard(p.slug)}
                  className={`group relative flex h-12 items-center gap-2 rounded-xl border px-2.5 sm:gap-2.5 sm:px-3 text-left text-sm font-medium transition-all duration-200 ${
                    on
                      ? 'border-brand-500/50 bg-white text-ink shadow-md shadow-brand-600/10 ring-2 ring-brand-500/20'
                      : 'border-transparent text-slate-600 hover:bg-white hover:text-ink hover:shadow-sm'
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${
                      on
                        ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white'
                        : 'bg-slate-200/70 text-slate-500 group-hover:bg-slate-200'
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
    </form>
  );
}

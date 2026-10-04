'use client';

import { Check, Globe, Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { ALL_CITIES_SLUG, slugify } from '@/lib/catalog';
import { NEAR_ME_SLUG } from '@/lib/search-params';
import type { CityOption } from '@/lib/data/places';
import { DROPDOWN_PANEL, FIELD_BOX, useDismiss } from './use-dismiss';

interface Props {
  options: CityOption[];
  value: { slug: string | null; text: string };
  onChange: (v: { slug: string | null; text: string }) => void;
  /** Wybranie „W pobliżu mnie” – formularz pyta o lokalizację. */
  onPickNearMe?: () => void;
  /** Trwa ustalanie lokalizacji. */
  locating?: boolean;
}

/** Pozycja „W pobliżu mnie” na liście miast (count -2 = pozycja specjalna). */
const NEAR_ME_OPTION: CityOption = { slug: NEAR_ME_SLUG, name: 'W pobliżu mnie', count: -2 };

const countLabel = (n: number) => (n === 1 ? '1 obiekt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} obiekty` : `${n} obiektów`);

export function CityCombobox({ options, value, onChange, onPickNearMe, locating = false }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const selected = value.slug === NEAR_ME_SLUG ? NEAR_ME_OPTION : options.find((o) => o.slug === value.slug);
  const query = selected && (selected.slug === NEAR_ME_SLUG || selected.slug === ALL_CITIES_SLUG) && selected.name === value.text ? '' : slugify(value.text);

  const items = useMemo(() => {
    const list = query ? options.filter((o) => o.slug !== ALL_CITIES_SLUG && slugify(o.name).includes(query)) : options.filter((o) => o.slug === ALL_CITIES_SLUG);
    const exact = options.some((o) => slugify(o.name) === query);
    // Dowolna fraza szuka po miejscowości, kodzie pocztowym, nazwie i brandzie.
    const withFree = value.text.trim() && !exact && query ? [{ slug: query, name: value.text.trim(), count: -1 }, ...list] : list;
    // „W pobliżu mnie” zawsze na samej górze (gdy nic nie wpisano albo wpisano np. „pobl”).
    const showNear = onPickNearMe && (!query || slugify(NEAR_ME_OPTION.name).includes(query));
    return showNear ? [NEAR_ME_OPTION, ...withFree] : withFree;
  }, [options, query, value.text, onPickNearMe]);

  function pick(o: CityOption) {
    if (o.slug === NEAR_ME_SLUG) {
      setOpen(false);
      inputRef.current?.blur();
      onPickNearMe?.();
      return;
    }
    onChange({ slug: o.count === -1 ? null : o.slug, text: o.name });
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (e.key === 'Enter' && open && items[active]) {
      if (items[active].count === -1) {
        setOpen(false);
        return; // Dowolną frazę można wyszukać od razu klawiszem Enter.
      }
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className={`${FIELD_BOX} cursor-text`}>
        {locating ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-brand-600" aria-hidden />
        ) : value.slug === NEAR_ME_SLUG ? (
          <LocateFixed className="size-5 shrink-0 text-brand-600" aria-hidden />
        ) : (
          <MapPin className="size-5 shrink-0 text-slate-400 transition group-focus-within:text-brand-600" aria-hidden />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Miejscowość, kod pocztowy lub nazwa"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
            value={locating ? 'Ustalam lokalizację…' : value.text}
            readOnly={locating}
            onChange={(e) => {
              onChange({ slug: null, text: e.target.value });
              setOpen(true);
              setActive(0);
            }}
            onFocus={(e) => {
              setOpen(true);
              setActive(Math.max(0, items.findIndex((o) => o.slug === value.slug)));
              e.target.select();
            }}
            onKeyDown={onKeyDown}
            placeholder="Miejscowość, kod pocztowy lub nazwa"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            className="w-full truncate bg-transparent focus-visible:outline-none text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-slate-400"
          />
        </span>
      </label>

      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className={`${DROPDOWN_PANEL} max-h-80 overflow-auto`}>
          {items.map((o, i) => {
            const isAll = o.slug === ALL_CITIES_SLUG;
            const isNear = o.slug === NEAR_ME_SLUG;
            const isFree = o.count === -1;
            const isSel = o.slug === value.slug;
            return (
              <li
                key={o.slug + i}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSel}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${i === active ? 'bg-slate-100' : ''} ${
                  isNear ? 'mb-1 border-b border-slate-100 pb-3' : ''
                }`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    isAll
                      ? 'bg-gradient-to-br from-brand-500 to-violet-500 text-white'
                      : isNear
                        ? 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-500/20'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isAll ? <Globe className="size-4" /> : isNear ? <LocateFixed className="size-4" /> : isFree ? <Search className="size-4" /> : <MapPin className="size-4" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-sm font-medium ${isNear ? 'text-brand-700' : 'text-ink'}`}>{isFree ? `Szukaj „${o.name}”` : o.name}</span>
                  <span className="text-xs text-slate-500">
                    {isNear ? 'Użyj mojej lokalizacji · od najbliższych' : isAll ? `Wszystkie obiekty · ${o.count}` : isFree ? 'Miejscowość, kod pocztowy lub nazwa · cała Polska' : countLabel(o.count)}
                  </span>
                </span>
                {isSel && <Check className="size-4 text-brand-600" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

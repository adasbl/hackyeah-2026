'use client';

import { Check, Globe, MapPin, Search } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { ALL_CITIES_SLUG, slugify } from '@/lib/catalog';
import type { CityOption } from '@/lib/data/places';
import { DROPDOWN_PANEL, FIELD_BOX, useDismiss } from './use-dismiss';

interface Props {
  options: CityOption[];
  value: { slug: string | null; text: string };
  onChange: (v: { slug: string | null; text: string }) => void;
}

const countLabel = (n: number) => (n === 1 ? '1 obiekt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} obiekty` : `${n} obiektów`);

export function CityCombobox({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const selected = options.find((o) => o.slug === value.slug);
  const query = selected && selected.name === value.text ? '' : slugify(value.text);

  const items = useMemo(() => {
    const list = query ? options.filter((o) => o.slug !== ALL_CITIES_SLUG && slugify(o.name).includes(query)) : options;
    const exact = options.some((o) => o.slug === query);
    // Miasta spoza listy też da się wyszukać
    return query && !exact ? [...list, { slug: query, name: value.text.trim(), count: -1 }] : list;
  }, [options, query, value.text]);

  function pick(o: CityOption) {
    onChange({ slug: o.slug, text: o.name });
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className={`${FIELD_BOX} cursor-text`}>
        <MapPin className="size-5 shrink-0 text-slate-400 transition group-focus-within:text-brand-600" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Miasto</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
            value={value.text}
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
            placeholder="Gdzie szukasz?"
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
            const isFree = o.count < 0;
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
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${i === active ? 'bg-slate-100' : ''}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    isAll ? 'bg-gradient-to-br from-brand-500 to-violet-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isAll ? <Globe className="size-4" /> : isFree ? <Search className="size-4" /> : <MapPin className="size-4" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{isFree ? `Szukaj „${o.name}”` : o.name}</span>
                  <span className="text-xs text-slate-500">
                    {isAll ? `Wszystkie obiekty · ${o.count}` : isFree ? 'Miasto spoza listy' : countLabel(o.count)}
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

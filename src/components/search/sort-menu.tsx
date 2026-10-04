'use client';

/**
 * Wybór sortowania wyników – własna lista zamiast systemowego <select>,
 * spójna wizualnie z wyborem promienia. Wzorzec ARIA: przycisk + listbox.
 */
import { ArrowDownAZ, Check, ChevronDown, Loader2, Navigation } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PlacesSort } from '@repo/types';
import { useDismiss } from './use-dismiss';

const SORT_OPTIONS: { value: PlacesSort; label: string; icon: React.ReactNode }[] = [
  { value: 'name', label: 'Nazwa A–Z', icon: <ArrowDownAZ className="size-4" aria-hidden /> },
  { value: 'distance', label: 'Najbliżej', icon: <Navigation className="size-4" aria-hidden /> },
];

interface Props {
  value: PlacesSort;
  busy?: boolean;
  onChange: (sort: PlacesSort) => void;
}

export function SortMenu({ value, busy = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const indexOf = (v: PlacesSort) => Math.max(0, SORT_OPTIONS.findIndex((o) => o.value === v));
  const [active, setActive] = useState(() => indexOf(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const current = SORT_OPTIONS[indexOf(value)];

  function choose(sort: PlacesSort) {
    setOpen(false);
    buttonRef.current?.focus();
    if (sort !== value) onChange(sort);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + SORT_OPTIONS.length) % SORT_OPTIONS.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : SORT_OPTIONS.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(SORT_OPTIONS[active].value);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') buttonRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={busy}
        aria-busy={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Sortowanie: ${current.label}`}
        onClick={() => {
          setActive(indexOf(value));
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(indexOf(value));
            setOpen(true);
          }
        }}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white pl-3.5 pr-3 text-sm font-medium text-ink shadow-sm transition disabled:cursor-wait disabled:opacity-70 ${
          open ? 'border-brand-500/40 ring-2 ring-brand-500/15' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="text-slate-500">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : current.icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Sortowanie wyników"
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top animate-pop rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.4)] outline-none backdrop-blur-xl"
        >
          <li className="px-3 pb-1.5 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-400" role="presentation">
            Sortuj według
          </li>
          {SORT_OPTIONS.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${i === active ? 'bg-slate-100' : ''} ${
                  selected ? 'text-brand-700' : 'text-ink'
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    selected ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {o.icon}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">{o.label}</span>
                {selected && <Check className="size-4 shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

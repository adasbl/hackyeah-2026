'use client';

/**
 * Wybór promienia „W pobliżu” – własna lista zamiast systemowego <select>,
 * żeby wyglądała tak samo jak reszta interfejsu (i na mapie, i nad listą).
 * Wzorzec ARIA: przycisk + listbox, obsługa strzałek, Enter, Escape i kliknięcia poza listą.
 */
import { Bike, Car, Check, ChevronDown, Footprints, MapPinned } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatDistance } from '@/lib/geo';
import { RADIUS_OPTIONS } from '@/lib/search-params';
import { useDismiss } from './use-dismiss';

/** Podpowiedź „ile to jest” – łatwiej wybrać promień, myśląc czasem dojazdu niż kilometrami. */
const HINTS: Record<number, { text: string; icon: React.ReactNode }> = {
  1000: { text: 'ok. 12 min pieszo', icon: <Footprints className="size-4" aria-hidden /> },
  2000: { text: 'ok. 25 min pieszo', icon: <Footprints className="size-4" aria-hidden /> },
  5000: { text: 'ok. 20 min rowerem', icon: <Bike className="size-4" aria-hidden /> },
  10_000: { text: 'ok. 20 min autem', icon: <Car className="size-4" aria-hidden /> },
  25_000: { text: 'cała okolica', icon: <MapPinned className="size-4" aria-hidden /> },
};

interface Props {
  value: number;
  onChange: (radius: number) => void;
}

export function RadiusSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, RADIUS_OPTIONS.findIndex((r) => r === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function choose(r: number) {
    setOpen(false);
    buttonRef.current?.focus();
    if (r !== value) onChange(r);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + RADIUS_OPTIONS.length) % RADIUS_OPTIONS.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : RADIUS_OPTIONS.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(RADIUS_OPTIONS[active]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') buttonRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative h-full">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Promień: ${formatDistance(value)}`}
        onClick={() => {
          setActive(Math.max(0, RADIUS_OPTIONS.findIndex((r) => r === value)));
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-full items-center gap-1 rounded-full px-2.5 text-sm font-semibold tabular-nums transition ${
          open ? 'bg-brand-600 text-white' : 'bg-brand-100/70 text-brand-700 hover:bg-brand-100'
        }`}
      >
        {formatDistance(value)}
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Promień wyszukiwania"
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKeyDown}
          className="absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 origin-top animate-pop rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.4)] outline-none backdrop-blur-xl"
        >
          <li className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400" role="presentation">
            Promień wyszukiwania
          </li>
          {RADIUS_OPTIONS.map((r, i) => {
            const selected = r === value;
            const hint = HINTS[r];
            return (
              <li
                key={r}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                  i === active ? 'bg-slate-100' : ''
                } ${selected ? 'text-brand-700' : 'text-ink'}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    selected ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {hint?.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold tabular-nums">{formatDistance(r)}</span>
                  {hint && <span className="text-xs text-slate-500">{hint.text}</span>}
                </span>
                {selected && <Check className="size-4 shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

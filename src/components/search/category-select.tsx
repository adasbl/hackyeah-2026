'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import type { CategorySlug } from '@repo/types';
import { CATEGORIES } from '@/lib/catalog';
import { CategoryGlyph } from '../category-icon';
import { DROPDOWN_PANEL, FIELD_BOX, useDismiss } from './use-dismiss';

const OPTIONS: { slug: CategorySlug | ''; name: string; soft: string }[] = [
  { slug: '', name: 'Wszystkie kategorie', soft: 'bg-slate-100 text-slate-600' },
  ...CATEGORIES,
];

export function CategorySelect({ value, onChange }: { value: CategorySlug | ''; onChange: (v: CategorySlug | '') => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const current = OPTIONS.find((o) => o.slug === value) ?? OPTIONS[0];

  function toggle() {
    setActive(Math.max(0, OPTIONS.indexOf(current)));
    setOpen((o) => !o);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return toggle();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + OPTIONS.length) % OPTIONS.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      onChange(OPTIONS[active].slug);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={`${FIELD_BOX} focus:border-brand-500/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10`}
      >
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${current.soft}`}>
          <CategoryGlyph category={current.slug || undefined} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.9375rem] font-medium leading-snug text-ink">{current.name}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul id={listId} role="listbox" className={DROPDOWN_PANEL}>
          {OPTIONS.map((o, i) => {
            const isSel = o.slug === value;
            return (
              <li
                key={o.slug || 'all'}
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onChange(o.slug);
                  setOpen(false);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${i === active ? 'bg-slate-100' : ''}`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${o.soft}`}>
                  <CategoryGlyph category={o.slug || undefined} />
                </span>
                <span className="flex-1 text-sm font-medium text-ink">{o.name}</span>
                {isSel && <Check className="size-4 text-brand-600" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

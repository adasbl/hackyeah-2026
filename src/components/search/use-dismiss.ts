'use client';

import { useEffect, type RefObject } from 'react';

/** Zamyka dropdown po kliknięciu poza elementem */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, open, onClose]);
}

export const DROPDOWN_PANEL =
  'absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto origin-top animate-pop rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.35)] backdrop-blur-xl';

export const FIELD_BOX =
  'group relative flex h-full min-h-16 w-full items-center gap-3 rounded-xl border border-transparent bg-slate-100/70 px-4 py-3 text-left transition hover:bg-slate-100 focus-within:border-brand-500/40 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/10';

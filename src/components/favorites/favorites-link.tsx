'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useFavorites } from '@/lib/favorites';

export function FavoritesLink() {
  const { favorites, ready } = useFavorites();
  const count = ready ? favorites.length : 0;
  return (
    <Link
      href="/ulubione"
      className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink"
      aria-label={count ? `Ulubione (${count})` : 'Ulubione'}
    >
      <Heart className={`size-4 ${count ? 'fill-rose-500 text-rose-500' : ''}`} aria-hidden />
      <span className="hidden sm:inline">Ulubione</span>
      {count > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold tabular-nums text-white" aria-hidden>
          {count}
        </span>
      )}
    </Link>
  );
}

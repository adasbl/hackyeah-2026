'use client';

import { Heart, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlaceSummary } from '@repo/types';
import { PlaceCard } from '@/components/place-card';
import { getFavoritePlaces } from '@/lib/data/favorites-actions';
import { useFavorites } from '@/lib/favorites';

export function FavoritesList() {
  const { favorites, ready, clear } = useFavorites();
  const [places, setPlaces] = useState<PlaceSummary[] | null>(null);
  const key = favorites.join(',');

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const slugs = key ? key.split(',') : [];
    if (!slugs.length) {
      setPlaces([]);
      return;
    }
    getFavoritePlaces(slugs)
      .then((res) => !cancelled && setPlaces(res))
      .catch(() => !cancelled && setPlaces([]));
    return () => {
      cancelled = true;
    };
  }, [key, ready]);

  if (!ready || places === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Wczytuję ulubione…
      </p>
    );
  }

  // Usunięte z ulubionych chowamy od razu, bez czekania na serwer.
  const visible = places.filter((p) => favorites.includes(p.slug));

  if (visible.length === 0) {
    return (
      <div className="animate-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center backdrop-blur">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <Heart className="size-7" aria-hidden />
        </span>
        <p className="mt-4 text-lg font-semibold">Nie masz jeszcze ulubionych</p>
        <p className="mt-1 text-sm text-slate-500">Kliknij serduszko przy obiekcie, a pojawi się tutaj.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25"
        >
          Szukaj obiektów
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {visible.length} {visible.length === 1 ? 'obiekt' : visible.length < 5 ? 'obiekty' : 'obiektów'}
        </p>
        <button type="button" onClick={clear} className="text-sm font-medium text-slate-500 hover:text-rose-600">
          Wyczyść listę
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((p) => (
          <li key={p.id} className="animate-fade-up">
            <PlaceCard place={p} />
          </li>
        ))}
      </ul>
    </>
  );
}

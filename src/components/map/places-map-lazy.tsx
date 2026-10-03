'use client';

/**
 * MapLibre potrzebuje przeglądarki (window, WebGL), więc mapy ładujemy tylko po stronie klienta.
 * Ten plik jest „opakowaniem”, którego można bezpiecznie użyć w Server Component.
 */
import dynamic from 'next/dynamic';

export const PlacesMapLazy = dynamic(() => import('./places-map').then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[68dvh] min-h-[420px] place-items-center rounded-3xl border border-slate-200/80 bg-slate-100 text-sm text-slate-500 sm:h-[72dvh] sm:max-h-[820px]">
      Ładowanie mapy…
    </div>
  ),
});

export const PlaceMiniMapLazy = dynamic(() => import('./place-mini-map').then((m) => m.PlaceMiniMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-slate-100 text-sm text-slate-500">Ładowanie mapy…</div>,
});

'use client';

/**
 * MapLibre potrzebuje przeglądarki (window, WebGL), więc mapę ładujemy tylko po stronie klienta.
 * Ten plik jest „opakowaniem”, którego można bezpiecznie użyć w Server Component (strona wyników).
 */
import dynamic from 'next/dynamic';

export const PlacesMapLazy = dynamic(() => import('./places-map').then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[320px] place-items-center rounded-3xl border border-slate-200/80 bg-slate-100 text-sm text-slate-500 sm:h-[440px]">
      Ładowanie mapy…
    </div>
  ),
});

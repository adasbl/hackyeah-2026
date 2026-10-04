'use client';

/**
 * MapLibre potrzebuje przeglądarki (window, WebGL), więc mapy ładujemy tylko po stronie klienta.
 * Ten plik jest „opakowaniem”, którego można bezpiecznie użyć w Server Component.
 */
import dynamic from 'next/dynamic';

/** Wcześniejsze pobranie tego samego modułu, którego używa dynamic poniżej, i rozgrzanie workerów MapLibre. */
export function preloadPlacesMap() {
  // Nieudane pobranie w tle nie blokuje listy; dynamic ponowi import przy wejściu na mapę.
  void import('./places-map').then((m) => m.warmUpMap()).catch(() => {});
}

export const PlacesMapLazy = dynamic(() => import('./places-map').then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-200/80 bg-slate-100 text-sm text-slate-500">
      Ładowanie mapy…
    </div>
  ),
});

export const PlaceMiniMapLazy = dynamic(() => import('./place-mini-map').then((m) => m.PlaceMiniMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-slate-100 text-sm text-slate-500">Ładowanie mapy…</div>,
});

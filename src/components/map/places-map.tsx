'use client';

/**
 * Mapa obiektów (MapLibre GL JS).
 * - wygląd mapy: NEXT_PUBLIC_MAP_STYLE_URL, a gdy pusty – darmowy styl OpenFreeMap,
 * - start: pinezki z serwera (wyniki dla miasta i filtrów), widok dopasowany do nich,
 * - po przesunięciu / przybliżeniu (z opóźnieniem 300 ms) pobiera obiekty z widocznego prostokąta (bbox).
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CardProviderSlug, CategorySlug } from '@repo/types';
import { categoryOf } from '@/lib/catalog';
import { getMapPlaces } from '@/lib/data/map-actions';
import { bboxOf, normalizeBbox, type Bbox, type MapPlace } from '@/lib/geo';

const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const DEBOUNCE_MS = 300;

/** Kolory pinezek – te same odcienie co kafelki kategorii w catalog.ts (Tailwind *-500). */
const MARKER_COLORS: Record<CategorySlug, string> = {
  silownia: '#f43f5e',
  basen: '#0ea5e9',
  fitness: '#d946ef',
  joga: '#10b981',
  wspinaczka: '#f59e0b',
  squash: '#6366f1',
};

export interface PlacesMapFilters {
  category?: CategorySlug;
  cards: CardProviderSlug[];
  q?: string;
}

interface Props {
  initialPlaces: MapPlace[];
  initialTotal: number;
  filters: PlacesMapFilters;
}

type Status = 'idle' | 'loading' | 'error';

export function PlacesMap({ initialPlaces, initialTotal, filters }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const requestIdRef = useRef(0);

  // Aktualne wartości dla handlerów mapy (mapa tworzona jest tylko raz).
  const filtersRef = useRef(filters);
  const routerRef = useRef(router);
  const initialPlacesRef = useRef(initialPlaces);
  useEffect(() => {
    filtersRef.current = filters;
    routerRef.current = router;
  });

  const [places, setPlaces] = useState(initialPlaces);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState<Status>('idle');

  // 1) Utworzenie mapy – raz, po zamontowaniu.
  useEffect(() => {
    if (!containerRef.current) return;
    const markers = markersRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const [w, s, e, n] = bboxOf(initialPlacesRef.current.map((p) => p.location));
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: [w, s, e, n],
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    async function loadVisible() {
      const b = map.getBounds();
      const bbox = normalizeBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as Bbox);
      const id = ++requestIdRef.current;
      setStatus('loading');
      try {
        const res = await getMapPlaces({ bbox, ...filtersRef.current });
        if (disposed || id !== requestIdRef.current) return; // mapa zamknięta albo przyszła starsza odpowiedź
        setPlaces(res.items);
        setTotal(res.total);
        setStatus('idle');
      } catch {
        if (!disposed && id === requestIdRef.current) setStatus('error');
      }
    }

    // Debounce: pytamy dopiero, gdy użytkownik przestanie ruszać mapą.
    map.on('moveend', () => {
      clearTimeout(timer);
      timer = setTimeout(loadVisible, DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      markers.forEach((m) => m.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2) Synchronizacja pinezek z listą `places` (dodaj nowe, usuń zbędne).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const nextIds = new Set(places.map((p) => p.id));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    for (const place of places) {
      if (markers.has(place.id)) continue;
      const marker = new maplibregl.Marker({ element: createPin(place) })
        .setLngLat([place.location.lng, place.location.lat])
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false, maxWidth: '260px' }).setDOMContent(createPopup(place, routerRef)))
        .addTo(map);
      markers.set(place.id, marker);
    }
  }, [places]);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-100 shadow-sm sm:h-[440px]">
      <div ref={containerRef} className="h-full w-full" />
      <MapStatus status={status} shown={places.length} total={total} />
    </div>
  );
}

function MapStatus({ status, shown, total }: { status: Status; shown: number; total: number }) {
  let content: React.ReactNode;
  if (status === 'loading') {
    content = (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Szukam w tym obszarze…
      </>
    );
  } else if (status === 'error') {
    content = (
      <>
        <AlertCircle className="size-3.5 text-rose-600" aria-hidden /> Nie udało się pobrać obiektów
      </>
    );
  } else {
    content = (
      <>
        <MapPin className="size-3.5 text-brand-600" aria-hidden />
        {total === 0 ? 'Brak obiektów w tym widoku' : shown < total ? `Pokazuję ${shown} z ${total} – przybliż mapę` : `${total} w tym widoku`}
      </>
    );
  }
  return (
    <p
      className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur"
      aria-live="polite"
    >
      {content}
    </p>
  );
}

/**
 * Kropka w kolorze kategorii. Element DOM tworzony ręcznie, bo MapLibre nie renderuje Reacta.
 * Zewnętrzny div pozycjonuje MapLibre (przez `transform`), a powiększenie po najechaniu jest na wewnętrznej
 * kropce – gdyby `scale` był na zewnętrznym elemencie, pinezka „uciekałaby” spod kursora.
 * div, nie <button>: MapLibre sam dodaje role="button", tabindex i obsługę Enter/Spacji, gdy pinezka ma dymek.
 */
function createPin(place: MapPlace) {
  const el = document.createElement('div');
  el.title = place.name;
  el.setAttribute('aria-label', `${place.name} – pokaż szczegóły`);
  el.className = 'group cursor-pointer p-1';

  const dot = document.createElement('span');
  dot.className = 'block size-4 rounded-full border-2 border-white shadow-md transition-[scale] group-hover:scale-125';
  dot.style.backgroundColor = MARKER_COLORS[place.category];

  el.append(dot);
  return el;
}

/** Dymek po kliknięciu pinezki. textContent zamiast innerHTML – nazwy z bazy nie mogą wstrzyknąć HTML. */
function createPopup(place: MapPlace, routerRef: React.RefObject<ReturnType<typeof useRouter>>) {
  const root = document.createElement('div');
  root.className = 'font-sans';

  const category = document.createElement('p');
  category.className = 'text-[10px] font-semibold uppercase tracking-wider text-slate-500';
  category.textContent = categoryOf(place.category).name;

  const href = `/places/${place.slug}`;
  const link = document.createElement('a');
  link.href = href;
  link.className = 'mt-0.5 block text-sm font-semibold leading-snug text-ink hover:text-brand-600';
  link.textContent = place.name;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    routerRef.current?.push(href);
  });

  const address = document.createElement('p');
  address.className = 'mt-0.5 text-xs text-slate-500';
  address.textContent = `${place.street}, ${place.city}`;

  root.append(category, link, address);
  return root;
}

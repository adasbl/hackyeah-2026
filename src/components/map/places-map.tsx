'use client';

/**
 * Mapa obiektów (MapLibre GL JS).
 * - wygląd mapy: NEXT_PUBLIC_MAP_STYLE_URL, a gdy pusty – darmowy styl OpenFreeMap,
 * - start: pinezki z serwera (wyniki dla miasta i filtrów), widok dopasowany do nich,
 * - po przesunięciu / przybliżeniu (z opóźnieniem 300 ms) pobiera obiekty z widocznego prostokąta (bbox),
 * - od razu pyta o zgodę na lokalizację; po zgodzie pokazuje kropkę użytkownika, ale mapę przybliża
 *   dopiero przycisk „Przybliż do mojej lokalizacji”.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { createElement as createIcon, Dumbbell, Flower2, HeartPulse, Mountain, Target, Waves, type IconNode } from 'lucide';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CardProviderSlug, CategorySlug } from '@repo/types';
import { categoryOf } from '@/lib/catalog';
import { getMapPlaces } from '@/lib/data/map-actions';
import { bboxOf, normalizeBbox, type Bbox, type MapPlace } from '@/lib/geo';

// MapLibre v6 nie znajdzie workera sam w paczce Next.js – plik kopiuje scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const DEBOUNCE_MS = 300;
/** Przybliżenie po kliknięciu „moja lokalizacja” (jeśli mapa jest już bliżej – zostaje). */
const LOCATE_ZOOM = 14;

/** Kolory pinezek – te same odcienie co kafelki kategorii w catalog.ts (Tailwind *-500). */
const MARKER_COLORS: Record<CategorySlug, string> = {
  silownia: '#f43f5e',
  basen: '#0ea5e9',
  fitness: '#d946ef',
  joga: '#10b981',
  wspinaczka: '#f59e0b',
  squash: '#6366f1',
};

/** Ikony w pinezkach – te same co w category-icon.tsx, ale z paczki `lucide` (czysty DOM, bez Reacta). */
const MARKER_ICONS: Record<CategorySlug, IconNode> = {
  silownia: Dumbbell,
  basen: Waves,
  fitness: HeartPulse,
  joga: Flower2,
  wspinaczka: Mountain,
  squash: Target,
};

/** Dymek nad pinezką: czubek pinezki jest w punkcie, a jej „główka” ~22 px wyżej. */
const PIN_POPUP_OFFSET: maplibregl.Offset = {
  center: [0, -22],
  top: [0, 4],
  'top-left': [0, 4],
  'top-right': [0, 4],
  bottom: [0, -38],
  'bottom-left': [0, -38],
  'bottom-right': [0, -38],
  left: [14, -22],
  right: [-14, -22],
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
    // Na ekranach dotykowych jeden palec przewija stronę, a mapę przesuwa się dwoma palcami –
    // inaczej mapa „łapie” przewijanie i nie da się zjechać do listy.
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: [w, s, e, n],
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: isTouch,
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': 'Przesuń mapę dwoma palcami',
        'CooperativeGesturesHandler.WindowsHelpText': 'Użyj Ctrl + kółko myszy, aby przybliżyć mapę',
        'CooperativeGesturesHandler.MacHelpText': 'Użyj ⌘ + kółko myszy, aby przybliżyć mapę',
      },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    // Lokalizacja użytkownika: watchPosition od razu wywołuje pytanie o zgodę w przeglądarce.
    // Kropkę pokazujemy, ale widoku nie ruszamy – przybliża dopiero kliknięcie przycisku.
    let userPos: [lng: number, lat: number] | undefined;
    let userMarker: maplibregl.Marker | undefined;
    let watchId: number | undefined;
    const locate = new LocateControl(() => {
      if (userPos) map.flyTo({ center: userPos, zoom: Math.max(map.getZoom(), LOCATE_ZOOM) });
    });
    map.addControl(locate, 'top-right');

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          if (disposed) return;
          userPos = [coords.longitude, coords.latitude];
          if (userMarker) userMarker.setLngLat(userPos);
          else userMarker = new maplibregl.Marker({ element: createUserDot() }).setLngLat(userPos).addTo(map);
          locate.setState('ready');
        },
        (err) => {
          if (disposed || userPos) return; // pojedynczy timeout nie kasuje znanej już pozycji
          locate.setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      );
    } else {
      locate.setState('unavailable');
    }

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
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      userMarker?.remove();
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
      const marker = new maplibregl.Marker({ element: createPin(place), anchor: 'bottom' })
        .setLngLat([place.location.lng, place.location.lat])
        .setPopup(
          new maplibregl.Popup({ offset: PIN_POPUP_OFFSET, closeButton: false, maxWidth: '260px' }).setDOMContent(createPopup(place, routerRef)),
        )
        .addTo(map);
      markers.set(place.id, marker);
    }
  }, [places]);

  return (
    <div className="relative h-[320px] overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-100 shadow-sm sm:h-[440px]">
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

type LocateState = 'waiting' | 'ready' | 'denied' | 'unavailable';

const LOCATE_LABELS: Record<LocateState, string> = {
  waiting: 'Czekam na Twoją lokalizację…',
  ready: 'Przybliż do mojej lokalizacji',
  denied: 'Brak zgody na lokalizację – możesz ją włączyć w ustawieniach przeglądarki',
  unavailable: 'Lokalizacja niedostępna',
};

/**
 * Przycisk „przybliż do mojej lokalizacji” w tym samym stylu co przyciski +/− (klasy i ikona z CSS MapLibre).
 * Własny zamiast GeolocateControl, bo ten przy uruchomieniu sam przesuwa mapę, a my chcemy to robić dopiero po kliknięciu.
 */
class LocateControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(onClick: () => void) {
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-geolocate';
    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.setAttribute('aria-hidden', 'true');
    this.button.append(icon);
    this.button.addEventListener('click', onClick);
    this.container.append(this.button);
    this.setState('waiting');
  }

  setState(state: LocateState) {
    const label = LOCATE_LABELS[state];
    this.button.disabled = state !== 'ready';
    this.button.setAttribute('aria-label', label);
    // title na kontenerze – na wyłączonym przycisku część przeglądarek nie pokazuje podpowiedzi.
    this.container.title = label;
  }

  onAdd() {
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }
}

/** Niebieska pulsująca kropka „tu jesteś” – wygląd z CSS MapLibre (ta sama co w GeolocateControl). */
function createUserDot() {
  const el = document.createElement('div');
  el.className = 'maplibregl-user-location-dot';
  el.setAttribute('aria-label', 'Twoja lokalizacja');
  el.setAttribute('role', 'img');
  el.style.zIndex = '1'; // zawsze nad pinezkami obiektów
  return el;
}

/**
 * Pinezka obiektu: „łezka” w kolorze kategorii z białą ikoną w środku – kształtem odróżnia się od okrągłej
 * kropki użytkownika. Element DOM tworzony ręcznie, bo MapLibre nie renderuje Reacta.
 * Zewnętrzny div pozycjonuje MapLibre (przez `transform`, anchor: 'bottom' → czubek w punkcie), a powiększenie
 * po najechaniu jest na wewnętrznym elemencie (od dołu, żeby czubek stał w miejscu) – gdyby `scale` był na
 * zewnętrznym, pinezka „uciekałaby” spod kursora.
 * div, nie <button>: MapLibre sam dodaje role="button", tabindex i obsługę Enter/Spacji, gdy pinezka ma dymek.
 */
function createPin(place: MapPlace) {
  const el = document.createElement('div');
  el.title = place.name;
  el.setAttribute('aria-label', `${place.name} – pokaż szczegóły`);
  el.className = 'group cursor-pointer';

  const body = document.createElement('div');
  body.className = 'relative h-9 w-7 origin-bottom drop-shadow-md transition-[scale] group-hover:scale-115';

  const NS = 'http://www.w3.org/2000/svg';
  const shape = document.createElementNS(NS, 'svg');
  shape.setAttribute('viewBox', '0 0 28 36');
  shape.setAttribute('class', 'absolute inset-0 size-full');
  shape.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M14 35C14 35 27 23 27 13.5A13 13 0 0 0 1 13.5C1 23 14 35 14 35Z');
  path.setAttribute('fill', MARKER_COLORS[place.category]);
  path.setAttribute('stroke', 'white');
  path.setAttribute('stroke-width', '2');
  shape.append(path);

  const icon = createIcon(MARKER_ICONS[place.category], {
    class: 'absolute left-1/2 top-[13.5px] size-3.5 -translate-x-1/2 -translate-y-1/2 text-white',
    'stroke-width': 2.5,
    'aria-hidden': 'true',
  });

  body.append(shape, icon);
  el.append(body);
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

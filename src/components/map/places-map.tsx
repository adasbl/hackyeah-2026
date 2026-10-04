'use client';

/**
 * Mapa obiektów (MapLibre GL JS).
 * - wygląd mapy: NEXT_PUBLIC_MAP_STYLE_URL, a gdy pusty – darmowy styl OpenFreeMap,
 * - start: punkty z serwera (wyniki dla miasta i filtrów), widok dopasowany do nich,
 * - po przesunięciu / przybliżeniu (z opóźnieniem 300 ms) pobiera obiekty z widocznego prostokąta (bbox),
 * - przy oddaleniu bliskie obiekty łączą się w klastry: kółko z liczbą i pierścieniem w kolorach kategorii;
 *   kliknięcie klastra przybliża mapę tak, żeby się rozpadł,
 * - przy wyszukiwaniu „w pobliżu” rysuje okrąg promienia,
 * - od razu pyta o zgodę na lokalizację; po zgodzie pokazuje kropkę użytkownika, ale mapę przybliża
 *   dopiero przycisk „Przybliż do mojej lokalizacji”.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CardProviderSlug, CategorySlug } from '@repo/types';
import { categoryOf } from '@/lib/catalog';
import { getMapPlaces } from '@/lib/data/map-actions';
import { bboxOf, circlePolygon, normalizeBbox, type Bbox, type MapPlace } from '@/lib/geo';
import {
  CLUSTER_PROPERTIES,
  createCluster,
  createPin,
  createUserDot,
  MAP_STYLE_URL,
  PIN_POPUP_OFFSET,
  type CategoryCounts,
} from './markers';

const DEBOUNCE_MS = 300;
/** Przybliżenie po kliknięciu „moja lokalizacja” (jeśli mapa jest już bliżej – zostaje). */
const LOCATE_ZOOM = 14;
/** Od tego przybliżenia nie łączymy już punktów w klastry (niżej = wcześniej widać pojedyncze pinezki). */
const CLUSTER_MAX_ZOOM = 12;
/** Promień (px), w którym punkty łączą się w klaster – mały, żeby klastry szybko się rozpadały. */
const CLUSTER_RADIUS = 34;

const SOURCE = 'places';
const RADIUS_SOURCE = 'search-radius';

export interface PlacesMapFilters {
  category?: CategorySlug;
  cards: CardProviderSlug[];
  q?: string;
  openNow?: boolean;
  lat?: number;
  lng?: number;
  radius?: number;
}

interface Props {
  initialPlaces: MapPlace[];
  initialTotal: number;
  filters: PlacesMapFilters;
  /** Elementy na mapie (np. filtry „Otwarte teraz”, „W pobliżu mnie”) – zostają widoczne także na pełnym ekranie. */
  overlay?: React.ReactNode;
  /** Klasy wysokości kontenera mapy. */
  heightClassName?: string;
}

type Status = 'idle' | 'loading' | 'error';

type PointProps = { id: string; slug: string; name: string; category: CategorySlug; street: string; city: string };

function toGeoJson(places: MapPlace[]): GeoJSON.FeatureCollection<GeoJSON.Point, PointProps> {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      id: Number(p.id) || undefined,
      geometry: { type: 'Point', coordinates: [p.location.lng, p.location.lat] },
      properties: { id: p.id, slug: p.slug, name: p.name, category: p.category, street: p.street, city: p.city },
    })),
  };
}

export const MAP_HEIGHT = 'h-[68dvh] min-h-[420px] sm:h-[72dvh] sm:max-h-[820px]';

/**
 * Uruchamia z wyprzedzeniem workery MapLibre (wspólne dla wszystkich map na stronie).
 * Wołane razem z wcześniejszym pobraniem kodu mapy – po przełączeniu na mapę kafelki ładują się od razu,
 * a workery przeżywają też ponowne utworzenie mapy po zmianie filtrów.
 */
export function warmUpMap() {
  maplibregl.prewarm();
}

export function PlacesMap({ initialPlaces, initialTotal, filters, overlay, heightClassName = MAP_HEIGHT }: Props) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const requestIdRef = useRef(0);
  /** Wersja danych – klastry dostają nowe ID po każdej zmianie danych, więc ich znaczniki tworzymy od nowa. */
  const dataVersionRef = useRef(0);
  const syncMarkersRef = useRef<() => void>(() => {});

  // Aktualne wartości dla handlerów mapy (mapa tworzona jest tylko raz).
  const filtersRef = useRef(filters);
  const routerRef = useRef(router);
  const initialPlacesRef = useRef(initialPlaces);
  const placesRef = useRef(initialPlaces);
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
    warmUpMap(); // workery zostają po zmianie filtrów (nowa mapa), zamiast startować od zera
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const { lat, lng, radius } = filtersRef.current;
    const center = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    const points = initialPlacesRef.current.map((p) => p.location);
    if (center) points.push(center);
    const [w, s, e, n] = bboxOf(points);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: [w, s, e, n],
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': 'Przesuń mapę dwoma palcami',
        'CooperativeGesturesHandler.WindowsHelpText': 'Użyj Ctrl + kółko myszy, aby przybliżyć mapę',
        'CooperativeGesturesHandler.MacHelpText': 'Użyj ⌘ + kółko myszy, aby przybliżyć mapę',
        'FullscreenControl.Enter': 'Mapa na pełnym ekranie',
        'FullscreenControl.Exit': 'Zamknij pełny ekran',
        'NavigationControl.ZoomIn': 'Przybliż',
        'NavigationControl.ZoomOut': 'Oddal',
      },
    });
    map.touchZoomRotate.disableRotation();
    // Pełny ekran obejmuje cały kontener (razem z filtrami na mapie), nie tylko samą mapę.
    // Gdy przeglądarka nie ma Fullscreen API (np. iPhone), MapLibre rozciąga kontener na całe okno.
    map.addControl(new maplibregl.FullscreenControl({ container: wrapperRef.current ?? undefined }), 'top-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    // Rozwinięcie formularza i zmiana wysokości okna zmieniają dostępną przestrzeń mapy.
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.resize());
    });
    resizeObserver.observe(containerRef.current);

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

    // --- Znaczniki HTML dla punktów i klastrów ------------------------------------------------
    // Źródło GeoJSON z `cluster: true` liczy klastry; my rysujemy je jako elementy HTML (ładniejsze niż
    // warstwa circle i spójne z pinezkami). Po każdej zmianie widoku synchronizujemy znaczniki z tym,
    // co źródło ma aktualnie w widocznych kafelkach.
    const pinMarkers = new Map<string, maplibregl.Marker>();
    const clusterMarkers = new Map<string, maplibregl.Marker>();

    function syncMarkers() {
      if (!map.getSource(SOURCE)) return;
      const nextPins = new Set<string>();
      const nextClusters = new Set<string>();

      for (const f of map.querySourceFeatures(SOURCE)) {
        if (f.geometry.type !== 'Point') continue;
        const [fx, fy] = f.geometry.coordinates;
        const props = f.properties as Record<string, unknown>;

        if (props.cluster) {
          const clusterId = Number(props.cluster_id);
          const key = `${dataVersionRef.current}:${clusterId}`;
          if (nextClusters.has(key)) continue; // ten sam klaster bywa w kilku kafelkach
          nextClusters.add(key);
          if (clusterMarkers.has(key)) continue;
          const count = Number(props.point_count);
          const counts: CategoryCounts = {};
          for (const c of Object.keys(CLUSTER_PROPERTIES)) counts[c as CategorySlug] = Number(props[c] ?? 0);
          const el = createCluster(count, counts);
          const zoomIn = async () => {
            const src = map.getSource<maplibregl.GeoJSONSource>(SOURCE);
            if (!src) return;
            const zoom = await src.getClusterExpansionZoom(clusterId).catch(() => map.getZoom() + 2);
            // +1 poziom ponad minimum – klaster od razu rozpada się na pinezki / mniejsze grupy.
            map.easeTo({ center: [fx, fy], zoom: Math.min(zoom + 1, 17), duration: 500 });
          };
          el.addEventListener('click', zoomIn);
          el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              void zoomIn();
            }
          });
          clusterMarkers.set(key, new maplibregl.Marker({ element: el }).setLngLat([fx, fy]).addTo(map));
          continue;
        }

        const place = props as unknown as PointProps;
        if (nextPins.has(place.id)) continue;
        nextPins.add(place.id);
        if (pinMarkers.has(place.id)) continue;
        const marker = new maplibregl.Marker({ element: createPin(place), anchor: 'bottom' })
          .setLngLat([fx, fy])
          .setPopup(
            new maplibregl.Popup({ offset: PIN_POPUP_OFFSET, closeButton: false, maxWidth: '260px' }).setDOMContent(
              createPopup(place, routerRef),
            ),
          )
          .addTo(map);
        pinMarkers.set(place.id, marker);
      }

      for (const [key, m] of clusterMarkers) {
        if (!nextClusters.has(key)) {
          m.remove();
          clusterMarkers.delete(key);
        }
      }
      for (const [id, m] of pinMarkers) {
        // Otwarty dymek zostawiamy, dopóki punkt jest w danych – inaczej znikałby przy lekkim przesunięciu.
        if (!nextPins.has(id) && !(m.getPopup()?.isOpen() && placesRef.current.some((p) => p.id === id))) {
          m.remove();
          pinMarkers.delete(id);
        }
      }
    }
    syncMarkersRef.current = syncMarkers;

    // Pinezki mogą ładować się równolegle z podkładem, bez czekania na wszystkie kafelki.
    map.once('style.load', () => {
      map.addSource(SOURCE, {
        type: 'geojson',
        data: toGeoJson(placesRef.current),
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: CLUSTER_PROPERTIES,
      });
      // Niewidoczna warstwa – bez niej MapLibre nie ładuje kafelków źródła i querySourceFeatures nic nie zwraca.
      map.addLayer({ id: 'places-anchor', type: 'circle', source: SOURCE, paint: { 'circle-radius': 0, 'circle-opacity': 0 } });

      if (center && radius) {
        map.addSource(RADIUS_SOURCE, { type: 'geojson', data: circlePolygon(center, radius) });
        map.addLayer({ id: 'radius-fill', type: 'fill', source: RADIUS_SOURCE, paint: { 'fill-color': '#3b6cff', 'fill-opacity': 0.07 } });
        map.addLayer({
          id: 'radius-line',
          type: 'line',
          source: RADIUS_SOURCE,
          paint: { 'line-color': '#3b6cff', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
        });
      }
    });
    // Podczas przesuwania „move” przychodzi wiele razy na klatkę – synchronizujemy najwyżej raz na klatkę.
    let syncFrame = 0;
    const scheduleSync = () => {
      if (!syncFrame) {
        syncFrame = requestAnimationFrame(() => {
          syncFrame = 0;
          syncMarkers();
        });
      }
    };
    map.on('sourcedata', (e) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) scheduleSync();
    });
    map.on('move', scheduleSync);
    map.on('moveend', syncMarkers);

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
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      clearTimeout(timer);
      cancelAnimationFrame(syncFrame);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      userMarker?.remove();
      pinMarkers.forEach((m) => m.remove());
      clusterMarkers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2) Nowe dane → podmiana danych źródła (MapLibre przelicza klastry, a znaczniki synchronizują się same).
  useEffect(() => {
    placesRef.current = places;
    const src = mapRef.current?.getSource<maplibregl.GeoJSONSource>(SOURCE);
    if (!src) return;
    dataVersionRef.current++;
    src.setData(toGeoJson(places));
  }, [places]);

  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-100 shadow-sm [&:fullscreen]:rounded-none [&.maplibregl-pseudo-fullscreen]:rounded-none ${heightClassName}`}
    >
      <div ref={containerRef} className="h-full w-full" />
      {overlay && <div className="absolute left-3 right-14 top-3 z-10">{overlay}</div>}
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
      className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur"
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

/** Dymek po kliknięciu pinezki. textContent zamiast innerHTML – nazwy z bazy nie mogą wstrzyknąć HTML. */
function createPopup(place: PointProps, routerRef: React.RefObject<ReturnType<typeof useRouter>>) {
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

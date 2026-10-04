/**
 * Wspólne elementy map (lista wyników i mini-mapa obiektu): styl, pinezki i kółka klastrów.
 * Elementy DOM tworzymy ręcznie, bo MapLibre nie renderuje Reacta.
 * Plik importujemy tylko z komponentów ładowanych po stronie klienta (ssr: false).
 */
import { createElement as createIcon, CircleDot, Dumbbell, Flower2, HeartPulse, Mountain, Music, Target, Waves, type IconNode } from 'lucide';
import * as maplibregl from 'maplibre-gl';
import { CATEGORY_SLUGS, type CategorySlug } from '@repo/types';
import { categoryOf } from '@/lib/catalog';

// MapLibre v6 nie znajdzie workera sam w paczce Next.js – plik kopiuje scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

/** Kolory pinezek – te same odcienie co kafelki kategorii w catalog.ts (Tailwind *-500). */
export const MARKER_COLORS: Record<CategorySlug, string> = {
  silownia: '#f43f5e',
  basen: '#0ea5e9',
  fitness: '#d946ef',
  joga: '#10b981',
  wspinaczka: '#f59e0b',
  squash: '#6366f1',
  tenis: '#84cc16',
  taniec: '#a855f7',
};

/** Ikony w pinezkach – te same co w category-icon.tsx, ale z paczki `lucide` (czysty DOM, bez Reacta). */
const MARKER_ICONS: Record<CategorySlug, IconNode> = {
  silownia: Dumbbell,
  basen: Waves,
  fitness: HeartPulse,
  joga: Flower2,
  wspinaczka: Mountain,
  squash: Target,
  tenis: CircleDot,
  taniec: Music,
};

/** Dymek nad pinezką: czubek pinezki jest w punkcie, a jej „główka” ~22 px wyżej. */
export const PIN_POPUP_OFFSET: maplibregl.Offset = {
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

/**
 * Pinezka obiektu: „łezka” w kolorze kategorii z białą ikoną w środku – kształtem odróżnia się od okrągłej
 * kropki użytkownika. Zewnętrzny div pozycjonuje MapLibre (przez `transform`, anchor: 'bottom' → czubek w punkcie),
 * a powiększenie po najechaniu jest na wewnętrznym elemencie (od dołu, żeby czubek stał w miejscu).
 * div, nie <button>: MapLibre sam dodaje role="button", tabindex i obsługę Enter/Spacji, gdy pinezka ma dymek.
 */
export function createPin(place: { name: string; category: CategorySlug }, opts: { size?: 'md' | 'lg'; label?: string } = {}) {
  const el = document.createElement('div');
  el.title = place.name;
  el.setAttribute('aria-label', opts.label ?? `${place.name} – pokaż szczegóły`);
  el.className = 'group cursor-pointer';

  const body = document.createElement('div');
  body.className = `relative origin-bottom drop-shadow-md transition-[scale] group-hover:scale-115 ${
    opts.size === 'lg' ? 'h-12 w-[37px]' : 'h-9 w-7'
  }`;

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
    class: `absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-white ${
      opts.size === 'lg' ? 'top-[18px] size-[18px]' : 'top-[13.5px] size-3.5'
    }`,
    'stroke-width': 2.5,
    'aria-hidden': 'true',
  });

  body.append(shape, icon);
  el.append(body);
  return el;
}

/** Liczba obiektów każdej kategorii w klastrze – liczone przez MapLibre (clusterProperties). */
export type CategoryCounts = Partial<Record<CategorySlug, number>>;

/** clusterProperties dla źródła GeoJSON: dla każdej kategorii suma punktów tej kategorii w klastrze. */
export const CLUSTER_PROPERTIES = Object.fromEntries(
  CATEGORY_SLUGS.map((c) => [c, ['+', ['case', ['==', ['get', 'category'], c], 1, 0]]]),
) as Record<string, [unknown, unknown]>;

const plural = (n: number) => {
  if (n === 1) return 'obiekt';
  const d = n % 10,
    t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'obiekty' : 'obiektów';
};

/**
 * Kółko klastra: pierścień podzielony na kolory kategorii (ile siłowni, basenów… jest w środku),
 * biały środek z liczbą i delikatna poświata. Rozmiar rośnie logarytmicznie z liczbą obiektów.
 */
export function createCluster(count: number, counts: CategoryCounts) {
  const size = Math.round(Math.min(68, 38 + Math.log2(count) * 6));
  const el = document.createElement('div');
  el.className = 'group cursor-pointer';
  el.style.zIndex = '2'; // klaster nad kropką „tu jesteś” i pojedynczymi pinezkami
  el.setAttribute('role', 'button');
  el.tabIndex = 0;

  const breakdown = CATEGORY_SLUGS.filter((c) => counts[c]).map((c) => `${categoryOf(c).name}: ${counts[c]}`);
  el.title = `${count} ${plural(count)}\n${breakdown.join('\n')}\nKliknij, aby przybliżyć`;
  el.setAttribute('aria-label', `${count} ${plural(count)} w tym miejscu – przybliż mapę`);

  // Stożkowy gradient: każda kategoria dostaje wycinek proporcjonalny do swojej liczby,
  // z 1,5° przerwą, żeby sąsiednie kolory się nie zlewały.
  let acc = 0;
  const stops: string[] = [];
  const present = CATEGORY_SLUGS.filter((c) => counts[c]);
  for (const c of present) {
    const from = (acc / count) * 360;
    acc += counts[c] ?? 0;
    const to = (acc / count) * 360;
    const gap = present.length > 1 ? 1.5 : 0;
    stops.push(`${MARKER_COLORS[c]} ${from + gap}deg ${to - gap}deg`, `transparent ${to - gap}deg ${to}deg`);
  }
  const ring = stops.length ? `conic-gradient(from -90deg, ${stops.join(', ')})` : '#3b6cff';

  const body = document.createElement('div');
  body.className =
    'relative grid place-items-center rounded-full bg-white/95 shadow-[0_8px_24px_-6px_rgba(30,64,175,0.45),0_0_0_6px_rgba(59,108,255,0.14)] transition-[scale,box-shadow] duration-200 group-hover:scale-110 group-hover:shadow-[0_10px_28px_-6px_rgba(30,64,175,0.55),0_0_0_9px_rgba(59,108,255,0.18)] group-focus-visible:scale-110';
  body.style.width = body.style.height = `${size}px`;

  const ringEl = document.createElement('div');
  ringEl.className = 'absolute inset-[3px] rounded-full';
  ringEl.style.background = ring;
  // Maska zostawia tylko pierścień (5 px) – środek zostaje biały.
  ringEl.style.mask = ringEl.style.webkitMask = 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4.5px))';

  const label = document.createElement('span');
  label.className = 'relative font-semibold tabular-nums tracking-tight text-ink';
  label.style.fontSize = `${count >= 100 ? 13 : count >= 10 ? 14 : 15}px`;
  label.textContent = count >= 1000 ? `${Math.floor(count / 100) / 10}k` : String(count);

  body.append(ringEl, label);
  el.append(body);
  return el;
}

/** Niebieska pulsująca kropka „tu jesteś” – wygląd z CSS MapLibre (ta sama co w GeolocateControl). */
export function createUserDot() {
  const el = document.createElement('div');
  el.className = 'maplibregl-user-location-dot';
  el.setAttribute('aria-label', 'Twoja lokalizacja');
  el.setAttribute('role', 'img');
  el.style.zIndex = '1'; // zawsze nad pinezkami obiektów
  return el;
}

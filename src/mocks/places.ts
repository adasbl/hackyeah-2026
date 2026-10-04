/**
 * DANE PRZYKŁADOWE (mock) – fikcyjne obiekty do budowy UI, zanim backend udostępni GET /api/places.
 * Nazwy obiektów i statusy kart są zmyślone i nie opisują prawdziwych miejsc.
 */
import type { CardClaim, CardProviderSlug, CardStatus, CategorySlug, Confidence, PlaceDetails, Price, SourceType } from '@repo/types';
import { CITIES, slugify } from '@/lib/catalog';

function claim(
  provider: CardProviderSlug,
  status: CardStatus,
  opts: { conditions?: string; source?: SourceType; confidence?: Confidence; verified?: string; expires?: string; quote?: string } = {},
): CardClaim {
  const known = status !== 'unknown';
  return {
    provider,
    status,
    conditions: opts.conditions ?? null,
    sourceType: opts.source ?? (known ? 'public_source' : 'automated'),
    sourceUrl: known ? 'https://example.com/zrodlo' : null,
    sourceQuote: opts.quote ?? null,
    confidence: opts.confidence ?? (known ? 'high' : 'low'),
    verifiedAt: known ? `${opts.verified ?? '2026-09-12'}T10:00:00Z` : null,
    expiresAt: known ? `${opts.expires ?? '2027-03-12'}T00:00:00Z` : null,
  };
}

const price = (label: string, amount: number, note: string | null = null): Price => ({ label, amount, currency: 'PLN', note });

interface Seed {
  name: string;
  category: CategorySlug;
  city: string; // slug
  street: string;
  postalCode: string;
  lat: number;
  lng: number;
  cards: CardClaim[];
  prices: Price[];
  hours?: [string, string][];
  amenities?: string[];
  description?: string;
}

const DEFAULT_HOURS: [string, string][] = [
  ['pon–pt', '6:00–22:00'],
  ['sob–niedz', '8:00–20:00'],
];

const seeds: Seed[] = [
  // Warszawa
  {
    name: 'Siłownia Żelazna Forma', category: 'silownia', city: 'warszawa', street: 'ul. Puławska 145', postalCode: '02-715', lat: 52.1949, lng: 21.0233,
    cards: [claim('multisport', 'accepted', { source: 'venue', quote: 'Honorujemy karty MultiSport Plus i Classic.' }), claim('medicover-sport', 'accepted'), claim('beactive', 'not_accepted'), claim('pzu-sport', 'unknown')],
    prices: [price('Wejście jednorazowe', 35), price('Karnet miesięczny', 149)], amenities: ['Szatnia', 'Prysznice', 'Strefa wolnych ciężarów', 'Parking'],
    description: 'Duża siłownia z rozbudowaną strefą wolnych ciężarów i treningu funkcjonalnego.',
  },
  {
    name: 'Basen Fala Mokotów', category: 'basen', city: 'warszawa', street: 'ul. Konduktorska 7', postalCode: '00-775', lat: 52.2007, lng: 21.0368,
    cards: [claim('multisport', 'conditional', { conditions: 'Wejście do 60 min, w weekendy dopłata 10 zł.' }), claim('beactive', 'accepted', { source: 'venue' }), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Bilet normalny 60 min', 28), price('Bilet ulgowy 60 min', 20)], hours: [['pon–pt', '6:30–22:00'], ['sob–niedz', '8:00–21:00']], amenities: ['Basen 25 m', 'Brodzik', 'Sauna'],
  },
  {
    name: 'Studio Jogi Lotos', category: 'joga', city: 'warszawa', street: 'ul. Hoża 41', postalCode: '00-681', lat: 52.2265, lng: 21.0145,
    cards: [claim('multisport', 'accepted', { verified: '2026-03-02', expires: '2026-09-02', confidence: 'medium' }), claim('pzu-sport', 'accepted', { source: 'community', confidence: 'medium' }), claim('beactive', 'unknown'), claim('medicover-sport', 'unknown')],
    prices: [price('Zajęcia jednorazowe', 50), price('Karnet 8 wejść', 320)], hours: [['pon–pt', '7:00–21:30'], ['sob', '9:00–14:00'], ['niedz', 'zamknięte']], amenities: ['Maty na miejscu', 'Herbata'],
  },
  {
    name: 'Squash Point Wola', category: 'squash', city: 'warszawa', street: 'ul. Kasprzaka 29', postalCode: '01-234', lat: 52.2297, lng: 20.9628,
    cards: [claim('multisport', 'conditional', { conditions: 'Rezerwacja kortu do 15:00 w dni robocze.', source: 'venue' }), claim('medicover-sport', 'conditional', { conditions: 'Dopłata 15 zł do kortu.' }), claim('beactive', 'unknown'), claim('pzu-sport', 'not_accepted')],
    prices: [price('Kort 60 min (szczyt)', 90), price('Kort 60 min (poza szczytem)', 60)], amenities: ['4 korty', 'Wypożyczalnia rakiet'],
  },
  // Kraków
  {
    name: 'Kraków Climb Center', category: 'wspinaczka', city: 'krakow', street: 'ul. Zakopiańska 62', postalCode: '30-418', lat: 50.0279, lng: 19.9393,
    cards: [claim('multisport', 'accepted'), claim('beactive', 'accepted', { source: 'venue' }), claim('medicover-sport', 'conditional', { conditions: 'Tylko bouldering, bez wypożyczenia sprzętu.' }), claim('pzu-sport', 'unknown')],
    prices: [price('Wejście normalne', 42), price('Wypożyczenie butów', 12, 'dodatkowo')], hours: [['pon–pt', '10:00–23:00'], ['sob–niedz', '9:00–22:00']], amenities: ['Bouldering', 'Ściana z liną', 'Strefa dla dzieci'],
  },
  {
    name: 'Fit Kazimierz', category: 'fitness', city: 'krakow', street: 'ul. Dietla 50', postalCode: '31-039', lat: 50.0525, lng: 19.9431,
    cards: [claim('multisport', 'accepted'), claim('medicover-sport', 'accepted'), claim('pzu-sport', 'accepted', { verified: '2026-02-10', expires: '2026-08-10' }), claim('beactive', 'unknown')],
    prices: [price('Wejście jednorazowe', 30), price('Karnet open', 139)], amenities: ['Zajęcia grupowe', 'Strefa cardio'],
  },
  {
    name: 'Pływalnia Wisła Park', category: 'basen', city: 'krakow', street: 'ul. Kotlarska 34', postalCode: '31-539', lat: 50.0566, lng: 19.9673,
    cards: [claim('multisport', 'accepted'), claim('beactive', 'not_accepted'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Bilet 60 min', 24)], hours: [['pon–niedz', '6:00–22:00']], amenities: ['Basen sportowy', 'Jacuzzi'],
  },
  {
    name: 'Joga Pod Wawelem', category: 'joga', city: 'krakow', street: 'ul. Stradomska 12', postalCode: '31-068', lat: 50.0519, lng: 19.9393,
    cards: [claim('multisport', 'unknown'), claim('beactive', 'unknown'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Zajęcia jednorazowe', 45)], amenities: ['Joga dla początkujących'],
  },
  // Gdańsk
  {
    name: 'Bałtyk Gym Wrzeszcz', category: 'silownia', city: 'gdansk', street: 'al. Grunwaldzka 82', postalCode: '80-244', lat: 54.3794, lng: 18.6036,
    cards: [claim('multisport', 'accepted', { source: 'venue' }), claim('beactive', 'accepted'), claim('medicover-sport', 'accepted'), claim('pzu-sport', 'conditional', { conditions: 'Wejścia 6:00–15:00.' })],
    prices: [price('Wejście jednorazowe', 30), price('Karnet miesięczny', 129)], hours: [['pon–niedz', '0:00–24:00']], amenities: ['Całodobowo', 'Parking', 'Sauna'],
  },
  {
    name: 'Aquapark Morska Przystań', category: 'basen', city: 'gdansk', street: 'ul. Chłopska 11', postalCode: '80-362', lat: 54.4097, lng: 18.5969,
    cards: [claim('multisport', 'conditional', { conditions: 'Strefa basenowa 90 min, strefa saun płatna osobno.' }), claim('medicover-sport', 'conditional', { conditions: 'Dopłata 12 zł.' }), claim('beactive', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Bilet 90 min', 39), price('Strefa saun', 25, 'dopłata')], amenities: ['Zjeżdżalnie', 'Sauny', 'Basen solankowy'],
  },
  {
    name: 'Ścianka Oliwa Boulder', category: 'wspinaczka', city: 'gdansk', street: 'ul. Kaprów 19', postalCode: '80-316', lat: 54.4031, lng: 18.5708,
    cards: [claim('multisport', 'accepted', { source: 'automated', confidence: 'low' }), claim('beactive', 'unknown'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Wejście normalne', 38)], amenities: ['Bouldering', 'Kawiarnia'],
  },
  {
    name: 'Squash Gdańsk Śródmieście', category: 'squash', city: 'gdansk', street: 'ul. Kartuska 18', postalCode: '80-104', lat: 54.3478, lng: 18.6317,
    cards: [claim('multisport', 'not_accepted'), claim('beactive', 'not_accepted'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Kort 60 min', 70)], amenities: ['3 korty'],
  },
  // Wrocław
  {
    name: 'Odra Fitness Club', category: 'fitness', city: 'wroclaw', street: 'ul. Legnicka 58', postalCode: '54-204', lat: 51.1186, lng: 16.9921,
    cards: [claim('multisport', 'accepted'), claim('medicover-sport', 'accepted'), claim('beactive', 'conditional', { conditions: 'Tylko zajęcia grupowe.' }), claim('pzu-sport', 'unknown')],
    prices: [price('Wejście jednorazowe', 32), price('Karnet open', 145)], amenities: ['Zajęcia grupowe', 'Strefa cardio', 'Parking'],
  },
  {
    name: 'Siłownia Rynek 24', category: 'silownia', city: 'wroclaw', street: 'ul. Ruska 46', postalCode: '50-079', lat: 51.1092, lng: 17.0244,
    cards: [claim('multisport', 'accepted'), claim('pzu-sport', 'accepted'), claim('beactive', 'unknown'), claim('medicover-sport', 'not_accepted')],
    prices: [price('Wejście jednorazowe', 29)], hours: [['pon–niedz', '0:00–24:00']], amenities: ['Całodobowo'],
  },
  {
    name: 'Wodny Park Ślęża', category: 'basen', city: 'wroclaw', street: 'ul. Borowska 99', postalCode: '50-558', lat: 51.0866, lng: 17.0302,
    cards: [claim('multisport', 'accepted', { verified: '2026-01-15', expires: '2026-07-15' }), claim('beactive', 'accepted'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Bilet 60 min', 26), price('Bilet rodzinny', 70)], amenities: ['Basen 25 m', 'Sauna', 'Siłownia'],
  },
  {
    name: 'Joga Nadodrze', category: 'joga', city: 'wroclaw', street: 'ul. Jedności Narodowej 120', postalCode: '50-301', lat: 51.1215, lng: 17.0412,
    cards: [claim('multisport', 'conditional', { conditions: 'Maks. 4 wejścia w miesiącu.', source: 'community', confidence: 'medium' }), claim('beactive', 'unknown'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Zajęcia jednorazowe', 40)], amenities: ['Joga, pilates'],
  },
  // Poznań
  {
    name: 'Warta Power Gym', category: 'silownia', city: 'poznan', street: 'ul. Głogowska 74', postalCode: '60-263', lat: 52.3962, lng: 16.8996,
    cards: [claim('multisport', 'accepted'), claim('beactive', 'accepted'), claim('medicover-sport', 'conditional', { conditions: 'Wejścia do 16:00.' }), claim('pzu-sport', 'accepted')],
    prices: [price('Wejście jednorazowe', 28), price('Karnet miesięczny', 119)], amenities: ['Strefa crossfit', 'Szatnia'],
  },
  {
    name: 'Malta Basen Rekreacyjny', category: 'basen', city: 'poznan', street: 'ul. Termalna 1', postalCode: '61-028', lat: 52.4019, lng: 16.9725,
    cards: [claim('multisport', 'conditional', { conditions: 'Wejście 75 min, w weekendy dopłata.' }), claim('beactive', 'unknown'), claim('medicover-sport', 'accepted'), claim('pzu-sport', 'unknown')],
    prices: [price('Bilet 75 min', 33)], hours: [['pon–niedz', '7:00–22:00']], amenities: ['Basen olimpijski', 'Termy', 'Zjeżdżalnie'],
  },
  {
    name: 'Blok Wspinaczkowy Jeżyce', category: 'wspinaczka', city: 'poznan', street: 'ul. Dąbrowskiego 39', postalCode: '60-843', lat: 52.4115, lng: 16.9005,
    cards: [claim('multisport', 'accepted'), claim('medicover-sport', 'accepted'), claim('beactive', 'unknown'), claim('pzu-sport', 'unknown')],
    prices: [price('Wejście normalne', 36)], amenities: ['Bouldering', 'Sklepik'],
  },
  {
    name: 'Squash & Fit Stary Browar', category: 'squash', city: 'poznan', street: 'ul. Półwiejska 32', postalCode: '61-888', lat: 52.4022, lng: 16.9278,
    cards: [claim('multisport', 'conditional', { conditions: 'Kort poza godzinami szczytu.' }), claim('beactive', 'unknown'), claim('medicover-sport', 'unknown'), claim('pzu-sport', 'not_accepted')],
    prices: [price('Kort 60 min', 65)], amenities: ['2 korty', 'Siłownia'],
  },
];

// ---------------------------------------------------------------------------
// Dodatkowe, generowane obiekty – żeby mapa (klastry), „w pobliżu mnie” i porównanie kart
// miały na czym pracować. Generator jest deterministyczny (stałe ziarno), więc dane i slugi
// są takie same przy każdym uruchomieniu i na serwerze, i w przeglądarce.
// ---------------------------------------------------------------------------

/** Prosty deterministyczny generator liczb losowych (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CityArea {
  slug: string;
  count: number;
  /** Dwucyfrowe początki kodów pocztowych miasta. */
  postal: string[];
  /** Prostokąt, w którym losujemy punkty (lądem, bez zatoki i rzek na środku mapy). */
  lat: [number, number];
  lng: [number, number];
  districts: string[];
}

const AREAS: CityArea[] = [
  { slug: 'warszawa', count: 40, postal: ['00', '01', '02', '03', '04'], lat: [52.17, 52.29], lng: [20.92, 21.1], districts: ['Mokotów', 'Wola', 'Praga', 'Ursynów', 'Bemowo', 'Bielany', 'Targówek', 'Wilanów', 'Ochota', 'Żoliborz', 'Białołęka', 'Wawer', 'Śródmieście', 'Gocław', 'Saska Kępa', 'Powiśle'] },
  { slug: 'krakow', count: 25, postal: ['30', '31'], lat: [50.02, 50.09], lng: [19.88, 20.02], districts: ['Kazimierz', 'Podgórze', 'Krowodrza', 'Nowa Huta', 'Bronowice', 'Dębniki', 'Prądnik', 'Czyżyny', 'Zabłocie', 'Grzegórzki'] },
  { slug: 'gdansk', count: 18, postal: ['80'], lat: [54.33, 54.4], lng: [18.53, 18.64], districts: ['Wrzeszcz', 'Oliwa', 'Przymorze', 'Zaspa', 'Orunia', 'Siedlce', 'Chełm', 'Morena', 'Jasień', 'Letnica'] },
  { slug: 'wroclaw', count: 22, postal: ['50', '51', '52', '53', '54'], lat: [51.07, 51.14], lng: [16.96, 17.1], districts: ['Krzyki', 'Fabryczna', 'Psie Pole', 'Śródmieście', 'Biskupin', 'Gaj', 'Popowice', 'Kozanów', 'Ołbin', 'Grabiszyn'] },
  { slug: 'poznan', count: 18, postal: ['60', '61'], lat: [52.37, 52.44], lng: [16.86, 16.98], districts: ['Jeżyce', 'Grunwald', 'Wilda', 'Łazarz', 'Rataje', 'Winogrady', 'Piątkowo', 'Górczyn', 'Sołacz', 'Garbary'] },
];

type GeneratedCategorySlug = (typeof CATEGORY_WEIGHTS)[number][0];

const NAME_PREFIX: Record<GeneratedCategorySlug, string[]> = {
  silownia: ['Siłownia', 'Power Gym', 'Iron Club', 'Gym Point'],
  basen: ['Pływalnia', 'Basen', 'Aqua Centrum'],
  fitness: ['Klub Fitness', 'Fit Studio', 'Studio Ruchu'],
  joga: ['Studio Jogi', 'Joga', 'Przestrzeń Jogi'],
  wspinaczka: ['Ścianka', 'Boulder Hall', 'Centrum Wspinaczkowe'],
  squash: ['Squash Club', 'Korty Squash', 'Squash & Fit'],
};

const STREETS = ['Sportowa', 'Leśna', 'Ogrodowa', 'Polna', 'Kwiatowa', 'Słoneczna', 'Lipowa', 'Szkolna', 'Parkowa', 'Klonowa', 'Długa', 'Krótka'];

const CATEGORY_WEIGHTS = [
  ['silownia', 30],
  ['fitness', 22],
  ['basen', 14],
  ['joga', 14],
  ['wspinaczka', 10],
  ['squash', 10],
] as const satisfies readonly (readonly [CategorySlug, number])[];

/** Udział statusów [accepted, conditional, not_accepted] – reszta to unknown. Różne karty mają różny zasięg. */
const CARD_ODDS: Record<CardProviderSlug, [number, number, number]> = {
  multisport: [0.58, 0.18, 0.08],
  'medicover-sport': [0.36, 0.14, 0.1],
  beactive: [0.3, 0.1, 0.14],
  'pzu-sport': [0.2, 0.08, 0.1],
};

const CONDITIONS: Record<GeneratedCategorySlug, string[]> = {
  silownia: ['Wejścia do 16:00 w dni robocze.', 'Dopłata 5 zł w weekendy.'],
  basen: ['Wejście do 60 min, w weekendy dopłata.', 'Bez strefy saun.'],
  fitness: ['Tylko zajęcia grupowe.', 'Maks. 1 wejście dziennie.'],
  joga: ['Maks. 4 wejścia w miesiącu.', 'Tylko zajęcia poranne.'],
  wspinaczka: ['Tylko bouldering.', 'Dopłata za wypożyczenie sprzętu.'],
  squash: ['Kort poza godzinami szczytu.', 'Dopłata 15 zł do kortu.'],
};

const PRICE_RANGE: Record<GeneratedCategorySlug, [string, number, number]> = {
  silownia: ['Wejście jednorazowe', 22, 40],
  basen: ['Bilet 60 min', 18, 36],
  fitness: ['Wejście jednorazowe', 25, 45],
  joga: ['Zajęcia jednorazowe', 35, 60],
  wspinaczka: ['Wejście normalne', 30, 48],
  squash: ['Kort 60 min', 50, 95],
};

const AMENITIES: Record<GeneratedCategorySlug, string[]> = {
  silownia: ['Szatnia', 'Prysznice', 'Strefa wolnych ciężarów', 'Parking', 'Sauna'],
  basen: ['Basen 25 m', 'Brodzik', 'Sauna', 'Jacuzzi'],
  fitness: ['Zajęcia grupowe', 'Strefa cardio', 'Szatnia'],
  joga: ['Maty na miejscu', 'Herbata', 'Zajęcia online'],
  wspinaczka: ['Bouldering', 'Wypożyczalnia butów', 'Kawiarnia'],
  squash: ['Wypożyczalnia rakiet', 'Prysznice', 'Bar'],
};

const HOURS_TEMPLATES: Record<GeneratedCategorySlug, [string, string][][]> = {
  silownia: [DEFAULT_HOURS, [['pon–niedz', '0:00–24:00']], [['pon–pt', '6:00–23:00'], ['sob–niedz', '8:00–22:00']]],
  basen: [[['pon–niedz', '6:00–22:00']], [['pon–pt', '6:30–22:00'], ['sob–niedz', '8:00–21:00']]],
  fitness: [DEFAULT_HOURS, [['pon–pt', '6:00–23:00'], ['sob–niedz', '8:00–22:00']]],
  joga: [[['pon–pt', '7:00–21:00'], ['sob', '9:00–14:00'], ['niedz', 'zamknięte']], [['pon–sob', '8:00–20:00'], ['niedz', '10:00–14:00']]],
  wspinaczka: [[['pon–pt', '10:00–23:00'], ['sob–niedz', '9:00–22:00']]],
  squash: [[['pon–pt', '7:00–23:00'], ['sob–niedz', '8:00–22:00']], DEFAULT_HOURS],
};

function generateSeeds(): Seed[] {
  const rand = rng(2026);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (min: number, max: number) => min + rand() * (max - min);
  const weighted = () => {
    const total = CATEGORY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [c, w] of CATEGORY_WEIGHTS) if ((r -= w) < 0) return c;
    return CATEGORY_WEIGHTS[0][0];
  };
  const usedNames = new Set(seeds.map((s) => s.name));
  const out: Seed[] = [];

  for (const area of AREAS) {
    for (let i = 0; i < area.count; i++) {
      const category = weighted();
      let name = '';
      for (let tries = 0; tries < 20 && (!name || usedNames.has(name)); tries++) {
        name = `${pick(NAME_PREFIX[category])} ${pick(area.districts)}`;
      }
      if (usedNames.has(name)) name = `${name} ${i + 2}`;
      usedNames.add(name);

      const cards = CARD_PROVIDERS_ORDER.map((provider) => {
        const [acc, cond, not] = CARD_ODDS[provider];
        const r = rand();
        if (r < acc) return claim(provider, 'accepted', { source: rand() < 0.3 ? 'venue' : 'public_source' });
        if (r < acc + cond) return claim(provider, 'conditional', { conditions: pick(CONDITIONS[category]) });
        if (r < acc + cond + not) return claim(provider, 'not_accepted');
        return claim(provider, 'unknown');
      });

      const [label, min, max] = PRICE_RANGE[category];
      const amount = Math.round(between(min, max));
      const amenities = AMENITIES[category].filter(() => rand() < 0.55);

      out.push({
        name,
        category,
        city: area.slug,
        street: `ul. ${pick(STREETS)} ${1 + Math.floor(rand() * 120)}`,
        postalCode: `${pick(area.postal)}-${String(Math.floor(rand() * 1000)).padStart(3, '0')}`,
        lat: Math.round(between(...area.lat) * 1e4) / 1e4,
        lng: Math.round(between(...area.lng) * 1e4) / 1e4,
        cards,
        prices: [price(label, amount)],
        hours: pick(HOURS_TEMPLATES[category]),
        amenities: amenities.length ? amenities : AMENITIES[category].slice(0, 1),
      });
    }
  }
  return out;
}

const CARD_PROVIDERS_ORDER: CardProviderSlug[] = ['multisport', 'beactive', 'medicover-sport', 'pzu-sport'];

export const MOCK_PLACES: PlaceDetails[] = [...seeds, ...generateSeeds()].map((s, i) => {
  const city = CITIES.find((c) => c.slug === s.city)!;
  const slug = slugify(s.name);
  // „od” liczymy tylko z podstawowych biletów – pozycje z notatką (dopłaty, wypożyczenia) pomijamy
  const cheapest = s.prices.filter((p) => !p.note).reduce<Price | null>((min, p) => (!min || p.amount < min.amount ? p : min), null);
  return {
    id: String(i + 1),
    slug,
    name: s.name,
    category: s.category,
    address: { street: s.street, postalCode: s.postalCode, city: city.name, citySlug: city.slug },
    location: { lat: s.lat, lng: s.lng },
    cards: s.cards,
    priceFrom: cheapest,
    description: s.description ?? null,
    website: 'https://example.com',
    phone: null, // celowo bez numerów – zmyślony numer mógłby należeć do prawdziwej osoby
    openingHours: (s.hours ?? DEFAULT_HOURS).map(([days, hours]) => ({ days, hours })),
    amenities: s.amenities ?? [],
    prices: s.prices,
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-28T08:00:00Z',
  };
});

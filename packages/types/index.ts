/**
 * Wspólny kontrakt API (frontend ↔ backend).
 * PROPOZYCJA Osoby 1 do uzgodnienia z Osobą 2 – opis i przykłady w docs/api-contract.md.
 * Daty: ISO 8601 (UTC). Współrzędne: WGS84 (EPSG:4326).
 */

export const CARD_PROVIDER_SLUGS = ['multisport', 'beactive', 'medicover-sport', 'pzu-sport'] as const;
export type CardProviderSlug = (typeof CARD_PROVIDER_SLUGS)[number];

export const CATEGORY_SLUGS = ['silownia', 'basen', 'fitness', 'joga', 'wspinaczka', 'squash'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/** Status karty – nigdy boolean. */
export const CARD_STATUSES = ['accepted', 'conditional', 'not_accepted', 'unknown'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** Skąd pochodzi informacja: od obiektu, ze źródła publicznego, z automatycznej analizy strony, od społeczności. */
export const SOURCE_TYPES = ['venue', 'public_source', 'automated', 'community'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type Confidence = 'high' | 'medium' | 'low';

export interface CardProvider {
  slug: CardProviderSlug;
  name: string;
}

export interface Category {
  slug: CategorySlug;
  name: string;
}

/** Odpowiednik rekordu place_card_claims. */
export interface CardClaim {
  provider: CardProviderSlug;
  status: CardStatus;
  /** Warunki użycia karty, np. „tylko do 16:00”, „dopłata 10 zł”. */
  conditions: string | null;
  sourceType: SourceType;
  sourceUrl: string | null;
  sourceQuote: string | null;
  confidence: Confidence;
  verifiedAt: string | null;
  /** Po tej dacie informacja wymaga ponownej weryfikacji. */
  expiresAt: string | null;
}

export interface Address {
  street: string;
  postalCode: string;
  city: string;
  citySlug: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Price {
  label: string; // np. „Wejście jednorazowe”
  amount: number; // w złotych
  currency: 'PLN';
  note: string | null;
}

export interface OpeningHoursEntry {
  days: string; // np. „pon–pt”
  hours: string; // np. „6:00–22:00” lub „zamknięte”
}

/** Element listy: GET /api/places */
export interface PlaceSummary {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  address: Address;
  location: GeoPoint;
  cards: CardClaim[];
  /** Najniższa znana cena, do wyświetlenia na liście. */
  priceFrom: Price | null;
  updatedAt: string;
}

/** Szczegóły: GET /api/places/:slug */
export interface PlaceDetails extends PlaceSummary {
  description: string | null;
  website: string | null;
  phone: string | null;
  openingHours: OpeningHoursEntry[];
  amenities: string[];
  prices: Price[];
  createdAt: string;
}

/** Parametry GET /api/places (wszystkie opcjonalne). */
export interface PlacesQuery {
  q?: string;
  city?: string; // slug miasta, np. „warszawa”
  category?: CategorySlug;
  /** Zwraca obiekty, gdzie KAŻDA z podanych kart ma status accepted lub conditional. */
  cards?: CardProviderSlug[]; // w URL: cards=multisport,beactive
  lat?: number;
  lng?: number;
  radius?: number; // metry
  bbox?: [number, number, number, number]; // west,south,east,north
  limit?: number; // domyślnie 20, max 100
  offset?: number;
}

export interface PlacesResponse {
  items: PlaceSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: { code: string; message: string };
}

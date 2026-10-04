import { CARD_PROVIDER_SLUGS, type CardClaim, type PlaceDetails } from '@repo/types';
import type { cardProviders, placeCardClaims, places } from '@/db/schema';

/** Kolumny potrzebne do szczegółów obiektu – bez surowych danych OSM (tagi, historia edycji). */
export type PlaceRow = Pick<typeof places.$inferSelect,
  | 'id' | 'slug' | 'name' | 'category' | 'description' | 'addressStreet' | 'addressHouseNumber'
  | 'postalCode' | 'city' | 'citySlug' | 'location' | 'openingHours' | 'website' | 'phone'
  | 'amenities' | 'prices' | 'createdAt' | 'updatedAt'>;
export type ClaimRow = typeof placeCardClaims.$inferSelect & {
  providerSlug: typeof cardProviders.$inferSelect.slug;
};

export function toPlaceDetails(place: PlaceRow, claims: ClaimRow[]): PlaceDetails {
  const cards: CardClaim[] = CARD_PROVIDER_SLUGS.map((provider) => {
    const claim = claims.find((item) => item.providerSlug === provider);
    return claim ? {
      provider,
      status: claim.status,
      conditions: claim.conditions,
      sourceType: claim.sourceType,
      sourceUrl: claim.sourceUrl,
      sourceQuote: claim.sourceQuote,
      confidence: claim.confidence,
      verifiedAt: claim.verifiedAt?.toISOString() ?? null,
      expiresAt: claim.expiresAt?.toISOString() ?? null,
    } : {
      provider,
      status: 'unknown',
      conditions: null,
      sourceType: 'automated',
      sourceUrl: null,
      sourceQuote: null,
      confidence: 'low',
      verifiedAt: null,
      expiresAt: null,
    };
  });

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    address: {
      street: [place.addressStreet, place.addressHouseNumber].filter(Boolean).join(' '),
      postalCode: place.postalCode ?? '',
      city: place.city ?? '',
      citySlug: place.citySlug ?? '',
    },
    location: { lat: place.location.y, lng: place.location.x },
    cards,
    priceFrom: place.prices.reduce<PlaceDetails['priceFrom']>(
      (lowest, price) => !lowest || price.amount < lowest.amount ? price : lowest,
      null,
    ),
    updatedAt: place.updatedAt.toISOString(),
    description: place.description,
    website: place.website,
    phone: place.phone,
    openingHours: place.openingHours,
    amenities: place.amenities,
    prices: place.prices,
    createdAt: place.createdAt.toISOString(),
  };
}

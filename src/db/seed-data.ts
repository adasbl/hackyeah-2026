import type { CardProvider, CardProviderSlug, CategorySlug } from "@repo/types";
import { placeCardClaims, places } from "./schema";

export const DEMO_DATASET = "hackyeah-demo-v1";
export const DEMO_MARKER = "demo:dataset";

export const SEED_PROVIDERS = [
  { slug: "multisport", name: "MultiSport" },
  { slug: "beactive", name: "BeActive" },
  { slug: "medicover-sport", name: "Medicover Sport" },
  { slug: "pzu-sport", name: "PZU Sport" },
] satisfies CardProvider[];

type PlaceInput = typeof places.$inferInsert;
type ClaimInput = Omit<
  typeof placeCardClaims.$inferInsert,
  "placeId" | "providerId"
>;

export interface SeedPlace {
  place: PlaceInput & { slug: string };
  claims: (ClaimInput & { providerSlug: CardProviderSlug })[];
}

const cities = [
  { name: "Warszawa", slug: "warszawa", postalCode: "00-001", lng: 21.0122, lat: 52.2297 },
  { name: "Kraków", slug: "krakow", postalCode: "30-001", lng: 19.945, lat: 50.0647 },
  { name: "Gdańsk", slug: "gdansk", postalCode: "80-001", lng: 18.6466, lat: 54.352 },
  { name: "Wrocław", slug: "wroclaw", postalCode: "50-001", lng: 17.0385, lat: 51.1079 },
  { name: "Poznań", slug: "poznan", postalCode: "60-001", lng: 16.9252, lat: 52.4064 },
] as const;

const categories = [
  { slug: "silownia", label: "Siłownia", osmTag: "fitness_centre" },
  { slug: "basen", label: "Basen", osmTag: "swimming_pool" },
  { slug: "fitness", label: "Studio fitness", osmTag: "fitness_centre" },
  { slug: "joga", label: "Studio jogi", osmTag: "sports_centre" },
  { slug: "wspinaczka", label: "Ścianka wspinaczkowa", osmTag: "sports_centre" },
  { slug: "squash", label: "Korty squasha", osmTag: "sports_centre" },
] satisfies { slug: CategorySlug; label: string; osmTag: string }[];

// Stałe daty dotyczą wyłącznie fikcyjnych scenariuszy, nie weryfikacji obiektów.
const verifiedAt = new Date("2026-10-03T10:00:00Z");
const expiresAt = new Date("2027-04-03T10:00:00Z");
const statuses = ["accepted", "conditional", "not_accepted", "unknown"] as const;

function claimsFor(slug: string, index: number): SeedPlace["claims"] {
  return SEED_PROVIDERS.map((provider, providerIndex) => {
    // Pierwszy obiekt akceptuje wszystkie karty: przykład filtra OR.
    const status = index === 0
      ? "accepted"
      : statuses[(index + providerIndex) % statuses.length];
    const unknown = status === "unknown";

    return {
      providerSlug: provider.slug,
      status,
      conditions: status === "conditional"
        ? "[DEMO] Wejście do 60 minut, wymagana wcześniejsza rezerwacja."
        : null,
      sourceType: unknown ? "automated" : status === "conditional" ? "public_source" : "venue",
      sourceUrl: unknown ? null : `https://example.com/demo/${slug}#${provider.slug}`,
      sourceQuote: "Fikcyjne dane seeda. Status nie opisuje rzeczywistego obiektu ani operatora.",
      confidence: unknown ? "low" : status === "conditional" ? "medium" : "high",
      verifiedAt: unknown ? null : verifiedAt,
      expiresAt: unknown ? null : expiresAt,
    };
  });
}

/** 20 fikcyjnych obiektów: 15 opublikowanych, 5 niepełnych szkiców. */
export const SEED_PLACES: SeedPlace[] = cities.flatMap((city, cityIndex) =>
  Array.from({ length: 4 }, (_, localIndex): SeedPlace => {
    const index = cityIndex * 4 + localIndex;
    const category = categories[index % categories.length];
    const draft = localIndex === 3;
    const slug = `demo-${city.slug}-${category.slug}-${localIndex + 1}`;

    return {
      place: {
        slug,
        name: `[DEMO] ${category.label} ${city.name} ${localIndex + 1}`,
        description: "Fikcyjny obiekt demonstracyjny. Nazwa, adres, współrzędne, ceny i statusy kart służą wyłącznie testom.",
        category: category.slug,
        // Przykład tagów OSM, ale bez podszywania się pod rzeczywisty osm_id.
        osmTags: {
          [DEMO_MARKER]: DEMO_DATASET,
          leisure: category.osmTag,
        },
        location: {
          x: city.lng + localIndex * 0.006,
          y: city.lat + localIndex * 0.004,
        },
        addressStreet: draft ? null : "ul. Demonstracyjna",
        addressHouseNumber: draft ? null : String(localIndex + 1),
        addressFloor: !draft && localIndex === 2 ? "1" : null,
        level: !draft && localIndex === 2 ? "1" : null,
        postalCode: draft ? null : city.postalCode,
        city: draft ? null : city.name,
        citySlug: draft ? null : city.slug,
        openingHoursRaw: draft || localIndex === 1
          ? null
          : "Mo-Fr 06:00-23:00; Sa-Su 07:00-22:00",
        openingHours: draft || localIndex === 1 ? [] : [
          { days: "pon–pt", hours: "06:00–23:00" },
          { days: "sob–nd", hours: "07:00–22:00" },
        ],
        website: draft || localIndex === 1 ? null : `https://example.com/demo/${slug}`,
        // Brak fikcyjnych numerów, pod którymi mógłby odebrać prawdziwy człowiek.
        phone: null,
        paymentMethods: draft ? [] : ["credit_cards", "visa", "mastercard"],
        amenities: draft || localIndex === 1 ? [] : ["szatnia", "prysznice"],
        prices: draft || localIndex === 1 ? [] : [{
          label: "[DEMO] Wejście jednorazowe",
          amount: 25 + localIndex * 10,
          currency: "PLN",
          note: "Cena fikcyjna, przeznaczona do testów.",
        }],
        isPublished: !draft,
      },
      // Brak rekordów kart w szkicach pozwala przetestować fallback unknown.
      claims: draft ? [] : claimsFor(slug, index),
    };
  }),
);

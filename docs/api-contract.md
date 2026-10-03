# Kontrakt API – propozycja frontendu (Osoba 1 → Osoba 2)

Typy TypeScript: [`packages/types/index.ts`](../packages/types/index.ts) (import: `@repo/types`).
Frontend korzysta dziś z mocka o dokładnie tym kształcie (`src/mocks/places.ts`), więc po uzgodnieniu wystarczy podmienić funkcje w `src/lib/data/places.ts`.

## Konwencje

- pola w JSON: `camelCase` (w bazie `snake_case`, mapowanie po stronie backendu),
- daty: ISO 8601 w UTC, np. `"2026-09-12T10:00:00Z"`,
- współrzędne: `{ "lat": 52.2, "lng": 21.0 }` (WGS84),
- ceny: kwota w złotych (`number`) + `currency: "PLN"`,
- slugi kategorii: `silownia`, `basen`, `fitness`, `joga`, `wspinaczka`, `squash`,
- slugi kart: `multisport`, `beactive`, `medicover-sport`, `pzu-sport`,
- status karty: `accepted` | `conditional` | `not_accepted` | `unknown` (nigdy boolean),
- źródło: `venue` | `public_source` | `automated` | `community`,
- pewność: `high` | `medium` | `low`.

## GET /api/places

| Parametr | Przykład | Opis |
|---|---|---|
| `q` | `fala` | nazwa / adres (pg_trgm) |
| `city` | `warszawa` | slug miasta; `polska` lub brak = cała Polska |
| `category` | `basen` | slug kategorii |
| `cards` | `multisport,beactive` | **każda** z kart musi mieć status `accepted` lub `conditional` |
| `lat`, `lng`, `radius` | `52.23`, `21.01`, `3000` | promień w metrach |
| `bbox` | `20.9,52.1,21.1,52.3` | west,south,east,north – dla mapy |
| `limit`, `offset` | `20`, `0` | domyślnie 20, max 100 |

Odpowiedź `200`:

```json
{
  "items": [
    {
      "id": "2",
      "slug": "basen-fala-mokotow",
      "name": "Basen Fala Mokotów",
      "category": "basen",
      "address": { "street": "ul. Konduktorska 7", "postalCode": "00-775", "city": "Warszawa", "citySlug": "warszawa" },
      "location": { "lat": 52.2007, "lng": 21.0368 },
      "cards": [
        {
          "provider": "multisport",
          "status": "conditional",
          "conditions": "Wejście do 60 min, w weekendy dopłata 10 zł.",
          "sourceType": "public_source",
          "sourceUrl": "https://example.com/zrodlo",
          "sourceQuote": null,
          "confidence": "high",
          "verifiedAt": "2026-09-12T10:00:00Z",
          "expiresAt": "2027-03-12T00:00:00Z"
        }
      ],
      "priceFrom": { "label": "Bilet ulgowy 60 min", "amount": 20, "currency": "PLN", "note": null },
      "updatedAt": "2026-09-28T08:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

## GET /api/places/:slug

`PlaceSummary` + pola: `description`, `website`, `phone`, `openingHours: [{ "days": "pon–pt", "hours": "6:30–22:00" }]`, `amenities: string[]`, `prices: Price[]`, `createdAt`.
Brak obiektu → `404`.

## Błędy

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Nieprawidłowy parametr category" } }
```

Bez szczegółów bazy i stack trace.

## Do ustalenia z backendem

1. Czy `cards` w liście zwracamy wszystkie 4 karty (także `unknown`)? Frontend zakłada, że **tak**; brakująca karta jest traktowana jak `unknown`.
2. `confidence` jako enum (`high/medium/low`) czy liczba 0–1?
3. `openingHours`: prosty format do wyświetlania (jak wyżej) czy surowy `opening_hours` z OSM?
4. Paginacja `limit/offset` czy kursor?

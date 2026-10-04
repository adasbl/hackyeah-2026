# Kontrakt API – propozycja frontendu (Osoba 1 → Osoba 2)

Typy TypeScript: [`packages/types/index.ts`](../packages/types/index.ts) (import: `@repo/types`).
Frontend pobiera dane z PostgreSQL przez `src/lib/data/places.ts` i serwis `src/server/places.ts`. Poniższe ścieżki HTTP opisują kontrakt; mapa i ulubione korzystają obecnie z Server Actions.

## Konwencje

- pola w JSON: `camelCase` (w bazie `snake_case`, mapowanie po stronie backendu),
- daty: ISO 8601 w UTC, np. `"2026-09-12T10:00:00Z"`,
- współrzędne: `{ "lat": 52.2, "lng": 21.0 }` (WGS84),
- ceny: kwota w złotych (`number`) + `currency: "PLN"`,
- slugi kategorii: `silownia`, `basen`, `fitness`, `joga`, `wspinaczka`, `squash`, `tenis`, `taniec`; `squash` obejmuje również padel,
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
| `cards` | `multisport,beactive` | **dowolna** z kart musi mieć status `accepted` lub `conditional` |
| `lat`, `lng`, `radius` | `52.23`, `21.01`, `3000` | punkt odniesienia i promień w metrach (`radius` wymaga `lat`/`lng`) |
| `open` | `1` | tylko obiekty otwarte teraz (czas Europe/Warsaw) |
| `sort` | `distance` | `name` (domyślnie) albo `distance` – od najbliższych, wymaga `lat`/`lng` |
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
      "openingHours": [{ "days": "pon–pt", "hours": "6:30–22:00" }, { "days": "sob–niedz", "hours": "8:00–21:00" }],
      "distanceMeters": 1240,
      "updatedAt": "2026-09-28T08:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

`openingHours` jest w elemencie listy, bo lista pokazuje status „otwarte teraz”.
`distanceMeters` zwracamy tylko, gdy zapytanie ma `lat`/`lng` (odległość w linii prostej, w metrach).

## GET /api/places/:slug

`PlaceSummary` + pola: `description`, `website`, `phone`, `amenities: string[]`, `prices: Price[]`, `createdAt`.

## GET /api/places/points (mapa)

Te same filtry co `/api/places` (zwykle z `bbox`), ale lekkie punkty i wyższy limit (do 2000),
bo mapa sama grupuje je w klastry: `{ "items": [{ "id", "slug", "name", "category", "street", "city", "location" }], "total" }`.
Przy bardzo dużej liczbie obiektów można później przenieść klastrowanie na serwer (PostGIS `ST_ClusterDBSCAN` / siatka).

## GET /api/stats/cards

Porównanie kart. Filtry jak w `/api/places` (`city`, `category`, `open`, `lat`/`lng`/`radius`), **bez** `cards`.

```json
{
  "total": 44,
  "providers": [
    { "provider": "multisport", "accepted": 26, "conditional": 8, "notAccepted": 3, "unknown": 7 }
  ]
}
```
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
5. „Otwarte teraz” liczymy z prostego formatu godzin – jeśli przejdziemy na `opening_hours` z OSM, filtr trzeba liczyć w bazie lub w serwisie.

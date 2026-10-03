# hackyeah-2026

Wyszukiwarka obiektów sportowych z obsługą kart partnerskich.

Stack: Next.js na Vercel, PostgreSQL/PostGIS w Supabase, MapLibre GL JS
z zewnętrznym dostawcą stylu i kafelków (propozycja dla MVP: MapTiler).
Lokalnie baza działa w Dockerze.

Pełny plan i podział pracy: [plan projektu](podsumowanie_projektu_wyszukiwarka_obiekt_w_multisport_beactive.md).

## Stan projektu

Repozytorium zawiera aplikację Next.js, schemat Drizzle, migrację SQL i seed DEMO.
Wyszukiwanie, szczegóły i lista miast odczytują dane z bazy przez `DATABASE_URL`.
Publiczne API, panel administracyjny i importer prawdziwych danych pozostają
kolejnymi zadaniami. Używamy npm i `package-lock.json`.

## Lokalna baza

```powershell
docker compose up -d db
docker compose ps
```

Jeśli nie masz jeszcze `.env.local`, skopiuj `.env.example`:

```powershell
Copy-Item .env.example .env.local
```

Jeśli plik już istnieje, dopisz brakujące wartości ręcznie; nie nadpisuj go.
Parametry bazy lokalnej są w `docker-compose.yml` i `.env.example`.
Nie używamy lokalnego hasła w chmurze. Każda osoba uruchamia własną bazę Docker;
bazą wspólną dla wdrożenia testowego jest Supabase staging.

## Co robimy teraz

1. **Osoba 1 — frontend:** tworzy scaffold Next.js i lockfile npm (`package-lock.json`) w repozytorium,
   przygotowuje listę na mockach oraz komponent MapLibre.
2. **Osoba 2 — backend:** dodaje Drizzle, migracje, idempotentny seed 20 obiektów,
   `GET /api/health` i `GET /api/places` w Route Handlers Next.js.
   Przygotowuje skrypty `db:generate`, `db:migrate` i `db:seed`,
   ładowanie `.env.local` oraz zgodność schematów PostGIS Docker/Supabase.
3. **Osoba 3 — hosting:** tworzy Supabase staging, włącza PostGIS i pg_trgm,
   udostępnia połączenia backendowi, podłącza repo do Vercel po otrzymaniu scaffolda,
   konfiguruje zmienne Preview i dostawcę kafelków. Następnie uruchamia
   migracje + seed osoby 2 na staging i sprawdza deployment.

## Konfiguracja chmury

- `DATABASE_URL`: Supabase **Transaction pooler** dla kodu serwerowego na Vercel.
  Klient postgres.js: `prepare: false`, początkowo `max: 1`, SSL, runtime Node.js.
- `DATABASE_MIGRATION_URL`: Supabase **direct** lub **Session pooler** dla operatora
  migracji / osobnego joba CI; poza runtime aplikacji. Migracje wykonujemy jawnie,
  przed zgodnym z nimi wdrożeniem, nie przy każdym buildzie i PR.
- `NEXT_PUBLIC_MAP_STYLE_URL`: publiczny URL stylu MapLibre od dostawcy kafelków.
  Ewentualny klucz w URL ograniczamy do domen właściwego środowiska.
- Zmienne `NEXT_PUBLIC_SUPABASE_*` są potrzebne dopiero przy integracji Auth;
  Drizzle łączy się za pomocą adresu PostgreSQL, bez klucza Supabase API.
- Preview używa staging; przed production tworzymy osobny projekt Supabase
  i ustawiamy osobne zmienne Production. Hasła/sekretne klucze pozostają poza Git.

Adresy połączeń kopiujemy z **Supabase → Connect**, bez zgadywania hostów.
Vercel nie uruchamia Docker Compose i nie korzysta z bazy na Twoim localhost.

Pierwszy cel: adres Vercel preview, `/api/health` zwracający 200
i `/api/places` zwracający dane z seeda w Supabase.

Dokumentacja: [połączenia Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres),
[PostGIS](https://supabase.com/docs/guides/database/extensions/postgis),
[Vercel z Git](https://vercel.com/docs/git),
[MapLibre](https://maplibre.org/maplibre-gl-js/docs/).
# fit-pass-finder
chat goes brrr...

## Frontend – uruchomienie

Wymagania: Node.js 20.9+ (npm jest instalowany razem z Node.js).

```bash
npm install
npm run dev    # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

Dane wyszukiwania, szczegółów i listy miast pochodzą z PostgreSQL przez Drizzle
(`src/lib/data/places.ts` → `src/server/places.ts`). Ustaw `DATABASE_URL` w `.env.local`
na połączenie Supabase Transaction pooler i wykonaj migrację przed uruchomieniem.
Frontend pokazuje tylko rekordy `places.is_published = true`; brak informacji
o karcie oznacza `unknown`. Filtr kart wymaga akceptacji każdej wybranej karty
i pomija wygasłe potwierdzenia. Strony odczytują dane przy każdym żądaniu.
Plik `src/mocks/places.ts` nie jest używany przez aplikację.

`npm run db:seed` dodaje fikcyjne dane DEMO, a nie prawdziwe obiekty.
Prawdziwe dane należy zaimportować osobno. Format danych frontendu opisuje
[`docs/api-contract.md`](docs/api-contract.md).

Test odczytu Supabase (tylko SELECT, bez modyfikowania bazy):

```powershell
$env:PLACES_INTEGRATION_TEST = "1"
try {
  npm run db:test
} finally {
  Remove-Item Env:PLACES_INTEGRATION_TEST
}
```

| Ścieżka | Co to jest |
|---|---|
| `/` | ekran wyszukiwania (miasto, karta, kategoria) |
| `/warszawa?cards=multisport&category=basen` | wyniki – linkowalne, renderowane na serwerze |
| `/polska` | wyniki dla całej Polski |
| `/places/[slug]` | szczegóły obiektu ze statusami kart |

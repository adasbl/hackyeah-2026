# hackyeah-2026

Wyszukiwarka obiektów sportowych z obsługą kart partnerskich.

Stack: Next.js na Vercel, PostgreSQL/PostGIS w Supabase, MapLibre GL JS
z zewnętrznym dostawcą stylu i kafelków (propozycja dla MVP: MapTiler).
Lokalnie baza działa w Dockerze.

Pełny plan i podział pracy: [plan projektu](podsumowanie_projektu_wyszukiwarka_obiekt_w_multisport_beactive.md).

## Stan projektu

Repozytorium zawiera plan i konfigurację lokalnej bazy. Aplikacja Next.js,
migracje, seed i skrypty npm są zadaniami do wykonania.
Nie ma jeszcze aplikacji, którą można wdrożyć na Vercel.

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

Na razie dane pochodzą z mocka (`src/mocks/places.ts`). Format odpowiedzi API do uzgodnienia: [`docs/api-contract.md`](docs/api-contract.md).

| Ścieżka | Co to jest |
|---|---|
| `/` | ekran wyszukiwania (miasto, karta, kategoria) |
| `/warszawa?cards=multisport&category=basen` | wyniki – linkowalne, renderowane na serwerze |
| `/polska` | wyniki dla całej Polski |
| `/places/[slug]` | szczegóły obiektu ze statusami kart, mini-mapą i statusem „otwarte teraz” |
| `/polska?lat=52.23&lng=21.01&radius=5000` | „w pobliżu mnie” – od najbliższych, w promieniu 5 km |
| `/warszawa?open=1` | tylko obiekty otwarte teraz |
| `/warszawa?view=map` | widok mapy (duża mapa, pełny ekran, filtry na mapie); domyślnie lista |
| `/ulubione` | ulubione obiekty zapisane w przeglądarce (localStorage) |

Mapa grupuje bliskie obiekty w klastry (kółko z liczbą i pierścieniem w kolorach kategorii).
Pod wynikami jest porównanie kart: ile obiektów przy bieżących filtrach akceptuje każdą kartę.
Mock zawiera 20 ręcznie opisanych obiektów i ~120 generowanych deterministycznie (`src/mocks/places.ts`).

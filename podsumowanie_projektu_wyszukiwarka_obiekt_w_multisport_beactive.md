# Wyszukiwarka obiektów sportowych z obsługą kart partnerskich

## 1. Cel projektu

Dynamiczna wyszukiwarka i mapa obiektów sportowych w Polsce. Użytkownik ma znaleźć siłownię, basen, studio jogi, ściankę wspinaczkową lub inny obiekt i sprawdzić:

- czy obiekt deklaruje akceptację kart MultiSport, BeActive, Medicover Sport lub PZU Sport,
- jakie są warunki użycia karty,
- kiedy informacja była ostatnio zweryfikowana,
- adres, lokalizację, godziny otwarcia, udogodnienia i orientacyjne ceny.

Najważniejszą wartością MVP jest wiarygodność danych: każdy status karty powinien mieć źródło, poziom pewności i datę weryfikacji.

Projekt nie powinien sugerować oficjalnego powiązania z operatorami kart. Nazwy kart są używane do opisania dostępności świadczenia.

## 2. Zakres MVP

### Funkcje użytkownika

1. Wyszukiwanie po mieście, adresie, nazwie lub lokalizacji użytkownika.
2. Filtrowanie po kategorii, karcie, promieniu i godzinach otwarcia.
3. Widok listy i interaktywnej mapy.
4. Strona szczegółowa obiektu z adresem, kontaktem, godzinami, cenami i warunkami wejścia.
5. Status informacji:
   - accepted — potwierdzone,
   - conditional — akceptowane pod warunkami,
   - not_accepted — potwierdzone jako nieakceptowane,
   - unknown — brak wystarczających danych.
6. Zgłoszenie błędnej lub nieaktualnej informacji.

### Funkcje administracyjne

1. Logowanie administratora i moderatora.
2. Import danych z pliku lub źródła zewnętrznego.
3. Deduplikacja obiektów.
4. Weryfikacja zgłoszeń społecznościowych.
5. Edycja statusu karty, warunków i źródła.
6. Historia zmian i data następnej weryfikacji.

Poza MVP pozostają rezerwacje, płatności, aplikacja mobilna, płatne profile obiektów i integracje wymagające prywatnego dostępu do baz operatorów kart.

## 3. Rekomendowany stack

### Aplikacja i backend

- Next.js, App Router i TypeScript; wersję Next.js oraz wspieraną wersję Node.js ustalamy przy tworzeniu aplikacji i ustawiamy identycznie lokalnie, w CI i na Vercel.
- React Server Components dla stron SEO i zapytań wykonywanych na serwerze.
- Client Components tylko dla interakcji, np. mapy i filtrów.
- Tailwind CSS.
- Next.js Route Handlers w app/api/**/route.ts jako Backend-for-Frontend.
- Drizzle ORM + sterownik postgres.
- PostgreSQL z rozszerzeniem PostGIS: lokalnie Docker Compose, w chmurze Supabase.
- Zod do walidacji parametrów i importów.
- pg_trgm lub pełnotekstowe wyszukiwanie PostgreSQL dla nazw i adresów.
- Indeks GiST dla współrzędnych geograficznych.

Osobny NestJS nie jest potrzebny w MVP. Logikę domenową należy wydzielić do src/server, a Route Handlers powinny walidować żądanie, wywołać serwis i zwrócić odpowiedź. NestJS można dodać później, jeśli pojawi się kilku niezależnych klientów API albo potrzeba niezależnego skalowania backendu.

### Mapa i lokalizacja

- MapLibre GL JS jako biblioteka renderująca mapę w przeglądarce.
- MapLibre nie jest dostawcą kafelków. Propozycja dla MVP: MapTiler Cloud jako dostawca stylu i kafelków, podłączony do MapLibre przez URL style.json.
- URL stylu przekazujemy przez NEXT_PUBLIC_MAP_STYLE_URL. Klucz zawarty w tym URL jest publiczny; osobne klucze dla development, preview i production ograniczamy do właściwych domen w panelu dostawcy.
- Nie dopuszczamy całego *.vercel.app; dopuszczamy konkretne domeny zespołu lub ustaloną domenę staging. Po wyborze dostawcy sprawdzamy jego aktualny plan, limity i warunki użycia.
- Zachowujemy atrybucję dostawcy i danych OSM zgodnie z ich warunkami. Kafelków demonstracyjnych MapLibre używamy tylko do prototypu.
- Geokodowanie jest osobną usługą. W pierwszym MVP korzystamy ze współrzędnych w seedzie i wyszukiwania miejscowości w bazie; zewnętrzny geocoder dodajemy później, jeśli będzie potrzebny.

### Autoryzacja i pliki

- Supabase Auth dla administratorów i moderatorów; backend sprawdza sesję i rolę przy każdej operacji administracyjnej.
- Publiczne wyszukiwanie bez logowania.
- Supabase Storage dla zdjęć i plików importu, gdy pojawią się w MVP; prywatne buckety dla materiałów administracyjnych.
- Vercel Environment Variables dla sekretów serwera oraz .env.local do pracy lokalnej. Sekretów nie commitujemy i nie dodajemy im prefiksu NEXT_PUBLIC_.

### Testy

- Vitest dla logiki domenowej i zapytań.
- Playwright dla wyszukiwania, mapy, formularzy i panelu administratora.
- ESLint, sprawdzanie typów i testy w CI.

## 4. Architektura Vercel + Supabase

    Przeglądarka
      |-- strony i /api/* --> Vercel: Next.js + Route Handlers (Node.js)
      |                          |-- Drizzle --> Supabase PostgreSQL + PostGIS
      |                          |               przez transaction pooler
      |                          |-- Supabase Auth / Storage
      |-- MapLibre GL JS --> dostawca stylu i kafelków (propozycja: MapTiler)

    Lokalny Next.js --> Docker Compose: PostgreSQL + PostGIS
    Migracje / seed / importer --> wybrana baza lokalna lub Supabase

Decyzje wdrożeniowe:

1. Frontend i backend MVP wdrażamy jako jedną aplikację Next.js na Vercel. Osoba 2 pisze Route Handlers w tym samym repozytorium; osobny serwer backendowy nie jest potrzebny.
2. Docker służy do lokalnej bazy. Vercel nie uruchamia naszego docker-compose.yml i nie połączy się z localhost na komputerze osoby 3.
3. Dla funkcji Vercel używamy DATABASE_URL skopiowanego z Supabase Connect → Transaction pooler (zwykle port 6543). Dla postgres.js wyłączamy prepared statements: prepare: false; zaczynamy od max: 1, używamy SSL i klienta tworzonego raz na poziomie modułu.
4. Migracje korzystają z osobnego DATABASE_MIGRATION_URL: połączenia direct, a przy braku IPv6 z Session pooler (port 5432). Nie używamy transaction poolera do migracji ani nie uruchamiamy ich z każdego builda, preview czy żądania API.
5. Preview i production otrzymują osobne zmienne środowiskowe i osobne projekty Supabase. Na pierwszy test wystarcza projekt fitpass-staging; przed uruchomieniem production tworzymy fitpass-prod. Lokalna baza pozostaje niezależna. Zmiana zmiennych na Vercel wymaga nowego deploymentu.
6. Region wykonywania funkcji Vercel wybieramy możliwie blisko regionu bazy Supabase, w ramach dostępnych opcji konta.
7. W Supabase włączamy PostGIS w dedykowanym schemacie, np. gis, oraz pg_trgm. Lokalny obraz postgis/postgis może mieć PostGIS już w public — osoba 2 uwzględnia to w migracjach i zapytaniach. Nie zakładamy identycznego search_path i nie przenosimy rozszerzenia w istniejącej bazie bez sprawdzenia zależności.
8. Przeglądarka pobiera dane obiektów przez /api/*; Drizzle oraz hasło PostgreSQL pozostają na serwerze. RLS zabezpiecza tabele w schematach wystawionych przez Supabase Data API. Nie udzielamy publicznych praw do zgłoszeń, danych kontaktowych i administracji. RLS nie zastępuje kontroli ról w Route Handlers, szczególnie przy połączeniu rolą postgres, która może omijać RLS.
9. Pierwszy import uruchamiamy ręcznie jako skrypt lokalny wskazujący staging. Długich importów i procesów Playwright nie wykonujemy w żądaniu Vercel. Automatyzację dodajemy później jako osobny job CI; krótkie zadania mogą korzystać z Vercel Cron po sprawdzeniu limitów planu i zabezpieczeniu endpointu.
10. Vercel zapewnia deploymenty z Git, adres i HTTPS. Logi aplikacji sprawdzamy na Vercel, logi bazy i Auth w Supabase. Politykę backupu oraz limity usług sprawdza osoba 3 przed demo; w razie braku odpowiedniego backupu planujemy ręczny eksport.

Dokumentacja: [połączenia Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [deploy z Git na Vercel](https://vercel.com/docs/git), [zmienne Vercel](https://vercel.com/docs/environment-variables), [limity funkcji](https://vercel.com/docs/functions/limitations), [MapLibre](https://maplibre.org/maplibre-gl-js/docs/), [klucze MapTiler](https://docs.maptiler.com/guides/credentials/api-key/).

## 5. Struktura repozytorium

    src/
      app/                    # strony, layouty i Route Handlers
      components/             # komponenty UI
      server/
        places/               # wyszukiwanie i logika obiektów
        cards/                # statusy kart i weryfikacja
        reports/              # zgłoszenia użytkowników
        auth/                 # autoryzacja administratorów
      db/
        schema.ts             # schemat Drizzle
        client.ts             # połączenie z bazą
      lib/                    # adaptery i walidatory
    worker/                   # importy i weryfikatory
    packages/types/           # wspólne typy
    drizzle/                  # wersjonowane migracje SQL
    scripts/                  # seed i ręczny import
    .github/workflows/        # CI; później osobny job importu
    tests/

Worker powinien być niezależnym procesem, aby importy, przetwarzanie stron i Playwright nie blokowały żądań użytkowników. W MVP startuje ręcznie poza funkcjami Vercel.

## 6. Model danych

### places

id, name, slug, description, address, city, postal_code, location geography(Point, 4326), category, website, phone, opening_hours, created_at, updated_at.

### card_providers

id, name, slug.

Przykładowe rekordy: multisport, beactive, medicover-sport, pzu-sport.

### place_card_claims

place_id, provider_id, status, conditions, source_type, source_url, source_quote, confidence, verified_at, expires_at, reviewed_by, updated_at.

Status karty nie może być polem boolean. Każdy status musi mieć źródło, poziom pewności i datę weryfikacji.

### sources

id, source_type, url, provider_name, retrieved_at, content_hash, license_note.

### reports

id, place_id, provider_id, reported_status, comment, contact_email, moderation_status, created_at.

## 7. API MVP

    GET  /api/places?q=&city=&category=&cards=&lat=&lng=&radius=&bbox=
    GET  /api/places/:slug
    GET  /api/categories
    GET  /api/card-providers
    POST /api/reports

    GET  /api/admin/reports
    POST /api/admin/places/:id/verify
    POST /api/admin/imports
    GET  /api/health

Zasady:

- wyniki listy muszą mieć paginację lub limit,
- zapytania mapowe powinny ograniczać się do aktualnego bbox,
- endpointy publiczne muszą mieć rate limiting,
- dane wejściowe muszą być walidowane przez Zod,
- operacje administracyjne wymagają autoryzacji i kontroli roli,
- błędy API nie mogą ujawniać sekretów ani szczegółów połączenia z bazą.
- /api/health wykonuje krótkie SELECT 1: zwraca 200 i {"status":"ok"} albo ogólne 503; nie ujawnia hosta bazy ani błędu sterownika,
- /api/admin/imports obsługuje tylko krótki, ograniczony import lub zlecenie zadania poza żądaniem; długiego workera uruchamiamy osobno.

Strona wyszukiwania powinna używać parametrów URL, np. /warszawa?cards=multisport&category=basen. Dzięki temu wyniki są dynamiczne, linkowalne i przyjazne SEO. Mapa pobiera tylko obiekty z aktualnego bbox.

## 8. Strategia pozyskiwania i weryfikacji danych

### Źródła

1. OpenStreetMap — lokalizacja, nazwa, adres, strona internetowa i kategoria.
2. Otwarte dane miejskie — obiekty OSiR, baseny, hale i obiekty publiczne.
3. Publiczne strony obiektów — ceny, godziny i warunki wejścia.
4. Bezpośrednie zgłoszenia obiektów lub ich pracowników.
5. Zgłoszenia użytkowników i moderowana weryfikacja społecznościowa.

### Zasady jakości

- Nie pobierać masowo zamkniętych baz operatorów kart bez zgody lub licencji.
- Nie oznaczać obiektu jako potwierdzonego tylko na podstawie nazwy sieci.
- Heurystyki mogą wygenerować unknown lub needs_review, ale nie accepted.
- Każdy rekord powinien przechowywać źródło i czas pozyskania.
- Informacje o akceptacji karty powinny wygasać i wymagać ponownej weryfikacji.
- Użytkownik musi widzieć, czy informacja pochodzi od obiektu, źródła publicznego, automatycznej analizy strony czy społeczności.

Wszystkie twierdzenia dotyczące licencji, baz danych i znaków towarowych należy przed wdrożeniem komercyjnym zweryfikować z prawnikiem.

## 9. Plan działania

### Etap 0 — decyzje projektowe

Cel: zamknięcie zakresu i przygotowanie repozytorium.

- ustalić pierwsze miasto lub województwo dla MVP,
- ustalić kategorie obiektów,
- zaakceptować statusy kart i źródła,
- przygotować disclaimer dotyczący operatorów kart,
- zdefiniować minimalny rekord obiektu.

Rezultat: zaakceptowany zakres MVP i model danych.

### Etap 1 — fundament aplikacji

Cel: uruchomiona aplikacja Next.js z bazą.

- skonfigurować Next.js, TypeScript, ESLint i Tailwind,
- dodać Drizzle i migracje,
- uruchomić lokalny PostgreSQL/PostGIS przez Docker Compose,
- utworzyć schemat tabel,
- dodać seed testowych obiektów,
- przygotować podstawowy layout i routing.

Kryterium ukończenia: npm run dev uruchamia aplikację, migracje przechodzą, a seed tworzy dane testowe.

### Etap 2 — wyszukiwanie i mapa

Cel: użytkownik może znaleźć obiekt i zobaczyć go na mapie.

- zaimplementować zapytania po mieście, kategorii i karcie,
- dodać zapytania PostGIS po promieniu i bbox,
- przygotować GET /api/places,
- zbudować listę wyników,
- dodać mapę MapLibre,
- dodać stronę /places/[slug],
- obsłużyć loading, pusty wynik i błędy.

Kryterium ukończenia: wyszukiwanie działa dla danych testowych na desktopie i telefonie.

### Etap 3 — źródła i panel administracyjny

Cel: informacje można weryfikować i poprawiać.

- dodać Supabase Auth i role administratora/moderatora sprawdzane na serwerze,
- zabezpieczyć tabele wystawione w Data API przez RLS oraz dobrać uprawnienia roli serwerowej,
- zbudować panel zgłoszeń,
- dodać edycję statusu karty, warunków i źródła,
- zapisywać historię weryfikacji,
- dodać oznaczenia unknown, conditional i verified,
- dodać rate limiting endpointów publicznych.

Kryterium ukończenia: moderator może rozpatrzyć zgłoszenie i zmienić status z zachowaniem źródła oraz daty.

### Etap 4 — importer danych

Cel: baza może być zasilana powtarzalnym procesem.

- przygotować import z OSM lub pliku GeoJSON/CSV,
- dodać normalizację adresów i nazw,
- dodać deduplikację po lokalizacji i podobieństwie nazwy,
- zapisywać źródła oraz hash pobranego materiału,
- przygotować osobny worker,
- uruchomić go ręcznie poza Vercel, najpierw lokalnie, potem na bazie staging,
- dopiero potem dodać osobny job importu w CI lub krótkie zadanie Vercel Cron, jeśli mieści się w limitach.

Kryterium ukończenia: ten sam import można uruchomić wielokrotnie bez tworzenia duplikatów.

### Etap 5 — wdrożenie Vercel + Supabase

Cel: działające środowisko testowe i produkcyjne.

- utworzyć Supabase staging, włączyć PostGIS i pg_trgm oraz wybrać region,
- otrzymać od osoby 2 migracje, seed i instrukcję uruchomienia; odtworzyć nimi schemat w staging,
- połączyć repozytorium z Vercel i wdrożyć scaffold Next.js od osoby 1,
- ustawić DATABASE_URL dla runtime oraz NEXT_PUBLIC_MAP_STYLE_URL w odpowiednim środowisku Vercel,
- przechowywać DATABASE_MIGRATION_URL u operatora migracji lub w sekretach osobnego joba CI, poza runtime aplikacji,
- uruchomić migracje tylko raz na wybrane środowisko, potem seed; kolejne wdrożenia używają migracji kompatybilnych z aktualnie działającą aplikacją,
- sprawdzić /api/health, /api/places i mapę na adresie preview,
- skonfigurować Supabase Auth i dozwolone adresy przekierowań dla panelu moderatora, kiedy będzie gotowy,
- skonfigurować osobny projekt Supabase dla production, domenę, backup/eksport i limity usług,
- dodać CI: instalacja z lockfile, lint, typy, testy i build; automatyczny deploy obsługuje integracja Vercel z Git.

Kryterium ukończenia: aplikacja jest dostępna przez HTTPS, a deploy można powtórzyć z CI.

### Etap 6 — testy i demo

Cel: stabilne MVP gotowe do prezentacji.

- testy jednostkowe wyszukiwania i statusów kart,
- testy integracyjne zapytań PostGIS,
- test E2E: wyszukanie, filtr, mapa, strona szczegółowa, zgłoszenie,
- sprawdzenie responsywności,
- sprawdzenie źródeł i disclaimerów,
- przygotowanie przykładowego datasetu i scenariusza demo.

Kryterium ukończenia: główny scenariusz użytkownika przechodzi bez ręcznej ingerencji administratora.

## 10. Definition of Done dla MVP

MVP jest gotowe, gdy:

- można znaleźć obiekty po lokalizacji i typie karty,
- wyniki działają jako lista i mapa,
- każda informacja o karcie ma status, źródło i datę weryfikacji,
- użytkownik może zgłosić błąd,
- moderator może zaakceptować lub odrzucić zgłoszenie,
- dane są przechowywane w PostgreSQL/PostGIS,
- aplikacja działa na Vercel przez HTTPS i korzysta z bazy Supabase,
- MapLibre ładuje styl i kafelki wybranego dostawcy z poprawną atrybucją,
- import danych jest powtarzalny i nie tworzy duplikatów,
- podstawowe testy i monitoring przechodzą.

## 11. Podział pracy dla trzech osób

Praca powinna rozpocząć się równolegle. Nie dzielimy projektu na całkowicie niezależne silosy — frontend i backend muszą od początku uzgodnić format odpowiedzi API.

### Osoba 1 — frontend

Zaczyna od:

1. Utworzenia aplikacji Next.js.
2. Zbudowania ekranu wyszukiwania.
3. Dodania formularza: miasto, karta i kategoria.
4. Wyświetlenia przykładowych obiektów z mocka.
5. Przygotowania listy wyników i podstawowego widoku szczegółów.
6. Dodania MapLibre GL JS jako Client Component, CSS biblioteki i stylu z NEXT_PUBLIC_MAP_STYLE_URL.
7. Podłączenia punktów z API oraz pobierania obiektów po bbox po zmianie widoku mapy (z debounce).

<<<<<<< HEAD
Scaffold Next.js powinien trafić do repozytorium od razu, żeby osoba 2 mogła dodać Route Handlers, a osoba 3 wykonać pierwszy deploy. Uzgadniamy npm i commitujemy package-lock.json.
=======
Scaffold Next.js powinien trafić do repozytorium od razu, żeby osoba 2 mogła dodać Route Handlers, a osoba 3 wykonać pierwszy deploy. Używamy npm i commitujemy package-lock.json.
>>>>>>> origin/frontend

### Osoba 2 — backend i baza danych

Zaczyna teraz od:

1. Podłączenia do lokalnej bazy z docker-compose.yml przez DATABASE_URL z .env.example. Nie tworzy kolejnej bazy u osoby 3; na swoim komputerze uruchamia ten sam Compose.
2. Po otrzymaniu scaffolda: dodania Drizzle, postgres.js i konfiguracji migracji. Skrypty aplikacji mają jawnie ładować .env.local; sam Drizzle CLI nie musi robić tego tak jak Next.js.
3. Przygotowania wersjonowanych migracji: rozszerzenia, places, card_providers, place_card_claims, sources i reports; indeks GiST, unikalny slug oraz ograniczenia statusów. Minimalny pierwszy endpoint może zacząć od trzech pierwszych tabel.
4. Ustalenia schematu PostGIS lokalnie i w chmurze. Typ geography(Point, 4326) i funkcje ST_* muszą wskazywać rzeczywisty schemat rozszerzenia. Nie opierać tego na sesyjnym SET search_path przy transaction poolerze.
5. Dodania idempotentnego seeda 20 obiektów ze współrzędnymi, operatorami kart i źródłami; ponowne uruchomienie nie tworzy duplikatów.
<<<<<<< HEAD
6. Przygotowania skryptów npm run db:generate, npm run db:migrate i npm run db:seed. db:migrate używa DATABASE_MIGRATION_URL. Seed ma być uruchamiany jawnie na wybranym środowisku; nie automatycznie przy buildzie.
=======
6. Przygotowania skryptów npm: npm run db:generate, npm run db:migrate i npm run db:seed. db:migrate używa DATABASE_MIGRATION_URL. Seed ma być uruchamiany jawnie na wybranym środowisku; nie automatycznie przy buildzie.
>>>>>>> origin/frontend
7. Zbudowania GET /api/health i GET /api/places: walidacja Zod, limit/paginacja, q/city/category/cards, potem bbox i promień PostGIS. Route Handlers korzystające z postgres.js działają w runtime Node.js.
8. Uzgodnienia kontraktu z osobą 1: id, slug, name, address, city, category, lat, lng i lista statusów kart ze źródłem oraz datą. GeoJSON i MapLibre używają kolejności [lng, lat]; radius podajemy w metrach, bbox jako west,south,east,north. Ustalamy też format błędów i paginacji.
9. Skonfigurowania klienta bazy dla chmury: prepare: false, początkowo max: 1 i SSL; lokalny Docker może działać bez SSL. Klient tylko w kodzie serwerowym, tworzony na poziomie modułu. Nie zakładamy, że Drizzle automatycznie przeniesie JWT użytkownika do polityk RLS.
10. Przekazania osobie 3 migracji, seeda, komend i kontraktu zmiennych. Osoba 2 odpowiada za schemat, zgodność z Supabase i poprawki migracji; osoba 3 za uruchomienie na właściwej bazie i konfigurację usług.

Rezultat pierwszego etapu: ten sam kod backendu działa z Dockerem i Supabase po zmianie konfiguracji; /api/places zwraca 20 przykładowych obiektów.

### Osoba 3 — hosting i środowisko (Ty)

Lokalny PostgreSQL/PostGIS został już postawiony w Dockerze. Następne zadania:

1. Udostępnić zespołowi docker-compose.yml oraz .env.example i sprawdzić, że każdy może uruchomić własną bazę. Kontener osoby 3 nie jest wspólną bazą w chmurze.
2. Utworzyć projekt Supabase fitpass-staging w wybranym regionie europejskim. Zaprosić osobę 2 do projektu, a hasło bazy/connection string przekazać bezpiecznie poza repozytorium.
3. W Database → Extensions włączyć PostGIS w dedykowanym schemacie, np. gis, oraz pg_trgm; przekazać osobie 2 nazwy schematów i wersję PostgreSQL. Tabele aplikacji powstają przez migracje osoby 2, nie przez ręczne klikanie w panelu.
4. Z Supabase Connect skopiować dwa adresy: Transaction pooler dla DATABASE_URL aplikacji oraz direct / Session pooler dla DATABASE_MIGRATION_URL operatora migracji. Wstawić prawdziwe hasło z kodowaniem znaków specjalnych w URL; nie zgadywać hosta poolera.
5. Po otrzymaniu scaffolda Next.js połączyć repozytorium GitHub z Vercel. Ustawić preset Next.js, właściwy Root Directory oraz wersję Node.js uzgodnioną z zespołem. Sprawdzić wybraną gałąź produkcyjną.
6. Przygotować konto u dostawcy kafelków; propozycja: MapTiler. Skopiować URL stylu dla MapLibre, utworzyć klucz testowy i ograniczyć go do localhost oraz konkretnych adresów preview/staging. Przekazać osobie 1 NEXT_PUBLIC_MAP_STYLE_URL. Dla production przygotować osobny klucz.
7. W Vercel ustawić Preview: DATABASE_URL do Supabase staging oraz NEXT_PUBLIC_MAP_STYLE_URL. Klucze Supabase Auth dodamy przy integracji logowania: publiczny URL/publishable key mogą trafić do klienta, secret/service-role key i hasło bazy wyłącznie na serwer.
8. Po otrzymaniu migracji od osoby 2 uruchomić je raz na staging przez DATABASE_MIGRATION_URL, potem uruchomić seed. Zachować lokalną konfigurację Dockera — do chmury użyć osobnego pliku ignorowanego przez Git lub sekretów joba. Nie nadpisywać w ciemno .env.local poleceniem pobierającym zmienne z Vercel.
9. Wykonać deployment preview i sprawdzić HTTPS, /api/health, /api/places oraz mapę. W razie błędu połączenia sprawdzić host, użytkownika poolera, hasło, SSL i prepare: false razem z osobą 2.
10. Po dodaniu skryptów aplikacji przygotować GitHub Actions: instalacja z lockfile, lint, typy, testy i build; testy integracyjne korzystają z osobnej bazy CI. Migracje chmurowe nie uruchamiają się automatycznie z niezweryfikowanych PR-ów. Deploy zostaje w integracji Git → Vercel.
11. Przed production utworzyć osobny Supabase fitpass-prod, ustawić zmienne Production, uruchomić migracje i zatwierdzony dataset, sprawdzić backup/eksport, limity oraz domeny i redirect URLs Supabase Auth.

Rezultat pierwszego etapu: działający adres Vercel preview, który pobiera dane z Supabase staging. Dockerfile, ECS, RDS i konfiguracja AWS nie są potrzebne w tym wariancie.

## 12. Pierwszy sprint

### Pierwszy dzień

- frontend ma ekran wyszukiwania z danymi mockowanymi,
- backend ma lokalną bazę, migracje, seed i pierwszy endpoint,
- osoba 3 ma Docker Compose, projekt Supabase staging i przygotowane zmienne; po pojawieniu się scaffolda wykonuje pierwszy deploy Vercel,
- frontend i backend uzgadniają wspólny format obiektu zwracanego przez API.

### Kolejne zadania sprintu

1. Podłączyć frontend do prawdziwego GET /api/places.
2. Dodać filtrowanie po karcie i kategorii.
3. Dodać stronę szczegółową obiektu.
4. Dodać testy podstawowego wyszukiwania.
5. Uruchomić aplikację na Vercel preview z bazą Supabase staging i sprawdzić /api/health.
6. MapLibre można przygotować wcześniej na mockach; po działaniu wyszukiwania podłączyć punkty z API i filtrowanie po bbox.

Po pierwszym dniu zespół powinien mieć frontend z formularzem, backend zwracający obiekty, lokalną bazę z danymi oraz pierwszy adres preview. Docelowo npm run dev uruchamia aplikację po jednorazowej konfiguracji i starcie bazy przez docker compose up -d.

## 13. Kolejność przekazania pracy na teraz

Stan repozytorium w chwili aktualizacji planu: dokumentacja i Docker Compose; brak jeszcze package.json, aplikacji Next.js, migracji i seeda. Nazwy skryptów npm w tym planie są kontraktem do wdrożenia przez zespół, a nie już dostępnymi poleceniami.

1. Osoba 3 przygotowuje Supabase staging i połączenia; osoba 1 równolegle publikuje scaffold Next.js w repozytorium.
2. Osoba 2 przygotowuje i sprawdza migracje + seed na Dockerze, uzgadnia ze stroną frontendową kontrakt /api/places.
3. Osoba 3 uruchamia te migracje + seed na Supabase staging; osoba 2 poprawia ewentualne różnice rozszerzeń/schematów.
4. Osoba 3 ustawia zmienne Preview na Vercel i wdraża aplikację; osoba 2 dostarcza działające /api/health oraz /api/places.
5. Wspólnie sprawdzamy, że URL Vercel zwraca dane z Supabase; osoba 1 podłącza listę i mapę.

Pierwszy wspólny punkt kontrolny: /api/health → 200 oraz /api/places → obiekty z seeda na adresie Vercel. Panel administracyjny, Storage i harmonogram importów mogą powstać po tym kroku.

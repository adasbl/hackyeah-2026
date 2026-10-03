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

- Next.js 15.x, App Router, TypeScript i Node.js 20.9+.
- React Server Components dla stron SEO i zapytań wykonywanych na serwerze.
- Client Components tylko dla interakcji, np. mapy i filtrów.
- Tailwind CSS.
- Next.js Route Handlers w app/api/**/route.ts jako Backend-for-Frontend.
- Drizzle ORM + sterownik postgres.
- PostgreSQL z rozszerzeniem PostGIS.
- Zod do walidacji parametrów i importów.
- pg_trgm lub pełnotekstowe wyszukiwanie PostgreSQL dla nazw i adresów.
- Indeks GiST dla współrzędnych geograficznych.

Osobny NestJS nie jest potrzebny w MVP. Logikę domenową należy wydzielić do src/server, a Route Handlers powinny walidować żądanie, wywołać serwis i zwrócić odpowiedź. NestJS można dodać później, jeśli pojawi się kilku niezależnych klientów API albo potrzeba niezależnego skalowania backendu.

### Mapa i lokalizacja

- MapLibre GL JS.
- Amazon Location Service do geokodowania i funkcji lokalizacyjnych albo inne źródło kafelków zgodne z licencją.
- Przy użyciu OpenStreetMap należy zachować prawidłową atrybucję i stosować się do ODbL.

### Autoryzacja i pliki

- Amazon Cognito User Pool dla administratorów i moderatorów.
- Publiczne wyszukiwanie bez logowania.
- Amazon S3 dla zdjęć, plików importu i zrzutów źródeł.
- AWS Secrets Manager dla haseł do bazy i kluczy API.

### Testy

- Vitest dla logiki domenowej i zapytań.
- Playwright dla wyszukiwania, mapy, formularzy i panelu administratora.
- ESLint, sprawdzanie typów i testy w CI.

## 4. Architektura AWS

    Route 53 + ACM
            |
    Application Load Balancer
            |
    ECS Fargate — kontener Next.js
            |
    RDS PostgreSQL + PostGIS — prywatne subnety

    EventBridge Scheduler
            |
    ECS Fargate Task — worker importujący dane

    S3 — zdjęcia i pliki importów
    Cognito — administratorzy i moderatorzy
    CloudWatch — logi i alarmy
    Secrets Manager — sekrety
    AWS CDK — infrastruktura jako kod

Decyzje wdrożeniowe:

1. Next.js działa jako kontener na ECS Fargate.
2. RDS PostgreSQL działa w prywatnej sieci VPC.
3. Application Load Balancer udostępnia aplikację przez HTTPS.
4. Worker importujący dane działa jako osobne zadanie ECS.
5. EventBridge Scheduler uruchamia import cyklicznie, np. raz dziennie.
6. Obrazy kontenerów są przechowywane w Amazon ECR.
7. Logi trafiają do CloudWatch Logs.
8. Infrastrukturę opisuje AWS CDK w TypeScript.
9. Region docelowy: eu-central-1, o ile nie pojawi się powód do użycia innego regionu.

AWS Amplify Hosting może posłużyć do szybkiego prototypu. ECS Fargate jest lepszym wariantem docelowym, gdy Next.js ma korzystać z prywatnego RDS i osobnego workera.

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
    infra/                    # AWS CDK
    tests/

Worker powinien być niezależnym procesem, aby importy, przetwarzanie stron i Playwright nie blokowały żądań użytkowników.

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

Zasady:

- wyniki listy muszą mieć paginację lub limit,
- zapytania mapowe powinny ograniczać się do aktualnego bbox,
- endpointy publiczne muszą mieć rate limiting,
- dane wejściowe muszą być walidowane przez Zod,
- operacje administracyjne wymagają autoryzacji i kontroli roli,
- błędy API nie mogą ujawniać sekretów ani szczegółów połączenia z bazą.

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

Kryterium ukończenia: pnpm dev uruchamia aplikację, migracje przechodzą, a seed tworzy dane testowe.

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

- dodać Cognito i role administratora/moderatora,
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
- uruchomić go ręcznie jako ECS Task,
- dopiero potem dodać harmonogram EventBridge.

Kryterium ukończenia: ten sam import można uruchomić wielokrotnie bez tworzenia duplikatów.

### Etap 5 — wdrożenie AWS

Cel: działające środowisko testowe i produkcyjne.

- przygotować Dockerfile dla Next.js,
- utworzyć ECR, ECS, ALB, VPC i RDS przez AWS CDK,
- skonfigurować Secrets Manager,
- dodać CloudWatch Logs i podstawowe alarmy,
- skonfigurować domenę i HTTPS,
- wdrożyć worker jako osobne zadanie,
- ustawić backup bazy i AWS Budget.

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
- aplikacja działa na AWS przez HTTPS,
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

### Osoba 2 — backend i baza danych

Zaczyna od:

1. Uruchomienia PostgreSQL/PostGIS.
2. Utworzenia tabel places, card_providers i place_card_claims.
3. Dodania 20 przykładowych obiektów.
4. Zbudowania endpointu GET /api/places.
5. Ustalenia formatu odpowiedzi API wspólnie z frontendem.

### Osoba 3 — AWS i środowisko

Zaczyna od:

1. Przygotowania Docker Compose do uruchamiania aplikacji i bazy.
2. Dodania Dockerfile dla Next.js.
3. Skonfigurowania GitHub Actions: instalacja, lint, testy i build.
4. Przygotowania pierwszego deploymentu testowego na AWS.

Osoba odpowiedzialna za AWS nie powinna czekać do końca projektu. Jej pierwszym zadaniem jest zapewnienie, że każdy członek zespołu może uruchomić projekt lokalnie jedną komendą.

## 12. Pierwszy sprint

### Pierwszy dzień

- frontend ma ekran wyszukiwania z danymi mockowanymi,
- backend ma lokalną bazę, migracje, seed i pierwszy endpoint,
- osoba od AWS przygotowuje Docker Compose, Dockerfile i podstawowe CI,
- frontend i backend uzgadniają wspólny format obiektu zwracanego przez API.

### Kolejne zadania sprintu

1. Podłączyć frontend do prawdziwego GET /api/places.
2. Dodać filtrowanie po karcie i kategorii.
3. Dodać stronę szczegółową obiektu.
4. Dodać testy podstawowego wyszukiwania.
5. Uruchomić aplikację w środowisku testowym AWS.
6. Dopiero po działaniu wyszukiwania rozpocząć integrację mapy.

Po pierwszym dniu zespół powinien mieć frontend z formularzem, backend zwracający obiekty, lokalną bazę z danymi oraz projekt uruchamiany jedną komendą.

# Fit Pass Finder

> Original project assumptions for the HackYeah 2026 MVP. This document describes
> the planned scope; see the [project overview](../README.md) and
> [technical documentation](README.md) for the implemented features and setup.

## Polski — założenia projektowe

### Cel

Projekt zakłada stworzenie wyszukiwarki obiektów sportowych w Polsce, która pomoże znaleźć miejsce do ćwiczeń i sprawdzić akceptację kart MultiSport, BeActive, Medicover Sport oraz PZU Sport. Zakres obejmuje siłownie, baseny, fitness, wspinaczkę, tenis, squash i taniec.

### Funkcje

- Wyszukiwanie po nazwie, adresie i mieście; filtrowanie po kategorii, karcie i dostępności „otwarte teraz”.
- Geolokalizacja, wyszukiwanie w określonym promieniu, sortowanie po odległości i paginacja.
- Widok listy i interaktywnej mapy z klastrami oraz filtrami.
- Profil obiektu z adresem, kontaktem, godzinami, udogodnieniami, cenami i warunkami użycia kart.
- Ulubione zapisane w przeglądarce i porównanie kart według liczby akceptujących je obiektów.
- Zgłaszanie błędów oraz panel moderatora z logowaniem, edycją danych i historią zmian.

### Dane i wiarygodność

Zakres katalogu: **ponad 11 000 obiektów z całej Polski**.

W obecnej implementacji wyszukiwanie odczytuje dane zapisane w bazie. Import OSM i skanowanie stron obiektów są uruchamiane osobno, poza żądaniami użytkowników.

Dane lokalizacyjne mają pochodzić z OpenStreetMap, a informacje o kartach i warunkach wejścia — ze stron obiektów, źródeł operatorów i zgłoszeń użytkowników. Import powinien uwzględniać normalizację, wykrywanie duplikatów i kontrolę jakości przed publikacją.

Każda informacja o karcie powinna zawierać status (`accepted`, `conditional`, `not_accepted`, `unknown`), warunki, źródło, poziom pewności i datę weryfikacji. Brak potwierdzenia oznacza `unknown`. Projekt przewiduje okresową aktualizację danych i wyraźne oddzielenie danych demonstracyjnych od rzeczywistych.

### Architektura i zakres MVP

Planowany stack: **Next.js, React, TypeScript i Tailwind CSS**, **Drizzle ORM**, **PostgreSQL z PostGIS** oraz **MapLibre**. Aplikacja i backend mają działać na Vercel, a baza na Supabase. Publiczne wyszukiwanie ma być dostępne bez logowania; operacje administracyjne wymagają autoryzacji.

MVP skupia się na wyszukiwaniu, mapie i wiarygodnych informacjach o kartach. Rezerwacje, płatności i aplikacja mobilna pozostają poza jego zakresem.

---

## English — project assumptions

### Goal

The project aims to create a search engine for sports venues in Poland that helps users find a place to exercise and check whether it accepts MultiSport, BeActive, Medicover Sport and PZU Sport cards. Its scope includes gyms, swimming pools, fitness, climbing, tennis, squash and dance.

### Features

- Search by name, address and city; filter by category, card and “open now” availability.
- Geolocation, radius search, sorting by distance and pagination.
- List view and an interactive map with clusters and filters.
- Venue profiles with addresses, contact details, opening hours, amenities, prices and card usage conditions.
- Browser-stored favourites and card comparisons based on the number of accepting venues.
- Error reporting and a moderator panel with authentication, data editing and change history.

### Data and reliability

Catalogue scope: **more than 11,000 venues across Poland**.

In the current implementation, searches read data stored in the database. OSM imports and venue website scans run separately, outside user requests.

Location data should come from OpenStreetMap, while card acceptance and admission conditions should come from venue websites, card operator sources and user reports. Imports should include normalisation, duplicate detection and quality checks before publication.

Each card claim should include a status (`accepted`, `conditional`, `not_accepted`, `unknown`), conditions, a source, a confidence level and a verification date. Unconfirmed information is marked as `unknown`. The project calls for periodic data updates and a clear distinction between demonstration data and real venue data.

### Architecture and MVP scope

The planned stack is **Next.js, React, TypeScript and Tailwind CSS**, **Drizzle ORM**, **PostgreSQL with PostGIS** and **MapLibre**. The application and backend should run on Vercel, and the database on Supabase. Public search should be available without signing in; administrative operations require authorisation.

The MVP focuses on search, maps and reliable card acceptance information. Bookings, payments and a mobile app remain outside its scope.

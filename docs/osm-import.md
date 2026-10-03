# Import siłowni i obiektów fitness z OSM — Warszawa

Importer pobiera obiekty z granic administracyjnych Warszawy przez Overpass API.
Nie pobiera `leisure=fitness_station` i odrzuca jawnie bezpłatne obiekty
plenerowe. Nowe rekordy zapisuje jako szkice (`is_published=false`) i nie tworzy
informacji o akceptowanych kartach sportowych.

```powershell
npm run db:import:osm:warsaw -- --download-only
npm run db:import:osm:warsaw -- --from-cache --dry-run
npm run db:import:osm:warsaw -- --from-cache
npm run db:import:osm:warsaw -- --verify
```

Snapshot trafia do ignorowanego przez Git pliku
`.local/osm/warszawa-fitness.json`. Import korzysta z
`DATABASE_MIGRATION_URL` z `.env.local` i wykonuje zapis w jednej transakcji.

Dane: © OpenStreetMap contributors, ODbL:
https://www.openstreetmap.org/copyright

## Przygotowanie do publikacji

```powershell
npm run db:prepare:osm:warsaw
npm run db:prepare:osm:warsaw -- --apply
```

Pierwsze polecenie odczytuje 370 elementów ze snapshotu i aktualne rekordy
bazy. Zapisuje do `.local/osm/review/` raport `report.md`, pełne dane
`report.json` i listę `publication-candidates.json` z decyzjami `pending`.
Nie łączy się ponownie z Overpass. Dane muszą już być zaimportowane.

`--apply` zapisuje wyłącznie korekty formatowania oraz jednoznacznie
przetworzone godziny w nieopublikowanych szkicach. Zachowuje istniejące
opracowane godziny. Przed zmianą zapisuje `before-*.json` z kopią rekordów.
Zapis jest transakcyjny i chroniony przed równoczesną zmianą rekordu.
Nie zmienia `is_published`, kategorii, współrzędnych ani statusów kart.
Ponowne uruchomienie nie powinno generować dalszych korekt.

Parser godzin obsługuje `24/7`, rozłączne reguły tygodniowe, przerwy oraz
końcowy wyjątek świąteczny `PH`. Nocne przedziały, nakładające się reguły,
daty i nierozpoznane warunki zostają w `opening_hours_raw` do przeglądu.
Nie pokazujemy części harmonogramu, jeśli reszta nie została zrozumiana.
To ograniczony podzbiór [składni OSM](https://wiki.openstreetmap.org/wiki/Key:opening_hours),
a nie pełny interpreter.

### Jak przejrzeć wynik

- `candidate_for_review`: ma nazwę i ulicę z numerem oraz brak wykrytych
  blokad. To kandydat, nie potwierdzenie istnienia czy kompletności danych.
- `needs_correction`: brak nazwy/adresu, możliwy duplikat, ograniczony
  dostęp, nieczynna/planowana placówka, sprzeczny tag plenerowy lub
  rozbieżność ze stroną obiektu.
- Ostrzeżenia obejmują niepewną kategorię, brak kontaktu/godzin, mieszaną
  ofertę, studia jogi/pilatesu i przybliżony punkt way/relation.
- Pary w promieniu 50 m ze zgodną nazwą, stroną, telefonem lub adresem są
  wyłącznie kandydatami do deduplikacji. W jednym budynku mogą działać
  niezależne firmy; samo oznaczenie pary nie powoduje scalania. Dla zgodnego
  pełnego adresu oraz nazwy lub telefonu próg wynosi 250 m, aby wykryć
  także różne części dużego obiektu.

Ustalenia z próbki oficjalnych stron zapisano w `docs/osm-venue-review.json`,
z datą, źródłem i propozycjami poprawek. Rozbieżności blokują automatyczne
przejście do grupy kandydatów. Propozycje z tych stron nie są stosowane przez
`--apply`; trzeba najpierw wyjaśnić lokalizację, godziny i warunki wejścia.
Po rozstrzygnięciu przypadku trzeba zaktualizować również wpis przeglądu.

W trybie publikacji po przeglądzie źródeł sprawdź kandydatów na stronach placówek, zatwierdź
kategorie i lokalizacje, a dopiero potem ustaw `is_published` dla wybranych
rekordów. Nie zgaduj adresów. Status kart może pozostać `unknown` — oznacza
to jednak brak wyniku po filtrze konkretnej karty. Nie publikuj rekordów
demo jako rzeczywistych placówek. Raporty są regenerowane; decyzje redakcyjne
przechowuj w osobnym pliku, aby kolejne uruchomienie ich nie nadpisało.

## Publikacja po przeglądzie źródeł

Decyzje wraz z potwierdzonymi polami, oficjalnymi adresami stron i datą
sprawdzenia są w `docs/osm-publication-decisions.json`. To jawna lista
zatwierdzonych oddziałów, nie automatyczna zgoda dla wszystkich kandydatów.
Przegląd techniczny objął 370 rekordów; nie wszystkie potwierdzono na stronach.
4 października 2026 opublikowano w bazie 30 potwierdzonych obiektów;
340 pozostało wówczas szkicami. Nie usunięto żadnego rekordu ani danych OSM.

```powershell
npm run db:publish:osm:warsaw
npm run db:publish:osm:warsaw -- --apply
npm run db:publish:osm:warsaw -- --verify
```

Bez argumentów powstaje tylko plan. `--apply` zapisuje korekty i
`is_published=true` wyłącznie dla zatwierdzonych szkiców. Zachowuje surowe
tagi, godziny OSM, współrzędne, ceny i istniejące informacje o kartach.
Niepotwierdzony harmonogram i telefon nie są kopiowane do publikacji.
Harmonogram warunkowy (np. dostęp z kluczem) zawiera warunek w aplikacji.
Brak godzin nie jest blokadą, jeśli obiekt i adres zostały potwierdzone.
Punkty OSM nie są pomiarem wejścia, a regularne godziny nie potwierdzają
wyjątków świątecznych. Nie przesuwamy punktu na podstawie numeru ulicy.

Skrypt sprawdza hash snapshotu, tożsamość elementów OSM, zakres importu,
unikalność decyzji, aktualność przeglądu (14 dni), adres, kategorię,
dostęp i duplikaty. Konflikt istniejącego adresu blokuje całą transakcję.
Przed zapisem tworzy `publication-before-*.json` z pełnymi rekordami i
decyzjami, po COMMIT zapisuje `publication-result-*.json` oraz aktualny
`publication-result.json` i `publication-result.md`. Ponowienie nie
nadpisuje opublikowanych rekordów. `--verify` odczytuje bazę i porównuje
wszystkie zatwierdzone pola z decyzjami. Raport opisuje także powód
wstrzymania każdego nieopublikowanego wpisu.

Publikacja oznacza udostępnienie danych przez obecny serwis aplikacji;
nie jest wdrożeniem kodu na hosting ani commitem/pushem. Bez potwierdzonych
`place_card_claims` statusy kart to `unknown`, a filtr konkretnej karty
nie zwróci tych obiektów.

Odczytowy test integracyjny można uruchomić z
`OSM_PUBLICATION_INTEGRATION_TEST=1` przez `npm run db:test`.
Nie uruchamiaj seeda na potrzeby sprawdzenia publikacji.

## Publikacja wszystkich technicznie poprawnych danych

4 października 2026 opublikowano dodatkowe 340 rekordów w trybie technicznym:
łącznie publiczne są wszystkie 370 obiektów OSM ze snapshotu, bez pozostałych
szkiców tego importu. Test odczytowy serwisu potwierdził widoczność całego zbioru,
paginację, PostGIS i szczegóły z niepełnym adresem lub nazwą zastępczą.

Na życzenie użytkownika można pominąć wymagania przeglądu źródeł:

```powershell
npm run db:publish:osm:warsaw -- --technical
npm run db:publish:osm:warsaw -- --technical --apply
npm run db:publish:osm:warsaw -- --technical --verify
```

Tryb `--technical` publikuje rekordy ze sprawdzonego snapshotu, które mają
poprawny format dla mappera, listy, mapy i strony szczegółów. Brak pełnego
adresu, kontaktu lub godzin, możliwe duplikaty i wcześniejsze wstrzymania
redakcyjne nie blokują publikacji. Błędne typy, współrzędne lub struktury
JSON zostają szkicami; niebezpieczne linki są usuwane. Nadal pomijane są
`fitness_station` i jawnie bezpłatne obiekty plenerowe.

Nie nadpisuje już opublikowanych poprawek, nie zmienia punktów OSM ani nie
nadaje dat weryfikacji źródłowej. Nie dodaje cen i statusów kart. Kopia przed
zapisem, transakcja, ochrona przed równoległą zmianą i raport działają jak
w trybie źródłowym. Raport zawiera `mode: technical`; historyczny manifest
30 obiektów pozostaje osobnym dowodem faktycznie wykonanego przeglądu.
Raport przygotowania rozróżnia `published_unverified` i `published_verified`.

Po publikacji technicznej test całości uruchamia się z
`OSM_TECHNICAL_PUBLICATION_INTEGRATION_TEST=1` przez `npm run db:test`;
sprawdza także paginację oraz szczegóły z brakującą nazwą i adresem.

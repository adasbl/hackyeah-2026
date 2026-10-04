# Import obiektów sportowych z PBF — Polska

Importer czyta lokalny snapshot `.osm.pbf` (np. z [Geofabrik](https://download.geofabrik.de/europe/poland.html)),
bez Overpass i przeglądarki. Nie wymaga instalacji Osmium ani Pythona.
Obsługuje nodes, ways oraz relacje, także zagnieżdżone.

Sprawdzenie na `poland-261002.osm.pbf` (SHA-256
`0fb658f00a11820a404d8569fa9579fbf078aeae8f3b8886c2b95d6dd91a2b08`)
przejrzało 276 611 497 elementów i przygotowało 11 210 rekordów:
400 siłowni, 2 952 baseny, 1 796 fitness, 181 wspinaczkowych,
5 674 tenisowe, 93 squash/padel i 114 tanecznych.
9 853 rekordy nie mają miejscowości w tagach, 9 730 nie ma pełnego adresu.
To wynik filtrowania OSM, nie liczba zweryfikowanych komercyjnych placówek.
Poszczególne korty i baseny jednego kompleksu mogą być osobnymi elementami OSM.
Przygotowanie pełnej paczki nie zapisało danych do bazy.

## Uruchomienie

Po pobraniu pliku uruchom z katalogu projektu:

```powershell
npm install
npm run db:import:osm:poland -- --file .local/osm/poland-261002.osm.pbf --prepare-only
```

Możesz podać dowolną nazwę i ścieżkę pliku; ścieżki ze spacjami wymagają cudzysłowów.
Bez `--file` domyślna lokalizacja to `.local/osm/poland-latest.osm.pbf`.
`--prepare-only` działa bez połączenia z bazą. Powstaje cache `.local/osm/polska-sport.json`
i jego datowana kopia. Zawiera gotowe rekordy, SHA-256 pliku źródłowego, hash rekordów,
liczby dla kategorii, powody pominięcia, braki adresów i miejscowości oraz obiekty wielokategorii.

Przed pierwszym zapisem dodaj wartości `tenis` i `taniec` do enuma `public.place_category`.
Migracja jest w `drizzle/0001_sports_categories.sql`.
Dla bazy zarządzanej migracjami Drizzle użyj `npm run db:migrate`.
Jeżeli istniejący schemat utworzono ręcznie i nie ma historii migracji Drizzle,
wykonaj samą nową migrację w SQL Editor Supabase:

```sql
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'tenis';
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'taniec';
```

Nie trzeba ponownie tworzyć istniejącego schematu ani uruchamiać seeda.
Importer zgłosi `OSM_POLAND_CATEGORY_MIGRATION_REQUIRED`, jeżeli baza nie zna kategorii z cache.

```powershell
# Próba zapisu, cała transakcja jest wycofywana:
npm run db:import:osm:poland -- --from-cache --dry-run

# Zapis nowych obiektów jako szkice:
npm run db:import:osm:poland -- --from-cache --apply

# Alternatywnie: zapis nowych obiektów od razu jako publiczne:
npm run db:import:osm:poland -- --from-cache --apply --publish
```

Zapis korzysta z `DATABASE_MIGRATION_URL` w `.env.local`, odbywa się w jednej transakcji
i partiami po 100 rekordów. Każda para `(osm_type, osm_id)` pojawia się najwyżej raz.
Istniejące obiekty, ich ręczne poprawki i status publikacji są zachowywane; ponowienie
nie aktualizuje ich ani nie publikuje wcześniej zapisanych szkiców.
`--publish` dotyczy wyłącznie nowych rekordów. Po COMMIT powstaje datowany raport
`polska-import-result-*.json` ze slugami dodanych obiektów.

## Kategorie i tagi

| Kategoria aplikacji | Główne tagi OSM |
| --- | --- |
| `silownia` | `amenity=gym`, sport `bodybuilding`, `weightlifting`, `powerlifting`, `gym`, `crossfit`; nazwa siłowni w `fitness_centre` |
| `basen` | `leisure=swimming_pool`, `leisure=water_park`, `amenity=swimming_pool`, sport `swimming` w obiekcie sportowym |
| `fitness` | `leisure=fitness_centre`, sport `fitness`, `aerobics`, `pilates` w obiekcie sportowym |
| `wspinaczka` | sport `climbing` / `bouldering` w obiekcie sportowym lub `climbing=wall` |
| `tenis` | sport `tennis` w korcie / obiekcie sportowym |
| `squash` | sport `squash` lub `padel` w korcie / obiekcie sportowym — wspólna kategoria „Squash / padel” |
| `taniec` | sport `dance` / `dancing`, `amenity=dancing_school`, `club=dance`, `amenity=school` + `school=dance/dancing` |

Obiekt sportowy to odpowiednie `leisure` (`sports_centre`, `sports_hall`, `pitch`,
`fitness_centre`, `swimming_pool`, `water_park`), `indoor=yes` albo `club=sport`.
Tag `sport` może zawierać kilka wartości rozdzielonych średnikiem.
W obecnym schemacie obiekt ma jedną kategorię główną. Gdy pasuje do kilku, priorytet to
siłownia, basen, fitness, wspinaczka, tenis, squash/padel, taniec; samodzielny basen
lub park wodny ma zawsze pierwszeństwo kategorii basen. Pozostałe kategorie pozostają
w surowych tagach i raporcie `multipleCategories`. Obiekt nie jest powielany w bazie.
Dotychczasowa kategoria joga pozostaje w aplikacji, ale nie jest osobnym celem tego importu.

Można ograniczyć import:

```powershell
npm run db:import:osm:poland -- --file .local/osm/poland-261002.osm.pbf --categories basen,tenis,squash --prepare-only
```

`--from-cache` używa zakresu zapisanej paczki; nie łączy się z `--file` ani `--categories`.
Nowe przygotowanie tworzy datowaną kopię i zastępuje bieżący cache.

## Jakość i geometria

- Pomijane są stacje plenerowe, jawnie bezpłatny plener (`fee=no` oraz `indoor=no`,
  `outdoor=yes` lub `location=outdoor`), dostęp `private/no`, nieczynne/planowane obiekty,
  sklepy, naturalne miejsca wspinaczkowe i inne obiekty niebędące obiektami sportowymi.
- Miejscowość pochodzi z `addr:city`, `addr:town` lub `addr:village`; brak pozostaje `null`.
  Po imporcie można uzupełnić brakujące miejscowości osobnym poleceniem opisanym poniżej.
- Nodes zachowują współrzędne. Ways i relacje dostają środek prostokąta ograniczającego
  ich pełną geometrię: punkt przybliżony, nie pomiar wejścia ani centroid powierzchni.
  Brak członka/węzła, cykl relacji lub głębokość ponad 16 powoduje pominięcie obiektu.
- PBF jest czytany strumieniowo w kilku przejściach. W pamięci zostają kandydaci i ich
  potrzebne węzły, a nie wszystkie węzły Polski. Zmiana pliku pomiędzy przejściami
  jest wykrywana przez porównanie hashy.
- Parser nie odczytuje metadanych autorów ani wersji/timestampów elementów z PBF,
  aby obsłużyć publiczne pliki Geofabrik z niepełnymi metadanymi. Pochodzenie paczki
  identyfikuje hash całego pliku i data przygotowania.
- Normalizowane są adresy, kontakt i obsługiwany podzbiór godzin. Zachowane są oryginalne tagi.
  Nie są dopisywane ceny, daty potwierdzenia ani informacje o akceptacji kart sportowych.

Dokumentacja źródłowa: [parser PBF](https://github.com/borisgontar/osm-pbf-parser-node),
[fitness](https://wiki.openstreetmap.org/wiki/Gym_/_Fitness_centre),
[wspinaczka](https://wiki.openstreetmap.org/wiki/Tag:sport%3Dclimbing),
[padel](https://wiki.openstreetmap.org/wiki/Tag:sport%3Dpadel).
W aplikacji należy zachować atrybucję © OpenStreetMap contributors i odniesienie do ODbL.

## Uzupełnianie miejscowości na podstawie współrzędnych

`db:fill:osm:cities` dopasowuje istniejące, opublikowane obiekty OSM do pełnych granic
miejscowości z lokalnego pliku Polski. Nie korzysta z zewnętrznego API, Nominatim ani Overpass.
Nie wymaga migracji bazy ani ponownego importu obiektów.

```powershell
# Przygotowanie granic offline, bez połączenia z bazą:
npm run db:fill:osm:cities -- --file .local/osm/poland-261002.osm.pbf --prepare-only

# Plan dopasowania do aktualnych współrzędnych z bazy, bez UPDATE:
npm run db:fill:osm:cities -- --from-cache --dry-run

# Uzupełnienie miejscowości i slugów:
npm run db:fill:osm:cities -- --from-cache --apply
```

Można także przygotować granice i zapisać zmiany jednym poleceniem z `--file ... --apply`.
Domyślnie bez `--apply` skrypt pokazuje wyłącznie plan. `--prepare-only` nie wymaga zmiennych
środowiskowych; pozostałe tryby czytają `DATABASE_MIGRATION_URL` z `.env.local`.

Zasady dopasowania:

- W Polsce `boundary=administrative` + `admin_level=8` oznacza miejscowość (miasto lub wieś).
  Gminy (7), dzielnice (9), części miejscowości (10) i same punkty `place=*` nie służą do przypisania miasta.
  Źródło: [poziomy administracyjne OSM w Polsce](https://wiki.openstreetmap.org/wiki/Pl%3AKey%3Aadmin_level).
- Testowany jest punkt w poligonie, nie sam prostokąt ograniczający ani odległość od centrum.
  Obsługiwane są wieloczęściowe obszary, wyspy, dziury, odwrócone odcinki i zagnieżdżone relacje.
  Niepełne i niezamknięte granice oraz cykle relacji są pomijane.
- Obiekty poza dostępnymi granicami, na krawędzi lub w nakładających się granicach różnych
  miejscowości pozostają bez przypisania. Nie ma heurystyki „najbliższe miasto”.
- Istniejące nazwy miejscowości nie są nadpisywane. Brakujący `city_slug` jest wyliczany z istniejącej
  nazwy. Jeżeli jest slug bez nazwy, rekord jest pomijany, aby zachować możliwą ręczną poprawkę.
- Aktualizowane są wyłącznie `city`, `city_slug` i `updated_at`; współrzędne, źródłowe tagi,
  adres uliczny, publikacja i informacje o kartach nie są zmieniane.
- Granice i wynik odnoszą się do daty snapshotu PBF. Dla ways i relacji obiektów sportowych
  wykorzystywany jest ich zapisany punkt przybliżony; nie potwierdza to adresu wejścia.

Cache `.local/osm/cities/polska-localities.json` zawiera hash PBF i granic oraz listę pominiętych
granic. Jest niezależny od `.local/osm/polska-sport.json` — uzupełnienie bazy nie modyfikuje
oryginalnej paczki importu. Zmiana PBF między przejściami i uszkodzenie cache są wykrywane.

Przed pierwszym UPDATE powstaje kopia `.local/osm/cities/before-*.json` z pełnymi zmienianymi
rekordami. Zapis odbywa się w jednej transakcji; przed COMMIT skrypt sprawdza zachowanie innych
pól i istniejących rekordów. Raport `.local/osm/cities/result-*.json` zawiera poprzednie i nowe
wartości oraz tożsamość granicy OSM dla każdego dopasowania. Ponowienie nie nadpisuje miast.

Nie uruchamiaj seeda, aby uzupełnić miasta lub karty — seed zawiera obiekty demonstracyjne.

### Wynik uruchomienia 4 października 2026

Z pliku `poland-261002.osm.pbf` przygotowano 26 615 poprawnych granic miejscowości;
595 kandydatów pominięto z powodu geometrii. W bazie z 11 214 opublikowanymi obiektami OSM:

- uzupełniono `city` i `city_slug` w 8 617 rekordach;
- zachowano 1 626 istniejących, kompletnych przypisań;
- pozostawiono 971 braków: 966 poza dostępnymi granicami i 5 niejednoznacznych dopasowań;
- ponowny `--dry-run` wykazał 0 planowanych zmian;
- odczytowa weryfikacja serwisu aplikacji wykazała 2 024 opcje miejscowości oraz poprawne
  wyszukiwanie, szczegóły i zapytania PostGIS.

Raport zapisu: `.local/osm/cities/result-2026-10-04T01-28-42-197Z.json`.
Kopia sprzed aktualizacji: `.local/osm/cities/before-2026-10-04T01-28-42-197Z.json`.
Raporty zawierają także identyfikatory nierozwiązanych obiektów i przyczyny pominięcia.

## Automatyczne uzupełnianie kodów pocztowych

`db:fill:osm:postcodes` uzupełnia wyłącznie puste `postal_code` w opublikowanych obiektach OSM.
Nie przypisuje kodu na podstawie nazwy miasta ani najbliższego adresu. Źródłem jest lokalny PBF,
a nie płatne API czy katalog poczty. Dane są dopasowaniem z OSM, nie urzędowym potwierdzeniem adresu.

```powershell
# Odczyt współrzędnych z bazy i przygotowanie cache, bez UPDATE:
npm run db:fill:osm:postcodes -- --file .local/osm/poland-261002.osm.pbf --prepare-only

# Plan bez zapisu:
npm run db:fill:osm:postcodes -- --from-cache --dry-run

# Uzupełnienie brakujących kodów:
npm run db:fill:osm:postcodes -- --from-cache --apply
```

Przygotowanie też wymaga `DATABASE_MIGRATION_URL` w `.env.local`: używa aktualnych współrzędnych
obiektów bez kodów. Można połączyć przygotowanie i zapis przez `--file ... --apply`.
Bez `--apply` nie ma aktualizacji bazy. Nie trzeba stosować migracji.

Reguły:

1. Bezpośredni `addr:postcode` na samym obiekcie ma pierwszeństwo. Dopuszczalne są `NN-NNN`
   i jednoznaczny zapis pięciu cyfr, normalizowany do `NN-NNN`. Nowy import Polski również
   normalizuje ten zapis. Listy i zakresy kodów nie są zamieniane na pojedynczy kod.
2. Punkt adresowy z kodem może być dopasowany tylko do identycznej ulicy i numeru domu,
   maksymalnie 150 m od obiektu. Jeżeli oba źródła podają miejscowość, musi się ona zgadzać.
   Numer `1/2` nie jest utożsamiany z `1-2`.
3. Obiekt może dziedziczyć kod z poligonu adresowego zawierającego jego punkt
   (np. budynku z `addr:postcode`) lub jawnego obszaru `boundary=postal_code` + `postal_code`.
   Obsługiwane są również granice administracyjne z jednym wyraźnie wskazanym `postal_code`.
   Źródło tagowania: [OSM postal_code](https://wiki.openstreetmap.org/wiki/Key%3Apostal_code).
4. Sprzeczne kody z adresu i obszarów, punkty na krawędzi oraz brak odpowiedniego źródła
   powodują pozostawienie pustego pola. `postal_code` urzędu pocztowego ani pobliski budynek
   nie są traktowane jako kod obiektu. Jawne adresy spoza Polski są pomijane.
5. Istniejące niepuste kody, także wymagające ręcznej korekty formatu, są zachowywane.
   Skrypt aktualizuje tylko `postal_code` i `updated_at`, sprawdzając przed COMMIT inne pola.
   Nie zmienia miast, ulic, współrzędnych, publikacji ani kart.

Przybliżony punkt ways/relacji może znajdować się poza właściwym budynkiem lub na jego krawędzi.
Taki obiekt może pozostać bez kodu. Nie tworzymy sztucznych stref z punktów adresowych.

Miliony obszarów adresowych są przetwarzane strumieniowo przez plik tymczasowy i tablice numeryczne.
Cache `.local/osm/postcodes/polska-postcodes.json` zawiera tylko obszary i punkty istotne dla targetów,
hash źródłowego PBF, hash danych oraz współrzędne targetów. Plik tymczasowy jest usuwany po zakończeniu.
Jeżeli obiekt jest nowy lub przesunięty, trzeba ponowić przygotowanie, aby korzystać z dopasowania
przestrzennego. Bezpośredni tag obiektu nie wymaga geometrii otoczenia.

Przed zapisem powstaje kopia `.local/osm/postcodes/before-*.json`. Raport `result-*.json` zawiera
stare i nowe wartości, źródłowe ID OSM i listę nierozwiązanych obiektów. Ponowienie nie nadpisuje kodów.
Po kolejnych importach uruchom przygotowanie i `--apply`; skrypt obsługuje to bez ręcznego przeglądania
każdego rekordu, a przypadki niejednoznaczne pozostawia bez zmian.

### Wynik uzupełnienia kodów 4 października 2026

Przetworzono 4 871 532 proste obszary adresowe z 33 782 256 unikalnymi węzłami oraz
złożone poligony i granice pocztowe. Cache dla aktualnych targetów zawiera 1 563 obszary
i 37 395 pobliskich punktów adresowych.

Z 9 908 rekordów bez kodu uzupełniono 2 167, zachowując 1 306 istniejących kodów.
Łącznie 3 473 obiekty mają kod; 7 741 pozostało bez kodu: 7 712 bez źródła,
19 ze sprzecznymi kodami, 5 na krawędzi i 5 z jawnym adresem spoza Polski.
Ponowny `--dry-run` wykazał 0 planowanych zmian. Testy i odczytowy test serwisu aplikacji przeszły.

Raport zapisu: `.local/osm/postcodes/result-2026-10-04T02-17-38-733Z.json`.
Kopia sprzed zapisu: `.local/osm/postcodes/before-2026-10-04T02-17-38-733Z.json`.

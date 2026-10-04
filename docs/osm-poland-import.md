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
  Importer nie wykonuje geokodowania ani dopasowania do granic administracyjnych.
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

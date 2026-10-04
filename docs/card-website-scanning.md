# Wyszukiwanie deklaracji kart na stronach obiektów

`db:scan:cards` odczytuje pole `places.website` i szuka tekstowych deklaracji dotyczących
MultiSport, BeActive, Medicover Sport i PZU Sport. Działa jako osobny, ręcznie uruchamiany
proces Node.js, poza żądaniami Next.js/Vercel. Nie wymaga migracji: korzysta z istniejącej
tabeli `place_card_claims`. `--crawl` automatycznie zapisuje statusy, bez moderacji.

## Automatyczna ocena źródeł

Publiczny URL ani `Allow` w robots.txt nie stanowią licencji na dane. Program nie może
sam zagwarantować legalności konkretnego wykorzystania. Nie wymaga jednak ręcznego
zatwierdzania każdego źródła: przy `--crawl` domyślnie wykonuje ograniczoną ocenę publicznych
warunków i dopiero na tej podstawie rozpoczyna analizę kart oraz zapis do bazy.

1. Sprawdza robots.txt. Wspólny transport blokuje prywatne IP, wyzwania dostępu i przeciążanie.
2. Odczytuje stronę główną origin oraz maksymalnie trzy powiązane strony z regulaminem,
   warunkami, licencją lub polityką prywatności. Wszystkie muszą przejść robots.txt.
3. Szuka jednoznacznego, odnoszącego się do treści witryny lub informacji o kartach dowodu:
   deklaracji CC0 z linkiem do oficjalnego dokumentu albo wyraźnego zezwolenia na automatyczne
   pobieranie, publikowanie i komercyjne wykorzystanie bez dodatkowych warunków.
4. Zakaz pobierania/wykorzystania ma pierwszeństwo przed znalezioną pozytywną deklaracją.
   Brak zakazu, logo licencji, licencja zdjęcia, cytowany przykład i zgoda na sam odczyt
   nie są uznawane za licencję. Niepełny odczyt regulaminów nie zatwierdza źródła.
5. Po wyniku `allowed` robot automatycznie analizuje obiekt i publikuje jednoznaczny status.
   Bez jawnego uprawnienia może dopuścić ograniczony tryb `facts_only`, opisany poniżej.
   `blocked` i `uncertain` nie zmieniają statusów w bazie. Nie ma kolejki moderatora.

### Łagodniejszy tryb faktów (domyślny)

Nie wymaga CC0 ani wyraźnej zgody na sam krótki fakt o karcie. Po zakończonym odczycie
publicznych warunków bez rozpoznanego zakazu wynik to `facts_only`, a podstawa operacyjna
to `public_facts`. To świadomie mniej zachowawcza konfiguracja, NIE stwierdzenie uzyskania
licencji ani dowód legalności. Brak wykrytego zakazu nie dowodzi braku innych ograniczeń.

- Nadal wymaga jednoznacznego zdania o konkretnej karcie oraz nazwy obiektu i adresu z miastem
  lub zgodnego telefonu. Logo, pytanie w FAQ i sama nazwa partnera nie wystarczają.
- Publikuje status i URL, ale `sourceQuote` pozostaje `null`: nie rozpowszechnia cytatu strony.
  Krótkie dowody i hashe pozostają wyłącznie w wewnętrznym raporcie audytowym.
- Proste warunki zamienia na dane, np. `Wariant: Plus; Dopłata: 10 PLN; Czas: 60 min`.
  Nieznany dodatkowy dzień, kwota, usługa lub ograniczenie blokuje zapis zamiast znikać.
- Maksymalnie pięć obiektów na domenę (łącznie z aliasem `www`) w jednym przebiegu.
  To limit operacyjny, nie prawny próg „nieistotnej części” bazy. Nie należy używać kolejnych
  uruchomień do obchodzenia limitu lub odtwarzania cudzych katalogów.
- Respektuje także rozpoznane zastrzeżenia eksploracji danych: tekstowe zakazy,
  `tdm-reservation: 1` w nagłówku/meta oraz `noai`.

`--strict-sources` przywraca poprzedni wymóg jawnego uprawnienia. W razie niepewności
co do warunków konkretnej strony użyj tego trybu lub rejestru sprawdzonych źródeł.

Rozpoznawanie jest deterministyczne i celowo wąskie. Inne licencje, np. CC-BY, oraz zgody
z dodatkowymi obowiązkami nie są automatycznie zatwierdzane w tej wersji. Program nie ustala,
czy autor deklaracji rzeczywiście posiada wszystkie prawa; nie analizuje wszystkich przepisów
ani całej witryny. `allowed` oznacza spełnienie reguł programu, nie opinię prawną.
Nie zakładamy też, że każda publiczna strona bez wyraźnej licencji jest z definicji nielegalnym
źródłem. W trybie ścisłym brak jawnej podstawy nadal oznacza pominięcie; w trybie faktów
publikacja jest ograniczona do rozpoznanych informacji, bez przejmowania tekstów czy grafik.

Raport `sourceAssessment` zawiera wynik, powód, odwiedzone URL-e, fragment podstawy,
SHA-256 i czas pobrania. Uprawnienia wykryte automatycznie są trzymane wyłącznie w pamięci
danego uruchomienia, wspólne dla origin i ponownie oceniane przy następnym uruchomieniu.
Operacyjna ważność wynosi 30 dni; nie jest to ustalenie prawnego terminu ważności licencji.
Limity, opóźnienia i cache obejmują łącznie ocenę źródła i odczyt deklaracji kart.

## Opcjonalny rejestr uprawnień

Można nadal wskazać zgodę właściciela, licencję albo sprawdzone warunki strony dopuszczające
odczyt i wykorzystanie dowodów. `reviewed_terms` oznacza udokumentowaną ocenę warunków,
nie automatyczne uznanie publicznej strony za dozwoloną. Wpisy rejestru nie są poszerzane
przez automatyczne odkrywanie; wygasły lub zbyt wąski wpis nadal blokuje skan danego URL.

Przykładowy plik `docs/card-crawler-policy.example.json` jest pusty i wystarcza do trybu automatycznego.
Własny rejestr przechowuj poza Git, np. `.local/card-crawler-policy.json`. Nie wpisuj w nim
prywatnej korespondencji lub danych pracownika: `evidence` może być identyfikatorem dokumentu
przechowywanego w prywatnym rejestrze uprawnień.

Struktura wpisu (adresy przykładowe; wymagają zastąpienia rzeczywistymi):

```json
{
  "version": 1,
  "contactUrl": "https://twoj-serwis.pl/crawler",
  "sites": [
    {
      "origin": "https://klub-przyklad.pl",
      "basis": "permission",
      "evidence": "Zgoda obiektu na automatyczny odczyt i zapis dowodów: dokument PO-001",
      "reviewedAt": "2026-10-04",
      "validUntil": "2026-12-31",
      "allowedPaths": ["/kluby/warszawa", "/cennik", "/kontakt"],
      "minDelayMs": 3000,
      "maxPages": 5
    }
  ]
}
```

`origin` musi być dokładnym początkiem URL bez końcowego `/` (protokół i host; `www` jest
osobnym hostem). `allowedPaths` dopuszcza konkretną ścieżkę i jej podścieżki; `"/"` dopuszcza
całą stronę i powinno być używane tylko przy odpowiednim zakresie uprawnienia. Data
zatwierdzenia nie może być przyszła, a zgoda nie może być przeterminowana. Opcjonalny
`contactUrl` to prawdziwa publiczna strona opisująca bota i sposób kontaktu z operatorem,
dodawana do User-Agent. Można ją również podać przez `CARD_CRAWLER_CONTACT_URL` w `.env.local`.
Bez niej bot identyfikuje nazwę i cel odczytu, bez fikcyjnego adresu kontaktowego.
Nie zatwierdzaj katalogów operatorów kart lub cudzych agregatorów jako stron obiektów.

## Uruchomienie

```powershell
# Plan dla wszystkich obiektów z URL, bez HTTP i bez zmian w bazie:
npm run db:scan:cards -- --dry-run

# Pilotaż: automatyczna ocena źródeł i zapis jednoznacznych statusów:
npm run db:scan:cards -- --crawl --limit 10

# Opcjonalnie tylko konkretne miasto:
npm run db:scan:cards -- --crawl --city warszawa --limit 10

# Wszystkie obiekty z URL (również szkice):
npm run db:scan:cards -- --crawl

# Równoległy odczyt niezależnych hostów (domyślnie 8, zakres 1–16):
npm run db:scan:cards -- --crawl --concurrency 16

# Sam odczyt HTTP i raport, bez zapisów w bazie:
npm run db:scan:cards -- --crawl --report-only

# Poprzednie, bardziej zachowawcze wymagania dotyczące uprawnień:
npm run db:scan:cards -- --crawl --strict-sources

# Wyłącznie ręcznie opisane uprawnienia, bez automatycznej oceny nowych domen:
npm run db:scan:cards -- --policy .local/card-crawler-policy.json --crawl --manual-sources-only
```

W tym lokalnym środowisku, jeśli `npm` nie znajduje się w PATH, odpowiednikiem polecenia jest
`node .local/tooling/package/bin/npm-cli.js run db:scan:cards -- --crawl --limit 10`.
Proces wykonuje jeden przebieg i kończy pracę; nie instaluje harmonogramu ani usługi w tle.

Obiekty z jednego hosta, łącznie z aliasami HTTP/HTTPS/www, są przetwarzane kolejno.
Równoległość dotyczy różnych hostów; nie zwiększa limitów ani częstotliwości odczytów
danej witryny. Raport jest zapisywany przez wspólną kolejkę, a proces czeka na zakończenie
aktywnych odczytów przed zamknięciem pliku i połączenia z bazą.

Odczyt używa `DATABASE_URL`, awaryjnie `DATABASE_MIGRATION_URL`, z `.env.local`.
Lista obiektów jest pobierana w transakcji PostgreSQL `READ ONLY`. Przy `--crawl`
potrzebne są również uprawnienia SELECT/INSERT/UPDATE do `place_card_claims` oraz
uprawnienia wymagane przez blokowanie rekordów obiektów i istniejących claimów.
Połączenie jest zamykane po zakończeniu przebiegu. Brak `--crawl` oznacza zawsze plan.
`--limit` dotyczy rekordów z URL, a nie tylko
zatwierdzonych domen; kolejność to ID obiektu. Pusty URL trafia do raportu jako `no_website`.

## Ochrona źródeł i sieci

- robots.txt jest sprawdzany przed stroną i przed każdym przekierowaniem. Respektowane są
  reguły bota, reguły `*` i Crawl-delay. Brak robots.txt (404/410) nie daje licencji.
  Błąd, blokada lub treść HTML zamiast robots.txt powodują pominięcie domeny. Błędny
  Content-Type jest tolerowany, jeśli ciało odpowiedzi zawiera rzeczywiste reguły robots.
- Kolejne żądania na domenie dzieli przynajmniej 2 s (domyślnie 3 s). Limit to 5 stron
  na obiekt, maksymalnie 10 po konfiguracji, oraz 100 żądań na origin w jednym uruchomieniu.
  Opóźnienia, budżet i zatrzymanie po błędzie są wspólne dla aliasów HTTP/HTTPS/www.
  Ponowne odczyty tego samego URL korzystają z cache procesu (do 20 MB); brak trwałego cache stron.
- Pobierane są tylko publiczne HTML-e i powiązane tematycznie linki na tym samym origin,
  w dozwolonych ścieżkach. Logowanie, API, query stringi, dokumenty PDF, inne domeny i porty
  poza 80/443 są wykluczone. Automatyczna ocena źródeł może śledzić przekierowanie
  HTTP→HTTPS i alias `www`/bez `www`, sprawdzając robots i warunki docelowego źródła.
  Nie zmienia przy tym URL-a obiektu w bazie, nie śledzi innych domen i nie obniża HTTPS do HTTP.
- 401, 403, 429, 5xx i CAPTCHA kończą odczyt domeny. Nie ma obchodzenia blokad ani retry.
  Respektowane są nofollow, nosnippet i noarchive z HTML oraz nagłówków odpowiedzi.
  Sam kod reCAPTCHA formularza kontaktowego nie jest blokadą dostępu do publicznej strony;
  faktyczna strona weryfikacyjna lub challenge nadal zatrzymują robot.
- Każda odpowiedź ma limit 1 MB (robots.txt: 512 KB) i timeout 15 s dla połączenia/odpowiedzi.
  Nie są wykonywane skrypty JS. Serwery wymuszające kompresję mimo `Accept-Encoding: identity`
  są pomijane. Prywatne, lokalne i zarezerwowane IP są blokowane także po DNS; sprawdzony
  adres jest przypięty do połączenia, aby uniknąć ponownego rozwiązania DNS.
- Ctrl+C przerywa proces i zapisuje podsumowanie częściowego przebiegu. Raport jest
  dopisywany po każdym obiekcie, więc ukończone wyniki pozostają także po awarii.

## Wyniki i interpretacja

Raport `.local/card-evidence/<czas>-<uuid>.jsonl` zawiera manifest, osobny wiersz dla
każdego obiektu oraz podsumowanie. Każdy dowód ma operatora, sugerowany status,
krótki fragment (do 240 znaków), URL, SHA-256 treści, rzeczywisty czas pobrania,
sygnały zgodności oddziału i powody ewentualnego pominięcia. Pełny HTML, zdjęcia i logotypy
nie są zapisywane. Raport jest wewnętrznym materiałem redakcyjnym, nie publicznym feedem.

- Bezpośrednie „honorujemy MultiSport” tworzy sugestię `accepted`.
- Wariant, dopłata lub limit w zdaniu tworzą sugestię `conditional`.
- Bezpośrednie zaprzeczenie tworzy sugestię `not_accepted`.
- Logo, sama nazwa, pytanie, planowana współpraca i niejasne ograniczenie nie potwierdzają
  akceptacji. Brak informacji nie oznacza nieakceptowania.
- Telefon lub zgodny adres z miastem stanowią pomoc w dopasowaniu oddziału. Sama nazwa
  sieci nie wystarcza. Nawet zgodny adres w stopce nie dowodzi zakresu deklaracji w tekście.
- Sprzeczne źródła zachowują oba fragmenty i oznaczenie `conflicting_sources`.
- Dowody mają `decision: eligible` albo `ambiguous`. Automatyczny zapis wymaga nazwy
  obiektu oraz zgodnego adresu z miastem lub telefonu, dopuszczonej konfiguracji źródła,
  poprawnych odczytów w granicach limitu i jednoznacznego tekstu. Wzmianki niejasne,
  materiał datowany ponad 90 dni temu i kontekst wielu oddziałów blokują zapis.
- Warianty kart, dopłaty, rezerwacje i limity w zdaniu oraz dwóch bezpośrednio kolejnych
  fragmentach są zachowywane jako `conditions`. Zbyt długi lub niejasny warunek i różne
  zestawy warunków dla jednej karty blokują zapis. Sam brak informacji nie zmienia statusu.

`completed` oznacza zakończenie ograniczonego odczytu HTML, nie kompletność całej witryny.
`partial` oznacza m.in. przekroczenie limitu stron lub pominięte podstrony. `blocked` oznacza
przerwanie przez ograniczenia/awarię; znalezione wcześniej fragmenty pozostają w raporcie.
Samo `partialReasons: ["page_limit"]` nie blokuje poprawnego dowodu. Inne przyczyny
częściowego odczytu (błąd, robots, ograniczenie treści, niedozwolone przekierowanie) nadal blokują zapis.
`permission_missing` wskazuje brak dostatecznej podstawy lub zakresu dostępu do analizy kart.
W trybie automatycznym ograniczony odczyt warunków mógł już nastąpić; szczegóły znajdują się
w `sourceAssessment.checked`. Nie należy zastępować tych wyników statusem `not_accepted`.

## Automatyczny zapis do bazy

Nie ma etapu moderatora. Po zakończeniu odczytu obiektu algorytm ustawia `accepted`,
`conditional` lub `not_accepted` w `place_card_claims`. Wpis ma `sourceType: automated`,
`confidence: medium`, URL, fragment dowodu (oprócz trybu faktów), warunki i `verifiedAt` równy czasowi faktycznego
pobrania źródła. Nie jest oznaczany jako potwierdzenie pracownika obiektu. Informacja wygasa
po 30 dniach, najpóźniej z końcem ważności uprawnienia do źródła.

Zapis odbywa się w transakcji dla jednego obiektu. Blokada szereguje równoległe przebiegi,
a nazwa, URL, adres i telefon są sprawdzane ponownie przed zapisem. Zmiana obiektu w czasie
skanowania wycofuje całą transakcję. Istniejący wiersz dla obiektu/karty jest aktualizowany,
zatem ponowienie nie tworzy duplikatów. Starszy odczyt nie nadpisuje nowszego automatycznego
potwierdzenia. Aktualne, znane potwierdzenia ze źródła `venue`, `public_source` lub `community`
są zachowywane; wygasłe i `unknown` mogą być aktualizowane automatycznie.

Sprzeczne, bezpośrednie deklaracje dopasowane do obiektu unieważniają poprzedni automatyczny status do `unknown`.
Brak wzmianki, błąd odczytu lub niejasny tekst pozostawiają istniejącą informację do jej
wygaśnięcia. Dowody z zablokowanego, przerwanego lub częściowego odczytu z błędami nie są publikowane.
Raport zawiera osobne wiersze `database_write` / `database_write_failed` i liczniki:
`written`, `invalidated`, `unchanged`, `writeFailures`. Błąd zapisu pozostaje w raporcie
i powoduje niezerowy kod zakończenia, a kolejne obiekty nadal są przetwarzane.

Regexy analizują ograniczony kontekst, więc automatyczna klasyfikacja może się pomylić.
Warunki w dalszych częściach regulaminu mogą nie zostać rozpoznane. Automatyzacja nie daje
gwarancji znalezienia wszystkich deklaracji, zwłaszcza w PDF-ach, grafikach i stronach
renderowanych wyłącznie przez JavaScript. Przydatność danych dla konkretnego wariantu
karty wynika z zapisanych warunków, a nie z samej nazwy operatora.

## Sprawdzenie wdrożenia — 4 października 2026

Wcześniejszy plan w trybie wyłącznie ręcznych uprawnień odczytał 1452 rekordy z URL: 1421 otrzymało
`permission_missing`, a 31 `invalid_url`. Rejestr przykładowy nie zawiera zatwierdzonych
źródeł, dlatego ten przebieg nie odwiedził żadnej strony i nie zebrał deklaracji kart.
Raport znajduje się w `.local/card-evidence/` (poza Git). Weryfikacja obejmowała również
testy bez skanowania zewnętrznych stron, sprawdzanie typów i lint. Następnie dodano
automatyczną ocenę źródeł. Test integracyjny użył kontrolowanych odpowiedzi HTTP i rzeczywistej
bazy: rozpoznał uprawnienie, zapisał trzy statusy i sprawdził widoczność w aplikacji,
idempotencję oraz ochronę istniejących potwierdzeń. Wszystkie testowe zmiany zostały wycofane.

Pilotaż automatyczny na pięciu rzeczywistych obiektach zakończył się bez zmian statusów:
trzy wyniki `uncertain` (dwa bez rozpoznanej zgody, jeden z niepełną oceną warunków)
oraz dwa `blocked` (nieprawidłowy robots.txt i wyzwanie dostępu). Dowodów kart: 0,
zapisów: 0, błędów zapisu: 0. Raport:
`.local/card-evidence/2026-10-04T04-01-59-839Z-aed0d878-45d7-4efb-b67f-c6c6a5f040c5.jsonl`.
Ówczesny zestaw: 98 testów zaliczonych, trzy inne testy integracyjne pominięte; lint i typecheck poprawne.

Po złagodzeniu wymagań i korekcie rozpoznawania CAPTCHA wykonano próbę 25 obiektów:
8 `completed`, 4 `partial` wyłącznie przez limit stron, 4 `permission_missing`, 9 `blocked`.
Zebrano 19 wzmianek (3 jednoznaczne, 16 niejasnych) i zapisano 3 statusy `accepted`
dla MyGym: MultiSport, Medicover Sport, PZU Sport. Zapisy i widoczność w publicznym
serwisie potwierdzono osobnym odczytem bazy. Błędy zapisu i unieważnienia: 0.
Raport: `.local/card-evidence/2026-10-04T04-21-09-680Z-01c0222b-a924-43cc-ab45-5232fe40b9a3.jsonl`.
Aktualna weryfikacja: 108 testów zaliczonych, 3 pominięte; lint i typecheck poprawne.

Podstawy zasad: [RFC 9309 — robots.txt](https://www.rfc-editor.org/rfc/rfc9309.html)
(robots.txt nie jest autoryzacją dostępu) oraz
[ustawa o ochronie baz danych](https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20240001769).
Zakres CC0 opisuje [oficjalny dokument Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/).
Tryb faktów opiera się na rozróżnieniu informacji od twórczego sposobu jej wyrażenia
([prawo autorskie, art. 1](https://eli.gov.pl/api/acts/DU/2025/24/text/I/D20250024.pdf)) oraz
ograniczonym wykorzystaniu publicznych baz przy legalnym dostępie (art. 7 ustawy o ochronie baz danych).
To podejście do ograniczania ryzyka, nie uniwersalna gwarancja. Art. 8 ust. 2 ogranicza
powtarzające się, systematyczne wykorzystanie naruszające normalne korzystanie i interesy producenta;
sama eksploracja danych nie daje automatycznego prawa do publikacji ich zawartości.
Przed szerszym lub komercyjnym wykorzystaniem należy sprawdzić prawa do konkretnych źródeł,
ponownego wykorzystania fragmentów i ewentualnych danych osobowych. Rejestr uprawnień
jest kontrolą operacyjną, a nie automatyczną opinią prawną.

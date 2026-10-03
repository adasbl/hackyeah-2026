# Seed danych demonstracyjnych

Uruchamiaj z katalogu repozytorium po wykonaniu migracji. Skrypt odczytuje
`DATABASE_MIGRATION_URL` (Session pooler) z `.env.local`; nie korzysta z
adresu Transaction pooler przeznaczonego dla backendu.

```powershell
pnpm db:seed
```

Jeśli zwykły terminal nie znajduje Node.js, można użyć środowiska Codex:

```powershell
& "C:\Users\macdo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --import tsx src/db/seed.ts
```

Próba wykonująca te same zapytania, ale wycofująca transakcję:

```powershell
pnpm db:seed --dry-run
```

## Zawartość

- 4 operatorów kart: MultiSport, BeActive, Medicover Sport, PZU Sport.
- 20 fikcyjnych miejsc z nazwami `[DEMO]` i slugami `demo-*` w Warszawie,
  Krakowie, Gdańsku, Wrocławiu i Poznaniu; wszystkie 6 kategorii API.
- 15 opublikowanych miejsc z pełnym adresem oraz 5 nieopublikowanych szkiców
  bez adresu, miasta i informacji o kartach.
- 60 informacji o kartach: wszystkie 4 statusy, warunki wejścia, źródła,
  poziomy pewności i daty. Weryfikacja 2026-10-03 i wygaśnięcie 2027-04-03
  to stałe daty fikcyjnych scenariuszy.
- Obiekty bez godzin, telefonu, strony WWW, cen i udogodnień do testowania
  brakujących danych. Tagi `demo:dataset` identyfikują zestaw; nie nadajemy
  fikcyjnym miejscom identyfikatorów OSM.

Nazwy, adresy, punkty na mapie, ceny, adresy `example.com` i statusy kart są
fikcyjne. Nie opisują istniejących obiektów ani potwierdzeń operatorów.

## Powtarzalność

Cały seed działa w jednej transakcji. Konflikt lub błąd wycofuje wszystkie
jej zmiany. Kolejne uruchomienie zachowuje identyfikatory i daty utworzenia,
aktualizuje dane demonstracyjne po slugu i statusy po parze obiekt–operator.
Istniejące nazwy operatorów pozostają bez zmian. Rekord o kolidującym slugu,
który nie należy do tego zestawu, przerywa seed.

Ponowne uruchomienie przywraca dane demonstracyjne z pliku; ręczne zmiany
w polach tych fikcyjnych rekordów mogą zostać nadpisane. Seed nie usuwa
innych miejsc i nie uruchamia importu OSM.

Po wykonaniu zobacz rekordy w Supabase Table Editor, schemat `public`.
Frontend nadal korzysta z mocków, dopóki nie podłączymy backendu.

## Testy

`pnpm db:test` sprawdza lokalnie dane i zapis/odczyt współrzędnych, bez połączenia
z bazą. Test integracyjny jest domyślnie pomijany.

Opcjonalny test na Supabase wykonuje seed dwukrotnie, sprawdza identyfikatory,
liczby rekordów, wartości `NULL` i ochronę przed kolizją sluga. Wszystkie zapisy
są wycofywane. Uruchom tylko na bazie, na której możesz testować:

```powershell
$env:SEED_INTEGRATION_TEST = "1"
try {
  pnpm db:test
} finally {
  Remove-Item Env:SEED_INTEGRATION_TEST
}
```

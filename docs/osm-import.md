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

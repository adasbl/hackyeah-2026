# Importing sports venues from PBF — Poland

The importer reads a local `.osm.pbf` snapshot (e.g. from [Geofabrik](https://download.geofabrik.de/europe/poland.html)),
without Overpass or a browser. It does not require Osmium or Python.
It handles nodes, ways and relations, including nested ones.

A run on `poland-261002.osm.pbf` (SHA-256
`0fb658f00a11820a404d8569fa9579fbf078aeae8f3b8886c2b95d6dd91a2b08`)
scanned 276,611,497 elements and prepared 11,210 records:
400 gyms, 2,952 swimming pools, 1,796 fitness venues, 181 climbing venues,
5,674 tennis venues, 93 squash/padel venues and 114 dance venues.
9,853 records have no locality in their tags and 9,730 have no full address.
This is the result of filtering OSM, not a count of verified commercial venues.
Individual courts and pools of a single complex can be separate OSM elements.
Preparing the full package did not write anything to the database.

## Running

After downloading the file, run from the project directory:

```powershell
npm install
npm run db:import:osm:poland -- --file .local/osm/poland-261002.osm.pbf --prepare-only
```

You can use any file name and path; paths with spaces need quotes.
Without `--file` the default location is `.local/osm/poland-latest.osm.pbf`.
`--prepare-only` works without a database connection. It creates the cache `.local/osm/polska-sport.json`
and a dated copy of it. The cache contains ready records, the SHA-256 of the source file, a hash of the records,
counts per category, skip reasons, missing addresses and localities, and multi-category venues.

Before the first write, add the `tenis` and `taniec` values to the `public.place_category` enum.
The migration is in `drizzle/0001_sports_categories.sql`.
For a database managed by Drizzle migrations, use `npm run db:migrate`.
If the existing schema was created by hand and has no Drizzle migration history,
run only the new migration in the Supabase SQL Editor:

```sql
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'tenis';
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'taniec';
```

There is no need to recreate the existing schema or run the seed.
The importer reports `OSM_POLAND_CATEGORY_MIGRATION_REQUIRED` if the database does not know a category from the cache.

```powershell
# Trial write; the whole transaction is rolled back:
npm run db:import:osm:poland -- --from-cache --dry-run

# Write new venues as drafts:
npm run db:import:osm:poland -- --from-cache --apply

# Alternatively: write new venues as published right away:
npm run db:import:osm:poland -- --from-cache --apply --publish
```

Writes use `DATABASE_MIGRATION_URL` from `.env.local` and run in a single transaction,
in batches of 100 records. Each `(osm_type, osm_id)` pair appears at most once.
Existing venues, their manual corrections and publication status are preserved; re-running
does not update them or publish previously saved drafts.
`--publish` applies only to new records. After COMMIT, a dated report
`polska-import-result-*.json` lists the slugs of the added venues.

## Categories and tags

| App category | Main OSM tags |
| --- | --- |
| `silownia` (gym) | `amenity=gym`, sport `bodybuilding`, `weightlifting`, `powerlifting`, `gym`, `crossfit`; gym name in `fitness_centre` |
| `basen` (pool) | `leisure=swimming_pool`, `leisure=water_park`, `amenity=swimming_pool`, sport `swimming` in a sports venue |
| `fitness` | `leisure=fitness_centre`, sport `fitness`, `aerobics`, `pilates` in a sports venue |
| `wspinaczka` (climbing) | sport `climbing` / `bouldering` in a sports venue, or `climbing=wall` |
| `tenis` (tennis) | sport `tennis` on a court / in a sports venue |
| `squash` | sport `squash` or `padel` on a court / in a sports venue — shared "Squash / padel" category |
| `taniec` (dance) | sport `dance` / `dancing`, `amenity=dancing_school`, `club=dance`, `amenity=school` + `school=dance/dancing` |

A sports venue is a matching `leisure` (`sports_centre`, `sports_hall`, `pitch`,
`fitness_centre`, `swimming_pool`, `water_park`), `indoor=yes` or `club=sport`.
The `sport` tag can contain several semicolon-separated values.
In the current schema a venue has one main category. When several match, the priority is
gym, pool, fitness, climbing, tennis, squash/padel, dance; a standalone pool
or water park always gets the pool category. Other categories remain
in the raw tags and in the `multipleCategories` report. The venue is not duplicated in the database.
The existing yoga category stays in the app but is not a separate target of this import.

You can limit the import:

```powershell
npm run db:import:osm:poland -- --file .local/osm/poland-261002.osm.pbf --categories basen,tenis,squash --prepare-only
```

`--from-cache` uses the scope of the saved package; it cannot be combined with `--file` or `--categories`.
A new preparation creates a dated copy and replaces the current cache.

## Quality and geometry

- Skipped: outdoor fitness stations, explicitly free outdoor venues (`fee=no` together with `indoor=no`,
  `outdoor=yes` or `location=outdoor`), `private/no` access, closed/planned venues,
  shops, natural climbing spots and other non-sports features.
- The locality comes from `addr:city`, `addr:town` or `addr:village`; if missing it stays `null`.
  Missing localities can be filled in after the import with the separate command described below.
- Nodes keep their coordinates. Ways and relations get the centre of the bounding box of
  their full geometry: an approximate point, not a measured entrance or area centroid.
  A missing member/node, a relation cycle or a depth above 16 causes the element to be skipped.
- The PBF is streamed in several passes. Only candidates and the nodes they need
  are kept in memory, not all nodes in Poland. A file change between passes
  is detected by comparing hashes.
- The parser does not read author metadata or element versions/timestamps from the PBF,
  so it can handle public Geofabrik files with incomplete metadata. The package origin
  is identified by the hash of the whole file and the preparation date.
- Addresses, contact details and a supported subset of opening hours are normalised. Original tags are kept.
  Prices, confirmation dates and card acceptance information are not added.

Source documentation: [PBF parser](https://github.com/borisgontar/osm-pbf-parser-node),
[fitness](https://wiki.openstreetmap.org/wiki/Gym_/_Fitness_centre),
[climbing](https://wiki.openstreetmap.org/wiki/Tag:sport%3Dclimbing),
[padel](https://wiki.openstreetmap.org/wiki/Tag:sport%3Dpadel).
The app must keep the © OpenStreetMap contributors attribution and a reference to the ODbL.

## Filling in localities from coordinates

`db:fill:osm:cities` matches existing, published OSM venues to full locality boundaries
from the local Poland file. It does not use an external API, Nominatim or Overpass.
It does not require a database migration or re-importing venues.

```powershell
# Prepare boundaries offline, without a database connection:
npm run db:fill:osm:cities -- --file .local/osm/poland-261002.osm.pbf --prepare-only

# Plan matches against current database coordinates, without UPDATE:
npm run db:fill:osm:cities -- --from-cache --dry-run

# Fill in localities and slugs:
npm run db:fill:osm:cities -- --from-cache --apply
```

You can also prepare boundaries and write changes in one command with `--file ... --apply`.
Without `--apply` the script only shows the plan. `--prepare-only` does not need environment
variables; the other modes read `DATABASE_MIGRATION_URL` from `.env.local`.

Matching rules:

- In Poland, `boundary=administrative` + `admin_level=8` means a locality (town or village).
  Municipalities (7), districts (9), parts of localities (10) and bare `place=*` points are not used to assign a city.
  Source: [OSM administrative levels in Poland](https://wiki.openstreetmap.org/wiki/Pl%3AKey%3Aadmin_level).
- A point-in-polygon test is used, not just the bounding box or distance from the centre.
  Multipart areas, islands, holes, reversed segments and nested relations are supported.
  Incomplete and unclosed boundaries and relation cycles are skipped.
- Venues outside the available boundaries, on an edge, or in overlapping boundaries of different
  localities stay unassigned. There is no "nearest city" heuristic.
- Existing locality names are not overwritten. A missing `city_slug` is derived from the existing
  name. If there is a slug without a name, the record is skipped to preserve a possible manual correction.
- Only `city`, `city_slug` and `updated_at` are updated; coordinates, source tags,
  street address, publication and card information are not changed.
- Boundaries and results refer to the PBF snapshot date. For ways and relations of sports venues
  their stored approximate point is used; this does not confirm the entrance address.

The cache `.local/osm/cities/polska-localities.json` contains the PBF and boundary hashes and a list of skipped
boundaries. It is independent of `.local/osm/polska-sport.json` — filling in the database does not modify
the original import package. A PBF change between passes and cache corruption are detected.

Before the first UPDATE, a backup `.local/osm/cities/before-*.json` with the full records to be changed is created.
The write runs in a single transaction; before COMMIT the script checks that other
fields and existing records are preserved. The report `.local/osm/cities/result-*.json` contains the previous and new
values and the OSM boundary identity for each match. Re-running does not overwrite cities.

Do not run the seed to fill in cities or cards — the seed contains demo venues.

### Result

Of 11,214 published OSM venues, the locality was filled in for 8,617, and 1,626 already had one.
971 venues remained unassigned: 966 lie outside the available boundaries
and 5 have an ambiguous match.

## Automatically filling in postcodes

`db:fill:osm:postcodes` fills in only empty `postal_code` values in published OSM venues.
It does not assign a code based on the city name or the nearest address. The source is the local PBF,
not a paid API or a postal directory. The data is an OSM match, not an official address confirmation.

```powershell
# Read coordinates from the database and prepare the cache, without UPDATE:
npm run db:fill:osm:postcodes -- --file .local/osm/poland-261002.osm.pbf --prepare-only

# Plan without writing:
npm run db:fill:osm:postcodes -- --from-cache --dry-run

# Fill in missing postcodes:
npm run db:fill:osm:postcodes -- --from-cache --apply
```

Preparation also requires `DATABASE_MIGRATION_URL` in `.env.local`: it uses the current coordinates
of venues without postcodes. Preparation and writing can be combined with `--file ... --apply`.
Without `--apply` the database is not updated. No migration is needed.

Rules:

1. A direct `addr:postcode` on the venue itself takes precedence. `NN-NNN`
   and an unambiguous five-digit form are accepted, normalised to `NN-NNN`. The new Poland import
   also normalises this form. Lists and ranges of codes are not turned into a single code.
2. An address point with a postcode can be matched only to an identical street and house number,
   at most 150 m from the venue. If both sources give a locality, it must match.
   Number `1/2` is not treated as equal to `1-2`.
3. A venue can inherit a code from an address polygon containing its point
   (e.g. a building with `addr:postcode`) or an explicit `boundary=postal_code` + `postal_code` area.
   Administrative boundaries with a single explicitly set `postal_code` are also supported.
   Tagging source: [OSM postal_code](https://wiki.openstreetmap.org/wiki/Key%3Apostal_code).
4. Conflicting codes from addresses and areas, points on an edge and no suitable source
   leave the field empty. A post office's `postal_code` or a nearby building
   is not treated as the venue's code. Explicit addresses outside Poland are skipped.
5. Existing non-empty codes, including ones that need a manual format fix, are preserved.
   The script updates only `postal_code` and `updated_at`, checking other fields before COMMIT.
   It does not change cities, streets, coordinates, publication or cards.

The approximate point of ways/relations may lie outside the actual building or on its edge.
Such a venue may stay without a code. We do not create artificial zones from address points.

Millions of address areas are streamed through a temporary file and numeric arrays.
The cache `.local/osm/postcodes/polska-postcodes.json` contains only areas and points relevant to the targets,
the source PBF hash, a data hash and the target coordinates. The temporary file is deleted when done.
If a venue is new or has moved, preparation must be re-run to use spatial
matching. A direct tag on the venue does not need surrounding geometry.

Before writing, a backup `.local/osm/postcodes/before-*.json` is created. The `result-*.json` report contains
old and new values, source OSM IDs and a list of unresolved venues. Re-running does not overwrite codes.
After further imports, run preparation and `--apply`; the script handles this without manually reviewing
each record and leaves ambiguous cases unchanged.

### Result

Of 9,908 venues without a postcode, 2,167 were filled in. In total 3,473 venues have a postcode;
7,741 remain without one, mostly because OSM has no source for it.

# Technical documentation

[Project overview](../README.md)

This guide covers the implementation, local setup and deployment of Fit Pass Finder,
the prototype built for HackYeah 2026.

## Documentation index

| Document | Contents |
|---|---|
| [Project assumptions](project-assumptions.md) | Original hackathon goals and MVP scope (Polish and English) |
| [OSM import](osm-poland-import.md) | Importing Poland-wide venue data and filling in localities and postcodes |
| [Card website scanning](card-website-scanning.md) | Separate crawler, source assessment and card claim updates |
| [Administrator moderation](admin-moderation.md) | Supabase Auth setup, permissions, review workflow and verification |
| [Administrator demo access](admin-demo-access.md) | Existing demo login and account prerequisites |
| [Hackathon presentation](Fit_Pass_Finder_PL.pptx) | Polish presentation prepared for the project |

## Architecture

Next.js App Router renders the public pages and hosts server actions. Search runs through
the frontend data layer in `src/lib/data/places.ts` and the query service in
`src/server/places.ts`. Drizzle reads published venues and card claims from PostgreSQL;
PostGIS handles radius, distance and map bounds queries. Public data is cached by Next.js,
and approving a submission invalidates the places cache.

MapLibre renders venue markers and clusters in the browser. Favourites are stored in
localStorage. Supabase Auth handles administrator sessions, while the protected
`admin_users` table controls access to moderation.

OSM imports and card website scans are separate command-line processes. Public searches
read stored data; they do not launch a website scan. User proposals wait for administrator
review, while the crawler can update card claims directly under its configured rules.

### Repository layout

| Path | Purpose |
|---|---|
| `src/app/` | Public routes, administrator pages and server actions |
| `src/components/` | Interface components, search controls and maps |
| `src/lib/` | Frontend data layer, Supabase clients and shared helpers |
| `src/server/` | Database query services, moderation and crawler logic |
| `src/db/` | Schema, database client, seeds and import scripts |
| `packages/types/` | Shared domain types |
| `drizzle/` | SQL migrations and migration metadata |
| `scripts/` | Build support, including MapLibre worker copying |
| `tests/` | Database and server tests |

## Features

| Path | What it is |
|---|---|
| `/` | search screen (city, card, category) |
| `/warszawa?cards=multisport&category=basen` | results – linkable, server-rendered |
| `/polska` | results for the whole of Poland |
| `/places/[slug]` | venue details with card statuses, a mini-map and an "open now" status |
| `/polska?lat=52.23&lng=21.01&radius=5000` | "near me" – closest first, within a 5 km radius |
| `/warszawa?open=1` | only venues that are open now |
| `/warszawa?view=map` | map view (large map, full screen, filters on the map); list view by default |
| `/ulubione` | favourite venues saved in the browser (localStorage) |
| `/admin` | moderation panel for user submissions (login required) |

The map groups nearby venues into clusters (a circle with a count and a ring in category colours).
The home page shows a card comparison: how many published venues in a given area accept each card.
The list, map, favourites and statistics read from PostgreSQL through `src/server/places.ts`.

On a venue page, the "Uzupełnij informacje o kartach" form lets anyone suggest a card status,
admission conditions and a source link without signing in. The submission is stored in
`card_contributions` and does not change public data until an administrator approves it in `/admin`.
Approval updates `place_card_claims` and the cache, and the history keeps the decision,
reviewer, date and previous values.

## Running locally

Run all commands from the repository root. Use a development Supabase project for migrations and demo data.

Requirements: Node.js 24.x and npm (the repository pins npm 11.6.2).
We use npm only; the only lockfile is `package-lock.json`.

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Fill in .env.local using the Supabase connection instructions below first.
npm run db:migrate
npm run db:seed                     # demo data
npm run dev                         # http://localhost:3000
```

The seed creates fictional venues and card statuses; it does not create Supabase Auth users or grant administrator access. See [administrator setup](admin-moderation.md) and [demo access](admin-demo-access.md).

Other commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Connecting to Supabase

Fill in `DATABASE_URL` and `DATABASE_MIGRATION_URL` with the connection strings copied
from **Supabase → Connect**. `.env.example` leaves them empty; the app requires
`DATABASE_URL` to be set. Both URLs should point to the same Supabase project
with the PostGIS and pg_trgm extensions enabled.

- `DATABASE_URL`: Supabase **Transaction pooler** for server code on Vercel.
  postgres.js client: `prepare: false`, `max: 5`, SSL, Node.js runtime.
- `DATABASE_MIGRATION_URL`: Supabase **direct** connection or **Session pooler** for migrations,
  the seed and importers; not used by the app runtime. Migrations are run explicitly,
  before a deployment that depends on them, not on every build or PR.
- `NEXT_PUBLIC_MAP_STYLE_URL`: optional public MapLibre style URL; without it the map uses
  OpenFreeMap. If the URL contains a key, restrict it to the domains of the given environment.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are needed for
  administrator login; Drizzle connects with the PostgreSQL URL, without a Supabase API key.
- Credentials for non-demo environments and secret keys stay out of Git.
  The previously shared hackathon login is listed separately in [demo access](admin-demo-access.md).

Documentation: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[PostGIS](https://supabase.com/docs/guides/database/extensions/postgis),
[Vercel with Git](https://vercel.com/docs/git),
[MapLibre](https://maplibre.org/maplibre-gl-js/docs/).

## Building on Vercel

Import the repository with the project root set to the repository root.
`vercel.json` sets the Next.js framework, `npm ci` as the install command
and `npm run build` as the build command. Node.js 24.x is set in `package.json`.
Keep the default Next.js output directory.

The MapLibre worker and its shared module are copied to `public/maplibre/`
after install and before the build, so they are deployed even when
installed dependencies are reused.

The build does not need a database connection. For the deployed app to work, set
`DATABASE_URL` in the Preview and Production environments on Vercel and prepare the database
schema before deploying. The database client is initialised only on request.
Redeploy after changing environment variables on Vercel.

To verify locally an install identical to Vercel's:

```bash
npm ci
npm run build
```

## Data

- [Importing venues from OpenStreetMap for the whole of Poland](osm-poland-import.md),
  including filling in localities and postcodes.
- [Scanning venue websites for card acceptance statements](card-website-scanning.md)
  (`npm run db:scan:cards`). The script respects robots.txt, rate limits and blocks.
- [Submission moderation and creating an administrator account](admin-moderation.md).

Data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).


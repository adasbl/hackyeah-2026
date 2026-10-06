# Fit Pass Finder

**A sports venue finder built in 24 hours at HackYeah 2026.**

**Live demo:** [fit-pass-finder.vercel.app](https://fit-pass-finder.vercel.app/)

Fit Pass Finder helps people in Poland find a gym, swimming pool or other sports venue
and check its declared acceptance of MultiSport, BeActive, Medicover Sport and PZU Sport
cards. It brings location search, maps and card information into one interface.

The project was developed as a hackathon MVP. This repository preserves the implementation, technical documentation and presentation after the event.

## What you can do

- Search by name, address or city and filter by sport category, card and "open now".
- Find nearby venues using geolocation, a search radius and distance sorting.
- Switch between a list and an interactive map with clustered markers.
- View venue details, opening hours, card statuses, admission conditions and source links.
- Save favourites in the browser and compare cards by venue coverage.
- Suggest corrections without signing in; administrators review them in a dedicated panel.

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-0F172A?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-336791?style=for-the-badge)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)
![MapLibre GL JS](https://img.shields.io/badge/MapLibre_GL_JS-396CB2?style=for-the-badge&logo=maplibre&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3FCF8E)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

The implementation includes geospatial queries, an OpenStreetMap import pipeline,
a separate website scanner for card acceptance statements, and a moderation workflow
with decision history and cache invalidation.

## Data and scope

Venue locations come from OpenStreetMap. The Poland-wide import prepared **11,210 records**
from an OSM snapshot; this is an import result, not a count of verified commercial venues.
Card acceptance is stored with its status, source and verification metadata. Missing
confirmation is shown as `unknown`.

## Documentation

See the [technical documentation](docs/README.md) for local setup, architecture,
database configuration, deployment and data workflows.

- [Original project assumptions](docs/project-assumptions.md)
- [Hackathon presentation (Polish)](docs/Fit_Pass_Finder_PL.pptx)
- [Administrator moderation](docs/admin-moderation.md)
- [Administrator demo access](docs/admin-demo-access.md)

Location data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).

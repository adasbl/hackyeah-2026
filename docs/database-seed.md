# Demo data seed

Run from the repository root after applying migrations. The script reads
`DATABASE_MIGRATION_URL` (Session pooler) from `.env.local`; it does not use the
Transaction pooler URL intended for the backend.

```powershell
npm run db:seed
```

A dry run that executes the same queries but rolls back the transaction:

```powershell
npm run db:seed -- --dry-run
```

## Contents

- 4 card operators: MultiSport, BeActive, Medicover Sport, PZU Sport.
- 20 fictional venues named `[DEMO]` with `demo-*` slugs in Warsaw,
  Kraków, Gdańsk, Wrocław and Poznań, covering all 6 API categories.
- 15 published venues with a full address and 5 unpublished drafts
  without an address, city or card information.
- 60 card claims covering all 4 statuses, admission conditions, sources,
  confidence levels and dates. The verification date 2026-10-03 and expiry date 2027-04-03
  are fixed dates for the fictional scenarios.
- Venues without opening hours, phone, website, prices or amenities, for testing
  missing data. `demo:dataset` tags identify the dataset; fictional venues
  have no OSM identifiers.

Names, addresses, map points, prices, `example.com` addresses and card statuses are
fictional. They do not describe real venues or operator confirmations.

## Repeatability

The whole seed runs in a single transaction. A conflict or error rolls back all
of its changes. Re-running keeps IDs and creation dates,
updates demo data by slug and statuses by venue–operator pair.
Existing operator names are left unchanged. A record with a conflicting slug
that does not belong to this dataset aborts the seed.

Re-running restores the demo data from the file; manual changes
to these fictional records may be overwritten. The seed does not delete
other venues and does not run the OSM import.

Afterwards, browse the records in the Supabase Table Editor, `public` schema.
The frontend reads from the database set in `DATABASE_URL` and shows only
published venues. The seed writes to `DATABASE_MIGRATION_URL`; both URLs
must point to the same project for the DEMO data to appear in the app.

## Tests

`npm run db:test` checks the data and coordinate read/write locally, without a database
connection. The integration test is skipped by default.

The optional Supabase test runs the seed twice and checks IDs, record counts,
`NULL` values and slug-collision protection. All writes are rolled back.
Run it only on a database you can test against:

```powershell
$env:SEED_INTEGRATION_TEST = "1"
try {
  npm run db:test
} finally {
  Remove-Item Env:SEED_INTEGRATION_TEST
}
```

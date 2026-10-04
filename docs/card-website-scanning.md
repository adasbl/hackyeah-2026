# Finding card acceptance statements on venue websites

`db:scan:cards` reads the `places.website` field and looks for text statements about
MultiSport, BeActive, Medicover Sport and PZU Sport. It runs as a separate, manually started
Node.js process, outside Next.js/Vercel requests. It needs no migration: it uses the existing
`place_card_claims` table. `--crawl` writes statuses automatically, without moderation.

## Automatic source assessment

Neither a public URL nor `Allow` in robots.txt is a licence to use the data. The program cannot
by itself guarantee that a particular use is lawful. It does not, however, require manual
approval of every source: with `--crawl` it performs a limited assessment of the public
terms by default and only then starts analysing cards and writing to the database.

1. Checks robots.txt. The shared transport blocks private IPs, access challenges and overloading.
2. Reads the origin's home page and up to three related pages with terms of service,
   conditions, a licence or a privacy policy. All of them must pass robots.txt.
3. Looks for unambiguous evidence that refers to the website content or card information:
   a CC0 statement linking to the official document, or explicit permission for automated
   collection, publication and commercial use without additional conditions.
4. A prohibition on collection/use takes precedence over any positive statement found.
   The absence of a prohibition, a licence logo, a photo licence, a quoted example and permission
   only to read are not treated as a licence. An incomplete read of the terms does not approve a source.
5. After an `allowed` result, the robot automatically analyses the venue and publishes an unambiguous status.
   Without explicit permission it can fall back to the limited `facts_only` mode described below.
   `blocked` and `uncertain` do not change statuses in the database. There is no moderator queue.

### Relaxed facts mode (default)

It does not require CC0 or explicit permission for a short fact about a card. After the public
terms have been read with no prohibition detected, the result is `facts_only`, and the operational basis
is `public_facts`. This is a deliberately less conservative configuration, NOT a claim that a
licence was obtained or proof of lawfulness. Not detecting a prohibition does not prove there are no other restrictions.

- It still requires an unambiguous sentence about a specific card, plus the venue name and an address with a city
  or a matching phone number. A logo, an FAQ question or just a partner name are not enough.
- It publishes the status and URL, but `sourceQuote` stays `null`: the page text is not redistributed.
  Short evidence snippets and hashes stay only in the internal audit report.
- Simple conditions are turned into data, e.g. `Wariant: Plus; Dopłata: 10 PLN; Czas: 60 min`.
  An unknown extra day, amount, service or restriction blocks the write instead of being dropped.
- At most five venues per domain (including the `www` alias) per run.
  This is an operational limit, not a legal threshold for an "insubstantial part" of a database. Do not use
  repeated runs to get around the limit or to reconstruct other people's directories.
- It also respects recognised text and data mining reservations: text prohibitions,
  `tdm-reservation: 1` in a header/meta tag, and `noai`.

`--strict-sources` restores the earlier requirement of explicit permission. If you are unsure
about the terms of a particular site, use this mode or the register of reviewed sources.

Detection is deterministic and intentionally narrow. Other licences, e.g. CC-BY, and permissions
with additional obligations are not approved automatically in this version. The program does not determine
whether the author of a statement actually holds all the rights; it does not analyse all regulations
or the whole website. `allowed` means the program's rules are met, not a legal opinion.
We also do not assume that every public site without an explicit licence is by definition an unlawful
source. In strict mode, no explicit basis still means skipping; in facts mode
publication is limited to recognised information, without copying texts or graphics.

The `sourceAssessment` report contains the result, reason, visited URLs, a snippet of the basis,
SHA-256 and fetch time. Automatically detected permissions are kept only in the memory
of the given run, shared per origin and re-assessed on the next run.
Operational validity is 30 days; this is not a determination of a licence's legal term.
Limits, delays and the cache cover both source assessment and reading card statements.

## Optional permission register

You can still record an owner's consent, a licence or reviewed site terms that allow
reading and using evidence. `reviewed_terms` means a documented assessment of the terms,
not automatic acceptance of a public site as allowed. Register entries are not widened
by automatic discovery; an expired or too narrow entry still blocks scanning the URL.

The example file `docs/card-crawler-policy.example.json` is empty and is enough for automatic mode.
Keep your own register outside Git, e.g. `.local/card-crawler-policy.json`. Do not put
private correspondence or employee data in it: `evidence` can be the identifier of a document
stored in a private permission register.

Entry structure (example addresses; replace them with real ones):

```json
{
  "version": 1,
  "contactUrl": "https://your-service.example/crawler",
  "sites": [
    {
      "origin": "https://example-club.pl",
      "basis": "permission",
      "evidence": "Venue consent to automated reading and storing evidence: document PO-001",
      "reviewedAt": "2026-10-04",
      "validUntil": "2026-12-31",
      "allowedPaths": ["/kluby/warszawa", "/cennik", "/kontakt"],
      "minDelayMs": 3000,
      "maxPages": 5
    }
  ]
}
```

`origin` must be the exact start of the URL without a trailing `/` (scheme and host; `www` is
a separate host). `allowedPaths` allows a specific path and its subpaths; `"/"` allows
the whole site and should be used only when the permission covers it. The review date
cannot be in the future, and the permission cannot be expired. The optional
`contactUrl` is a real public page describing the bot and how to contact its operator,
added to the User-Agent. It can also be set with `CARD_CRAWLER_CONTACT_URL` in `.env.local`.
Without it, the bot identifies its name and purpose, without a made-up contact address.
Do not approve card operators' directories or third-party aggregators as venue websites.

## Running

```powershell
# Plan for all venues with a URL, no HTTP and no database changes:
npm run db:scan:cards -- --dry-run

# Pilot: automatic source assessment and writing unambiguous statuses:
npm run db:scan:cards -- --crawl --limit 10

# Optionally a single city only:
npm run db:scan:cards -- --crawl --city warszawa --limit 10

# All venues with a URL (drafts included):
npm run db:scan:cards -- --crawl

# Parallel reads of independent hosts (default 8, range 1–16):
npm run db:scan:cards -- --crawl --concurrency 16

# HTTP read and report only, no database writes:
npm run db:scan:cards -- --crawl --report-only

# The earlier, more conservative permission requirements:
npm run db:scan:cards -- --crawl --strict-sources

# Only manually described permissions, no automatic assessment of new domains:
npm run db:scan:cards -- --policy .local/card-crawler-policy.json --crawl --manual-sources-only
```

The process performs a single run and exits; it does not install a schedule or a background service.

Venues on the same host, including HTTP/HTTPS/www aliases, are processed sequentially.
Parallelism applies to different hosts; it does not increase limits or request frequency
for a given site. The report is written through a shared queue, and the process waits for
active reads to finish before closing the file and the database connection.

Reading uses `DATABASE_URL`, falling back to `DATABASE_MIGRATION_URL`, from `.env.local`.
The venue list is fetched in a PostgreSQL `READ ONLY` transaction. With `--crawl`,
SELECT/INSERT/UPDATE permissions on `place_card_claims` are also needed, as well as
the permissions required to lock venue rows and existing claims.
The connection is closed at the end of the run. Without `--crawl` the result is always a plan.
`--limit` applies to records with a URL, not only to approved domains; the order is by venue ID.
An empty URL appears in the report as `no_website`.

## Protecting sources and the network

- robots.txt is checked before the page and before each redirect. Rules for the bot,
  `*` rules and Crawl-delay are respected. A missing robots.txt (404/410) does not grant a licence.
  An error, a block or HTML content instead of robots.txt causes the domain to be skipped. A wrong
  Content-Type is tolerated if the response body contains actual robots rules.
- Consecutive requests to a domain are at least 2 s apart (3 s by default). The limit is 5 pages
  per venue, at most 10 when configured, and 100 requests per origin per run.
  Delays, the budget and stopping after an error are shared across HTTP/HTTPS/www aliases.
  Repeated reads of the same URL use the in-process cache (up to 20 MB); there is no persistent page cache.
- Only public HTML pages and topically related links on the same origin are fetched,
  within allowed paths. Login pages, APIs, query strings, PDF documents, other domains and ports
  other than 80/443 are excluded. Automatic source assessment may follow an
  HTTP→HTTPS redirect and the `www`/non-`www` alias, checking robots and the terms of the target source.
  It does not change the venue's URL in the database, does not follow other domains and never downgrades HTTPS to HTTP.
- 401, 403, 429, 5xx and CAPTCHA end reading the domain. There is no block circumvention and no retry.
  nofollow, nosnippet and noarchive from HTML and response headers are respected.
  reCAPTCHA code on a contact form alone does not block access to a public page;
  an actual verification page or challenge still stops the robot.
- Each response is limited to 1 MB (robots.txt: 512 KB) with a 15 s connection/response timeout.
  JS scripts are not executed. Servers that force compression despite `Accept-Encoding: identity`
  are skipped. Private, local and reserved IPs are blocked after DNS resolution too; the checked
  address is pinned to the connection to avoid re-resolving DNS.
- Ctrl+C stops the process and writes a summary of the partial run. The report is
  appended after each venue, so completed results survive a crash.

## Results and interpretation

The report `.local/card-evidence/<time>-<uuid>.jsonl` contains a manifest, a separate line for
each venue and a summary. Each piece of evidence has the operator, the suggested status,
a short snippet (up to 240 characters), the URL, a SHA-256 of the content, the actual fetch time,
branch-matching signals and reasons for any skip. Full HTML, images and logos
are not stored. The report is internal editorial material, not a public feed.

- A direct "we accept MultiSport" creates an `accepted` suggestion.
- A variant, surcharge or limit in the sentence creates a `conditional` suggestion.
- A direct denial creates a `not_accepted` suggestion.
- A logo, a bare name, a question, a planned partnership and an unclear restriction do not confirm
  acceptance. Missing information does not mean non-acceptance.
- A phone number or a matching address with a city helps match the branch. A chain
  name alone is not enough. Even a matching address in the footer does not prove the scope of the statement in the text.
- Conflicting sources keep both snippets and the `conflicting_sources` flag.
- Evidence has `decision: eligible` or `ambiguous`. An automatic write requires the venue
  name plus a matching address with a city or a phone number, an allowed source configuration,
  successful reads within the limit and unambiguous text. Unclear mentions,
  material dated more than 90 days ago and multi-branch context block the write.
- Card variants, surcharges, bookings and limits in the sentence and the two directly following
  snippets are kept as `conditions`. A condition that is too long or unclear, and different
  sets of conditions for one card, block the write. Missing information alone does not change a status.

`completed` means the limited HTML read finished, not that the whole site was covered.
`partial` means, among other things, that the page limit was exceeded or subpages were skipped. `blocked` means
the read was stopped by restrictions or a failure; snippets found earlier remain in the report.
`partialReasons: ["page_limit"]` on its own does not block valid evidence. Other reasons for
a partial read (error, robots, content restriction, disallowed redirect) still block the write.
`permission_missing` indicates an insufficient basis or scope of access for analysing cards.
In automatic mode a limited read of the terms may already have happened; details are in
`sourceAssessment.checked`. These results must not be replaced with a `not_accepted` status.

## Automatic database writes

There is no moderation step. After a venue has been read, the algorithm sets `accepted`,
`conditional` or `not_accepted` in `place_card_claims`. The entry has `sourceType: automated`,
`confidence: medium`, the URL, an evidence snippet (except in facts mode), conditions and a `verifiedAt` equal to the actual
fetch time of the source. It is not marked as a confirmation by venue staff. The information expires
after 30 days, or at the latest when the source permission expires.

The write runs in a transaction per venue. A lock serialises parallel runs,
and the name, URL, address and phone are re-checked before writing. A venue change during
the scan rolls back the whole transaction. The existing row for the venue/card is updated,
so re-running does not create duplicates. An older read does not overwrite a newer automatic
confirmation. Current, known confirmations from `venue`, `public_source` or `community` sources
are preserved; expired and `unknown` ones can be updated automatically.

Conflicting direct statements matched to the venue reset the previous automatic status to `unknown`.
No mention, a read error or unclear text leave the existing information until it
expires. Evidence from a blocked, interrupted or partially failed read is not published.
The report contains separate `database_write` / `database_write_failed` lines and counters:
`written`, `invalidated`, `unchanged`, `writeFailures`. A write error stays in the report
and causes a non-zero exit code, while the remaining venues are still processed.

The regexes analyse limited context, so automatic classification can be wrong.
Conditions further down in the terms may not be recognised. Automation does not
guarantee finding all statements, especially in PDFs, images and pages
rendered only with JavaScript. Whether the data applies to a specific card variant
depends on the stored conditions, not on the operator name alone.

## Pilot result

A trial on 25 real venues gave 8 `completed` reads, 4 `partial` (page limit),
4 `permission_missing` and 9 `blocked`. Of 19 card mentions, 3 were unambiguous and were
written as `accepted` statuses; the other 16 were considered unclear and skipped.

Basis for the rules: [RFC 9309 — robots.txt](https://www.rfc-editor.org/rfc/rfc9309.html)
(robots.txt is not access authorisation) and the
[Polish Database Protection Act](https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20240001769).
The scope of CC0 is described in the [official Creative Commons document](https://creativecommons.org/publicdomain/zero/1.0/).
Facts mode relies on the distinction between information and its creative expression
([Polish Copyright Act, art. 1](https://eli.gov.pl/api/acts/DU/2025/24/text/I/D20250024.pdf)) and
on limited use of public databases with lawful access (art. 7 of the Database Protection Act).
This is a risk-reduction approach, not a universal guarantee. Art. 8(2) restricts
repeated, systematic use that conflicts with normal exploitation and the maker's interests;
text and data mining alone does not automatically grant the right to publish the content.
Before broader or commercial use, check the rights to specific sources,
reuse of snippets and any personal data. The permission register
is an operational control, not an automatic legal opinion.

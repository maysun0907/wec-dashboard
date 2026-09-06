# Reliability review — 2026-09-07

## Expanded verification and refactoring

- Backend: 113 tests passed on local Python 3.14 and production-compatible
  Python 3.11. Ruff correctness checks (`F,E9`) and Bandit passed.
- Frontend: 115 tests passed; ESLint, TypeScript, production build and npm
  audit passed. GitHub verification now runs on pull requests and main pushes.
- Isolated API sweep: 19,212 requests across every documented GET route,
  existing identifiers, all 14 seasons, classes and invalid parameters:
  16,917 HTTP 200, 1,850 HTTP 422, 120 HTTP 404, 325 HTTP 400; zero 5xx.
  These are local snapshot checks, not production latency measurements.
- Browser checks: 40 navigation scenarios plus four expanded accessibility
  scenarios across Chromium, Firefox, WebKit and
  iPhone-sized WebKit. All page families in both languages; entity details;
  search success/failure; language/season navigation; compare removal;
  simulator input/reset; race session tabs and class filters; historical
  2012/2018/2023/2025 pages; legacy redirects and invalid identifiers.
  Homepage plus six data/tool page accessibility checks found no
  serious/critical WCAG violations after fixing simulator selector semantics
  and regulation definition-list markup and keyboard access to scroll tables;
  desktop/mobile screenshots were also inspected.
- GitHub-hosted verification could not start: the account reports a billing
  lock. No billing/security settings were changed. The corresponding checks
  were run locally; this is not recorded as a successful GitHub Actions run.
- PostgreSQL 17: full migration chain and schema comparison passed. Full
  2026 source reconciliation passed after the final collector changes;
  archive reconciliation was separately exercised against the local copy.

### Changes in this pass

- Shared latest-standing snapshot selection respects round chronology and
  separate class calendars. Career/title reads no longer count intermediate
  standings as extra titles. Fourteen-season career tests use at most five
  SQL statements per driver/team/manufacturer profile.
- Batch career queries and remove duplicate historical lookup logic; keep
  race history across a driver's car changes and prefer the vehicle's brand.
- Import actual official race lineups, resolve known same-car name aliases,
  preserve unmatched substitute names and record lineup corrections.
- Match circuit assets to the actual event, not a country-wide first match;
  reuse schedule slug discovery. Missing/empty/duplicate calendar inputs fail
  before replacing valid data. Local mock/experimental standings writers
  require explicit local-only confirmation.
- Preserve BoP references when merging duplicate car models, reject conflicting
  published adjustments, and resolve curated BoP by exact season and round.
- Disable speculative table-link rendering; memoize identical timeout-bounded
  API reads per server render while retaining adaptive persistent caching.
- Preserve language/season in search and comparisons, including deliberately
  empty selections. Reject duplicate/obsolete simulator picks. Use published
  positions to resolve equal-point leaders and fix fractional lap-time sorting.
- Fix Safari timestamp hydration, detail-page headings, accessible search
  controls, retired Korean BoP links and preview CORS scope. Stop inferring
  clouds from humidity or sitemap modification dates from race/year dates.

### Coverage interpretation

The automated sweeps enumerate API identifiers and browser page families;
they are not a line-by-line proof or independent verification of every
historical sporting fact. Unit-suite backend statement coverage alone was
55% before the final regression additions; integration/source/browser checks
are separate. Existing source-authority constraints below still apply.

## Verification performed

- Backend test suite: 92 passing tests, including result-state, attendance,
  source ownership, transaction rollback, migration and cache regressions.
- Frontend: 104 passing tests; lint, TypeScript and production build passed.
- Read-only production snapshot: 14 seasons, 109 events, 434 sessions and
  12,912 result rows. Exercised 3,336 GET requests across documented API route
  families and existing entity IDs on an isolated copy; no 5xx responses.
- PostgreSQL 17: complete migration chain from an empty database; latest
  migration downgrade/re-upgrade; model/schema comparison passed.
- Dependency checks: npm audit and local Python environment audit passed.
- Full 2026 ingestion against current upstream sources completed on the
  isolated database after correcting the local-date cutoff.
- Follow-up: full 2026 ingestion and 2025 archive reconciliation passed on
  isolated production copies. Latest PostgreSQL migration round trip and
  schema comparison passed. Production data was not used for load testing.

## Changes

- Record race snapshot status, source URL and collection timestamp. Separate
  a full-duration classification (`completed`) from an explicitly final file.
- Exclude known live snapshots from career totals and winner histories.
  Legacy rows without provenance retain the conservative past-date fallback.
- Apply actual driver lineups/round participation to driver profiles.
- Resolve manufacturer entries from the vehicle model, falling back to team.
- Preserve car IDs and images during season rebuilds; reject reduced timing
  coverage for review instead of silently discarding existing results.
- Cache source documents within one collection only, never between polls.
- Keep latest available classification when newer weather files appear first.
- Continue independent live collection when full-season validation fails.
- Fix invalid countdown values, hydration mismatch, continued request fan-out
  after errors, unknown-season circuit fallback and image-path traversal.

## Limitations and follow-up

### Post-race corrections

- Final publication does not mean immutable: completed/final snapshots can
  change positions, laps and status. Published championship points may decrease
  or become negative. Regression tests cover penalties and reinstatement.
- Store changed completed race classifications and championship tables in
  `source_revisions`, transactionally with the applied data. Identical payloads
  are deduplicated; history begins at deployment, not retroactively.
- DSQ/excluded/non-classified/DNS entries no longer receive estimated points,
  wins or podiums. Unclassified results are not interpreted as a P0 finish.
- Current-season full collection remains hourly in race week and six-hourly
  otherwise; active-session timing remains five-minute polling. At 03:00 UTC
  outside race week, reconcile one historical season's standings and race
  timing. January-April prioritize the previous season; otherwise rotate the
  archives by date. Failures roll back and are logged, not silently accepted.
- Keep recent race/season caches hourly for 120 days beyond the race-week
  window; older archives retain daily caches. These are revalidation windows,
  not guaranteed publication-to-screen latency.
- Race detail displays collected state, source and UTC collection timestamp.
  Estimated charts and per-race points are labelled separately from published
  championship totals. Progression uses at most two data queries, plus route
  season/class lookup, and actual participating driver lineups.
- Targeted practice refresh updates existing rows in place and validates
  coverage before applying changes. Seasonal full refresh remains atomic.

### Remaining constraints

- Request coverage is not proof of semantic correctness for every historical
  value or every browser interaction. Tests do not exhaust all inputs.
- A local-time completion cutoff incorrectly expected round-five entrant
  Ricky Taylor in pre-race standings. Completion now uses the shared UTC/
  collected-state rule. Source roster validation remains enabled.
- Legacy result finality is unknown until recollected; reduced/shortened races
  require explicit final publication. Hour-based completion is not FIA signoff.
- Championship progression and per-race displayed points remain explicitly
  labelled estimates, not a replacement for official tables. Manufacturer
  charts sum entry estimates; they do not implement championship eligibility.
- Corrections only published in stewards' PDFs/notices, but not reflected in
  the collected timing/table sources, are not automatically interpreted.
  A missing entrant is not assumed disqualified: reduced source coverage is
  rejected for review. Archive standings rely on secondary Wikipedia tables.
  Archive rotation is best-effort and pauses in race week; no all-years SLA.
- Car identity is stable, but result/standing rows are still season-rebuilt in
  an atomic transaction. Fully incremental ingestion remains future work.
- Historical migration scripts target PostgreSQL, not SQLite ALTER constraints.

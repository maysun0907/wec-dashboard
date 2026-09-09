# Reliability review — 2026-09-09

## Multilingual follow-up

- Review nine-language metadata, canonical/hreflang links, navigation,
  comparison controls and shared rule explanations. This pass does not
  claim independent verification of every historical race or local search volume.
- Localize champion badges and comparison removal labels in all nine languages.
  Continue to the explicit language URL when saving the preference fails,
  including an old tab whose Server Action is no longer available after deployment.
- Remove the inherited English/Korean keyword list from other languages.
  Localized titles, descriptions, canonical URLs and hreflang remain in place.
- Correct rules using FIA WEC 2026 Sporting Regulations v1.2, articles 6.2.2,
  10.2.1 and 13.3.3, and LMH Technical Regulations article 5.3.2: ten cars
  advance per class; LMGT3 requires Bronze plus another Bronze/Silver;
  front-axle deployment speed follows BoP; success handicap can affect mass
  and/or power. Retain the verified new-homologation ERS requirement (5.3).
- Remove unsupported shared tyre-compound and blanket 2032 validity claims,
  explain all three points tables, and link the current official regulations.
  Apply these corrections to all nine translations and generated FAQ text.
- Sources: https://www.fia.com/regulation/category/118 and
  https://www.fiawec.com/en/page/regulations-1; Goodyear supplier confirmation:
  https://www.fiawec.com/en/news/goodyear-extends-lmgt3-tyre-partnership-with-long-term-commitment/13610
- Local checks: 144 backend tests, 163 frontend tests, ESLint, TypeScript,
  production build and npm production dependency audit passed. Production
  DB and collection health endpoints returned healthy during the review.
  No collection frequency, database contents or infrastructure settings changed.


## Race integrity and browser follow-up

- Correct Le Mans full-distance scoring to 50/36/30/24/20/16/12/8/4/2;
  keep the separate 8–10 hour and 6 hour tables. Replace incorrect test
  expectations, simulator calculations and both language explanations.
  Published championship totals remain independent of these estimates.
- Match driver standing entries within the same class and select transfers
  by the latest scheduled round at that snapshot. Prefer the car's brand.
  Carry crew round eligibility to simulations and deduplicate awarded IDs.
- Calculate live duration from untranslated names, choose event dates in
  circuit time, and prefer completed/final or fresh live source state.
  Refresh visible race-detail/live pages once per minute during race week;
  suspend requests in hidden tabs and clean up on navigation. Existing
  source polling and server caches still determine end-to-end freshness.
- Reject duplicate classified positions, class mismatches and unidentified
  entries before publishing timing. Le Mans guest entries in tracked classes
  require explicit guest mode and source team/crew identity; log omitted
  non-season entries. Full guest-roster ingestion is not claimed here.
- Remove cancelled-event BoP dependencies transactionally and clear old
  posters when the circuit changes. Checkpoint write failures cannot mask a
  completed ingest, and schedule reload failure cannot abort all hot polls.
- Persist full/hot/recovery outcomes and last success in a reserved health
  checkpoint namespace. `/health/ingest` returns non-cached 503 on failed,
  missing or stale collection; race-week/hot thresholds are stricter.
  It is separate from Railway's process liveness check to avoid API restart
  loops. This adds a diagnostic endpoint, not an external alert subscription.
- Browser verification exposed stale season-selector props after navigation;
  use the canonical URL and verify switching in both directions.
- Local source reconciliation: 2026 full ingest succeeded on isolated
  PostgreSQL, with 8 events, 35 season cars, 110 driver standings and 176
  race rows. COTA's 35 rows match official position (unclassified normalized
  to zero), laps, best lap and status. Le Mans class winners return 50 points.
- Local API sweep: 19,213 requests across 14 seasons; no unexpected failures.
  The offline ingestion-health endpoint intentionally returns degraded 503.
  This is regression/integration evidence, not proof of all historical facts
  or a production load benchmark.
- Final checks: 144 backend tests, 121 frontend tests, Ruff, Bandit, ESLint,
  TypeScript, production build, npm production dependency audit and PostgreSQL
  schema comparison passed. All 44 browser scenarios passed across Chromium,
  Firefox, WebKit and mobile WebKit (the final mobile scenario was rerun
  after overlapping test runners collided while cleaning trace artifacts).
  The season-switch regression also passed five consecutive Chromium runs.
  GitHub-hosted jobs remain blocked by the account billing lock; local runs
  are not represented as successful GitHub Actions checks.

## Post-race collection follow-up

- Scope: championship driver identity, off-week source checkpoints, and the
  scheduler's live/post-race failure paths. This is a focused follow-up, not
  a new claim of line-by-line verification of the entire repository.
- Resolve substitute drivers across car numbers only by a unique normalized
  full name in the same season and class. Keep roster coverage validation,
  duplicate-row rejection and the car-scoped alias fallback.
- After a full-season failure, independently reconcile up to two races from
  the past 14 days outside their live windows. Include already-final files
  so late corrections remain eligible; wrap helper commits in an outer
  transaction to avoid publishing partial recovery.
- Missing checkpoint storage falls back to normal ingestion. Future-dated
  checkpoints cannot suppress a rebuild.
- Backend: 134 tests passed. Frontend: 115 tests passed, plus ESLint and
  TypeScript checks. These checks do not measure production throughput.

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

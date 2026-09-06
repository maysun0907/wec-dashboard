# Reliability review — 2026-09-07

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

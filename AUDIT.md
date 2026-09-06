# Reliability review — 2026-09-07

## Verification performed

- Backend test suite: 76 passing tests, including result-state, attendance,
  source ownership, transaction rollback, migration and cache regressions.
- Frontend: 102 passing tests; lint, TypeScript and production build passed.
- Read-only production snapshot: 14 seasons, 109 events, 434 sessions and
  12,912 result rows. Exercised 3,001 GET requests across documented API route
  families and existing entity IDs on an isolated copy; no 5xx responses.
- PostgreSQL 17: complete migration chain from an empty database; latest
  migration downgrade/re-upgrade; model/schema comparison passed.
- Dependency checks: npm audit and local Python environment audit passed.
- Full 2026 ingestion against current upstream sources completed on the
  isolated database after correcting the local-date cutoff.

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

- Request coverage is not proof of semantic correctness for every historical
  value or every browser interaction. Tests do not exhaust all inputs.
- A local-time completion cutoff incorrectly expected round-five entrant
  Ricky Taylor in pre-race standings. Completion now uses the shared UTC/
  collected-state rule. Source roster validation remains enabled.
- Legacy result finality is unknown until recollected; reduced/shortened races
  require explicit final publication. Hour-based completion is not FIA signoff.
- Championship progression and per-race displayed points remain estimates
  derived from partial classifications, not a replacement for official tables.
- Car identity is stable, but result/standing rows are still season-rebuilt in
  an atomic transaction. Fully incremental ingestion remains future work.
- Historical migration scripts target PostgreSQL, not SQLite ALTER constraints.

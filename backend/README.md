# Backend

FastAPI + SQLAlchemy + Alembic. Postgres on Railway in production, any
Postgres locally for dev.

## Setup

```sh
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # if present, otherwise create one (see below)
alembic upgrade head
uvicorn app.main:app --reload
```

`.env` requires the database URL. The remaining settings have production-safe
defaults and can be overridden when the Railway connection budget changes:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | `postgresql+psycopg://user:pw@host:5432/db`. Use the `+psycopg` driver suffix. |
| `ENVIRONMENT` | `development` | Set to `dev` to get colored console logs; anything else emits one JSON line per event. |
| `DB_POOL_SIZE` | `10` | Persistent PostgreSQL connections per API worker. |
| `DB_MAX_OVERFLOW` | `5` | Temporary connections allowed above the base pool. |
| `DB_POOL_TIMEOUT_SECONDS` | `5` | Maximum connection-checkout wait before a structured `503`. |
| `API_MAX_CONCURRENCY` | `12` | In-flight `/api/v1/*` requests admitted per worker. Must stay below total pool capacity. |
| `API_ADMISSION_TIMEOUT_SECONDS` | `1.5` | Async gate wait before a fast overload `503`. |
| `API_RETRY_AFTER_SECONDS` | `2` | `Retry-After` value on overload responses. |

The admission gate applies only to `/api/v1/*`. `/health` and `/health/db`
bypass it so Railway can distinguish an overloaded API from a dead process.
The gate keeps three connections in reserve with the defaults above, and its
waiters stay on the event loop instead of occupying synchronous worker threads.

The API serves at `http://localhost:8000`. Browse `/docs` for the
auto-generated OpenAPI UI.

### Live Al Kamel CSV endpoints

A handful of session endpoints fetch Al Kamel CSVs at request time
and cache the parsed result per session id (in-process, indefinitely
once non-empty). Don't be surprised by a 1-3 second cold-start hit
the first time each is called for a given session.

| Endpoint | What it returns |
| --- | --- |
| `GET /api/v1/sessions/{id}/lap-chart` | Per-car lap-by-lap position trajectories (race only) |
| `GET /api/v1/sessions/{id}/pit-stops` | Pit visits with laps + durations |
| `GET /api/v1/sessions/{id}/weather` | Median temps, humidity, wind, rain flag |
| `GET /api/v1/sessions/{id}/results` | Race classification, plus V-max for races and Q sector triples for qualifying |

## Seed mock data (dev only)

`python -m app.seed` wipes the DB and re-inserts the 2026 Hypercar +
LMGT3 grids with mock results through round 2. Idempotent. Runs the
car-spec curator at the end so `category` / `engine` / `year` / power
weight come back populated.

## Migrations

```sh
# Apply all pending migrations
alembic upgrade head

# Generate a new migration after editing app/models/__init__.py
alembic revision --autogenerate -m "describe the change"
```

Always inspect autogenerate output — it sometimes misses indexes or
gets data-migration order wrong. The existing migrations in
`alembic/versions/` are the style guide.

## Ingest

The Railway "cron" service calls one entry point — `python -m
app.ingest.wikipedia` — that fans out into the full pipeline:

1. **Wikipedia** — entries, calendar, race-results summary (winners),
   per-round classification subarticles when published.
2. **Al Kamel** — full race classification rows from
   `03_Classification_Race`, pit-stop log from `23_Analysis_Race`,
   FP1-3 + Q (and Hyperpole) sessions and per-car results from the
   timing-portal CSVs.
3. **fiawec.com schedule** — session start times for upcoming rounds
   whose Wikipedia article is still a stub.
4. **Published standings** — the current season is mirrored from FIA WEC's
   official championship tables; archived seasons use Wikipedia. Every
   current table and roster identity is validated before replacement, so a
   partial source response cannot overwrite the last good standings.
5. **fiawec.com asset URLs** (`app.ingest.fiawec_assets`) — official
   manufacturer logos, car-render PNGs, circuit-layout PNGs and round
   posters from the FIA's grid + per-race pages.

Each step is idempotent and best-effort — if the Al Kamel CSV hasn't
been published yet, the rest of the pipeline still commits.

### Adaptive race-week cadence

The Railway service remains scheduled once per hour. Both the API and cron
services share `railway.toml`, so a cron expression must not be added to that
file: it would also turn the always-on API service into a cron job. The
no-argument cron entry point adapts inside each invocation instead:

| Window | Collection policy |
| --- | --- |
| Outside race week | Full Wikipedia/FIA/Al Kamel ingest every 6 hours. Other hourly launches exit after a cheap DB schedule check. |
| Race week, between sessions | Full ingest every hour so entries, schedules, and championship standings stay current. |
| 20 minutes before FP/Q through 3 hours after start | Poll only that event/session's Al Kamel results and weather every 5 minutes. |
| 20 minutes before a race through race duration + 3 hours | Poll the latest race-hour classification every 5 minutes. Files are revalidated even at the same URL because Al Kamel can update them in place. |

The hot loop lasts at most 54 minutes, so it exits before Railway's next
top-of-hour invocation; a PostgreSQL advisory lock also rejects accidental
overlap. Championship standings are intentionally not part of the five-minute
poll: the official table changes after a completed round, and the race-week
hourly full ingest already captures it without repeatedly scraping the heavier
FIA standings page. Set `ADAPTIVE_INGEST=false` for a one-shot Railway run, or
pass an explicit year/URL for local backfills.

Session rows are upserted by `(event_id, type)` and retain their IDs across
full ingests. Only their rebuilt results are replaced, preventing cached race
pages from calling session URLs that disappeared during the latest cron run.

Manual one-shot for a backfill:

```sh
python -m app.ingest.wikipedia 2026
```

## Curation

Spec data the FIA publishes per round (BoP) and per chassis
(homologation specs / car images) lives in code, not in the database
directly. Edit the dict, push, and the curator runs on next deploy.

| File | Curator | Applies to |
| --- | --- | --- |
| `app/data/car_specs.py` | `python -m app.curate_car_models` | `car_models` table |
| `app/data/bop.py` | `python -m app.curate_bop` | `bop_adjustments` table |

Both curators print the slugs they couldn't find — useful for catching
typos or model renames between seasons.

## Project layout

```
backend/
├── alembic/versions/        # All schema migrations
├── app/
│   ├── data/                # Curated source-of-truth dicts
│   │   ├── car_specs.py
│   │   ├── bop.py
│   │   └── car_image_sources.md   # Press-kit URL catalog
│   ├── ingest/
│   │   ├── _common.py             # upsert helpers + slugify
│   │   ├── alkamel.py             # CSV timing parser
│   │   ├── fiawec_schedule.py     # Session start-times
│   │   └── wikipedia.py           # Entries + results + standings
│   ├── models/__init__.py   # SQLAlchemy ORM (single file)
│   ├── routers/             # One file per resource (cars, teams, …)
│   ├── config.py            # Settings (env-var loader)
│   ├── db.py                # Engine + SessionLocal
│   ├── logging.py           # structlog config (JSON in prod)
│   ├── main.py              # FastAPI app + router registration
│   ├── schemas.py           # Pydantic v2 response schemas
│   ├── scoring.py           # WEC points table + class-position logic
│   └── seed.py              # Mock data for dev
├── alembic.ini
├── Procfile                 # Railway: web: uvicorn ...
├── railway.toml             # preDeployCommand chain
└── requirements.txt
```

## Conventions

- **Response schemas use camelCase** via Pydantic's `alias_generator`.
  Internal code stays snake_case; serialization translates.
- **One router file per resource**. Cross-cutting helpers live in
  `app/scoring.py` or `app/season.py`.
- **Joinedload, never lazy.** Routers that touch FK relationships
  always eager-load via `.options(joinedload(...))` to avoid N+1.
- **`structlog.get_logger(__name__)`** — don't use `print()` outside of
  the seed script.
- **Migrations only go forward** in production. The `downgrade()` is
  for local recovery; don't rely on it across deploys.

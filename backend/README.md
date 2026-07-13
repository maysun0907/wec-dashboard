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

`.env` only needs two variables:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | `postgresql+psycopg://user:pw@host:5432/db`. Use the `+psycopg` driver suffix. |
| `ENVIRONMENT` | `development` | Set to `dev` to get colored console logs; anything else emits one JSON line per event. |

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
app.ingest.wikipedia 2026` — that fans out into the full pipeline:

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

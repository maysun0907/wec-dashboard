# WEC Dashboard

An unofficial fan dashboard for the FIA World Endurance Championship.
Schedule, lap-by-lap race results, sector breakdowns, V-max, weather,
session-by-session standings progressions, circuit layouts, and a
recap home for past seasons going back to 2012 (HYPERCAR / LMP1 /
LMP2 / LMGTE Pro / LMGTE Am).

**Live**: [wec-dashboard-seven.vercel.app](https://wec-dashboard-seven.vercel.app)

## What's in here

- **Live race weekend** — next-race countdown, hourly cron pulls
  latest classification + Al Kamel CSVs, frontend revalidate windows
  scoped tighter during weekends.
- **Race detail page** — qualifying sector breakdown on the pole
  card, V-max column on the race classification, Al Kamel position
  chart, pit-stop log, weather emoji badge per session tab.
- **Past-season recap home** — Champions card per class (drivers /
  team / manufacturer), Le Mans spotlight, every-round-at-a-glance
  grid, mini progression charts. Adapts to whatever class taxonomy
  the season ran (LMP1+LMP2+LMGTE PRO+LMGTE AM in 2014-2020,
  HYPERCAR+LMGT3 since 2024).
- **Circuit pages** — per-track SVG layouts (CC-BY-SA from Wikimedia
  Commons), country-keyed, served straight from `public/circuits/`.
- **Rules / BoP** — 2026 regulations summary, success-handicap
  explainer, points tables.

## Architecture

```
         ┌──────────────────┐         ┌─────────────────────┐
         │  frontend (Next) │ ──API──▶│  backend (FastAPI)  │
         │   Vercel SSR     │         │  Railway + Postgres │
         └──────────────────┘         └─────────────────────┘
                                              ▲
                                              │ scheduled ingest
                                              │
                                       ┌──────┴───────┐
                                       │  Wikipedia   │
                                       │  Al Kamel    │
                                       │  fiawec.com  │
                                       └──────────────┘
```

- **`frontend/`** — Next.js 16 (App Router), Tailwind v4, shadcn/ui,
  Recharts. Server components fetch from the backend with per-resource
  `revalidate` caching.
- **`backend/`** — FastAPI 0.115, SQLAlchemy 2, Alembic, Postgres on
  Railway. Ingestion modules pull race data from Wikipedia, Al Kamel
  CSVs, and fiawec.com.

## Quick start

You need **Python 3.11+**, **Node 20+**, and a Postgres database
(local or hosted). Two terminal tabs — one for backend, one for
frontend.

```sh
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo "DATABASE_URL=postgresql+psycopg://user:pw@localhost:5432/wec" > .env
echo "ENVIRONMENT=dev" >> .env
alembic upgrade head
python -m app.seed                # local mock data
python -m app.curate_car_models   # apply curated car specs
uvicorn app.main:app --reload     # http://localhost:8000

# Frontend (new terminal)
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev                       # http://localhost:3000
```

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for deeper setup, ingest CLI,
and curation flow.

## Project structure

```
wec-dashboard/
├── backend/
│   ├── alembic/versions/        # Schema migrations
│   ├── app/
│   │   ├── data/                # Curated specs (car_specs.py, bop.py)
│   │   ├── ingest/              # Wikipedia + Al Kamel + fiawec scrapers
│   │   ├── models/              # SQLAlchemy ORM
│   │   ├── routers/             # FastAPI routes (one file per resource)
│   │   ├── curate_car_models.py # Apply data/car_specs.py to DB
│   │   ├── curate_bop.py        # Apply data/bop.py to DB
│   │   ├── seed.py              # Reset DB to mock data (dev only)
│   │   ├── schemas.py           # Pydantic response schemas (camelCase)
│   │   └── main.py              # FastAPI app
│   ├── railway.toml             # Deploy config (alembic + curators)
│   └── requirements.txt
└── frontend/
    ├── public/
    │   ├── cars/                # Car-model PNGs/WebPs (slug-keyed)
    │   ├── circuits/            # Track layout SVGs (ISO-3-keyed)
    │   └── drivers/             # Optional driver-photo overrides
    ├── src/
    │   ├── app/(dashboard)/     # Routed pages: home, races, live, ...
    │   ├── components/          # Shared UI + cards
    │   └── lib/
    │       ├── api.ts           # Typed API client
    │       ├── car-image.ts     # Server-only public/cars/ lookup
    │       ├── circuit-image.ts # Server-only public/circuits/ lookup
    │       ├── driver-image.ts  # Server-only public/drivers/ lookup
    │       └── season.ts        # Selected-season cookie helper
    └── vitest.config.ts
```

## Deployment

- **Frontend**: every push to `main` deploys to Vercel.
- **Backend**: every push triggers Railway. The `preDeployCommand` in
  `railway.toml` runs `alembic upgrade head && curate_car_models &&
  curate_bop` so schema and curated data are always in sync with the
  committed code.
- **Ingest cron**: a separate Railway service runs `python -m
  app.ingest.wikipedia` on a schedule to keep the DB up to date with
  the season as Wikipedia and Al Kamel publish results.

## License

[MIT](LICENSE) — fan project, not affiliated with FIA / ACO / WEC.
Press images are editorial-use only with manufacturer credit; see
`backend/app/data/car_image_sources.md`.

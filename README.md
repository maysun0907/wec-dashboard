# WEC Dashboard

An unofficial fan dashboard for the FIA World Endurance Championship.
Schedule, lap-by-lap race results, sector breakdowns, V-max, weather,
session-by-session standings progressions, circuit layouts, and a
recap home for past seasons going back to 2012 (HYPERCAR / LMP1 /
LMP2 / LMGTE Pro / LMGTE Am).

**Live**: [wec-dashboard-seven.vercel.app](https://wec-dashboard-seven.vercel.app)

## What's in here

- **Live race weekend** — next-race countdown, adaptive five-minute session pulls
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
- **Bilingual (EN / KO)** — full Korean translation catalog covering
  every page, component, table header, race/circuit/event name, and
  data label. Toggle via the header switcher (cookie-persisted); first
  visit auto-detects from `Accept-Language` so Korean searchers land
  on Korean content. See `frontend/messages/{en,ko}.json` +
  `frontend/src/i18n/`.
- **Mobile / tablet / desktop** — responsive end-to-end (320 px → 4K).
  Mobile-first Tailwind v4 breakpoints, header logo / hero / table /
  card grids tuned per viewport.
- **Past-season car photography** — when fiawec.com publishes a new
  season the previous season's car images vanish. The backfill module
  walks the Internet Archive (Wayback Machine) per car number across
  multiple probe dates and rescues the original press shots from
  `/ecm-prod/` (2018+) and `/ecm/` (2016-2017). Covers 2017 and
  2022-2025 today. See `backend/app/ingest/fiawec_assets.py`.
- **SEO** — full sitemap of every static + dynamic route (events,
  drivers, teams, cars, circuits) across all seasons, robots.txt,
  per-page OG / Twitter cards with rich descriptions, bilingual
  keywords, canonical URLs, hreflang.

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
  Recharts, next-intl (EN/KO). Server components fetch from the backend
  with race-aware per-resource caching (60 s around an active weekend,
  1 hr between rounds, and 24 hr for completed archives).
- **`backend/`** — FastAPI 0.115, SQLAlchemy 2, Alembic, Postgres on
  Railway. Ingestion modules pull race data from Wikipedia, Al Kamel
  CSVs, fiawec.com, and the Internet Archive (for past-season images).

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
    ├── messages/                # next-intl catalogs (en.json, ko.json)
    ├── public/
    │   ├── cars/                # Car-model PNGs/WebPs (slug-keyed)
    │   ├── circuits/            # Track layout SVGs (ISO-3-keyed)
    │   └── drivers/             # Optional driver-photo overrides
    ├── src/
    │   ├── app/(dashboard)/     # Routed pages: home, races, live, ...
    │   ├── app/sitemap.ts       # Dynamic sitemap (all seasons, all routes)
    │   ├── app/robots.ts        # robots.txt
    │   ├── components/          # Shared UI + cards
    │   ├── i18n/                # next-intl config, Accept-Language sniff
    │   └── lib/
    │       ├── api.ts           # Typed API client
    │       ├── car-image.ts     # Server-only public/cars/ lookup
    │       ├── circuit-image.ts # Server-only public/circuits/ lookup
    │       ├── driver-image.ts  # Server-only public/drivers/ lookup
    │       ├── locale-names.ts  # EN/KO names for circuits & events
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
  app.ingest.wikipedia` hourly. The process skips most full off-week pulls,
  keeps hourly race-week metadata/standings refreshes, and polls only the
  active event's Al Kamel timing files every five minutes around sessions.

## License

[MIT](LICENSE) — fan project, not affiliated with FIA / ACO / WEC.
Press images are editorial-use only with manufacturer credit; see
`backend/app/data/car_image_sources.md`.

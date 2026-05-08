# Frontend

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Recharts. SSR by
default; client components only where interaction is needed.

## Setup

```sh
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev   # http://localhost:3000
```

| Var | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL. Set the Railway URL in Vercel for prod. |
| `VERCEL_PROJECT_PRODUCTION_URL` | *(auto)* | Set by Vercel — used for `<meta>` canonical URL. |

## Scripts

```sh
npm run dev          # turbopack dev server
npm run build        # production build
npm start            # serve production build
npm run lint         # eslint
npm test             # vitest run
npm run test:watch   # vitest in watch mode
```

## Project layout

```
frontend/
├── public/
│   ├── cars/        # Car-model images, slug-keyed (.webp/.png/.jpg)
│   ├── circuits/    # Track-layout SVGs, ISO-3 country code keyed
│   ├── drivers/     # Optional driver-photo overrides, by driver id
│   └── *.svg
├── src/
│   ├── app/
│   │   ├── (dashboard)/     # All routed pages share the dashboard layout
│   │   │   ├── page.tsx               # Home — recap when past, schedule when live
│   │   │   ├── races/[id]/            # Race detail (Q sectors, V-max, weather)
│   │   │   ├── live/
│   │   │   ├── standings/
│   │   │   ├── drivers/
│   │   │   ├── teams/
│   │   │   ├── cars/[slug]/page.tsx   # Car-model detail (specs, stats, teams)
│   │   │   ├── rules/
│   │   │   ├── circuits/
│   │   │   ├── stats/
│   │   │   └── error.tsx              # In-tree error boundary
│   │   └── global-error.tsx           # Root crash fallback
│   ├── components/          # Shared UI + feature cards
│   └── lib/
│       ├── api.ts           # Typed API client + helpers
│       ├── car-image.ts     # Server-only fs lookup for /public/cars
│       ├── circuit-image.ts # Server-only fs lookup for /public/circuits
│       ├── driver-image.ts  # Server-only fs lookup for /public/drivers
│       └── season.ts        # Cookie-backed season selector
└── vitest.config.ts
```

## Adding a car / circuit / driver image

All three follow the same "drop the file, no code" pattern. The
matching `lib/*-image.ts` does an `fs.existsSync` server-side at
render time.

| Folder | Filename convention | Source |
| --- | --- | --- |
| `public/cars/{slug}.{webp,png,jpg}` | model slug from `/api/v1/cars` | press kits, see `backend/app/data/car_image_sources.md` |
| `public/circuits/{iso3}.svg` | lowercase ISO-3 country code | Wikimedia Commons (CC-BY-SA), one circuit per country in WEC |
| `public/drivers/{driver_id}.{jpg,webp,png}` | numeric id from `/api/v1/drivers` | only needed when the Wikipedia thumbnail is missing or low quality |

Slug lookup:
```sh
curl https://wec-dashboard-production.up.railway.app/api/v1/cars?year=2026 \
  | jq -r '.[] | "\(.slug) — \(.name)"'
```

## Conventions

- **Server components by default.** Only add `"use client"` when you
  need state, hover, or browser APIs.
- **API client is typed.** Add new endpoints to `lib/api.ts` with a
  matching `type` and the appropriate `revalidate` hint:
  - 5–10 min for live race weekend data,
  - 10 min for standings,
  - 1 hour for entries / circuits / car models.
- **camelCase everywhere.** Backend serializes via Pydantic alias
  generator; never type a snake_case field on the frontend.
- **Tailwind 4 + shadcn/ui.** Use `cn()` from `lib/utils.ts` for
  conditional classes. Card / Tabs / Table components are wrapped in
  `components/ui/`.
- **Emoji used sparingly** — the only intentional uses are the
  weather-condition badge (☀️ / ⛅ / 🌧️ + 💧 humidity) and the recap
  hero trophy. Date formatting goes through `date-fns`.

## Tests

Vitest, one file per testable module:

```sh
npm test
# ✓ src/lib/api.test.ts (12 tests)
```

Server-only modules (`car-image.ts`, anything calling `node:fs`) are
skipped — keep tests on pure helpers like `eventStatus`,
`describeRounds`, etc.

## Notes on Next 16

This codebase tracks the latest Next.js. Read the relevant guide in
`node_modules/next/dist/docs/` before introducing new patterns — App
Router conventions and caching semantics shift between minors.

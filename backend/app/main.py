from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging import configure_logging
from app.routers import (
    bop,
    cars,
    circuits,
    drivers,
    events,
    health,
    manufacturers,
    seasons,
    standings,
    stats,
    teams,
)

configure_logging()
app = FastAPI(title="WEC Dashboard API", version="0.1.0")

# CORS — locked to localhost dev, the canonical public domain, the
# production Vercel alias, and preview deploys from this repo's owner.
# Loose ".*\\.vercel\\.app" globs match forks, so once the repo is public
# we don't want them.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://wecdash.com",
        "https://www.wecdash.com",
        "https://wec-dashboard-seven.vercel.app",
    ],
    allow_origin_regex=(
        r"^https://wec-dashboard-[a-z0-9-]+-maysun0907\.vercel\.app$"
    ),
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)

# All resource routers live under /api/v1
API_V1_PREFIX = "/api/v1"
app.include_router(seasons.router, prefix=API_V1_PREFIX)
app.include_router(events.router, prefix=API_V1_PREFIX)
app.include_router(standings.router, prefix=API_V1_PREFIX)
app.include_router(drivers.router, prefix=API_V1_PREFIX)
app.include_router(teams.router, prefix=API_V1_PREFIX)
app.include_router(cars.router, prefix=API_V1_PREFIX)
app.include_router(bop.router, prefix=API_V1_PREFIX)
app.include_router(manufacturers.router, prefix=API_V1_PREFIX)
app.include_router(circuits.router, prefix=API_V1_PREFIX)
app.include_router(stats.router, prefix=API_V1_PREFIX)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "wec-dashboard-api",
        "version": "0.1.0",
        "environment": settings.environment,
    }

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

from app.admission import ApiAdmissionMiddleware
from app.config import settings
from app.db import engine
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
log = structlog.get_logger(__name__)
app = FastAPI(title="WEC Dashboard API", version="0.1.0")

# Add the admission gate before CORS. Starlette inserts newly-added
# middleware at the outside of the stack, so CORS remains outermost and also
# decorates overload responses with the appropriate allow-origin header.
app.add_middleware(
    ApiAdmissionMiddleware,
    max_concurrency=settings.api_max_concurrency,
    wait_timeout=settings.api_admission_timeout_seconds,
    retry_after=settings.api_retry_after_seconds,
)

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
        r"^https://wec-dashboard-[a-z0-9-]+-(?:maysun0907|erins-projects-122e4cb5)\.vercel\.app$"
    ),
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(SQLAlchemyTimeoutError)
async def database_pool_timeout(
    request: Request,
    _exc: SQLAlchemyTimeoutError,
) -> JSONResponse:
    log.warning(
        "database_pool_timeout",
        path=request.url.path,
        pool_status=engine.pool.status(),
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Service temporarily unavailable",
            "code": "database_pool_timeout",
        },
        headers={
            "Retry-After": str(settings.api_retry_after_seconds),
            "Cache-Control": "no-store",
        },
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

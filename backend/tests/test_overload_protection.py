import asyncio

import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from starlette.responses import JSONResponse

from app.admission import ApiAdmissionMiddleware
from app.config import Settings, settings
from app.db import _engine_options, get_db
from app.main import app


class ControlledApp:
    def __init__(self) -> None:
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.paths: list[str] = []

    async def __call__(self, scope, receive, send) -> None:
        path = scope["path"]
        self.paths.append(path)
        if path == "/api/v1/hold":
            self.entered.set()
            await self.release.wait()
        response = JSONResponse({"path": path})
        await response(scope, receive, send)


class BurstApp:
    def __init__(self, expected_active: int) -> None:
        self.expected_active = expected_active
        self.active = 0
        self.max_active = 0
        self.full = asyncio.Event()
        self.release = asyncio.Event()

    async def __call__(self, scope, receive, send) -> None:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        if self.active == self.expected_active:
            self.full.set()
        try:
            await self.release.wait()
            response = JSONResponse({"status": "ok"})
            await response(scope, receive, send)
        finally:
            self.active -= 1


def test_admission_rejects_excess_api_requests_and_releases_slot() -> None:
    async def scenario() -> None:
        inner = ControlledApp()
        guarded = ApiAdmissionMiddleware(
            inner,
            max_concurrency=1,
            wait_timeout=0.02,
            retry_after=2,
        )
        cors_app = CORSMiddleware(
            guarded,
            allow_origins=["https://wecdash.com"],
            allow_methods=["GET"],
            allow_headers=["*"],
        )

        transport = ASGITransport(app=cors_app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            held = asyncio.create_task(client.get("/api/v1/hold"))
            await asyncio.wait_for(inner.entered.wait(), timeout=1)
            try:
                rejected = await client.get(
                    "/api/v1/next",
                    headers={"Origin": "https://wecdash.com"},
                )
            finally:
                inner.release.set()

            first = await held
            available_again = await client.get("/api/v1/next")

        assert first.status_code == 200
        assert rejected.status_code == 503
        assert rejected.json() == {
            "detail": "Service temporarily unavailable",
            "code": "api_overloaded",
        }
        assert rejected.headers["retry-after"] == "2"
        assert rejected.headers["cache-control"] == "no-store"
        assert (
            rejected.headers["access-control-allow-origin"]
            == "https://wecdash.com"
        )
        assert available_again.status_code == 200
        assert inner.paths == ["/api/v1/hold", "/api/v1/next"]

    asyncio.run(scenario())


def test_health_routes_bypass_full_admission_gate() -> None:
    async def scenario() -> None:
        inner = ControlledApp()
        guarded = ApiAdmissionMiddleware(
            inner,
            max_concurrency=1,
            wait_timeout=0.02,
            retry_after=2,
        )
        transport = ASGITransport(app=guarded)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            held = asyncio.create_task(client.get("/api/v1/hold"))
            await asyncio.wait_for(inner.entered.wait(), timeout=1)
            try:
                health = await client.get("/health")
                health_db = await client.get("/health/db")
            finally:
                inner.release.set()
            await held

        assert health.status_code == 200
        assert health_db.status_code == 200
        assert inner.paths == ["/api/v1/hold", "/health", "/health/db"]

    asyncio.run(scenario())


def test_burst_is_bounded_and_excess_requests_fail_fast_without_500() -> None:
    async def scenario() -> None:
        concurrency = 8
        total_requests = 120
        inner = BurstApp(expected_active=concurrency)
        guarded = ApiAdmissionMiddleware(
            inner,
            max_concurrency=concurrency,
            wait_timeout=0.02,
            retry_after=2,
        )
        transport = ASGITransport(app=guarded)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            admitted = [
                asyncio.create_task(client.get(f"/api/v1/work/{index}"))
                for index in range(concurrency)
            ]
            await asyncio.wait_for(inner.full.wait(), timeout=1)

            # Keep every admitted request behind the barrier. The remaining
            # burst therefore has one deterministic outcome: it times out at
            # the async gate without ever entering the inner application.
            excess = await asyncio.gather(
                *(
                    client.get(f"/api/v1/work/{index}")
                    for index in range(concurrency, total_requests)
                )
            )
            inner.release.set()
            successful = await asyncio.gather(*admitted)

        responses = [*successful, *excess]
        assert (
            sum(response.status_code == 200 for response in responses)
            == concurrency
        )
        assert (
            sum(response.status_code == 503 for response in responses)
            == total_requests - concurrency
        )
        assert all(response.status_code in {200, 503} for response in responses)
        assert inner.max_active == concurrency
        assert inner.active == 0

    asyncio.run(scenario())


def test_sqlalchemy_pool_timeout_maps_to_cors_enabled_503() -> None:
    def unavailable_db():
        raise SQLAlchemyTimeoutError("test pool exhaustion")

    app.dependency_overrides[get_db] = unavailable_db
    try:
        with TestClient(app) as client:
            response = client.get(
                "/health/db",
                headers={"Origin": "https://wecdash.com"},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Service temporarily unavailable",
        "code": "database_pool_timeout",
    }
    assert response.headers["retry-after"] == "2"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["access-control-allow-origin"] == "https://wecdash.com"


def test_cors_wraps_admission_middleware_in_production_app() -> None:
    middleware_classes = [item.cls for item in app.user_middleware]
    assert middleware_classes.index(CORSMiddleware) < middleware_classes.index(
        ApiAdmissionMiddleware
    )
    admission = next(
        item
        for item in app.user_middleware
        if item.cls is ApiAdmissionMiddleware
    )
    assert admission.kwargs == {
        "max_concurrency": settings.api_max_concurrency,
        "wait_timeout": settings.api_admission_timeout_seconds,
        "retry_after": settings.api_retry_after_seconds,
    }


def test_pool_options_apply_only_to_postgresql() -> None:
    sqlite_options = _engine_options("sqlite+pysqlite:///:memory:")
    postgres_options = _engine_options(
        "postgresql+psycopg://user:password@example.invalid/db"
    )

    assert sqlite_options == {"pool_pre_ping": True}
    assert postgres_options == {
        "pool_pre_ping": True,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout_seconds,
    }


@pytest.mark.parametrize("api_max_concurrency", [3, 4])
def test_settings_require_connection_reserve(
    api_max_concurrency: int,
) -> None:
    with pytest.raises(ValueError, match="API_MAX_CONCURRENCY"):
        Settings(
            database_url="sqlite+pysqlite:///:memory:",
            db_pool_size=2,
            db_max_overflow=1,
            api_max_concurrency=api_max_concurrency,
        )

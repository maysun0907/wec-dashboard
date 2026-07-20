"""Bound API concurrency before synchronous handlers consume worker threads."""

from __future__ import annotations

import asyncio

import structlog
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


log = structlog.get_logger(__name__)


class ApiAdmissionMiddleware:
    """Apply short, asynchronous backpressure to versioned API requests.

    Waiting on the semaphore happens on the event loop rather than in AnyIO's
    worker-thread pool. This prevents a burst of synchronous SQLAlchemy
    handlers from occupying every worker while they wait for a DB connection.
    Health probes intentionally bypass the gate because they are not under the
    ``/api/v1`` prefix.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_concurrency: int,
        wait_timeout: float,
        retry_after: int,
    ) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")
        if wait_timeout <= 0:
            raise ValueError("wait_timeout must be positive")
        if retry_after < 1:
            raise ValueError("retry_after must be at least 1")

        self.app = app
        self.max_concurrency = max_concurrency
        self.wait_timeout = wait_timeout
        self.retry_after = retry_after
        self._slots = asyncio.Semaphore(max_concurrency)

    @staticmethod
    def _is_limited(scope: Scope) -> bool:
        if scope["type"] != "http":
            return False
        path = scope.get("path", "")
        return path == "/api/v1" or path.startswith("/api/v1/")

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if not self._is_limited(scope):
            await self.app(scope, receive, send)
            return

        acquired = False
        try:
            await asyncio.wait_for(
                self._slots.acquire(),
                timeout=self.wait_timeout,
            )
            acquired = True
        except TimeoutError:
            path = scope.get("path", "")
            log.warning(
                "api_admission_rejected",
                path=path,
                max_concurrency=self.max_concurrency,
                wait_timeout_seconds=self.wait_timeout,
            )
            response = JSONResponse(
                status_code=503,
                content={
                    "detail": "Service temporarily unavailable",
                    "code": "api_overloaded",
                },
                headers={
                    "Retry-After": str(self.retry_after),
                    "Cache-Control": "no-store",
                },
            )
            await response(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        finally:
            if acquired:
                self._slots.release()

"""Revalidate every known input before skipping a successful season rebuild.

Only hashes and HTTP validators survive cron restarts, not downloaded bodies.
Live-session polls deliberately bypass this gate. A daily unconditional rebuild
also rediscovers optional inputs and applies parser / database repairs.
"""
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import wraps
from hashlib import sha256
from inspect import signature

import httpx
import structlog
from sqlalchemy.exc import SQLAlchemyError

from app import models
from app.db import SessionLocal

RECHECK_AFTER = timedelta(hours=24)
FORMAT_VERSION = 1


@dataclass
class Inputs:
    sources: dict = field(default_factory=dict)
    bodies: dict = field(default_factory=dict)
    consumed: set = field(default_factory=set)
    failed: bool = False


inputs: ContextVar[Inputs | None] = ContextVar("ingest_inputs", default=None)


def fetch_text(url: str, *, headers: dict, timeout: float) -> str:
    """Track successful source inputs; never reuse a body across refreshes."""
    state = inputs.get()
    key = sha256((url + repr(sorted(headers.items()))).encode()).hexdigest()
    if state is not None:
        state.consumed.add(key)
    if state is not None and key in state.bodies:
        return state.bodies[key]
    try:
        response = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
        response.raise_for_status()
    except Exception:
        if state is not None:
            state.failed = True
        raise
    body = response.text
    if state is not None:
        state.sources[key] = {
            "url": url, "headers": headers, "timeout": timeout,
            "hash": sha256(body.encode()).hexdigest(),
            "etag": response.headers.get("etag"),
            "modified": response.headers.get("last-modified"),
        }
        state.bodies[key] = body
    return body


def _unchanged(sources: dict, state: Inputs) -> bool:
    """Even unchanged listing URLs must not hide in-place CSV corrections."""
    for key, source in sources.items():
        headers = {**source["headers"], "Cache-Control": "no-cache"}
        if source.get("etag"):
            headers["If-None-Match"] = source["etag"]
        elif source.get("modified"):
            headers["If-Modified-Since"] = source["modified"]
        response = httpx.get(source["url"], headers=headers,
                             timeout=source["timeout"], follow_redirects=True)
        if response.status_code == 304:
            if not (source.get("etag") or source.get("modified")):
                return False
            continue
        response.raise_for_status()
        body = response.text
        digest = sha256(body.encode()).hexdigest()
        state.sources[key] = {**source, "hash": digest,
                              "etag": response.headers.get("etag"),
                              "modified": response.headers.get("last-modified")}
        state.bodies[key] = body
        if digest != source["hash"]:
            return False
    return True


def unchanged_sources(kind: str):
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            arguments = signature(function).bind(*args, **kwargs)
            arguments.apply_defaults()
            year = arguments.arguments["year"]
            invocation = dict(arguments.arguments)
            scope = f"{kind}:{year}"
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            log = structlog.get_logger(__name__)
            try:
                with SessionLocal() as db:
                    checkpoint = db.get(models.IngestCheckpoint, scope)
                    previous = checkpoint.manifest if checkpoint else None
                    fresh = (checkpoint is not None
                             and timedelta(0) <= now - checkpoint.completed_at < RECHECK_AFTER)
            except SQLAlchemyError as exc:
                # This optimization must not disable ingestion during a
                # checkpoint schema/cache outage. Do not record a new marker.
                log.warning("ingest_checkpoint_unavailable", scope=scope, error=str(exc))
                return function(*args, **kwargs)
            state = Inputs()
            if (fresh and previous and previous.get("version") == FORMAT_VERSION
                    and previous.get("invocation") == invocation):
                try:
                    if previous["sources"] and _unchanged(previous["sources"], state):
                        log.info("ingest_sources_unchanged", scope=scope,
                                 sources=len(previous["sources"]))
                        return {"unchanged": True, "sources_checked": len(previous["sources"])}
                except Exception as exc:
                    # A failed check is not evidence of unchanged data. Retry
                    # through the normal collector with its validation guards.
                    log.warning("ingest_source_check_failed", scope=scope, error=str(exc))
                    state = Inputs()
            # Preflight bodies can be reused, but only inputs actually consumed
            # by this rebuild belong in the next dependency manifest.
            # Invalidate before running: a failed/partial refresh must never
            # leave an older success marker eligible to suppress the retry.
            with SessionLocal() as db:
                checkpoint = db.get(models.IngestCheckpoint, scope)
                if checkpoint:
                    db.delete(checkpoint)
                    db.commit()
            token = inputs.set(state)
            try:
                result = function(*args, **kwargs)
                sources = {key: state.sources[key] for key in state.consumed
                           if key in state.sources}
                if sources and not state.failed:
                    with SessionLocal() as db:
                        db.merge(models.IngestCheckpoint(
                            scope=scope, completed_at=now,
                            manifest={"version": FORMAT_VERSION, "invocation": invocation,
                                      "sources": sources},
                        ))
                        db.commit()
                    log.info("ingest_source_checkpoint_saved", scope=scope, sources=len(sources))
                elif state.failed:
                    log.warning("ingest_source_checkpoint_rejected", scope=scope,
                                reason="incomplete_source_checks")
                return result
            finally:
                inputs.reset(token)
        return wrapped
    return decorate

"""Durable collector health, separate from API process/database liveness.

Uses a reserved checkpoint namespace; these rows are never source-cache
markers. Public status contains timestamps and outcomes, not exception text.
"""
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy.exc import SQLAlchemyError

from app import models
from app.db import SessionLocal


def record_status(year: int, kind: str, outcome: str) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    scope = f"health:{year}:{kind}"
    try:
        with SessionLocal() as db:
            previous = db.get(models.IngestCheckpoint, scope)
            manifest = dict(previous.manifest) if previous else {}
            manifest.update(outcome=outcome, attempted_at=now.isoformat() + "Z")
            if outcome == "ok":
                manifest["succeeded_at"] = now.isoformat() + "Z"
            db.merge(models.IngestCheckpoint(scope=scope, manifest=manifest, completed_at=now))
            db.commit()
    except SQLAlchemyError:
        # Preserve collection even when observability storage is unavailable;
        # the status endpoint will report missing/stale state independently.
        structlog.get_logger(__name__).exception("ingest_health_write_failed", kind=kind)


def monitored(status_year: int, kind: str, function, *args, **kwargs):
    record_status(status_year, kind, "running")
    try:
        result = function(*args, **kwargs)
    except Exception:
        record_status(status_year, kind, "failed")
        raise
    record_status(status_year, kind, "ok")
    return result


def collector_health(db, year: int, now: datetime, *, race_week: bool, hot: bool) -> dict:
    required = {"full": timedelta(hours=2 if race_week else 8)}
    if hot:
        required["hot"] = timedelta(minutes=15)
    collectors = {}
    for kind, maximum_age in required.items():
        row = db.get(models.IngestCheckpoint, f"health:{year}:{kind}")
        data = row.manifest if row else {}
        success = data.get("succeeded_at")
        try:
            age = now - datetime.fromisoformat(success) if success else None
        except (TypeError, ValueError):
            age = None
        healthy = (data.get("outcome") != "failed" and age is not None
                   and timedelta(0) <= age <= maximum_age)
        collectors[kind] = {"status": "ok" if healthy else "degraded",
                            "outcome": data.get("outcome", "unknown"),
                            "lastAttemptAt": data.get("attempted_at"),
                            "lastSuccessAt": success,
                            "maxAgeSeconds": int(maximum_age.total_seconds())}
    return {"status": "ok" if all(c["status"] == "ok" for c in collectors.values()) else "degraded",
            "year": year, "collectors": collectors}

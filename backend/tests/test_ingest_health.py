from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.db import Base
from app.ingest import status


def test_success_failure_and_freshness_are_separate_from_db_liveness(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(status, "SessionLocal", sessionmaker(bind=engine))
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        assert status.collector_health(db, 2026, now, race_week=False, hot=False)["status"] == "degraded"
    status.monitored(2026, "full", lambda **_: {}, year=2026)
    with Session(engine) as db:
        now = datetime.now(timezone.utc)
        assert status.collector_health(db, 2026, now, race_week=True, hot=False)["status"] == "ok"
        assert status.collector_health(db, 2026, now + timedelta(hours=3), race_week=True, hot=False)["status"] == "degraded"
        assert status.collector_health(db, 2026, now + timedelta(hours=3), race_week=False, hot=False)["status"] == "ok"
        assert status.collector_health(db, 2026, now, race_week=True, hot=True)["status"] == "degraded"
    def fail():
        raise ValueError("private source error")
    with pytest.raises(ValueError):
        status.monitored(2026, "full", fail)
    with Session(engine) as db:
        row = db.get(models.IngestCheckpoint, "health:2026:full")
        assert row.manifest["succeeded_at"]
        assert "private" not in str(row.manifest)
        assert status.collector_health(db, 2026, now, race_week=False, hot=False)["status"] == "degraded"
    engine.dispose()


def test_missing_status_storage_is_degraded_not_an_unhandled_exception(monkeypatch):
    from fastapi import Response
    from app.ingest import scheduled
    from app.routers.health import health_ingest
    engine = create_engine("sqlite://")
    monkeypatch.setattr(scheduled, "load_schedule", lambda _: scheduled.ScheduleSnapshot())
    with Session(engine) as db:
        response = Response()
        assert health_ingest(response, db)["status"] == "degraded"
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
    engine.dispose()

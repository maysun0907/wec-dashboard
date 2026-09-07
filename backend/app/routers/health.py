from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}


@router.get("/health/ingest")
def health_ingest(response: Response, db: Session = Depends(get_db)) -> dict:
    from app.ingest.scheduled import active_sessions, is_race_week, load_schedule
    from app.ingest.status import collector_health
    now = datetime.now(timezone.utc)
    try:
        snapshot = load_schedule(now.year)
        result = collector_health(db, now.year, now, race_week=is_race_week(snapshot, now),
                                  hot=bool(active_sessions(snapshot, now)))
    except SQLAlchemyError:
        db.rollback()
        result = {"status": "degraded", "year": now.year, "reason": "status_unavailable"}
    response.headers["Cache-Control"] = "no-store"
    if result["status"] != "ok":
        response.status_code = 503
    return result

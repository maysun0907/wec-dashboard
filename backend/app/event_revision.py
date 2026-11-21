"""A compact change token for browsers following an active race."""

import json
import time
from functools import lru_cache
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import SessionLocal

REVISION_CACHE_SECONDS = 15


def event_revision(db: Session, event_id: int) -> str | None:
    event = db.execute(
        select(models.Event.id, models.Event.name, models.Event.round,
               models.Event.date_start, models.Event.date_end, models.Event.format,
               models.Event.poster_url, models.Circuit.id, models.Circuit.name,
               models.Circuit.country)
        .join(models.Circuit, models.Event.circuit_id == models.Circuit.id)
        .where(models.Event.id == event_id)
    ).first()
    if event is None:
        return None
    session = models.Session
    sessions = db.execute(
        select(session.id, session.type, session.start_time, session.result_status,
               session.result_source_url, session.lap_chart_json,
               session.air_temp_c, session.track_temp_c, session.humidity_pct,
               session.wind_kph, session.rain)
        .where(session.event_id == event_id)
        .order_by(session.id)
    )
    result = models.SessionResult
    # Exclude result row IDs: an atomic rebuild can recreate identical rows.
    # Do not hash the poll timestamp: re-ingesting identical data should not
    # make every open browser refresh.
    columns = [column for column in result.__table__.c if column.key != "id"]
    results = db.execute(
        select(*columns)
        .join(session, result.session_id == session.id)
        .where(session.event_id == event_id)
        .order_by(result.session_id, result.car_id, result.position, result.id)
    )
    stop = models.PitStopEvent
    stops = db.execute(
        select(stop.session_id, stop.car_id, stop.lap_number, stop.duration_ms)
        .join(session, stop.session_id == session.id)
        .where(session.event_id == event_id)
        .order_by(stop.session_id, stop.car_id, stop.lap_number, stop.duration_ms)
    )
    payload = (tuple(event), [tuple(row) for row in sessions],
               [tuple(row) for row in results], [tuple(row) for row in stops])
    return sha256(json.dumps(payload, separators=(",", ":"), default=str).encode()).hexdigest()


@lru_cache(maxsize=256)
def _cached_revision(event_id: int, bucket: int) -> str | None:
    with SessionLocal() as db:
        return event_revision(db, event_id)


def get_event_revision(event_id: int) -> str | None:
    return _cached_revision(event_id, int(time.monotonic()) // REVISION_CACHE_SECONDS)

"""Adaptive Railway cron orchestration for current-season ingestion.

Railway starts ``wec-cron`` once per hour. Most championship data is static
between race weekends, while Al Kamel timing files appear throughout a live
session. This module keeps the existing hourly platform schedule but, only
when a session overlaps the next hour, keeps that one cron process alive for
at most 54 minutes and refreshes the relevant event every five minutes.

The bounded loop avoids changing the shared ``railway.toml`` (which is also
used by the always-on API service) and always exits before the next hourly
invocation.
"""

from __future__ import annotations

import os
import re
import time as time_module
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

import structlog
from sqlalchemy import text

from app import models
from app.db import SessionLocal, engine
from app.ingest.wikipedia import SourceDataError
from app.logging import configure_logging


UTC = timezone.utc
COLD_FULL_INGEST_HOURS = 6
HOT_POLL_SECONDS = 5 * 60
# Never occupy an entire hourly Railway cron interval.
HOT_LOOP_MAX_SECONDS = 54 * 60
NEXT_CRON_SAFETY_SECONDS = 2 * 60
SESSION_PRE_START = timedelta(minutes=20)
PRACTICE_AND_QUALIFYING_WINDOW = timedelta(hours=3)
RESULT_PUBLICATION_GRACE = timedelta(hours=3)
SCHEDULER_LOCK_ID = 24_575_701_880_542_024  # stable "WEC DASH" advisory key


@dataclass(frozen=True)
class EventSchedule:
    id: int
    season_id: int
    year: int
    round: int
    name: str
    date_start: date
    date_end: date


@dataclass(frozen=True)
class SessionSchedule:
    event_id: int
    type: str
    start_time: datetime


@dataclass(frozen=True)
class ScheduleSnapshot:
    events: tuple[EventSchedule, ...] = ()
    sessions: tuple[SessionSchedule, ...] = ()


@dataclass(frozen=True)
class IngestPlan:
    run_full_ingest: bool
    keep_hot_loop: bool
    reason: str


def _as_utc(value: datetime) -> datetime:
    """Treat DB-naive session timestamps as UTC and normalize aware values."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _race_duration(event_name: str) -> timedelta:
    match = re.search(r"\b(\d{1,2})\s+Hours?\b", event_name, re.IGNORECASE)
    if match:
        return timedelta(hours=int(match.group(1)))
    lowered = event_name.casefold()
    if "lone star le mans" in lowered:
        return timedelta(hours=6)
    if "qatar" in lowered or "1812" in lowered:
        return timedelta(hours=10)
    return timedelta(hours=8)


def hot_window(
    session: SessionSchedule,
    event: EventSchedule,
) -> tuple[datetime, datetime]:
    start = _as_utc(session.start_time)
    if session.type == "RACE":
        duration = _race_duration(event.name) + RESULT_PUBLICATION_GRACE
    else:
        duration = PRACTICE_AND_QUALIFYING_WINDOW
    return start - SESSION_PRE_START, start + duration


def active_sessions(
    snapshot: ScheduleSnapshot,
    now: datetime,
) -> tuple[SessionSchedule, ...]:
    current = _as_utc(now)
    events = {event.id: event for event in snapshot.events}
    return tuple(
        session
        for session in snapshot.sessions
        if session.event_id in events
        and hot_window(session, events[session.event_id])[0]
        <= current
        <= hot_window(session, events[session.event_id])[1]
    )


def has_hot_window_between(
    snapshot: ScheduleSnapshot,
    start: datetime,
    end: datetime,
) -> bool:
    window_start = _as_utc(start)
    window_end = _as_utc(end)
    events = {event.id: event for event in snapshot.events}
    for session in snapshot.sessions:
        event = events.get(session.event_id)
        if event is None:
            continue
        hot_start, hot_end = hot_window(session, event)
        if hot_start <= window_end and hot_end >= window_start:
            return True
    return False


def is_race_week(snapshot: ScheduleSnapshot, now: datetime) -> bool:
    """Race week spans Monday of the event week through two days after it.

    Using the calendar week rather than the first published session keeps the
    backend's hourly metadata refresh aligned with the frontend's short-cache
    window even when a timetable is added or corrected early in race week.
    """
    current = _as_utc(now)
    for event in snapshot.events:
        event_week_monday = event.date_start - timedelta(
            days=event.date_start.weekday()
        )
        opens = datetime.combine(event_week_monday, time.min, tzinfo=UTC)
        closes = datetime.combine(
            event.date_end + timedelta(days=3),
            time.min,
            tzinfo=UTC,
        )
        if opens <= current < closes:
            return True
    return False


def build_ingest_plan(
    snapshot: ScheduleSnapshot,
    now: datetime,
    *,
    loop_seconds: int = HOT_LOOP_MAX_SECONDS,
) -> IngestPlan:
    current = _as_utc(now)
    hot_soon = has_hot_window_between(
        snapshot,
        current,
        current + timedelta(seconds=loop_seconds),
    )
    if not snapshot.events:
        return IngestPlan(True, False, "schedule_missing")
    if is_race_week(snapshot, current):
        return IngestPlan(True, hot_soon, "race_week")
    if current.hour % COLD_FULL_INGEST_HOURS == 0:
        return IngestPlan(True, hot_soon, "cold_six_hour_refresh")
    return IngestPlan(False, hot_soon, "cold_skip")


def hot_loop_budget_seconds(started_at: datetime) -> float:
    """Cap runtime and stop before the next UTC top-of-hour cron slot."""
    current = _as_utc(started_at)
    next_hour = current.replace(minute=0, second=0, microsecond=0) + timedelta(
        hours=1
    )
    until_safe_exit = (
        next_hour - current
    ).total_seconds() - NEXT_CRON_SAFETY_SECONDS
    return max(0.0, min(float(HOT_LOOP_MAX_SECONDS), until_safe_exit))


def adaptive_scheduler_enabled(
    environ: Mapping[str, str] | None = None,
) -> bool:
    env = os.environ if environ is None else environ
    override = env.get("ADAPTIVE_INGEST")
    if override is not None:
        return override.strip().casefold() in {"1", "true", "yes", "on"}
    return env.get("RAILWAY_SERVICE_NAME") == "wec-cron"


def load_schedule(year: int) -> ScheduleSnapshot:
    db = SessionLocal()
    try:
        season = db.query(models.Season).filter(models.Season.year == year).first()
        if season is None:
            return ScheduleSnapshot()
        event_rows = (
            db.query(models.Event)
            .filter(models.Event.season_id == season.id)
            .order_by(models.Event.round)
            .all()
        )
        events = tuple(
            EventSchedule(
                id=event.id,
                season_id=season.id,
                year=season.year,
                round=event.round,
                name=event.name,
                date_start=event.date_start,
                date_end=event.date_end,
            )
            for event in event_rows
        )
        event_ids = [event.id for event in event_rows]
        if not event_ids:
            return ScheduleSnapshot(events=events)
        session_rows = (
            db.query(models.Session)
            .filter(
                models.Session.event_id.in_(event_ids),
                models.Session.start_time.is_not(None),
            )
            .all()
        )
        sessions = tuple(
            SessionSchedule(
                event_id=session.event_id,
                type=session.type,
                start_time=session.start_time,
            )
            for session in session_rows
            if session.start_time is not None
        )
        return ScheduleSnapshot(events=events, sessions=sessions)
    finally:
        db.close()


@contextmanager
def scheduler_lock() -> Iterator[bool]:
    """Prevent duplicate collectors without adding a bookkeeping table."""
    if engine.dialect.name != "postgresql":
        yield True
        return

    # Keep one physical connection checked out so the session-level advisory
    # lock cannot migrate to another pooled connection. Commit the lock SELECT
    # immediately to avoid an hour-long idle-in-transaction session.
    with engine.connect() as connection:
        acquired = bool(
            connection.execute(
                text("SELECT pg_try_advisory_lock(:lock_id)"),
                {"lock_id": SCHEDULER_LOCK_ID},
            ).scalar()
        )
        connection.commit()
        try:
            yield acquired
        finally:
            if acquired:
                if connection.in_transaction():
                    connection.rollback()
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": SCHEDULER_LOCK_ID},
                )
                connection.commit()


def refresh_active_sessions(
    snapshot: ScheduleSnapshot,
    now: datetime,
) -> dict[str, int]:
    """Refresh only the active event/session families from Al Kamel."""
    from app.ingest.alkamel import (
        enrich_qualifying_drivers,
        enrich_race_results,
        enrich_session_weather,
        ingest_practice_results,
    )

    current_sessions = active_sessions(snapshot, now)
    by_event: dict[int, set[str]] = {}
    for session in current_sessions:
        by_event.setdefault(session.event_id, set()).add(session.type)
    events = {event.id: event for event in snapshot.events}
    summary = {
        "practice_rows": 0,
        "qualifying_rows": 0,
        "race_rows": 0,
        "weather_sessions": 0,
    }

    db = SessionLocal()
    try:
        for event_id, session_types in by_event.items():
            event = events[event_id]
            practice_types = session_types.intersection({"FP1", "FP2", "FP3"})
            if practice_types:
                summary["practice_rows"] += ingest_practice_results(
                    db,
                    event.season_id,
                    event.year,
                    event_id=event.id,
                    session_types=practice_types,
                )
            if "Q" in session_types:
                summary["qualifying_rows"] += enrich_qualifying_drivers(
                    db,
                    event.season_id,
                    event.year,
                    event_id=event.id,
                )
            if "RACE" in session_types:
                # Al Kamel can update a CSV in place without changing its URL,
                # so a hot poll must refetch rather than deduplicating by URL.
                summary["race_rows"] += enrich_race_results(
                    db,
                    event.season_id,
                    event.year,
                    event_id=event.id,
                )
            summary["weather_sessions"] += enrich_session_weather(
                db,
                event.season_id,
                event.year,
                event_id=event.id,
                session_types=session_types,
            )
        # Existing collectors commit progressively for their CLI callers. The
        # final commit also keeps future flush-only targeted collectors durable;
        # rollback below applies to work not already committed by a helper.
        db.commit()
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def run_scheduled_ingest(
    *,
    year: int,
    url: str,
    ingest_once: Callable[..., dict],
    now_fn: Callable[[], datetime] = _utc_now,
    monotonic_fn: Callable[[], float] = time_module.monotonic,
    sleep_fn: Callable[[float], None] = time_module.sleep,
) -> None:
    """Run one adaptive hourly Railway cron invocation."""
    configure_logging()
    log = structlog.get_logger(__name__)
    started_at = _as_utc(now_fn())
    started_monotonic = monotonic_fn()
    loop_budget = hot_loop_budget_seconds(started_at)
    deadline_monotonic = started_monotonic + loop_budget

    with scheduler_lock() as acquired:
        if not acquired:
            log.info("scheduled_ingest_skipped", reason="collector_already_running")
            return

        try:
            snapshot = load_schedule(year)
            plan = build_ingest_plan(snapshot, started_at)
        except Exception as exc:
            # A stale or unavailable schedule must not prevent the full ingest
            # that can repair it.
            log.warning("ingest_schedule_unavailable", error=str(exc))
            snapshot = ScheduleSnapshot()
            plan = IngestPlan(True, False, "schedule_error")

        if plan.run_full_ingest:
            log.info("scheduled_full_ingest", reason=plan.reason, year=year)
            try:
                ingest_once(year=year, url=url)
            except SourceDataError as exc:
                # Retain the last snapshot, but do not let a season-page
                # failure disable independent live timing refreshes.
                log.error(
                    "scheduled_full_ingest_source_rejected",
                    year=year,
                    error=str(exc),
                )
            snapshot = load_schedule(year)
        else:
            log.info("scheduled_ingest_skipped", reason=plan.reason, year=year)

        now = _as_utc(now_fn())
        remaining = max(0.0, deadline_monotonic - monotonic_fn())
        if not has_hot_window_between(
            snapshot,
            now,
            now + timedelta(seconds=remaining),
        ):
            return

        log.info(
            "hot_ingest_loop_started",
            poll_seconds=HOT_POLL_SECONDS,
            max_seconds=loop_budget,
        )
        while True:
            remaining = deadline_monotonic - monotonic_fn()
            if remaining <= 0:
                break
            sleep_fn(min(HOT_POLL_SECONDS, remaining))
            if monotonic_fn() >= deadline_monotonic:
                break

            now = _as_utc(now_fn())
            try:
                snapshot = load_schedule(year)
            except Exception as exc:
                # A transient DB/network event should cost one tick, not the
                # rest of the live-session refresh window.
                log.warning("hot_ingest_schedule_failed", error=str(exc))
                continue
            wall_deadline = now + timedelta(
                seconds=max(0.0, deadline_monotonic - monotonic_fn())
            )
            if not has_hot_window_between(snapshot, now, wall_deadline):
                break
            sessions = active_sessions(snapshot, now)
            if not sessions:
                continue
            try:
                summary = refresh_active_sessions(snapshot, now)
            except Exception as exc:
                log.exception("hot_ingest_failed", error=str(exc))
                continue
            log.info(
                "hot_ingest_completed",
                active_session_types=sorted({session.type for session in sessions}),
                **summary,
            )
        log.info("hot_ingest_loop_completed")

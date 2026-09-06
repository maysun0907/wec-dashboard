from datetime import date
from datetime import datetime, timezone
from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.db import Base
from app.ingest import alkamel, wikipedia
from app.ingest import scheduled
from app.routers.events import session_lap_chart
from app.routers.stats import _championship_titles, _driver_wins_and_podiums


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    # Python's legacy SQLite transaction mode otherwise releases outermost
    # SAVEPOINTs as commits, unlike production PostgreSQL.
    @event.listens_for(engine, "connect")
    def connect(connection, _):
        connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def begin(connection):
        connection.exec_driver_sql("BEGIN")

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def fixture_rows(db):
    season = models.Season(year=2020, championship_name="WEC")
    circuit = models.Circuit(name="Spa", country="BEL", length_km=7)
    team = models.Team(name="Team")
    rc = models.RaceClass(name="HYPERCAR")
    drivers = [models.Driver(name=n) for n in ("Full Season", "Substitute")]
    db.add_all([season, circuit, team, rc, *drivers]); db.flush()
    car = models.Car(season_id=season.id, team_id=team.id, race_class_id=rc.id, number="1")
    db.add(car); db.flush()
    for driver, rounds in zip(drivers, ("1", "2")):
        db.add(models.CarDriver(car_id=car.id, driver_id=driver.id, season_id=season.id, rounds=rounds))
    for rnd in (1, 2):
        ev = models.Event(season_id=season.id, circuit_id=circuit.id, round=rnd, name="6 Hours", date_start=date(2020,rnd,1), date_end=date(2020,rnd,1))
        db.add(ev); db.flush()
        race = models.Session(event_id=ev.id, type="RACE")
        db.add(race); db.flush()
        db.add(models.SessionResult(session_id=race.id, car_id=car.id, position=1))
    db.commit()
    return season, circuit, rc, drivers


def test_driver_wins_follow_round_participation(db):
    fixture_rows(db)
    wins, podiums = _driver_wins_and_podiums(db)
    assert {r["name"]: r["wins"] for r in wins} == {"Full Season": 1, "Substitute": 1}
    assert [r["podiums"] for r in podiums] == [1, 1]


def test_actual_race_lineup_overrides_scheduled_lineup(db):
    fixture_rows(db)
    for row in db.query(models.SessionResult):
        row.drivers = "Substitute"
    db.commit()
    wins, _ = _driver_wins_and_podiums(db)
    assert [(r["name"], r["wins"]) for r in wins] == [("Substitute", 2)]


def test_current_leader_is_not_a_champion(db):
    season, circuit, rc, drivers = fixture_rows(db)
    db.add(models.StandingDriver(season_id=season.id, driver_id=drivers[0].id, race_class_id=rc.id, position=1, points=100))
    db.commit()
    assert _championship_titles(db, "drivers")[0]["titles"] == 1
    db.add(models.Event(season_id=season.id, circuit_id=circuit.id, round=3, name="Future finale", date_start=date(2099,1,1), date_end=date(2099,1,1)))
    db.commit()
    assert _championship_titles(db, "drivers") == []


def test_missing_lap_chart_does_not_fetch_or_write(db, monkeypatch):
    fixture_rows(db)
    race = db.query(models.Session).first()
    monkeypatch.setattr(alkamel, "resolve_event_params", lambda *_: pytest.fail("network lookup"))
    monkeypatch.setattr(db, "commit", lambda: pytest.fail("GET committed"))
    with pytest.raises(HTTPException) as exc:
        session_lap_chart(race.id, db)
    assert exc.value.status_code == 404


def test_full_ingest_rolls_back_even_after_helper_commit(db, monkeypatch):
    fixture_rows(db)
    engine = db.get_bind()
    db.close()
    monkeypatch.setattr(wikipedia, "engine", engine)
    monkeypatch.setattr(wikipedia, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(wikipedia, "fetch_html", lambda _: "")
    monkeypatch.setattr(wikipedia, "_parse_entry_groups", lambda _: ([], {}))
    monkeypatch.setattr(wikipedia, "_clear_season", lambda session, _: session.query(models.SessionResult).delete())
    def committed_then_failed(_soup, session, *_):
        session.commit()
        raise ValueError("late source failure")
    monkeypatch.setattr(wikipedia, "_ingest_calendar", committed_then_failed)
    with pytest.raises(ValueError, match="late source failure"):
        wikipedia.ingest(2020, "https://example.test")
    with Session(engine) as check:
        assert check.query(models.SessionResult).count() == 2


def test_failed_full_refresh_does_not_disable_hot_timing(monkeypatch):
    now = datetime(2026, 9, 6, 18, tzinfo=timezone.utc)
    snapshot = scheduled.ScheduleSnapshot(
        events=(scheduled.EventSchedule(1, 1, 2026, 5, "Lone Star Le Mans", now.date(), now.date()),),
        sessions=(scheduled.SessionSchedule(1, "RACE", now),),
    )
    @contextmanager
    def lock():
        yield True
    ticks = [0.0]
    refreshes = []
    def rejected(**_):
        raise wikipedia.SourceDataError("season source unavailable")
    monkeypatch.setattr(scheduled, "scheduler_lock", lock)
    monkeypatch.setattr(scheduled, "load_schedule", lambda _: snapshot)
    monkeypatch.setattr(scheduled, "refresh_active_sessions", lambda *_: refreshes.append(True) or {})
    scheduled.run_scheduled_ingest(
        year=2026, url="https://example.test", ingest_once=rejected,
        now_fn=lambda: now, monotonic_fn=lambda: ticks[0],
        sleep_fn=lambda seconds: ticks.__setitem__(0, ticks[0] + seconds),
    )
    assert refreshes

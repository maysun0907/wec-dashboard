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


@pytest.mark.parametrize("error", [wikipedia.SourceDataError("bad source"), ValueError("roster mismatch")])
def test_failed_full_refresh_does_not_disable_hot_timing(monkeypatch, error):
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
        raise error
    monkeypatch.setattr(scheduled, "scheduler_lock", lock)
    monkeypatch.setattr(scheduled, "load_schedule", lambda _: snapshot)
    monkeypatch.setattr(scheduled, "refresh_active_sessions", lambda *_: refreshes.append(True) or {})
    scheduled.run_scheduled_ingest(
        year=2026, url="https://example.test", ingest_once=rejected,
        now_fn=lambda: now, monotonic_fn=lambda: ticks[0],
        sleep_fn=lambda seconds: ticks.__setitem__(0, ticks[0] + seconds),
    )
    assert refreshes


def test_live_results_never_count_as_career_wins(db):
    from app.routers.drivers import _driver_career, get_driver
    from app.routers.teams import _team_career
    _, _, _, drivers = fixture_rows(db)
    races = db.query(models.Session).order_by(models.Session.id).all()
    races[0].result_status = "live"  # still live even if the scheduled date is old
    races[1].result_status = "completed"
    db.commit()
    assert _driver_career(db, drivers[0].id)[0].races == 0
    assert _driver_career(db, drivers[1].id)[0].wins == 1
    assert get_driver(drivers[0].id, year=2020, db=db).results == []
    assert _team_career(db, db.query(models.Team).one().id)[0].races == 1
    wins, _ = _driver_wins_and_podiums(db)
    assert [r["name"] for r in wins] == ["Substitute"]


def test_manufacturer_uses_vehicle_brand_not_team_default(db):
    from app.routers.manufacturers import get_manufacturer
    fixture_rows(db)
    brands = [models.Manufacturer(name=n) for n in ("Ford", "Porsche")]
    db.add_all(brands); db.flush()
    car = db.query(models.Car).one()
    car.team.manufacturer_id = brands[0].id
    model = models.CarModel(slug="963", name="963", manufacturer_id=brands[1].id)
    db.add(model); db.flush()
    car.car_model_id = model.id
    db.commit()
    assert get_manufacturer(brands[0].id, 2020, db).cars == []
    assert len(get_manufacturer(brands[1].id, 2020, db).cars) == 1


def test_published_hour_not_weather_controls_latest_race_file(monkeypatch):
    prefix = "Results/15_2026/05_COTA/673_FIA%20WEC/202609061300_Race/"
    html = (f'<a href="{prefix}01_Hour%201/03_Classification_Race.CSV">x</a>'
            f'<a href="{prefix}02_Hour%202/26_Weather_Race.CSV">x</a>')
    monkeypatch.setattr(alkamel, "_event_html", lambda *_: html)
    assert "01_Hour" in alkamel._list_race_csvs("15_2026", "05_COTA")[1]


def test_race_state_distinguishes_full_duration_from_final():
    prefix = "Results/15_2026/05_COTA/673_FIA%20WEC/202609061300_Race/"
    assert alkamel.race_result_status(prefix + "01_Hour%201/03_Classification_Race.CSV", "Lone Star Le Mans") == "live"
    assert alkamel.race_result_status(prefix + "06_Hour%206/03_Classification_Race.CSV", "Lone Star Le Mans") == "completed"
    assert alkamel.race_result_status(prefix + "06_Hour%206/03_Classification_Race_Final.CSV", "Lone Star Le Mans") == "final"


def test_timing_cache_expires_between_refreshes(monkeypatch):
    from app.ingest.snapshot import source_snapshot
    calls = []
    class Response:
        text = "source"
        def raise_for_status(self): pass
    monkeypatch.setattr(alkamel.httpx, "get", lambda *args, **kwargs: calls.append(args[0]) or Response())
    @source_snapshot
    def refresh():
        alkamel._fetch("https://example.test/file")
        alkamel._fetch("https://example.test/file")
    refresh(); refresh()
    assert len(calls) == 2


def test_reingest_preserves_car_id_and_image(db, monkeypatch):
    season, _, rc, _ = fixture_rows(db)
    car = db.query(models.Car).one()
    stable_id = car.id
    car.image_url = "https://example.test/car.png"
    db.commit()
    wikipedia._clear_season(db, season.id)
    monkeypatch.setattr(wikipedia, "fetch_manufacturer_logo", lambda _: None)
    wikipedia._ingest_entries(db, season.id, {rc.name:rc.id}, [{
        "car":"Ferrari 499P", "entrant":"Team", "race_class":rc.name,
        "number":"1", "drivers":[{"name":"Full Season", "rounds":"All"}],
    }], {})
    db.commit()
    car = db.query(models.Car).one()
    assert car.id == stable_id
    assert car.image_url == "https://example.test/car.png"


def test_download_slug_cannot_escape_output_directory():
    from app.fetch_car_image import fetch
    with pytest.raises(ValueError, match="slug"):
        fetch("../../unexpected", "https://example.test/image.png")

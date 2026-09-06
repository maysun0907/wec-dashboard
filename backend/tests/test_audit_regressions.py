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


def test_revision_deduplicates_unflushed_changes(db):
    from app.ingest.revisions import record_revision
    db.autoflush = False
    kwargs = dict(scope="test", source_url="https://example.test", payload={"x": 1})
    assert record_revision(db, **kwargs)
    assert not record_revision(db, **kwargs)
    db.commit()
    assert db.query(models.SourceRevision).count() == 1


def test_seed_requires_explicit_local_confirmation(db, monkeypatch):
    from app.seed import _assert_local_seed_allowed
    monkeypatch.delenv("ALLOW_LOCAL_SEED", raising=False)
    with pytest.raises(RuntimeError, match="local development"):
        _assert_local_seed_allowed(db)
    monkeypatch.setenv("ALLOW_LOCAL_SEED", "delete-local-data")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("RAILWAY_ENVIRONMENT_ID", raising=False)
    _assert_local_seed_allowed(db)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_ID", "production")
    with pytest.raises(RuntimeError):
        _assert_local_seed_allowed(db)


def test_blank_round_attendance_is_full_season():
    from app.rounds import driver_in_round
    assert driver_in_round("  ", 2)


@pytest.mark.parametrize("lap, expected", [("1:23.1", 83100), ("1:23.12", 83120), ("1:23.123", 83123), ("1:63.123", None), ("DNF", None)])
def test_lap_fraction_precision(lap, expected):
    assert alkamel._lap_to_ms(lap) == expected


def test_missing_or_empty_calendar_preserves_events(db, monkeypatch):
    from bs4 import BeautifulSoup
    season, *_ = fixture_rows(db)
    soup = BeautifulSoup("<html></html>", "lxml")
    with pytest.raises(ValueError, match="Calendar table missing"):
        wikipedia._ingest_calendar(soup, db, season.id, 2020)
    monkeypatch.setattr(wikipedia, "find_table_by_heading", lambda *args: soup)
    monkeypatch.setattr(wikipedia, "parse_calendar", lambda *args, **kwargs: [])
    with pytest.raises(ValueError, match="Empty or duplicate"):
        wikipedia._ingest_calendar(soup, db, season.id, 2020)
    assert db.query(models.Event).count() == 2


def test_driver_history_includes_car_changes_and_model_manufacturer(db):
    from app.routers.drivers import get_driver, list_drivers
    season, _, rc, drivers = fixture_rows(db)
    old_car = db.query(models.Car).one()
    manufacturer = models.Manufacturer(name="Correct", logo_url="https://example.test/correct.png")
    db.add(manufacturer); db.flush()
    model = models.CarModel(name="Correct Car", slug="correct-car", manufacturer_id=manufacturer.id)
    db.add(model); db.flush()
    new_car = models.Car(season_id=season.id, team_id=old_car.team_id, race_class_id=rc.id,
                         number="2", car_model_id=model.id)
    db.add(new_car); db.flush()
    db.add(models.CarDriver(car_id=new_car.id, driver_id=drivers[0].id, season_id=season.id, rounds="2"))
    race = db.query(models.Session).join(models.Event).filter(models.Event.round == 2).one()
    result = db.query(models.SessionResult).filter_by(session_id=race.id).one()
    result.car_id = new_car.id
    db.commit()
    detail = get_driver(drivers[0].id, season.year, db)
    assert [row.round for row in detail.results] == [1, 2]
    assert detail.manufacturer == "Correct"
    assert next(row for row in list_drivers(season.year, db) if row.car_number == "2").manufacturer_logo_url == manufacturer.logo_url


def test_cors_allows_only_owned_preview_domains():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        for origin, allowed in [
            ("https://wec-dashboard-abc-erins-projects-122e4cb5.vercel.app", True),
            ("https://wec-dashboard-abc-attacker.vercel.app", False),
        ]:
            response = client.get("/", headers={"Origin": origin})
            assert (response.headers.get("access-control-allow-origin") == origin) is allowed


def test_race_assets_match_event_not_first_circuit_in_country(db, monkeypatch):
    from app.ingest import fiawec_assets, fiawec_schedule
    season, circuit, *_ = fixture_rows(db)
    season.year = 2026
    circuit.country = "ITA"
    other = models.Circuit(name="Monza", country="ITA", length_km=5.7)
    db.add(other); db.flush()
    events = db.query(models.Event).order_by(models.Event.round).all()
    events[0].name = "6 Hours of Imola"
    events[1].name = "6 Hours of Monza"
    events[1].circuit_id = other.id
    db.commit()
    monkeypatch.setattr(fiawec_assets, "_scrape_grid", lambda year: ({}, {}, {}))
    monkeypatch.setattr(fiawec_schedule, "discover_race_slugs", lambda year: {"imola": "6-hours-of-imola-2026", "monza": "6-hours-of-monza-2026"})
    monkeypatch.setattr(fiawec_assets, "_scrape_race_assets", lambda slug: (f"https://example.test/{slug}.png", f"https://example.test/{slug}-poster.png"))
    result = fiawec_assets.ingest_fiawec_assets(db, 2026)
    assert result["circuits"] == 2
    assert "imola" in circuit.layout_image
    assert "monza" in other.layout_image
    assert "monza" in events[1].poster_url


def test_championship_titles_count_only_latest_snapshot(db):
    season, _, rc, drivers = fixture_rows(db)
    events = db.query(models.Event).order_by(models.Event.round).all()
    for ev in events:
        db.add(models.StandingDriver(season_id=season.id, race_class_id=rc.id,
                                    driver_id=drivers[0].id, position=1, points=25 * ev.round,
                                    after_event_id=ev.id))
    db.commit()
    assert _championship_titles(db, "drivers")[0]["titles"] == 1
    from app.routers.drivers import _driver_career
    assert _driver_career(db, drivers[0].id)[0].points == 50


def test_latest_snapshot_keeps_classes_with_different_last_rounds(db):
    from app.standing_snapshot import latest_snapshot_filter
    season, _, rc, drivers = fixture_rows(db)
    other = models.RaceClass(name="LMP2")
    db.add(other); db.flush()
    events = db.query(models.Event).order_by(models.Event.round).all()
    for cls, ev in [(rc, events[0]), (rc, events[1]), (other, events[0])]:
        db.add(models.StandingDriver(season_id=season.id, race_class_id=cls.id,
                                    driver_id=drivers[0].id, position=1, points=25,
                                    after_event_id=ev.id))
    db.commit()
    rows = db.query(models.StandingDriver).filter(latest_snapshot_filter(models.StandingDriver)).all()
    assert {(row.race_class_id, row.after_event_id) for row in rows} == {(rc.id, events[1].id), (other.id, events[0].id)}


def test_model_dedupe_preserves_bop_and_specs(db):
    import structlog
    from app.curate_car_models import _dedupe_duplicate_models
    fixture_rows(db)
    maker = models.Manufacturer(name="Test")
    db.add(maker); db.flush()
    canonical = models.CarModel(name="Test car", slug="canonical", manufacturer_id=maker.id)
    duplicate = models.CarModel(name="Test car", slug="duplicate", power_hp=500)
    db.add_all([canonical, duplicate]); db.flush()
    db.add(models.BopAdjustment(event_id=db.query(models.Event).first().id,
                               car_model_id=duplicate.id, min_weight_kg=1000))
    db.commit()
    assert _dedupe_duplicate_models(db, structlog.get_logger()) == 1
    db.commit()
    assert db.query(models.BopAdjustment).one().car_model_id == canonical.id
    assert canonical.power_hp == 500


def test_actual_lineup_refs_include_substitute_outside_planned_round(db):
    from app.routers.events import session_results
    _, _, _, drivers = fixture_rows(db)
    result = db.query(models.SessionResult).first()
    result.drivers = drivers[1].name
    db.commit()
    output = session_results(result.session_id, db)
    assert output[0].driver_refs[0].id == drivers[1].id


def test_bop_curator_targets_exact_season(db, monkeypatch):
    from app import curate_bop
    season, circuit, _, _ = fixture_rows(db)
    newer = models.Season(year=2021, championship_name="WEC")
    model = models.CarModel(name="Test", slug="test")
    db.add_all([newer, model]); db.flush()
    target = models.Event(season_id=newer.id, circuit_id=circuit.id, round=1, name="Test", date_start=date(2021,1,1), date_end=date(2021,1,1))
    db.add(target); db.commit()
    target_id = target.id
    monkeypatch.setattr(curate_bop, "SessionLocal", lambda: db)
    monkeypatch.setattr(curate_bop, "BOP", {(2021, 1, "test"): {"min_weight_kg": 1000}})
    curate_bop.main()
    assert db.query(models.BopAdjustment).one().event_id == target_id


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


@pytest.mark.parametrize("kind", ["drivers", "teams", "manufacturers"])
def test_progression_uses_completed_state_and_bounded_queries(db, kind):
    from app.progression import estimated_progression
    season, _, rc, _ = fixture_rows(db)
    brand = models.Manufacturer(name="Brand")
    db.add(brand); db.flush()
    db.query(models.Team).one().manufacturer_id = brand.id
    races = db.query(models.Session).order_by(models.Session.id).all()
    races[0].result_status = "live"
    races[1].result_status = "final"
    db.commit()
    season_id, class_id = season.id, rc.id
    queries = []
    def count(*args): queries.append(True)
    event.listen(db.get_bind(), "before_cursor_execute", count)
    try:
        rows = estimated_progression(db, season_id, class_id, kind, 5)
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", count)
    assert len(queries) <= 2
    assert len(rows) == 1
    assert rows[0]["is_estimate"] is True
    assert rows[0]["points"] == [{"round": 2, "cumulative_points": 25}]
    if kind == "drivers":
        assert rows[0]["driver_name"] == "Substitute"


@pytest.mark.parametrize("status", ["DSQ", "Excluded", "NC", "DNS"])
def test_post_race_disqualification_revokes_podiums_and_points(db, status):
    from app.routers.drivers import _driver_career
    from app.routers.events import session_results
    from app.routers.standings import round_podiums
    from app.progression import estimated_progression
    season, _, rc, drivers = fixture_rows(db)
    row = db.query(models.SessionResult).order_by(models.SessionResult.id).first()
    row.status = status  # even a stale numeric P1 must never remain a win
    db.commit()
    assert _driver_career(db, drivers[0].id)[0].wins == 0
    assert session_results(row.session_id, db)[0].points_awarded == 0
    assert session_results(row.session_id, db)[0].class_position == 0
    assert len(round_podiums(rc.name, 2020, db)) == 1
    wins, _ = _driver_wins_and_podiums(db)
    assert [r["name"] for r in wins] == ["Substitute"]
    points = estimated_progression(db, season.id, rc.id, "drivers", 5)
    assert next(r for r in points if r["driver_id"] == drivers[0].id)["points"][-1]["cumulative_points"] == 0


def test_changed_source_history_is_deduplicated_and_transactional(db):
    from app.ingest.revisions import record_revision
    kwargs = dict(scope="standings:2020", source_url="https://example.test")
    assert record_revision(db, **kwargs, payload={"points": 100})
    db.commit()
    assert not record_revision(db, **kwargs, payload={"points": 100})
    assert record_revision(db, **kwargs, payload={"points": 75})
    db.commit()
    assert db.query(models.SourceRevision).count() == 2
    assert record_revision(db, **kwargs, payload={"points": 100})  # appeal reinstates points
    db.rollback()
    assert db.query(models.SourceRevision).count() == 2


def test_final_race_can_be_amended_but_partial_sources_are_rejected(db):
    fixture_rows(db)
    result = db.query(models.SessionResult).first()
    session = db.get(models.Session, result.session_id)
    session.result_status = "final"
    session.result_source_url = "original"
    result.laps = 100
    incoming = [{"number": result.car.number, "laps": "99"}]
    cars = {result.car.number: result.car}
    alkamel.validate_race_snapshot(session, [result], incoming, "final", "amended", cars)
    session.result_status = "completed"
    alkamel.validate_race_snapshot(session, [result], incoming, "completed", "amended", cars)
    session.result_status = "final"
    with pytest.raises(ValueError, match="state regressed"):
        alkamel.validate_race_snapshot(session, [result], incoming, "live", "old", cars)
    with pytest.raises(ValueError, match="coverage decreased"):
        alkamel.validate_race_snapshot(session, [result], [], "final", "broken", cars)


def test_final_file_wins_over_provisional_listing_order(monkeypatch):
    prefix = "Results/15_2026/05_COTA/673_FIA%20WEC/202609061300_Race/06_Hour%206/"
    files = ["03_Classification_Race_Final.CSV", "03_Classification_Race.CSV"]
    for ordering in (files, files[::-1]):
        monkeypatch.setattr(alkamel, "_event_html", lambda *_: "".join(
            f'<a href="{prefix}{name}">x</a>' for name in ordering))
        assert alkamel._list_race_csvs("15_2026", "05_COTA")[1].endswith("_Final.CSV")


def test_archive_rotation_keeps_previous_season_in_appeal_window():
    from app.ingest.archive import archive_year_for
    assert archive_year_for([2024, 2025, 2026], datetime(2026, 2, 1)) == 2025
    assert archive_year_for([2026], datetime(2026, 2, 1)) is None
    selected = {archive_year_for([2023, 2024, 2025, 2026], datetime(2026, 7, day)) for day in range(1, 4)}
    assert selected == {2023, 2024, 2025}


def test_archive_partial_standings_roll_back_previous_snapshot(db, monkeypatch):
    from app.ingest import archive
    season, _, rc, drivers = fixture_rows(db)
    db.add(models.StandingDriver(season_id=season.id, driver_id=drivers[0].id,
                               race_class_id=rc.id, position=1, points=100))
    db.commit()
    engine = db.get_bind()
    db.close()
    monkeypatch.setattr(archive, "engine", engine)
    monkeypatch.setattr(archive, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(wikipedia, "fetch_html", lambda _: "")
    monkeypatch.setattr(wikipedia, "_ingest_standings", lambda *_: {})
    with pytest.raises(ValueError, match="coverage decreased"):
        archive.refresh_archive(2020)
    with Session(engine) as check:
        assert check.query(models.StandingDriver).one().points == 100


def test_latest_standings_follows_round_not_database_id(db):
    from app.standing_snapshot import latest_snapshot_filter
    season, _, rc, drivers = fixture_rows(db)
    events = db.query(models.Event).order_by(models.Event.id).all()
    events[0].round, events[1].round = 3, 1
    for ev in events:
        db.add(models.StandingDriver(season_id=season.id, driver_id=drivers[0].id,
                                   race_class_id=rc.id, after_event_id=ev.id, position=1, points=100))
    db.commit()
    assert db.query(models.StandingDriver).filter(latest_snapshot_filter(models.StandingDriver)).one().after_event_id == events[0].id


def test_practice_refresh_preserves_row_identity_and_rejects_partial_file(db, monkeypatch):
    season, _, rc, _ = fixture_rows(db)
    session = db.query(models.Session).first()
    session.type = "FP1"
    row = db.query(models.SessionResult).filter_by(session_id=session.id).one()
    stable_id = row.id
    db.commit()
    monkeypatch.setattr(alkamel, "_season_param_for_year", lambda _: "2020")
    monkeypatch.setattr(alkamel, "_event_options_for_season", lambda _: [(1, "01_SPA")])
    monkeypatch.setattr(alkamel, "_list_session_csvs", lambda *_: [("FP1", "HYPERCAR", "file", "", "202001011200")])
    monkeypatch.setattr(alkamel, "_fetch", lambda _: "POS;NUMBER;CLASS;TIME;LAPS\n1;1;HYPERCAR;1:50.000;12")
    assert alkamel.ingest_practice_results(db, season.id, 2020) == 1
    assert db.query(models.SessionResult).filter_by(session_id=session.id).one().id == stable_id
    car = models.Car(season_id=season.id, race_class_id=rc.id, team_id=row.car.team_id, number="2")
    db.add(car); db.flush()
    db.add(models.SessionResult(session_id=session.id, car_id=car.id, position=2))
    db.commit()
    with pytest.raises(ValueError, match="coverage decreased"):
        alkamel.ingest_practice_results(db, season.id, 2020)
    db.rollback()
    assert db.query(models.SessionResult).filter_by(session_id=session.id).count() == 2

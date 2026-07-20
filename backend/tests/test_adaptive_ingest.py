import sys
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest import alkamel, scheduled, wikipedia
from app.ingest.alkamel import _apply_race_classification
from app.lap_chart import compute_lap_chart
from app.ingest.scheduled import (
    EventSchedule,
    ScheduleSnapshot,
    SessionSchedule,
    active_sessions,
    adaptive_scheduler_enabled,
    build_ingest_plan,
    hot_loop_budget_seconds,
)
from app.ingest.wikipedia import _clear_season, _upsert_session, current_utc_year


UTC = timezone.utc


def _snapshot(
    *,
    event_name: str = "6 Hours of Spa-Francorchamps",
    session_type: str = "FP1",
    session_start: datetime = datetime(2026, 5, 7, 9, 0),
) -> ScheduleSnapshot:
    event = EventSchedule(
        id=10,
        season_id=1,
        year=2026,
        round=2,
        name=event_name,
        date_start=date(2026, 5, 9),
        date_end=date(2026, 5, 9),
    )
    session = SessionSchedule(
        event_id=event.id,
        type=session_type,
        start_time=session_start,
    )
    return ScheduleSnapshot(events=(event,), sessions=(session,))


def test_cold_period_runs_full_ingest_only_every_six_hours() -> None:
    snapshot = _snapshot()

    refresh = build_ingest_plan(snapshot, datetime(2026, 7, 21, 6, 5, tzinfo=UTC))
    skipped = build_ingest_plan(snapshot, datetime(2026, 7, 21, 7, 5, tzinfo=UTC))

    assert refresh.run_full_ingest is True
    assert refresh.reason == "cold_six_hour_refresh"
    assert skipped.run_full_ingest is False
    assert skipped.keep_hot_loop is False
    assert skipped.reason == "cold_skip"


def test_race_week_keeps_hourly_full_ingest() -> None:
    snapshot = _snapshot()

    plan = build_ingest_plan(snapshot, datetime(2026, 5, 8, 18, 0, tzinfo=UTC))

    assert plan.run_full_ingest is True
    assert plan.reason == "race_week"


def test_race_week_runs_from_event_week_monday_through_two_days_after() -> None:
    snapshot = _snapshot()

    before = build_ingest_plan(snapshot, datetime(2026, 5, 3, 23, 59, tzinfo=UTC))
    opens = build_ingest_plan(snapshot, datetime(2026, 5, 4, 0, 0, tzinfo=UTC))
    before_close = build_ingest_plan(
        snapshot,
        datetime(2026, 5, 11, 23, 59, tzinfo=UTC),
    )
    closed = build_ingest_plan(snapshot, datetime(2026, 5, 12, 0, 0, tzinfo=UTC))

    assert before.reason == "cold_skip"
    assert opens.reason == "race_week"
    assert before_close.reason == "race_week"
    assert closed.reason == "cold_six_hour_refresh"


def test_session_starting_within_next_hour_starts_hot_loop() -> None:
    snapshot = _snapshot(session_start=datetime(2026, 5, 7, 10, 0))

    # The hot window opens at 09:40, so a 09:00 hourly invocation must stay
    # alive rather than waiting until the next top of the hour.
    plan = build_ingest_plan(snapshot, datetime(2026, 5, 7, 9, 0, tzinfo=UTC))

    assert plan.run_full_ingest is True
    assert plan.keep_hot_loop is True


def test_delayed_cron_still_exits_before_next_top_of_hour() -> None:
    assert (
        hot_loop_budget_seconds(datetime(2026, 5, 7, 9, 0, tzinfo=UTC))
        == 54 * 60
    )
    assert (
        hot_loop_budget_seconds(datetime(2026, 5, 7, 9, 10, tzinfo=UTC))
        == 48 * 60
    )


def test_post_session_grace_and_utc_normalization() -> None:
    naive_snapshot = _snapshot(session_start=datetime(2026, 5, 7, 9, 0))
    aware_snapshot = _snapshot(
        session_start=datetime(2026, 5, 7, 11, 0, tzinfo=timezone(timedelta(hours=2)))
    )

    before_grace_ends = datetime(2026, 5, 7, 11, 59, tzinfo=UTC)
    after_grace_ends = datetime(2026, 5, 7, 12, 1, tzinfo=UTC)
    assert active_sessions(naive_snapshot, before_grace_ends)
    assert active_sessions(aware_snapshot, before_grace_ends)
    assert active_sessions(naive_snapshot, after_grace_ends) == ()
    assert active_sessions(aware_snapshot, after_grace_ends) == ()


def test_long_race_window_includes_result_publication_grace() -> None:
    snapshot = _snapshot(
        event_name="24 Hours of Le Mans",
        session_type="RACE",
        session_start=datetime(2026, 6, 13, 14, 0),
    )

    assert active_sessions(snapshot, datetime(2026, 6, 14, 16, 59, tzinfo=UTC))
    assert active_sessions(snapshot, datetime(2026, 6, 14, 17, 1, tzinfo=UTC)) == ()


def test_adaptive_scheduler_defaults_only_on_named_railway_cron() -> None:
    assert adaptive_scheduler_enabled({"RAILWAY_SERVICE_NAME": "wec-cron"})
    assert not adaptive_scheduler_enabled({"RAILWAY_SERVICE_NAME": "wec-dashboard"})
    assert adaptive_scheduler_enabled({"ADAPTIVE_INGEST": "true"})
    assert not adaptive_scheduler_enabled(
        {"RAILWAY_SERVICE_NAME": "wec-cron", "ADAPTIVE_INGEST": "false"}
    )


def test_default_ingest_year_uses_utc_at_year_boundary() -> None:
    assert current_utc_year(datetime(2026, 12, 31, 23, 59, tzinfo=UTC)) == 2026
    assert current_utc_year(
        datetime(2027, 1, 1, 8, 30, tzinfo=timezone(timedelta(hours=9)))
    ) == 2026


def test_explicit_cli_year_stays_one_shot_even_in_railway_cron(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[int, str]] = []

    def fake_ingest(*, year: int, url: str) -> dict:
        calls.append((year, url))
        return {}

    def unexpected_scheduler(**_kwargs) -> None:
        raise AssertionError("explicit CLI arguments must bypass adaptive scheduling")

    monkeypatch.setenv("RAILWAY_SERVICE_NAME", "wec-cron")
    monkeypatch.setenv("ADAPTIVE_INGEST", "true")
    monkeypatch.setattr(sys, "argv", ["wikipedia.py", "2025"])
    monkeypatch.setattr(wikipedia, "ingest", fake_ingest)
    monkeypatch.setattr(scheduled, "run_scheduled_ingest", unexpected_scheduler)

    wikipedia.main()

    assert calls == [(2025, wikipedia.url_for_year(2025))]


def test_no_argument_local_cli_stays_one_shot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    def fake_ingest(*, year: int, url: str) -> dict:
        del url
        calls.append(year)
        return {}

    monkeypatch.delenv("RAILWAY_SERVICE_NAME", raising=False)
    monkeypatch.delenv("ADAPTIVE_INGEST", raising=False)
    monkeypatch.setattr(sys, "argv", ["wikipedia.py"])
    monkeypatch.setattr(wikipedia, "ingest", fake_ingest)

    wikipedia.main()

    assert calls == [wikipedia.DEFAULT_YEAR]


def test_hot_loop_is_bounded_and_waits_for_session_starting_this_hour(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = _snapshot(session_start=datetime(2026, 5, 7, 10, 0))

    class Clock:
        wall = datetime(2026, 5, 7, 9, 0, tzinfo=UTC)
        monotonic = 0.0

        def now(self) -> datetime:
            return self.wall

        def tick(self) -> float:
            return self.monotonic

        def sleep(self, seconds: float) -> None:
            self.monotonic += seconds
            self.wall += timedelta(seconds=seconds)

    clock = Clock()
    full_runs: list[int] = []
    hot_runs: list[datetime] = []
    schedule_loads = 0

    @contextmanager
    def fake_lock():
        yield True

    def fake_full(*, year: int, url: str) -> dict:
        del url
        full_runs.append(year)
        return {}

    def fake_hot(
        _snapshot: ScheduleSnapshot,
        now: datetime,
    ) -> dict[str, int]:
        hot_runs.append(now)
        return {}

    def flaky_schedule(_year: int) -> ScheduleSnapshot:
        nonlocal schedule_loads
        schedule_loads += 1
        if schedule_loads == 3:
            raise RuntimeError("temporary DB read failure")
        return snapshot

    monkeypatch.setattr(scheduled, "scheduler_lock", fake_lock)
    monkeypatch.setattr(scheduled, "load_schedule", flaky_schedule)
    monkeypatch.setattr(scheduled, "refresh_active_sessions", fake_hot)

    scheduled.run_scheduled_ingest(
        year=2026,
        url=wikipedia.url_for_year(2026),
        ingest_once=fake_full,
        now_fn=clock.now,
        monotonic_fn=clock.tick,
        sleep_fn=clock.sleep,
    )

    assert full_runs == [2026]
    assert schedule_loads > 3
    assert hot_runs
    assert hot_runs[0] == datetime(2026, 5, 7, 9, 40, tzinfo=UTC)
    assert clock.monotonic == scheduled.HOT_LOOP_MAX_SECONDS
    assert clock.monotonic < 55 * 60


def test_hot_refresh_commits_and_closes_owned_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = _snapshot(session_start=datetime(2026, 5, 7, 9, 0))

    class FakeDb:
        commits = 0
        rollbacks = 0
        closes = 0

        def commit(self) -> None:
            self.commits += 1

        def rollback(self) -> None:
            self.rollbacks += 1

        def close(self) -> None:
            self.closes += 1

    db = FakeDb()
    monkeypatch.setattr(scheduled, "SessionLocal", lambda: db)
    monkeypatch.setattr(alkamel, "ingest_practice_results", lambda *_a, **_kw: 3)
    monkeypatch.setattr(alkamel, "enrich_session_weather", lambda *_a, **_kw: 1)

    summary = scheduled.refresh_active_sessions(
        snapshot,
        datetime(2026, 5, 7, 10, 0, tzinfo=UTC),
    )

    assert summary["practice_rows"] == 3
    assert summary["weather_sessions"] == 1
    assert db.commits == 1
    assert db.rollbacks == 0
    assert db.closes == 1


def test_hot_refresh_rolls_back_and_closes_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = _snapshot(session_start=datetime(2026, 5, 7, 9, 0))

    class FakeDb:
        commits = 0
        rollbacks = 0
        closes = 0

        def commit(self) -> None:
            self.commits += 1

        def rollback(self) -> None:
            self.rollbacks += 1

        def close(self) -> None:
            self.closes += 1

    def fail(*_args, **_kwargs) -> int:
        raise RuntimeError("upstream parse failed")

    db = FakeDb()
    monkeypatch.setattr(scheduled, "SessionLocal", lambda: db)
    monkeypatch.setattr(alkamel, "ingest_practice_results", fail)

    with pytest.raises(RuntimeError, match="upstream parse failed"):
        scheduled.refresh_active_sessions(
            snapshot,
            datetime(2026, 5, 7, 10, 0, tzinfo=UTC),
        )

    assert db.commits == 0
    assert db.rollbacks == 1
    assert db.closes == 1


def test_clear_season_preserves_session_id_and_removes_rebuilt_children() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)
    try:
        season = models.Season(year=2026, championship_name="FIA WEC")
        race_class = models.RaceClass(name="HYPERCAR")
        circuit = models.Circuit(name="Spa", country="BEL", length_km=7.004)
        team = models.Team(name="Stable Session Racing")
        db.add_all([season, race_class, circuit, team])
        db.flush()
        event = models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=2,
            name="6 Hours of Spa-Francorchamps",
            date_start=date(2026, 5, 9),
            date_end=date(2026, 5, 9),
        )
        car = models.Car(
            season_id=season.id,
            team_id=team.id,
            race_class_id=race_class.id,
            number="50",
        )
        db.add_all([event, car])
        db.flush()
        race = models.Session(
            event_id=event.id,
            type="RACE",
            start_time=datetime(2026, 5, 9, 12, 0),
        )
        db.add(race)
        db.flush()
        result = models.SessionResult(
            session_id=race.id,
            car_id=car.id,
            position=1,
        )
        pit = models.PitStopEvent(
            session_id=race.id,
            car_id=car.id,
            lap_number=20,
        )
        db.add_all([result, pit])
        db.commit()
        stable_id = race.id

        _clear_season(db, season.id)
        db.flush()
        db.expire_all()

        preserved = db.query(models.Session).one()
        assert preserved.id == stable_id
        assert db.query(models.SessionResult).count() == 0
        assert db.query(models.PitStopEvent).count() == 0
        assert db.query(models.Car).count() == 0
    finally:
        db.close()


def test_upsert_session_reuses_id_and_constraint_blocks_duplicates() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)
    try:
        season = models.Season(year=2026, championship_name="FIA WEC")
        circuit = models.Circuit(name="Fuji", country="JPN", length_km=4.563)
        db.add_all([season, circuit])
        db.flush()
        event = models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=6,
            name="6 Hours of Fuji",
            date_start=date(2026, 9, 27),
            date_end=date(2026, 9, 27),
        )
        db.add(event)
        db.flush()

        first = _upsert_session(db, event.id, "RACE", datetime(2026, 9, 27, 9, 0))
        stable_id = first.id
        second = _upsert_session(db, event.id, "RACE", datetime(2026, 9, 27, 10, 0))
        db.flush()

        assert second.id == stable_id
        assert second.start_time == datetime(2026, 9, 27, 10, 0)
        assert (
            db.query(models.Session)
            .filter_by(event_id=event.id, type="RACE")
            .count()
            == 1
        )
        db.add(models.Session(event_id=event.id, type="RACE"))
        with pytest.raises(IntegrityError):
            db.flush()
    finally:
        db.rollback()
        db.close()


def test_live_race_snapshot_updates_position_gap_and_laps() -> None:
    row = models.SessionResult(
        session_id=1,
        car_id=1,
        position=8,
        laps=20,
        gap="+1 Lap",
        status="Running",
    )
    changed = _apply_race_classification(
        row,
        {
            "position": "1",
            "gap": "",
            "best_lap": "1:35.001",
            "status": "Running",
            "laps": "24",
        },
        pit_stops=2,
        top_speed_kph=331.2,
    )

    assert changed is True
    assert row.position == 1
    assert row.gap is None
    assert row.laps == 24
    assert row.best_lap == "1:35.001"
    assert row.pit_stops == 2
    assert row.top_speed_kph == 331.2


def test_race_weather_uses_latest_available_hour(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    html = (
        '<a href="Results/2026/WEC/04_FIA%20WEC/202607121000_Race/'
        '01_Hour%201/26_Weather_Race.CSV">H1</a>'
        '<a href="Results/2026/WEC/04_FIA%20WEC/202607121000_Race/'
        '03_Hour%203/26_Weather_Race.CSV">H3</a>'
    )
    monkeypatch.setattr(alkamel, "_fetch", lambda _url: html)

    url = alkamel.find_weather_url("2026", "04_EVENT", "RACE")

    assert url is not None
    assert "/03_Hour%203/" in url


def test_lap_chart_reuses_downloaded_rows_without_second_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)
    try:
        season = models.Season(year=2026, championship_name="FIA WEC")
        race_class = models.RaceClass(name="HYPERCAR")
        circuit = models.Circuit(name="Le Mans", country="FRA", length_km=13.626)
        team_a = models.Team(name="Team A")
        team_b = models.Team(name="Team B")
        db.add_all([season, race_class, circuit, team_a, team_b])
        db.flush()
        event = models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=3,
            name="24 Hours of Le Mans",
            date_start=date(2026, 6, 13),
            date_end=date(2026, 6, 14),
        )
        car_a = models.Car(
            season_id=season.id,
            team_id=team_a.id,
            race_class_id=race_class.id,
            number="50",
        )
        car_b = models.Car(
            season_id=season.id,
            team_id=team_b.id,
            race_class_id=race_class.id,
            number="51",
        )
        db.add_all([event, car_a, car_b])
        db.flush()
        race = models.Session(event_id=event.id, type="RACE")
        db.add(race)
        db.flush()
        db.add_all(
            [
                models.SessionResult(
                    session_id=race.id,
                    car_id=car_a.id,
                    position=1,
                    drivers="Driver A",
                ),
                models.SessionResult(
                    session_id=race.id,
                    car_id=car_b.id,
                    position=2,
                    drivers="Driver B",
                ),
            ]
        )
        db.flush()

        def unexpected_fetch(*_args, **_kwargs):
            raise AssertionError("supplied lap rows must bypass upstream fetch")

        monkeypatch.setattr(alkamel, "resolve_event_params", unexpected_fetch)
        chart = compute_lap_chart(
            db,
            race,
            laps=[
                {"number": "50", "lap": "1", "elapsed": "0:01:40.000"},
                {"number": "51", "lap": "1", "elapsed": "0:01:50.000"},
                {"number": "50", "lap": "2", "elapsed": "0:03:30.000"},
                {"number": "51", "lap": "2", "elapsed": "0:03:25.000"},
            ],
        )

        assert chart is not None
        by_number = {car.car_number: car for car in chart.cars}
        assert by_number["50"].positions == [1, 2]
        assert by_number["51"].positions == [2, 1]
    finally:
        db.close()

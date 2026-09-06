from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest import alkamel as a
from app.ingest.fiawec_schedule import parse_race_page


def test_race_classification_preserves_official_lineup_and_aliases():
    parsed = a._parse_race_classification("POSITION;NUMBER;DRIVER_1;DRIVER_2;DRIVER_3;STATUS\n1;8;Sébastien BUEMI;Brendon HARTLEY;Ryo HIRAKAWA;Classified")
    assert "Ryo HIRAKAWA" in parsed[0]["drivers"]
    candidates = [models.Driver(name=name) for name in ["Phil Hanson", "Ye Yifei", "Dan Harper"]]
    assert a.canonical_race_lineup("Philip HANSON / Yifei YE / Daniel HARPER / New DRIVER", candidates) == "Phil Hanson / Ye Yifei / Dan Harper / New Driver"


def test_race_amendment_replaces_driver_lineup():
    row = models.SessionResult(position=1, drivers="Old Driver")
    assert a._apply_race_classification(row, {"position": "1", "drivers": "New Driver"}, pit_stops=None, top_speed_kph=None)
    assert row.drivers == "New Driver"


def test_api_session_time_has_explicit_utc_offset():
    from app.schemas import SessionOut
    result = SessionOut(id=1, type="RACE", start_time=datetime(2026, 9, 6, 18))
    assert result.model_dump(mode="json", by_alias=True)["startTime"] == "2026-09-06T18:00:00Z"


def test_wrong_event_cache_retries_and_filters_mixed_links(monkeypatch):
    wrong = '<a href="Results/15_2026/01_IMOLA/645_FIA%20WEC/file.CSV">x</a>'
    right = '<a href="Results/15_2026/05_CIRCUIT%20OF%20THE%20AMERICAS/673_FIA%20WEC/file.CSV">x</a>'
    replies = iter([wrong, right + wrong])
    monkeypatch.setattr(a, "_fetch", lambda _: next(replies))
    html = a._event_html("15_2026", "05_CIRCUIT OF THE AMERICAS")
    assert "01_IMOLA" not in html
    assert "05_CIRCUIT" in html
    monkeypatch.setattr(a, "_fetch", lambda _: wrong)
    with pytest.raises(ValueError, match="another event"):
        a._event_html("15_2026", "05_CIRCUIT OF THE AMERICAS")


def test_track_timetable_overrides_wrong_european_schema_offset():
    html = '''<script type="application/ld+json">{
      "name":"Race - Lone Star Le Mans", "startDate":"2026-09-06T13:00:00+02:00"
    }</script><div>September 6 th Race 01:00 PM Live Track info</div>'''
    assert dict(parse_race_page(html, 2026, "America/Chicago"))["RACE"] == datetime(2026, 9, 6, 18)


def test_le_mans_multistage_and_combined_class_folders(monkeypatch):
    prefix = "Results/15_2026/03_LE%20MANS/657_FIA%20WEC/"
    folders = ["202606101845_Qualifying%20LMP2-LMGT3",
               "202606112105_Hyperpole%201%20HYPERCAR",
               "202606112140_Hyperpole%202%20HYPERCAR"]
    html = "".join(f'<a href="{prefix}{f}/03_Classification_Final.CSV">x</a>' for f in folders)
    monkeypatch.setattr(a, "_fetch", lambda _: html)
    assert [(r[0], r[1], r[4]) for r in a._list_session_csvs("15_2026", "03_LE MANS")] == [
        ("Q", "LMP2-LMGT3", "202606101845"),
        ("HP", "HYPERCAR", "202606112105"),
        ("HP", "HYPERCAR", "202606112140"),
    ]


def test_official_grid_restores_distinct_q_hp_and_penalty_order(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        season = models.Season(year=2026, championship_name="WEC")
        circuit = models.Circuit(name="Circuit of the Americas", country="USA", length_km=5.513)
        rc = models.RaceClass(name="HYPERCAR")
        team = models.Team(name="Ferrari")
        db.add_all([season, circuit, rc, team]); db.flush()
        event = models.Event(season_id=season.id, circuit_id=circuit.id, round=5,
                             name="Lone Star Le Mans", date_start=datetime(2026,9,6).date(), date_end=datetime(2026,9,6).date())
        db.add(event); db.flush()
        sess = models.Session(event_id=event.id, type="Q")
        cars = [models.Car(season_id=season.id, team_id=team.id, race_class_id=rc.id, number=n) for n in ("51", "50")]
        db.add_all([sess, *cars]); db.flush()
        for car in cars:
            db.add(models.SessionResult(session_id=sess.id, car_id=car.id, position=1, best_lap="1:30.127", hyperpole_lap="1:30.127"))
        db.add(models.SessionResult(session_id=sess.id, car_id=cars[0].id, position=3, best_lap="1:30.127"))
        db.commit()
        monkeypatch.setattr(a, "_season_param_for_year", lambda _: "15_2026")
        monkeypatch.setattr(a, "_event_options_for_season", lambda _: [(5, "05_COTA")])
        monkeypatch.setattr(a, "_list_session_csvs", lambda *_: [
            ("Q", "HYPERCAR", "q", "", "202609051540"),
            ("HP", "HYPERCAR", "hp", "", "202609051600"),
            ("Q", "", "grid", "", "202609051730"),
        ])
        docs = {
            "q": "NUMBER;TIME\n51;1:52.105\n50;1:52.020",
            "hp": "NUMBER;TIME\n51;1:52.445",
            "grid": "POSITION;NUMBER;TIME;QP_HC;HP_HC\n1;51;1:52.445;1:52.105;1:52.445\n2;50;1:52.020;1:52.020;",
        }
        monkeypatch.setattr(a, "_fetch", docs.__getitem__)
        a.enrich_qualifying_drivers(db, season.id, 2026)
        rows = db.query(models.SessionResult).order_by(models.SessionResult.position).all()
        assert [(r.car.number, r.qualifying_lap, r.hyperpole_lap, r.best_lap) for r in rows] == [
            ("51", "1:52.105", "1:52.445", "1:52.445"),
            ("50", "1:52.020", None, "1:52.020"),
        ]

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest import alkamel as a
from app.ingest.event_entries import apply_event_entries
from app.ingest.wikipedia import _clear_season, _ingest_entries


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def make_event(db):
    season = models.Season(year=2026, championship_name="WEC")
    circuit = models.Circuit(name="Le Mans", country="FRA", length_km=13.626)
    db.add_all([season, circuit]); db.flush()
    event = models.Event(season_id=season.id, circuit_id=circuit.id, round=3,
                         name="24 Hours of Le Mans", date_start=date(2026,6,13), date_end=date(2026,6,14))
    db.add(event); db.flush()
    return event


def guest(number="101", cls="HYPERCAR"):
    return dict(NUMBER=number, CLASS=cls, TEAM="Cadillac WTR", VEHICLE="Cadillac V-Series.R",
                DRIVER_1="Ricky TAYLOR", DRIVER_2="Jordan TAYLOR", DRIVER_3="Filipe ALBUQUERQUE")


def test_event_guests_survive_rebuild_with_stable_ids_and_round_attendance(db):
    event = make_event(db)
    driver = models.Driver(name="Ricky Taylor")
    db.add(driver); db.flush()
    assert apply_event_entries(db, event, [guest(), guest("43", "LMP2")]) == 2
    db.commit()
    ids = [c.id for c in db.query(models.Car).order_by(models.Car.id)]
    assert db.query(models.Driver).count() == 3
    assert all(cd.rounds == "3" for cd in db.query(models.CarDriver))
    assert all(c.is_guest for c in db.query(models.Car))
    _clear_season(db, event.season_id)
    _ingest_entries(db, event.season_id, {}, [], {})
    apply_event_entries(db, event, [guest(), guest("43", "LMP2")])
    assert [c.id for c in db.query(models.Car).order_by(models.Car.id)] == ids
    assert db.query(models.CarDriver).count() == 6


def test_incomplete_guest_rejected_before_any_entry_write(db):
    event = make_event(db)
    with pytest.raises(ValueError, match="Incomplete"):
        apply_event_entries(db, event, [guest(), {**guest("43"), "VEHICLE": ""}])
    assert db.query(models.Car).count() == 0
    assert db.query(models.Driver).count() == 0
    with pytest.raises(ValueError, match="Invalid"):
        apply_event_entries(db, event, [guest(), guest()])


def test_split_practice_discovery_includes_fp4_warmup_and_excludes_support(monkeypatch):
    root = "Results/15_2026/07_BARCELONA/688_FIA%20WEC/"
    folders = ["202610170850_Free%20Practice%203%20-%20LMGT3", "202610171240_Free%20Practice%203%20-%20HYPERCAR",
               "202610172300_Free%20Practice%204", "202610181100_Warm%20Up"]
    html = ''.join(f'<a href="{root}{f}/03_Classification_Final.CSV">x</a>' for f in folders)
    html += f'<a href="{root.replace("688_FIA%20WEC", "689_Support")}{folders[0]}/03_Classification.CSV">x</a>'
    monkeypatch.setattr(a, "_event_html", lambda *args: html)
    entries = a._list_session_csvs("15_2026", "07_BARCELONA")
    assert [(e[0],e[1]) for e in entries] == [("FP3","LMGT3"),("FP3","HYPERCAR"),("FP4",""),("WARMUP","")]


def test_split_practice_merge_keeps_both_classes_and_earliest_start(monkeypatch):
    docs = {"gt": "POS;NUMBER;CLASS;TIME;LAPS\n1;21;LMGT3;1:40.000;20",
            "hc": "POS;NUMBER;CLASS;TIME;LAPS\n1;50;HYPERCAR;1:30.000;22"}
    monkeypatch.setattr(a, "_fetch", docs.__getitem__)
    entries = [("FP3","LMGT3","gt","","202610170850"),("FP3","HYPERCAR","hc","","202610171240")]
    rows, _, timestamp = a._practice_snapshot(entries)
    assert [(r["number"],r["position"]) for r in rows] == [("50","1"),("21","2")]
    assert timestamp == "202610170850"
    docs["hc"] = docs["gt"]
    with pytest.raises(ValueError, match="Duplicate"):
        a._practice_snapshot(entries)


def test_guest_biography_requires_identity_and_uses_only_explicit_fields():
    from app.ingest.guest_profiles import parse_biography
    html = '''<h1>Jordan Taylor (racing driver)</h1><table class="infobox">
    <tr><td class="infobox-image"><img src="//upload.wikimedia.org/wikipedia/portrait.jpg"></td></tr>
    <tr><th>Born</th><td><span class="bday">1991-05-10</span></td></tr>
    <tr><th>Nationality</th><td><img alt="United States"></td></tr></table>'''
    assert parse_biography(html, "Jordan Taylor", date(2026,10,26)) == {
        "dob": date(1991,5,10), "nationality": "USA", "photo_url": "https://upload.wikimedia.org/wikipedia/portrait.jpg"}
    with pytest.raises(ValueError, match="identity"):
        parse_biography(html, "Ricky Taylor", date(2026,10,26))
    invalid = html.replace("1991-05-10", "2024-01-01").replace("upload.wikimedia.org", "evil.test")
    assert parse_biography(invalid, "Jordan Taylor", date(2026,10,26)) == {"nationality": "USA"}


def test_absolute_official_wikipedia_driver_links_and_guest_aliases(db):
    from bs4 import BeautifulSoup
    from app.ingest.wikipedia import parse_driver_links
    html = '<table><a href="https://en.wikipedia.org/wiki/Nick_Yelloly">Nick Yelloly</a><a href="https://evil.test/wiki/Wrong">Wrong</a></table>'
    assert parse_driver_links(BeautifulSoup(html,"lxml").table) == {"Nick Yelloly": "Nick_Yelloly"}
    event = make_event(db)
    driver = models.Driver(name="Alex Quinn")
    db.add(driver); db.flush()
    apply_event_entries(db,event,[{**guest(),"DRIVER_1":"Alexander QUINN"}])
    assert db.query(models.Driver).filter_by(name="Alexander Quinn").count() == 0

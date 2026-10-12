from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest import fiawec_profiles as p
from app.ingest.wikipedia import _upsert_circuit
from app.data.car_specs import CAR_SPECS

PROFILE = '''<h1><small>Ryō</small> Hirakawa</h1>
<div><span>Nationality</span><div><span class="flag:JP"></span>Japan</div></div>
<div><span>Age</span>1994/03/07 (Age: 32)</div>
<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Ryō Hirakawa",
"image":"https://www.fiawec.com/uploads/driver.png"}]}</script>'''


def test_official_profile_fields():
    assert p.parse_profile(PROFILE, "Ryō Hirakawa", date(2026, 10, 13)) == {
        "nationality": "JPN", "dob": date(1994, 3, 7),
        "photo_url": "https://www.fiawec.com/uploads/driver.png",
    }


def test_profile_rejects_another_person():
    with pytest.raises(ValueError, match="identity"):
        p.parse_profile(PROFILE, "Kamui Kobayashi", date(2026, 10, 13))


@pytest.mark.parametrize("bad_date", ["2024/11/07", "2030/01/01", "1900/01/01", "1994/02/31"])
def test_profile_rejects_implausible_birth_dates(bad_date):
    assert "dob" not in p.parse_profile(PROFILE.replace("1994/03/07", bad_date), "Ryō Hirakawa", date(2026, 10, 13))


def test_profile_links_conflicts_and_foreign_sources():
    html = '<a href="/en/driver/2026/1">Philip Hanson</a><a href="https://evil.test/en/driver/2026/2">Phil Hanson</a>'
    assert p.profile_links(html, 2026) == {p.identity("Phil Hanson"): p.BASE + "/en/driver/2026/1"}
    with pytest.raises(ValueError, match="Conflicting"):
        p.profile_links(html + '<a href="/en/driver/2026/2">Phil Hanson</a>', 2026)


def test_profile_rejects_foreign_portrait():
    result = p.parse_profile(PROFILE.replace('www.fiawec.com/uploads/driver.png', 'evil.test/driver.png'), "Ryō Hirakawa", date(2026, 10, 13))
    assert "photo_url" not in result


def test_angolan_nationality_and_verified_date_corrections():
    assert p.COUNTRIES['AO'] == 'AGO'
    for name, dob in p.DOB_CORRECTIONS.items():
        html = PROFILE.replace('Ryō', name.split()[0]).replace('Hirakawa', ' '.join(name.split()[1:])).replace('1994/03/07', '2024/05/29')
        assert p.parse_profile(html, name, date(2026, 10, 13))['dob'] == dob


def test_profile_refresh_weekly_and_preserves_existing_portraits(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        season = models.Season(year=2026, championship_name="WEC")
        driver = models.Driver(name="Ryō Hirakawa", photo_url="existing")
        team = models.Team(name="Toyota")
        rc = models.RaceClass(name="HYPERCAR")
        db.add_all([season, driver, team, rc]); db.flush()
        car = models.Car(season_id=season.id, team_id=team.id, race_class_id=rc.id, number="8")
        db.add(car); db.flush()
        db.add(models.CarDriver(driver_id=driver.id, car_id=car.id, season_id=season.id)); db.commit()
        monkeypatch.setattr(p, '_fetch', lambda url: '<a href="/en/driver/2026/1">Ryō Hirakawa</a>' if '/season/' in url else PROFILE)
        assert p.enrich_driver_profiles(db, 2026)['profiles_updated'] == 1
        db.commit()
        assert driver.nationality == 'JPN' and driver.dob == date(1994, 3, 7)
        assert driver.photo_url == 'existing'
        monkeypatch.setattr(p, '_fetch', lambda _: pytest.fail('weekly refresh should skip'))
        assert p.enrich_driver_profiles(db, 2026)['profiles_checked'] == 0
    engine.dispose()


def test_new_circuit_metadata_repairs_unknowns():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for name, country, length in [('Circuit de Barcelona-Catalunya', 'ESP', 4.657), ('Monza Circuit', 'ITA', 5.793)]:
            db.add(models.Circuit(name=name, country='UNK', length_km=0))
            db.flush()
            row = _upsert_circuit(db, name, "UNK")
            assert (row.country, row.length_km) == (country, length)
    engine.dispose()


def test_verified_missing_car_specs():
    assert CAR_SPECS['genesis-gmr-001']['engine'] == '3.2 L twin-turbo V8 hybrid'
    for slug, year in [('mclaren-720s-gt3-evo-2', 2023), ('mercedes-amg-gt3-evo', 2020), ('lexus-rc-f-gt3', 2017)]:
        assert CAR_SPECS[slug]['year_introduced'] == year

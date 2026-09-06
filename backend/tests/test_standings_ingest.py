from datetime import datetime, timezone, timedelta

import pytest
from bs4 import BeautifulSoup
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest.wikipedia import _ingest_standings


STANDINGS_HTML = """
<h3>Hypercar World Endurance Drivers' Championship</h3>
<table class="wikitable">
  <tr><th>Pos.</th><th>Driver</th><th>Points</th></tr>
  <tr><td>18</td><td>André Lotterer</td><td>4</td></tr>
  <tr><td>22</td><td>Daniel Juncadella</td><td>0</td></tr>
</table>
<h3>FIA Endurance Trophy for LMGT3 Drivers</h3>
<table class="wikitable">
  <tr><th>Pos.</th><th>Driver</th><th>Points</th></tr>
  <tr><td>26</td><td>Matteo Cressoni</td><td>0</td></tr>
</table>
<h3>Hypercar World Endurance Manufacturers' Championship</h3>
<table class="wikitable">
  <tr><th>Pos.</th><th>Manufacturer</th><th>Points</th></tr>
  <tr><td>7</td><td>Peugeot</td><td>15</td></tr>
  <tr><td>8</td><td>Genesis</td><td>6</td></tr>
</table>
<h3>FIA Endurance Trophy for LMGT3 Teams</h3>
<table class="wikitable">
  <tr><th>Pos.</th><th>Team</th><th>Car</th><th>Points</th></tr>
  <tr><td>17</td><td>Vista AF Corse</td><td>54</td><td>0</td></tr>
  <tr><td>18</td><td>Iron Lynx</td><td>79</td><td>0</td></tr>
</table>
"""


def _session() -> tuple[Session, models.Season, dict[str, int]]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)

    season = models.Season(year=2026, championship_name="FIA WEC")
    hypercar = models.RaceClass(name="HYPERCAR")
    lmgt3 = models.RaceClass(name="LMGT3")
    circuit = models.Circuit(
        name="Interlagos Circuit",
        country="BRA",
        length_km=4.309,
    )
    db.add_all([season, hypercar, lmgt3, circuit])
    db.flush()
    db.add(
        models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=4,
            name="6 Hours of São Paulo",
            date_start=datetime.now(timezone.utc).date() - timedelta(days=2),
            date_end=datetime.now(timezone.utc).date() - timedelta(days=1),
        )
    )
    peugeot = models.Manufacturer(name="Peugeot")
    genesis = models.Manufacturer(name="Genesis")
    vista = models.Team(name="Vista AF Corse")
    iron_lynx = models.Team(name="Iron Lynx")
    db.add_all(
        [
            models.Driver(name="André Lotterer"),
            models.Driver(name="Daniel Juncadella"),
            models.Driver(name="Matteo Cressoni"),
            peugeot,
            genesis,
            vista,
            iron_lynx,
        ]
    )
    db.flush()
    db.add_all(
        [
            models.Car(
                season_id=season.id,
                team_id=vista.id,
                race_class_id=hypercar.id,
                number="17",
            ),
            models.Car(
                season_id=season.id,
                team_id=iron_lynx.id,
                race_class_id=lmgt3.id,
                number="79",
            ),
        ]
    )
    db.commit()
    return db, season, {"HYPERCAR": hypercar.id, "LMGT3": lmgt3.id}


def test_ingests_published_categories_and_keeps_zero_point_rows() -> None:
    db, season, race_class_ids = _session()
    try:
        counts = _ingest_standings(
            BeautifulSoup(STANDINGS_HTML, "lxml"),
            db,
            season.id,
            race_class_ids,
            2026,
        )
        db.flush()

        assert counts == {"drivers": 3, "manufacturers": 2, "teams": 2}

        drivers = db.query(models.StandingDriver).all()
        assert len(drivers) == 3
        assert sorted(row.points for row in drivers) == [0, 0, 4]

        manufacturers = (
            db.query(models.StandingManufacturer)
            .join(models.Manufacturer)
            .order_by(models.StandingManufacturer.position)
            .all()
        )
        assert [row.manufacturer.name for row in manufacturers] == [
            "Peugeot",
            "Genesis",
        ]
        assert [row.points for row in manufacturers] == [15, 6]

        teams = (
            db.query(models.StandingTeam)
            .order_by(models.StandingTeam.position)
            .all()
        )
        assert [(row.car_number, row.points) for row in teams] == [
            ("54", 0),
            ("79", 0),
        ]
        assert all(row.race_class_id == race_class_ids["LMGT3"] for row in teams)
        assert all(
            row.race_class_id == race_class_ids["HYPERCAR"]
            for row in manufacturers
        )
    finally:
        db.close()


def test_unmapped_row_aborts_so_last_good_standings_can_be_rolled_back() -> None:
    db, season, race_class_ids = _session()
    try:
        genesis = (
            db.query(models.Manufacturer).filter_by(name="Genesis").one()
        )
        sentinel = models.StandingManufacturer(
            season_id=season.id,
            manufacturer_id=genesis.id,
            race_class_id=race_class_ids["HYPERCAR"],
            position=8,
            points=6,
        )
        db.add(sentinel)
        db.commit()

        bad_html = STANDINGS_HTML.replace(
            "André Lotterer", "Unmapped Driver"
        )
        db.execute(
            delete(models.StandingManufacturer).where(
                models.StandingManufacturer.season_id == season.id
            )
        )

        with pytest.raises(RuntimeError, match="unmapped HYPERCAR standings driver"):
            _ingest_standings(
                BeautifulSoup(bad_html, "lxml"),
                db,
                season.id,
                race_class_ids,
                2026,
            )
        db.rollback()

        restored = db.query(models.StandingManufacturer).one()
        assert restored.id == sentinel.id
        assert restored.points == 6
    finally:
        db.close()


def test_completed_season_data_requires_at_least_one_standings_table() -> None:
    db, season, race_class_ids = _session()
    try:
        with pytest.raises(RuntimeError, match="no standings tables found"):
            _ingest_standings(
                BeautifulSoup("<h2>Standings unavailable</h2>", "lxml"),
                db,
                season.id,
                race_class_ids,
                2026,
            )
    finally:
        db.close()


def test_completed_modern_season_rejects_one_missing_championship_table() -> None:
    db, season, race_class_ids = _session()
    try:
        soup = BeautifulSoup(STANDINGS_HTML, "lxml")
        heading = next(
            h
            for h in soup.find_all("h3")
            if "Manufacturers" in h.get_text()
        )
        heading.find_next("table").decompose()
        heading.decompose()

        with pytest.raises(
            RuntimeError,
            match="missing required standings tables: HYPERCAR manufacturers",
        ):
            _ingest_standings(
                soup,
                db,
                season.id,
                race_class_ids,
                2026,
            )
    finally:
        db.close()

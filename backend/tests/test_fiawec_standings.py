from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest.fiawec_standings import (
    ingest_fiawec_standings,
    parse_published_standings,
)


FIA_STANDINGS_HTML = """
<button>FIA Hypercar World Endurance Manufacturers’ Championship</button>
<div><table>
  <thead><tr><th>Pos.</th><th>Manufacturer</th><th>Total points</th></tr></thead>
  <tbody><tr><td>1</td><td>GENESIS</td><td>6</td></tr></tbody>
</table></div>
<button>FIA Hypercar World Endurance Drivers Championship</button>
<div><table>
  <thead><tr><th>Pos.</th><td>N°</td><th>Drivers</th><th>Total points</th></tr></thead>
  <tbody>
    <tr><td>18</td><td>#17</td><td>
      <a href="/en/driver/2026/1">LUÍS FELIPE DERANI</a>
      <a href="/en/driver/2026/4">ANDRÉ LOTTERER</a>
    </td><td>4</td></tr>
    <tr><td>22</td><td>#19</td><td>
      <a href="/en/driver/2026/2">DANIEL JUNCADELLA</a>
    </td><td>0</td></tr>
  </tbody>
</table></div>
<button>FIA Endurance Trophy for LMGT3 Teams</button>
<div><table>
  <thead><tr><th>Pos.</th><td>N°</td><th>Team</th><th>Total points</th></tr></thead>
  <tbody>
    <tr><td>17</td><td>#54</td><td>VISTA AF CORSE</td><td>0</td></tr>
    <tr><td>18</td><td>#79</td><td>IRON LYNX</td><td>0</td></tr>
  </tbody>
</table></div>
<button>FIA Endurance Trophy for LMGT3 Drivers</button>
<div><table>
  <thead><tr><th>Pos.</th><td>N°</td><th>Drivers</th><th>Total points</th></tr></thead>
  <tbody>
    <tr><td>26</td><td>#54</td><td>
      <a href="/en/driver/2026/3">THOMAS FLOHR</a>
    </td><td>0</td></tr>
  </tbody>
</table></div>
"""


def _db() -> tuple[Session, models.Season, models.Event]:
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
    genesis = models.Manufacturer(name="Genesis")
    ferrari = models.Manufacturer(name="Ferrari")
    db.add_all([season, hypercar, lmgt3, circuit, genesis, ferrari])
    db.flush()

    event = models.Event(
        season_id=season.id,
        circuit_id=circuit.id,
        round=4,
        name="6 Hours of São Paulo",
        date_start=date(2026, 7, 10),
        date_end=date(2026, 7, 12),
    )
    genesis_team = models.Team(
        name="Genesis Magma Racing",
        manufacturer_id=genesis.id,
    )
    vista = models.Team(name="Vista AF Corse", manufacturer_id=ferrari.id)
    iron_lynx = models.Team(name="Iron Lynx", manufacturer_id=ferrari.id)
    db.add_all([event, genesis_team, vista, iron_lynx])
    db.flush()

    cars = [
        models.Car(
            season_id=season.id,
            team_id=genesis_team.id,
            race_class_id=hypercar.id,
            number="17",
        ),
        models.Car(
            season_id=season.id,
            team_id=genesis_team.id,
            race_class_id=hypercar.id,
            number="19",
        ),
        models.Car(
            season_id=season.id,
            team_id=vista.id,
            race_class_id=lmgt3.id,
            number="54",
        ),
        models.Car(
            season_id=season.id,
            team_id=iron_lynx.id,
            race_class_id=lmgt3.id,
            number="79",
        ),
    ]
    drivers = [
        models.Driver(name="Pipo Derani"),
        models.Driver(name="André Lotterer"),
        models.Driver(name="Daniel Juncadella"),
        models.Driver(name="Thomas Flohr"),
    ]
    db.add_all(cars + drivers)
    db.flush()
    db.add_all(
        [
            models.CarDriver(
                car_id=cars[0].id,
                driver_id=drivers[0].id,
                season_id=season.id,
            ),
            models.CarDriver(
                car_id=cars[1].id,
                driver_id=drivers[2].id,
                season_id=season.id,
            ),
            models.CarDriver(
                car_id=cars[2].id,
                driver_id=drivers[3].id,
                season_id=season.id,
            ),
            models.CarDriver(
                car_id=cars[0].id,
                driver_id=drivers[1].id,
                season_id=season.id,
            ),
        ]
    )
    db.commit()
    return db, season, event


def test_parses_all_modern_championship_tables_and_zero_points() -> None:
    rows = parse_published_standings(FIA_STANDINGS_HTML)

    assert len(rows) == 7
    assert {(row["kind"], row["race_class"]) for row in rows} == {
        ("drivers", "HYPERCAR"),
        ("manufacturers", "HYPERCAR"),
        ("drivers", "LMGT3"),
        ("teams", "LMGT3"),
    }
    assert len([row for row in rows if row["points"] == 0]) == 4


def test_ingest_resolves_official_driver_alias_and_car_number_teams() -> None:
    db, season, event = _db()
    try:
        counts = ingest_fiawec_standings(
            db,
            season.id,
            2026,
            event.id,
            html=FIA_STANDINGS_HTML,
        )

        assert counts == {"drivers": 4, "manufacturers": 1, "teams": 2}
        derani = (
            db.query(models.StandingDriver)
            .join(models.Driver)
            .filter(models.Driver.name == "Pipo Derani")
            .one()
        )
        assert derani.points == 4
        assert [
            (row.car_number, row.points)
            for row in db.query(models.StandingTeam)
            .order_by(models.StandingTeam.position)
            .all()
        ] == [("54", 0), ("79", 0)]
    finally:
        db.close()


def test_parser_rejects_a_partial_official_response() -> None:
    partial = FIA_STANDINGS_HTML.replace(
        "FIA Endurance Trophy for LMGT3 Drivers",
        "Unrelated table",
    )
    with pytest.raises(ValueError, match="missing FIA WEC standings tables"):
        parse_published_standings(partial)


def test_ingest_rejects_one_missing_driver_link_from_a_crew() -> None:
    db, season, event = _db()
    try:
        partial = FIA_STANDINGS_HTML.replace(
            '<a href="/en/driver/2026/4">ANDRÉ LOTTERER</a>',
            "ANDRÉ LOTTERER",
        )
        with pytest.raises(
            ValueError,
            match="driver standings do not match the completed-round roster",
        ):
            ingest_fiawec_standings(
                db,
                season.id,
                2026,
                event.id,
                html=partial,
            )
    finally:
        db.close()


def test_ingest_rejects_manufacturer_not_on_the_hypercar_grid() -> None:
    db, season, event = _db()
    try:
        wrong_manufacturer = FIA_STANDINGS_HTML.replace(
            "<td>GENESIS</td>",
            "<td>FERRARI</td>",
        )
        with pytest.raises(
            ValueError,
            match="manufacturer standings do not match the season grid",
        ):
            ingest_fiawec_standings(
                db,
                season.id,
                2026,
                event.id,
                html=wrong_manufacturer,
            )
    finally:
        db.close()


def test_ingest_rejects_duplicate_team_car_and_missing_grid_car() -> None:
    db, season, event = _db()
    try:
        wrong_cars = FIA_STANDINGS_HTML.replace(
            "<td>#79</td><td>IRON LYNX</td>",
            "<td>#54</td><td>IRON LYNX</td>",
        )
        with pytest.raises(
            ValueError,
            match="team standings cars do not match the season grid",
        ):
            ingest_fiawec_standings(
                db,
                season.id,
                2026,
                event.id,
                html=wrong_cars,
            )
    finally:
        db.close()

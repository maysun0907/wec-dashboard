from datetime import date

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.routers.drivers import _driver_career
from app.routers.teams import _team_career
from app.routers.manufacturers import _manufacturer_career


def test_career_query_count_does_not_grow_with_seasons():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        manufacturer = models.Manufacturer(name="Test")
        circuit = models.Circuit(name="Test", country="GBR", length_km=5)
        driver = models.Driver(name="Test")
        rc = models.RaceClass(name="HYPERCAR")
        db.add_all([manufacturer, circuit, driver, rc]); db.flush()
        team = models.Team(name="Test", manufacturer_id=manufacturer.id)
        db.add(team); db.flush()
        for year in range(2012, 2026):
            season = models.Season(year=year, championship_name="WEC")
            db.add(season); db.flush()
            car = models.Car(number="1", season_id=season.id, team_id=team.id, race_class_id=rc.id)
            ev = models.Event(name="6 Hours", round=1, season_id=season.id, circuit_id=circuit.id,
                              date_start=date(year, 1, 1), date_end=date(year, 1, 1))
            db.add_all([car, ev]); db.flush()
            session = models.Session(event_id=ev.id, type="RACE", result_status="final")
            db.add(session); db.flush()
            db.add_all([models.CarDriver(car_id=car.id, driver_id=driver.id, season_id=season.id),
                        models.SessionResult(car_id=car.id, session_id=session.id, position=1)])
        db.commit()
        ids = driver.id, team.id, manufacturer.id
    for function, identifier in zip((_driver_career, _team_career, _manufacturer_career), ids):
        statements = []
        def count(_conn, _cursor, statement, *_args):
            statements.append(statement)
        event.listen(engine, "before_cursor_execute", count)
        try:
            with Session(engine) as db:
                career = function(db, identifier)
                assert len(career) == 14
                assert all(row.wins == 1 for row in career)
                assert len(statements) <= 5, (function.__name__, len(statements))
        finally:
            event.remove(engine, "before_cursor_execute", count)
    engine.dispose()

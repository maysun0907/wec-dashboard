from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import models
from app.db import Base, get_db
from app.main import app


def _session() -> tuple[Session, models.Circuit]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = Session(engine)
    db.info["engine"] = engine

    circuit = models.Circuit(name="Spa", country="BEL", length_km=7.004)
    hypercar = models.RaceClass(name="HYPERCAR")
    lmgt3 = models.RaceClass(name="LMGT3")
    seasons = [
        models.Season(year=2025, championship_name="FIA WEC"),
        models.Season(year=2026, championship_name="FIA WEC"),
    ]
    db.add_all([circuit, hypercar, lmgt3, *seasons])
    db.flush()

    for season in seasons:
        event_row = models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=3,
            name=f"6 Hours of Spa {season.year}",
            date_start=date(season.year, 5, 9),
            date_end=date(season.year, 5, 10),
        )
        hyper_team = models.Team(name=f"Hyper Team {season.year}")
        gt_team = models.Team(name=f"GT Team {season.year}")
        db.add_all([event_row, hyper_team, gt_team])
        db.flush()
        cars = [
            models.Car(
                season_id=season.id,
                team_id=hyper_team.id,
                race_class_id=hypercar.id,
                number="1",
            ),
            models.Car(
                season_id=season.id,
                team_id=gt_team.id,
                race_class_id=lmgt3.id,
                number="92",
            ),
        ]
        db.add_all(cars)
        db.flush()
        race = models.Session(event_id=event_row.id, type="RACE")
        db.add(race)
        db.flush()
        db.add_all(
            [
                models.SessionResult(
                    session_id=race.id, car_id=cars[0].id, position=1
                ),
                models.SessionResult(
                    session_id=race.id, car_id=cars[1].id, position=2
                ),
            ]
        )
    db.commit()
    return db, circuit


def test_circuit_history_batches_race_winner_queries() -> None:
    db, circuit = _session()
    engine = db.info["engine"]
    query_count = 0

    def count_queries(*_args: object) -> None:
        nonlocal query_count
        query_count += 1

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    event.listen(engine, "before_cursor_execute", count_queries)
    try:
        with TestClient(app) as client:
            response = client.get(f"/api/v1/circuits/{circuit.id}")
    finally:
        event.remove(engine, "before_cursor_execute", count_queries)
        app.dependency_overrides.clear()
        db.close()

    assert response.status_code == 200
    payload = response.json()
    assert [event_row["seasonYear"] for event_row in payload["events"]] == [
        2026,
        2025,
    ]
    assert [
        (winner["raceClass"], winner["carNumber"], winner["team"])
        for winner in payload["events"][0]["winners"]
    ] == [
        ("HYPERCAR", "1", "Hyper Team 2026"),
        ("LMGT3", "92", "GT Team 2026"),
    ]
    # Circuit, event history, race sessions, and all classifications: four
    # bounded reads regardless of the number of prior events at this circuit.
    assert query_count <= 4

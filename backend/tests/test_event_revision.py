from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.event_revision import event_revision
from app.main import app
from app.routers import events


def test_event_revision_changes_only_with_published_data():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        season = models.Season(year=2026, championship_name="WEC")
        circuit = models.Circuit(name="Fuji Speedway", country="JPN", length_km=4.563)
        team = models.Team(name="Team")
        race_class = models.RaceClass(name="HYPERCAR")
        db.add_all([season, circuit, team, race_class])
        db.flush()
        event = models.Event(
            season_id=season.id, circuit_id=circuit.id, round=1, name="6 Hours of Fuji",
            date_start=date(2026, 9, 27), date_end=date(2026, 9, 27),
        )
        car = models.Car(season_id=season.id, team_id=team.id,
                         race_class_id=race_class.id, number="7")
        db.add_all([event, car])
        db.flush()
        session = models.Session(event_id=event.id, type="Q")
        db.add(session)
        db.flush()

        def version():
            db.flush()
            return event_revision(db, event.id)

        revisions = [version()]
        row = models.SessionResult(id=1, session_id=session.id, car_id=car.id, position=1)
        db.add(row)
        revisions.append(version())
        row.best_lap = "1:30.123"
        revisions.append(version())

        session.results_updated_at = datetime(2026, 9, 26, 6)
        db.execute(delete(models.SessionResult).where(models.SessionResult.id == 1))
        db.add(models.SessionResult(id=2, session_id=session.id, car_id=car.id,
                                    position=1, best_lap="1:30.123"))
        assert version() == revisions[-1]

        session.start_time = datetime(2026, 9, 26, 5)
        revisions.append(version())
        session.result_status = "final"
        revisions.append(version())
        session.air_temp_c = 19
        revisions.append(version())
        session.lap_chart_json = '{"total_laps":12}'
        revisions.append(version())
        db.add(models.PitStopEvent(session_id=session.id, car_id=car.id, lap_number=7))
        revisions.append(version())

        assert len(set(revisions)) == len(revisions)
        assert event_revision(db, 9999) is None


def test_event_revision_is_small_and_readable_from_the_frontend(monkeypatch):
    monkeypatch.setattr(events, "get_event_revision", lambda event_id: "a" * 64 if event_id == 1 else None)
    with TestClient(app) as client:
        response = client.get("/api/v1/events/1/revision",
                              headers={"Origin": "https://www.wecdash.com"})
        assert response.json() == {"version": "a" * 64}
        assert response.headers["cache-control"] == "public, max-age=15"
        assert response.headers["access-control-allow-origin"] == "https://www.wecdash.com"
        assert client.get("/api/v1/events/9999/revision").status_code == 404
        assert client.get("/api/v1/events/2147483648/revision").status_code == 404

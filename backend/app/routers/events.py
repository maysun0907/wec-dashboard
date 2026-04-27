from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.rounds import driver_in_round
from app.scoring import class_position_for, points_for

router = APIRouter(tags=["events"])

_SESSION_ORDER = {"FP1": 1, "FP2": 2, "FP3": 3, "Q": 4, "RACE": 5}


@router.get("/events", response_model=list[schemas.EventOut])
def list_events(db: Session = Depends(get_db)) -> list[models.Event]:
    return (
        db.query(models.Event)
        .options(joinedload(models.Event.circuit))
        .order_by(models.Event.round)
        .all()
    )


@router.get("/events/{event_id}", response_model=schemas.EventDetailOut)
def get_event(event_id: int, db: Session = Depends(get_db)) -> schemas.EventDetailOut:
    event = (
        db.query(models.Event)
        .options(joinedload(models.Event.circuit))
        .filter(models.Event.id == event_id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    sessions = (
        db.query(models.Session)
        .filter(models.Session.event_id == event_id)
        .all()
    )
    sessions.sort(key=lambda s: _SESSION_ORDER.get(s.type, 99))
    return schemas.EventDetailOut(
        id=event.id,
        round=event.round,
        name=event.name,
        date_start=event.date_start,
        date_end=event.date_end,
        format=event.format,
        circuit=schemas.CircuitOut.model_validate(event.circuit),
        sessions=[schemas.SessionOut.model_validate(s) for s in sessions],
    )


@router.get(
    "/sessions/{session_id}/results",
    response_model=list[schemas.SessionResultOut],
)
def session_results(
    session_id: int, db: Session = Depends(get_db)
) -> list[schemas.SessionResultOut]:
    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    event = db.get(models.Event, session.event_id)
    season_id = event.season_id if event else None
    round_num = event.round if event else None

    results = (
        db.query(models.SessionResult)
        .options(
            joinedload(models.SessionResult.car).joinedload(models.Car.team),
            joinedload(models.SessionResult.car).joinedload(models.Car.race_class),
        )
        .filter(models.SessionResult.session_id == session_id)
        .order_by(models.SessionResult.position)
        .all()
    )

    # Per-result drivers come from the race classification when ingested;
    # otherwise we reconstruct from car_drivers, filtered by event round so
    # TBC / Le-Mans-only drivers don't bleed into other rounds.
    drivers_by_car: dict[int, list[str]] = {}
    if results and season_id is not None:
        car_ids = [r.car_id for r in results]
        rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(
                models.CarDriver.car_id.in_(car_ids),
                models.CarDriver.season_id == season_id,
            )
            .all()
        )
        for cd, d in rows:
            if round_num is not None and not driver_in_round(cd.rounds, round_num):
                continue
            drivers_by_car.setdefault(cd.car_id, []).append(d.name)

    out: list[schemas.SessionResultOut] = []
    for r in results:
        cp = class_position_for(
            db, session_id, r.car.race_class_id, r.position
        )
        # Only race sessions award championship points.
        pts = (
            points_for(event.name, cp)
            if (event is not None and session.type == "RACE")
            else 0.0
        )
        out.append(
            schemas.SessionResultOut(
                position=r.position,
                class_position=cp,
                points_awarded=pts,
                car_number=r.car.number,
                team=r.car.team.name,
                drivers=r.drivers or " / ".join(drivers_by_car.get(r.car_id, [])),
                race_class=r.car.race_class.name,
                laps=r.laps,
                gap=r.gap,
                best_lap=r.best_lap,
            )
        )
    return out

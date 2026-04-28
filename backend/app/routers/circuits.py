from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/circuits", tags=["circuits"])


@router.get("", response_model=list[schemas.CircuitOut])
def list_circuits(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[models.Circuit]:
    """List circuits, filtered to those that host an event in the
    resolved season. Pass `year=` explicitly to pin a season; without it
    the API uses the latest ingested season. To get every circuit ever,
    pass `year=0` (no season matches → unfiltered fallback)."""
    season = resolve_season(db, year)
    q = db.query(models.Circuit).order_by(models.Circuit.name)
    if season is not None:
        q = q.filter(
            models.Circuit.id.in_(
                db.query(models.Event.circuit_id).filter(
                    models.Event.season_id == season.id
                )
            )
        )
    return q.all()


@router.get("/{circuit_id}", response_model=schemas.CircuitDetailOut)
def get_circuit(
    circuit_id: int, db: Session = Depends(get_db)
) -> schemas.CircuitDetailOut:
    circuit = db.get(models.Circuit, circuit_id)
    if circuit is None:
        raise HTTPException(status_code=404, detail="Circuit not found")

    # All events held at this circuit, plus their season year
    event_rows = (
        db.query(models.Event, models.Season)
        .join(models.Season, models.Event.season_id == models.Season.id)
        .filter(models.Event.circuit_id == circuit_id)
        .order_by(models.Season.year.desc(), models.Event.round)
        .all()
    )

    events_out: list[schemas.CircuitEventOut] = []
    for ev, season in event_rows:
        # Winners per class for this event's RACE session
        winners: list[schemas.CircuitWinnerOut] = []
        race_session = (
            db.query(models.Session)
            .filter_by(event_id=ev.id, type="RACE")
            .first()
        )
        if race_session is not None:
            # First-place finisher per class
            seen_classes: set[str] = set()
            rows = (
                db.query(models.SessionResult, models.Car, models.Team, models.RaceClass)
                .join(models.Car, models.SessionResult.car_id == models.Car.id)
                .join(models.Team, models.Car.team_id == models.Team.id)
                .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
                .filter(models.SessionResult.session_id == race_session.id)
                .order_by(models.SessionResult.position)
                .all()
            )
            for sr, car, team, rc in rows:
                if rc.name in seen_classes:
                    continue
                seen_classes.add(rc.name)
                winners.append(
                    schemas.CircuitWinnerOut(
                        race_class=rc.name,
                        car_number=car.number,
                        team=team.name,
                    )
                )
        events_out.append(
            schemas.CircuitEventOut(
                event_id=ev.id,
                season_year=season.year,
                round=ev.round,
                name=ev.name,
                date_start=ev.date_start,
                date_end=ev.date_end,
                winners=winners,
            )
        )

    return schemas.CircuitDetailOut(
        id=circuit.id,
        name=circuit.name,
        country=circuit.country,
        length_km=circuit.length_km,
        lap_record=circuit.lap_record,
        events=events_out,
    )

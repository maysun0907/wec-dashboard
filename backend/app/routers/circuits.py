from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.race_state import completed_race_filter
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/circuits", tags=["circuits"])


@router.get("", response_model=list[schemas.CircuitOut])
def list_circuits(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[models.Circuit]:
    """List circuits, filtered to those that host an event in the
    resolved season. Unknown seasons return no circuits, like other lists."""
    season = resolve_season(db, year)
    if season is None:
        return []
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

    # Fetch every race session and its class winners in two bounded queries.
    # The old per-event loop performed two additional queries for each past
    # visit to a circuit, making long-lived tracks progressively slower.
    event_ids = [ev.id for ev, _ in event_rows]
    race_session_ids_by_event: dict[int, int] = {}
    if event_ids:
        for session in (
            db.query(models.Session)
            .join(models.Event, models.Session.event_id == models.Event.id)
            .filter(completed_race_filter())
            .filter(
                models.Session.event_id.in_(event_ids),
                models.Session.type == "RACE",
            )
            .all()
        ):
            race_session_ids_by_event.setdefault(session.event_id, session.id)

    winners_by_event: dict[int, list[schemas.CircuitWinnerOut]] = defaultdict(
        list
    )
    race_session_ids = list(race_session_ids_by_event.values())
    if race_session_ids:
        seen_classes_by_event: dict[int, set[str]] = defaultdict(set)
        rows = (
            db.query(
                models.Session.event_id,
                models.SessionResult,
                models.Car,
                models.Team,
                models.RaceClass,
            )
            .select_from(models.SessionResult)
            .join(
                models.Session,
                models.SessionResult.session_id == models.Session.id,
            )
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
            .filter(models.SessionResult.session_id.in_(race_session_ids))
            .order_by(models.Session.event_id, models.SessionResult.position)
            .all()
        )
        for event_id, _, car, team, race_class in rows:
            seen_classes = seen_classes_by_event[event_id]
            if race_class.name in seen_classes:
                continue
            seen_classes.add(race_class.name)
            winners_by_event[event_id].append(
                schemas.CircuitWinnerOut(
                    race_class=race_class.name,
                    car_number=car.number,
                    team=team.name,
                    team_id=team.id,
                )
            )

    events_out: list[schemas.CircuitEventOut] = []
    for ev, season in event_rows:
        events_out.append(
            schemas.CircuitEventOut(
                event_id=ev.id,
                season_year=season.year,
                round=ev.round,
                name=ev.name,
                date_start=ev.date_start,
                date_end=ev.date_end,
                winners=winners_by_event[ev.id],
            )
        )

    return schemas.CircuitDetailOut(
        id=circuit.id,
        name=circuit.name,
        country=circuit.country,
        length_km=circuit.length_km,
        lap_record=circuit.lap_record,
        layout_image=circuit.layout_image,
        events=events_out,
    )

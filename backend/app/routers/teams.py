from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.scoring import class_position_for, points_for

router = APIRouter(prefix="/teams", tags=["teams"])

CURRENT_SEASON_YEAR = 2026


def _current_season(db: Session) -> models.Season | None:
    return db.query(models.Season).filter_by(year=CURRENT_SEASON_YEAR).first()


@router.get("", response_model=list[schemas.TeamEntryOut])
def list_teams(db: Session = Depends(get_db)) -> list[schemas.TeamEntryOut]:
    """Team entries — one row per car in the current season."""
    cars = (
        db.query(models.Car)
        .options(
            joinedload(models.Car.team).joinedload(models.Team.manufacturer),
            joinedload(models.Car.race_class),
        )
        .all()
    )
    # Sort numerically; "007" → 7 places it next to other 7-ish entries.
    cars.sort(key=lambda c: int(c.number) if c.number.isdigit() else 9999)
    return [
        schemas.TeamEntryOut(
            id=c.team.id,
            name=c.team.name,
            car_number=c.number,
            race_class=c.race_class.name,
            model=c.model,
            manufacturer=(
                c.team.manufacturer.name if c.team.manufacturer is not None else None
            ),
            manufacturer_logo_url=(
                c.team.manufacturer.logo_url
                if c.team.manufacturer is not None
                else None
            ),
        )
        for c in cars
    ]


@router.get("/{team_id}", response_model=schemas.TeamDetailOut)
def get_team(
    team_id: int, db: Session = Depends(get_db)
) -> schemas.TeamDetailOut:
    team = (
        db.query(models.Team)
        .options(joinedload(models.Team.manufacturer))
        .filter(models.Team.id == team_id)
        .first()
    )
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    season = _current_season(db)
    if season is None:
        return schemas.TeamDetailOut(
            id=team.id,
            name=team.name,
            manufacturer=team.manufacturer.name if team.manufacturer else None,
        )

    # All cars this team operates this season
    cars = (
        db.query(models.Car)
        .options(joinedload(models.Car.race_class))
        .filter(models.Car.team_id == team_id)
        .filter(models.Car.season_id == season.id)
        .all()
    )
    cars.sort(key=lambda c: int(c.number) if c.number.isdigit() else 9999)

    # Drivers per car — keep CarDriver alongside Driver for rounds info.
    drivers_by_car: dict[int, list[tuple[models.CarDriver, models.Driver]]] = {}
    if cars:
        rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(models.CarDriver.car_id.in_([c.id for c in cars]))
            .filter(models.CarDriver.season_id == season.id)
            .order_by(models.Driver.name)
            .all()
        )
        for cd, d in rows:
            drivers_by_car.setdefault(cd.car_id, []).append((cd, d))

    # Race results across all team cars, ordered by round + position
    result_rows = []
    if cars:
        result_rows = (
            db.query(models.SessionResult, models.Event, models.Car, models.RaceClass)
            .join(models.Session, models.SessionResult.session_id == models.Session.id)
            .join(models.Event, models.Session.event_id == models.Event.id)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
            .filter(models.Car.team_id == team_id)
            .filter(models.Car.season_id == season.id)
            .filter(models.Session.type == "RACE")
            .filter(models.Event.season_id == season.id)
            .order_by(models.Event.round, models.SessionResult.position)
            .all()
        )

    return schemas.TeamDetailOut(
        id=team.id,
        name=team.name,
        manufacturer=team.manufacturer.name if team.manufacturer else None,
        manufacturer_logo_url=(
            team.manufacturer.logo_url if team.manufacturer else None
        ),
        cars=[
            schemas.TeamCarOut(
                car_id=c.id,
                number=c.number,
                race_class=c.race_class.name,
                model=c.model,
                drivers=[
                    schemas.DriverRef(
                        id=d.id,
                        name=d.name,
                        rounds=cd.rounds,
                        photo_url=d.photo_url,
                    )
                    for cd, d in drivers_by_car.get(c.id, [])
                ],
            )
            for c in cars
        ],
        results=[
            schemas.TeamResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                car_number=car.number,
                race_class=rc.name,
                position=sr.position,
                class_position=class_position_for(
                    db, sr.session_id, car.race_class_id, sr.position
                ),
                points_awarded=points_for(
                    ev.name,
                    class_position_for(
                        db, sr.session_id, car.race_class_id, sr.position
                    ),
                ),
                laps=sr.laps,
                gap=sr.gap,
            )
            for sr, ev, car, rc in result_rows
        ],
    )

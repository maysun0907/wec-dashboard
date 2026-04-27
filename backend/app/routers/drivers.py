import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db


# WEC points awarded per class position. Endurance rounds (Le Mans 24h,
# Bahrain 8h, Qatar 1812 km roughly 10h) use the long table.
_POINTS_LONG = [38, 27, 23, 18, 15, 12, 9, 6, 3, 2]
_POINTS_STANDARD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
_LONG_RACE_RE = re.compile(r"24 Hours|1812 km|8 Hours", re.IGNORECASE)


def _points_for(event_name: str, class_position: int) -> float:
    table = _POINTS_LONG if _LONG_RACE_RE.search(event_name) else _POINTS_STANDARD
    if 1 <= class_position <= len(table):
        return float(table[class_position - 1])
    return 0.0

router = APIRouter(prefix="/drivers", tags=["drivers"])

CURRENT_SEASON_YEAR = 2026


def _current_season(db: Session) -> models.Season | None:
    return db.query(models.Season).filter_by(year=CURRENT_SEASON_YEAR).first()


@router.get("", response_model=list[schemas.DriverEntryOut])
def list_drivers(db: Session = Depends(get_db)) -> list[schemas.DriverEntryOut]:
    """Driver entries for the current season, joined with their car/team/class."""
    rows = (
        db.query(
            models.Driver,
            models.Car,
            models.Team,
            models.RaceClass,
        )
        .join(models.CarDriver, models.CarDriver.driver_id == models.Driver.id)
        .join(models.Car, models.CarDriver.car_id == models.Car.id)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .order_by(models.Driver.name)
        .all()
    )
    return [
        schemas.DriverEntryOut(
            id=d.id,
            name=d.name,
            nationality=d.nationality,
            car_number=c.number,
            team=t.name,
            race_class=rc.name,
        )
        for d, c, t, rc in rows
    ]


@router.get("/{driver_id}", response_model=schemas.DriverDetailOut)
def get_driver(
    driver_id: int, db: Session = Depends(get_db)
) -> schemas.DriverDetailOut:
    driver = db.get(models.Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    season = _current_season(db)
    if season is None:
        return schemas.DriverDetailOut(
            id=driver.id, name=driver.name, nationality=driver.nationality
        )

    # Current-season car / team / class
    row = (
        db.query(models.Car, models.Team, models.Manufacturer, models.RaceClass)
        .join(models.CarDriver, models.CarDriver.car_id == models.Car.id)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .outerjoin(
            models.Manufacturer, models.Team.manufacturer_id == models.Manufacturer.id
        )
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.CarDriver.driver_id == driver_id)
        .filter(models.CarDriver.season_id == season.id)
        .first()
    )

    if row is None:
        return schemas.DriverDetailOut(
            id=driver.id, name=driver.name, nationality=driver.nationality
        )

    car, team, manuf, rc = row

    # Co-drivers in the same car for the same season — keep rounds for each.
    co_driver_rows = (
        db.query(models.CarDriver, models.Driver)
        .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
        .filter(models.CarDriver.car_id == car.id)
        .filter(models.CarDriver.season_id == season.id)
        .filter(models.Driver.id != driver_id)
        .order_by(models.Driver.name)
        .all()
    )

    # Race results for this car (overall position; per-driver attendance not
    # tracked in v1 — every listed driver is treated as having shared the car).
    result_rows = (
        db.query(models.SessionResult, models.Event)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Event, models.Session.event_id == models.Event.id)
        .filter(models.SessionResult.car_id == car.id)
        .filter(models.Session.type == "RACE")
        .filter(models.Event.season_id == season.id)
        .order_by(models.Event.round)
        .all()
    )

    # Class position per result = how many cars in the same session and same
    # class finished ahead, plus one. One extra query per finished round.
    def _class_position(sr: models.SessionResult) -> int:
        better = (
            db.query(func.count(models.SessionResult.id))
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .filter(
                models.SessionResult.session_id == sr.session_id,
                models.Car.race_class_id == car.race_class_id,
                models.SessionResult.position < sr.position,
            )
            .scalar()
            or 0
        )
        return int(better) + 1

    standing = (
        db.query(models.StandingDriver)
        .filter_by(driver_id=driver_id, season_id=season.id)
        .first()
    )

    return schemas.DriverDetailOut(
        id=driver.id,
        name=driver.name,
        nationality=driver.nationality,
        car_number=car.number,
        team=team.name,
        manufacturer=manuf.name if manuf else None,
        race_class=rc.name,
        car_model=car.model,
        co_drivers=[
            schemas.DriverRef(id=d.id, name=d.name, rounds=cd.rounds)
            for cd, d in co_driver_rows
        ],
        results=[
            schemas.DriverResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                position=sr.position,
                class_position=_class_position(sr),
                points_awarded=_points_for(ev.name, _class_position(sr)),
                laps=sr.laps,
                gap=sr.gap,
            )
            for sr, ev in result_rows
        ],
        standing=(
            schemas.DriverStandingRef(
                position=standing.position, points=standing.points
            )
            if standing
            else None
        ),
    )

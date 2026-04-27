from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

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

    # Co-drivers in the same car for the same season
    co_drivers = (
        db.query(models.Driver)
        .join(models.CarDriver, models.CarDriver.driver_id == models.Driver.id)
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
            schemas.DriverRef(id=d.id, name=d.name) for d in co_drivers
        ],
        results=[
            schemas.DriverResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                position=sr.position,
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

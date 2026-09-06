from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.race_state import completed_race_filter, driver_participated
from app.scoring import class_position_for, points_for, preload_class_positions
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.get("", response_model=list[schemas.DriverEntryOut])
def list_drivers(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.DriverEntryOut]:
    """Driver entries for the selected season, joined with their car/team/class."""
    season = resolve_season(db, year)
    if season is None:
        return []
    rows = (
        db.query(
            models.Driver,
            models.Car,
            models.Team,
            models.Manufacturer,
            models.RaceClass,
        )
        .join(models.CarDriver, models.CarDriver.driver_id == models.Driver.id)
        .join(models.Car, models.CarDriver.car_id == models.Car.id)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .outerjoin(
            models.Manufacturer, models.Team.manufacturer_id == models.Manufacturer.id
        )
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.Car.season_id == season.id)
        .filter(models.CarDriver.season_id == season.id)
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
            manufacturer_logo_url=m.logo_url if m else None,
            photo_url=d.photo_url,
            race_class=rc.name,
        )
        for d, c, t, m, rc in rows
    ]


def _driver_career(
    db: Session, driver_id: int
) -> list[schemas.DriverSeasonOut]:
    """One row per (season, car) the driver appeared in. Includes
    championship position + points (from standings_drivers) and per-row
    race / win / podium tallies for that car-season."""
    rows = (
        db.query(
            models.Season,
            models.Car,
            models.Team,
            models.Manufacturer,
            models.RaceClass,
            models.CarDriver.rounds,
        )
        .join(models.CarDriver, models.CarDriver.season_id == models.Season.id)
        .join(models.Car, models.CarDriver.car_id == models.Car.id)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .outerjoin(
            models.Manufacturer,
            models.Team.manufacturer_id == models.Manufacturer.id,
        )
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.CarDriver.driver_id == driver_id)
        .filter(models.CarDriver.car_id == models.Car.id)
        .order_by(models.Season.year.desc(), models.Car.number)
        .all()
    )

    out: list[schemas.DriverSeasonOut] = []
    driver = db.get(models.Driver, driver_id)
    for season, car, team, manuf, rc, rounds in rows:
        standing = (
            db.query(models.StandingDriver)
            .filter_by(
                driver_id=driver_id,
                season_id=season.id,
                race_class_id=rc.id,
            )
            .first()
        )
        # Race tallies: walk every race-session result for this car and run
        # class_position_for to compute the in-class finish.
        result_rows = (
            db.query(models.SessionResult, models.Event)
            .join(models.Session, models.SessionResult.session_id == models.Session.id)
            .join(models.Event, models.Session.event_id == models.Event.id)
            .filter(models.SessionResult.car_id == car.id)
            .filter(models.Session.type == "RACE")
            .filter(completed_race_filter())
            .all()
        )
        result_rows = [sr for sr, ev in result_rows if driver is not None
                       and driver_participated(driver.name, rounds, ev.round, sr.drivers)]
        preload_class_positions(db, (sr.session_id for sr in result_rows))
        races = len(result_rows)
        wins = 0
        podiums = 0
        for sr in result_rows:
            cp = class_position_for(db, sr.session_id, rc.id, sr.position)
            if cp == 1:
                wins += 1
            if 1 <= cp <= 3:
                podiums += 1
        out.append(
            schemas.DriverSeasonOut(
                year=season.year,
                team=team.name,
                team_id=team.id,
                manufacturer=manuf.name if manuf else None,
                manufacturer_logo_url=manuf.logo_url if manuf else None,
                race_class=rc.name,
                car_number=car.number,
                championship_position=standing.position if standing else None,
                points=standing.points if standing else None,
                races=races,
                wins=wins,
                podiums=podiums,
            )
        )
    return out


@router.get("/{driver_id}", response_model=schemas.DriverDetailOut)
def get_driver(
    driver_id: int,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> schemas.DriverDetailOut:
    driver = db.get(models.Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    career = _driver_career(db, driver_id)

    season = resolve_season(db, year)
    if season is None:
        return schemas.DriverDetailOut(
            id=driver.id,
            name=driver.name,
            nationality=driver.nationality,
            photo_url=driver.photo_url,
            seasons=career,
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
        .options(joinedload(models.Car.car_model))
        .filter(models.CarDriver.driver_id == driver_id)
        .filter(models.CarDriver.season_id == season.id)
        .first()
    )

    if row is None:
        return schemas.DriverDetailOut(
            id=driver.id,
            name=driver.name,
            nationality=driver.nationality,
            photo_url=driver.photo_url,
            seasons=career,
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

    attendance = db.query(models.CarDriver).filter_by(car_id=car.id, driver_id=driver_id).one()
    # Only completed races actually entered by this driver belong in history.
    result_rows = (
        db.query(models.SessionResult, models.Event)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Event, models.Session.event_id == models.Event.id)
        .filter(models.SessionResult.car_id == car.id)
        .filter(models.Session.type == "RACE")
        .filter(models.Event.season_id == season.id)
        .filter(completed_race_filter())
        .order_by(models.Event.round)
        .all()
    )
    result_rows = [(sr, ev) for sr, ev in result_rows
                   if driver_participated(driver.name, attendance.rounds, ev.round, sr.drivers)]
    preload_class_positions(db, (sr.session_id for sr, _ev in result_rows))

    def _cp(sr: models.SessionResult) -> int:
        return class_position_for(
            db, sr.session_id, car.race_class_id, sr.position
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
        team_id=team.id,
        manufacturer=manuf.name if manuf else None,
        manufacturer_logo_url=manuf.logo_url if manuf else None,
        photo_url=driver.photo_url,
        race_class=rc.name,
        car_model=car.model,
        car_model_slug=car.car_model.slug if car.car_model else None,
        co_drivers=[
            schemas.DriverRef(
                id=d.id, name=d.name, rounds=cd.rounds, photo_url=d.photo_url
            )
            for cd, d in co_driver_rows
        ],
        results=[
            schemas.DriverResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                position=sr.position,
                class_position=_cp(sr),
                points_awarded=points_for(ev.name, _cp(sr)),
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
        seasons=career,
    )

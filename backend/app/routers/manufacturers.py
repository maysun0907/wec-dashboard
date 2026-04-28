from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.scoring import class_position_for, points_for
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/manufacturers", tags=["manufacturers"])


@router.get("/{manufacturer_id}", response_model=schemas.ManufacturerDetailOut)
def get_manufacturer(
    manufacturer_id: int,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> schemas.ManufacturerDetailOut:
    """Profile for a manufacturer in the current season — every car running
    the brand (across all teams), per-round results, and championship rows
    where the brand has one (Hypercar only — LMGT3 has no manufacturers'
    trophy)."""
    manuf = db.get(models.Manufacturer, manufacturer_id)
    if manuf is None:
        raise HTTPException(status_code=404, detail="Manufacturer not found")

    season = resolve_season(db, year)
    if season is None:
        return schemas.ManufacturerDetailOut(
            id=manuf.id,
            name=manuf.name,
            country=manuf.country,
            logo_url=manuf.logo_url,
        )

    # Every current-season car whose team is bound to this manufacturer.
    car_rows = (
        db.query(models.Car, models.Team, models.RaceClass)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.Team.manufacturer_id == manufacturer_id)
        .filter(models.Car.season_id == season.id)
        .all()
    )
    car_rows.sort(
        key=lambda r: int(r[0].number) if r[0].number.isdigit() else 9999
    )
    car_ids = [c.id for c, _, _ in car_rows]

    # Drivers per car (with rounds for partial-season filtering UX)
    drivers_by_car: dict[int, list[tuple[models.CarDriver, models.Driver]]] = {}
    if car_ids:
        rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(models.CarDriver.car_id.in_(car_ids))
            .filter(models.CarDriver.season_id == season.id)
            .order_by(models.Driver.name)
            .all()
        )
        for cd, d in rows:
            drivers_by_car.setdefault(cd.car_id, []).append((cd, d))

    # Race results across every car this brand fields, ordered by round +
    # finishing position.
    result_rows = []
    if car_ids:
        result_rows = (
            db.query(
                models.SessionResult,
                models.Event,
                models.Car,
                models.Team,
                models.RaceClass,
            )
            .join(models.Session, models.SessionResult.session_id == models.Session.id)
            .join(models.Event, models.Session.event_id == models.Event.id)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
            .filter(models.Car.id.in_(car_ids))
            .filter(models.Session.type == "RACE")
            .filter(models.Event.season_id == season.id)
            .order_by(models.Event.round, models.SessionResult.position)
            .all()
        )

    # Manufacturers' championship rows (Hypercar only in WEC).
    standing_rows = (
        db.query(models.StandingManufacturer)
        .options(joinedload(models.StandingManufacturer.race_class))
        .filter(models.StandingManufacturer.manufacturer_id == manufacturer_id)
        .filter(models.StandingManufacturer.season_id == season.id)
        .order_by(models.StandingManufacturer.position)
        .all()
    )

    return schemas.ManufacturerDetailOut(
        id=manuf.id,
        name=manuf.name,
        country=manuf.country,
        logo_url=manuf.logo_url,
        cars=[
            schemas.ManufacturerCarOut(
                car_id=car.id,
                car_number=car.number,
                race_class=rc.name,
                team_id=team.id,
                team_name=team.name,
                model=car.model,
                drivers=[
                    schemas.DriverRef(
                        id=d.id,
                        name=d.name,
                        rounds=cd.rounds,
                        photo_url=d.photo_url,
                    )
                    for cd, d in drivers_by_car.get(car.id, [])
                ],
            )
            for car, team, rc in car_rows
        ],
        results=[
            schemas.ManufacturerResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                car_number=car.number,
                team_name=team.name,
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
            for sr, ev, car, team, rc in result_rows
        ],
        standings=[
            schemas.ManufacturerStandingItem(
                race_class=s.race_class.name,
                position=s.position,
                points=s.points,
            )
            for s in standing_rows
        ],
    )

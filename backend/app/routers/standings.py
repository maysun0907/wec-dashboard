from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/standings", tags=["standings"])

# URL query alias — frontend sends ?raceClass=HYPERCAR (camelCase) to match
# the rest of the camelCase API surface.
RaceClassParam = Query(None, alias="raceClass")


def _class_filter(query, model, race_class: str | None):
    if race_class is None:
        return query
    return query.filter(model.race_class.has(name=race_class.upper()))


@router.get("/drivers", response_model=list[schemas.StandingDriverOut])
def driver_standings(
    race_class: str | None = RaceClassParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingDriverOut]:
    q = db.query(models.StandingDriver).options(
        joinedload(models.StandingDriver.driver),
        joinedload(models.StandingDriver.race_class),
    )
    q = _class_filter(q, models.StandingDriver, race_class)
    rows = q.order_by(models.StandingDriver.position).all()
    return [
        schemas.StandingDriverOut(
            position=r.position,
            driver_id=r.driver_id,
            driver_name=r.driver.name,
            race_class=r.race_class.name,
            points=r.points,
        )
        for r in rows
    ]


@router.get("/teams", response_model=list[schemas.StandingTeamOut])
def team_standings(
    race_class: str | None = RaceClassParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingTeamOut]:
    q = db.query(models.StandingTeam).options(
        joinedload(models.StandingTeam.team).joinedload(models.Team.manufacturer),
        joinedload(models.StandingTeam.race_class),
    )
    q = _class_filter(q, models.StandingTeam, race_class)
    rows = q.order_by(models.StandingTeam.position).all()
    return [
        schemas.StandingTeamOut(
            position=r.position,
            team_id=r.team_id,
            team_name=r.team.name,
            manufacturer=(
                r.team.manufacturer.name if r.team.manufacturer is not None else None
            ),
            race_class=r.race_class.name,
            points=r.points,
        )
        for r in rows
    ]


@router.get("/manufacturers", response_model=list[schemas.StandingManufacturerOut])
def manufacturer_standings(
    race_class: str | None = RaceClassParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingManufacturerOut]:
    q = db.query(models.StandingManufacturer).options(
        joinedload(models.StandingManufacturer.manufacturer),
        joinedload(models.StandingManufacturer.race_class),
    )
    q = _class_filter(q, models.StandingManufacturer, race_class)
    rows = q.order_by(models.StandingManufacturer.position).all()
    return [
        schemas.StandingManufacturerOut(
            position=r.position,
            manufacturer_id=r.manufacturer_id,
            manufacturer_name=r.manufacturer.name,
            race_class=r.race_class.name,
            points=r.points,
        )
        for r in rows
    ]

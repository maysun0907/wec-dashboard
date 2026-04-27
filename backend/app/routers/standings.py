from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/standings", tags=["standings"])


@router.get("/drivers", response_model=list[schemas.StandingDriverOut])
def driver_standings(db: Session = Depends(get_db)) -> list[schemas.StandingDriverOut]:
    rows = (
        db.query(models.StandingDriver)
        .options(joinedload(models.StandingDriver.driver))
        .order_by(models.StandingDriver.position)
        .all()
    )
    return [
        schemas.StandingDriverOut(
            position=r.position,
            driver_id=r.driver_id,
            driver_name=r.driver.name,
            points=r.points,
        )
        for r in rows
    ]


@router.get("/teams", response_model=list[schemas.StandingTeamOut])
def team_standings(db: Session = Depends(get_db)) -> list[schemas.StandingTeamOut]:
    rows = (
        db.query(models.StandingTeam)
        .options(
            joinedload(models.StandingTeam.team).joinedload(models.Team.manufacturer)
        )
        .order_by(models.StandingTeam.position)
        .all()
    )
    return [
        schemas.StandingTeamOut(
            position=r.position,
            team_id=r.team_id,
            team_name=r.team.name,
            manufacturer=(
                r.team.manufacturer.name if r.team.manufacturer is not None else None
            ),
            points=r.points,
        )
        for r in rows
    ]


@router.get("/manufacturers", response_model=list[schemas.StandingManufacturerOut])
def manufacturer_standings(
    db: Session = Depends(get_db),
) -> list[schemas.StandingManufacturerOut]:
    rows = (
        db.query(models.StandingManufacturer)
        .options(joinedload(models.StandingManufacturer.manufacturer))
        .order_by(models.StandingManufacturer.position)
        .all()
    )
    return [
        schemas.StandingManufacturerOut(
            position=r.position,
            manufacturer_id=r.manufacturer_id,
            manufacturer_name=r.manufacturer.name,
            points=r.points,
        )
        for r in rows
    ]

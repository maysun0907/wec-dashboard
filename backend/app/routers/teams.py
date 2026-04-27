from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[schemas.TeamEntryOut])
def list_teams(db: Session = Depends(get_db)) -> list[schemas.TeamEntryOut]:
    """Team entries — one row per car in the current season."""
    cars = (
        db.query(models.Car)
        .options(
            joinedload(models.Car.team).joinedload(models.Team.manufacturer),
            joinedload(models.Car.race_class),
        )
        .order_by(models.Car.number)
        .all()
    )
    return [
        schemas.TeamEntryOut(
            id=c.team.id,
            name=c.team.name,
            car_number=c.number,
            race_class=c.race_class.name,
            manufacturer=(
                c.team.manufacturer.name if c.team.manufacturer is not None else None
            ),
        )
        for c in cars
    ]

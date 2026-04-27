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
            manufacturer=(
                c.team.manufacturer.name if c.team.manufacturer is not None else None
            ),
        )
        for c in cars
    ]

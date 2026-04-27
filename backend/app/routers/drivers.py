from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/drivers", tags=["drivers"])


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

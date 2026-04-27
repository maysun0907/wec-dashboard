from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/circuits", tags=["circuits"])


@router.get("", response_model=list[schemas.CircuitOut])
def list_circuits(db: Session = Depends(get_db)) -> list[models.Circuit]:
    return (
        db.query(models.Circuit).order_by(models.Circuit.name).all()
    )

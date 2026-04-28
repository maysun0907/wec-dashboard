from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[schemas.SeasonOut])
def list_seasons(db: Session = Depends(get_db)) -> list[schemas.SeasonOut]:
    """Return every ingested season, newest first. The frontend uses this
    to populate the season switcher."""
    rows = (
        db.query(models.Season).order_by(models.Season.year.desc()).all()
    )
    return [
        schemas.SeasonOut(
            id=s.id, year=s.year, championship_name=s.championship_name
        )
        for s in rows
    ]

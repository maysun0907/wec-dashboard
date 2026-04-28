"""Season resolution for multi-season requests.

Routers accept an optional ?year= query param. When omitted the resolver
falls back to the most recent season actually present in the database —
that way the API auto-rolls over once a new season's data is ingested,
without code changes.
"""
from fastapi import Query
from sqlalchemy.orm import Session

from app import models


YearParam = Query(None, ge=1990, le=2100, description="Season year (e.g., 2026)")


def resolve_season(db: Session, year: int | None) -> models.Season | None:
    """Pick the season for `year` if specified, else the latest ingested
    season. Returns None when the database has no seasons at all."""
    if year is not None:
        return db.query(models.Season).filter_by(year=year).first()
    return (
        db.query(models.Season)
        .order_by(models.Season.year.desc())
        .first()
    )

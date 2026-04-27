"""Shared helpers for ingestion modules.

Idempotent upsert pattern: look up by natural key (usually `name`), update
fields if changed, otherwise insert. Returns the persisted instance.
"""
from sqlalchemy.orm import Session

from app import models


def upsert_manufacturer(
    db: Session, name: str, country: str | None = None
) -> models.Manufacturer:
    obj = db.query(models.Manufacturer).filter_by(name=name).first()
    if obj is None:
        obj = models.Manufacturer(name=name, country=country)
        db.add(obj)
        db.flush()
    elif country and obj.country != country:
        obj.country = country
    return obj


def upsert_team(
    db: Session, name: str, manufacturer_id: int | None = None
) -> models.Team:
    obj = db.query(models.Team).filter_by(name=name).first()
    if obj is None:
        obj = models.Team(name=name, manufacturer_id=manufacturer_id)
        db.add(obj)
        db.flush()
    elif manufacturer_id and obj.manufacturer_id != manufacturer_id:
        obj.manufacturer_id = manufacturer_id
    return obj


def upsert_driver(
    db: Session, name: str, nationality: str | None = None
) -> models.Driver:
    obj = db.query(models.Driver).filter_by(name=name).first()
    if obj is None:
        obj = models.Driver(name=name, nationality=nationality)
        db.add(obj)
        db.flush()
    elif nationality and obj.nationality != nationality:
        obj.nationality = nationality
    return obj


def get_or_create_race_class(db: Session, name: str) -> models.RaceClass:
    obj = db.query(models.RaceClass).filter_by(name=name).first()
    if obj is None:
        obj = models.RaceClass(name=name)
        db.add(obj)
        db.flush()
    return obj


def get_or_create_season(
    db: Session, year: int, championship_name: str = "FIA WEC"
) -> models.Season:
    obj = db.query(models.Season).filter_by(year=year).first()
    if obj is None:
        obj = models.Season(year=year, championship_name=championship_name)
        db.add(obj)
        db.flush()
    return obj

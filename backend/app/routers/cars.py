from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/cars", tags=["cars"])


@router.get("", response_model=list[schemas.CarModelOut])
def list_car_models(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.CarModelOut]:
    """Car models running in the selected season — one row per
    (model, race_class). The same chassis competing in two classes (rare)
    produces two rows."""
    season = resolve_season(db, year)
    if season is None:
        return []

    rows = (
        db.query(models.Car, models.RaceClass, models.CarModel, models.Manufacturer)
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .join(models.CarModel, models.Car.car_model_id == models.CarModel.id)
        .outerjoin(
            models.Manufacturer,
            models.CarModel.manufacturer_id == models.Manufacturer.id,
        )
        .filter(models.Car.season_id == season.id)
        .all()
    )

    grouped: dict[tuple[int, int], dict] = {}
    for car, rc, cm, manuf in rows:
        key = (cm.id, rc.id)
        bucket = grouped.setdefault(
            key,
            {
                "model": cm,
                "race_class": rc,
                "manufacturer": manuf,
                "entries": 0,
            },
        )
        bucket["entries"] += 1

    out = [
        schemas.CarModelOut(
            id=b["model"].id,
            slug=b["model"].slug,
            name=b["model"].name,
            race_class=b["race_class"].name,
            manufacturer=b["manufacturer"].name if b["manufacturer"] else None,
            manufacturer_logo_url=(
                b["manufacturer"].logo_url if b["manufacturer"] else None
            ),
            image_url=b["model"].image_url,
            entries=b["entries"],
        )
        for b in grouped.values()
    ]
    out.sort(key=lambda r: (r.race_class, r.name))
    return out


@router.get("/{slug}", response_model=schemas.CarModelDetailOut)
def get_car_model(
    slug: str,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> schemas.CarModelDetailOut:
    cm = (
        db.query(models.CarModel)
        .options(joinedload(models.CarModel.manufacturer))
        .filter(models.CarModel.slug == slug)
        .first()
    )
    if cm is None:
        raise HTTPException(status_code=404, detail="Car model not found")

    teams: list[schemas.CarModelTeamRef] = []
    season = resolve_season(db, year)
    if season is not None:
        rows = (
            db.query(models.Car, models.Team, models.RaceClass)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
            .filter(models.Car.car_model_id == cm.id)
            .filter(models.Car.season_id == season.id)
            .all()
        )
        rows.sort(key=lambda r: int(r[0].number) if r[0].number.isdigit() else 9999)
        teams = [
            schemas.CarModelTeamRef(
                team_id=team.id,
                team_name=team.name,
                car_number=car.number,
                race_class=rc.name,
            )
            for car, team, rc in rows
        ]

    return schemas.CarModelDetailOut(
        id=cm.id,
        slug=cm.slug,
        name=cm.name,
        manufacturer=cm.manufacturer.name if cm.manufacturer else None,
        manufacturer_logo_url=cm.manufacturer.logo_url if cm.manufacturer else None,
        image_url=cm.image_url,
        category=cm.category,
        engine=cm.engine,
        power_hp=cm.power_hp,
        weight_kg=cm.weight_kg,
        year_introduced=cm.year_introduced,
        teams=teams,
    )

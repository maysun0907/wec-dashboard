from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.scoring import class_position_for
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/cars", tags=["cars"])


def _model_stats(
    db: Session, car_model_id: int, season_id: int
) -> schemas.CarModelStats:
    rows = (
        db.query(models.SessionResult, models.Session, models.Car)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Car, models.SessionResult.car_id == models.Car.id)
        .filter(models.Car.car_model_id == car_model_id)
        .filter(models.Car.season_id == season_id)
        .filter(models.Session.type.in_(["RACE", "Q"]))
        .all()
    )
    races = wins = podiums = poles = 0
    for sr, sess, car in rows:
        cp = class_position_for(db, sess.id, car.race_class_id, sr.position)
        if sess.type == "RACE":
            races += 1
            if cp == 1:
                wins += 1
            if 1 <= cp <= 3:
                podiums += 1
        elif sess.type == "Q" and cp == 1:
            poles += 1
    return schemas.CarModelStats(
        races=races, wins=wins, podiums=podiums, poles=poles
    )


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
    stats = schemas.CarModelStats()
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
        stats = _model_stats(db, cm.id, season.id)

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
        stats=stats,
    )

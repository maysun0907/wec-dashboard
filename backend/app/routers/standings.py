from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.progression import car_manufacturer, completed_class_results, estimated_progression
from app.race_state import is_classified
from app.season import YearParam, resolve_season
from app.standing_snapshot import latest_snapshot_filter

router = APIRouter(prefix="/standings", tags=["standings"])

# URL query alias — frontend sends ?raceClass=HYPERCAR (camelCase) to match
# the rest of the camelCase API surface.
RaceClassParam = Query(None, alias="raceClass")


def _class_filter(query, model, race_class: str | None):
    if race_class is None:
        return query
    return query.filter(model.race_class.has(name=race_class.upper()))


@router.get("/drivers", response_model=list[schemas.StandingDriverOut])
def driver_standings(
    race_class: str | None = RaceClassParam,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingDriverOut]:
    season = resolve_season(db, year)
    if season is None:
        return []
    season_id = season.id

    q = (
        db.query(
            models.StandingDriver,
            models.Driver,
            models.Team,
            models.Manufacturer,
        )
        .join(models.Driver, models.StandingDriver.driver_id == models.Driver.id)
        .outerjoin(
            models.CarDriver,
            (models.CarDriver.driver_id == models.Driver.id)
            & (models.CarDriver.season_id == season_id),
        )
        .outerjoin(models.Car, models.CarDriver.car_id == models.Car.id)
        .outerjoin(models.Team, models.Car.team_id == models.Team.id)
        .outerjoin(
            models.Manufacturer, models.Team.manufacturer_id == models.Manufacturer.id
        )
        .options(joinedload(models.StandingDriver.race_class))
        .filter(models.StandingDriver.season_id == season_id)
    )
    q = q.filter(latest_snapshot_filter(models.StandingDriver))
    q = _class_filter(q, models.StandingDriver, race_class)
    rows = q.order_by(models.StandingDriver.position).all()

    # A driver could match multiple CarDriver rows if they had crew swaps;
    # keep the first row per StandingDriver id.
    seen: set[int] = set()
    out: list[schemas.StandingDriverOut] = []
    for sd, d, t, m in rows:
        if sd.id in seen:
            continue
        seen.add(sd.id)
        out.append(
            schemas.StandingDriverOut(
                position=sd.position,
                driver_id=sd.driver_id,
                driver_name=d.name,
                team=t.name if t else None,
                team_id=t.id if t else None,
                manufacturer_logo_url=m.logo_url if m else None,
                race_class=sd.race_class.name,
                points=sd.points,
            )
        )
    return out


@router.get("/teams", response_model=list[schemas.StandingTeamOut])
def team_standings(
    race_class: str | None = RaceClassParam,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingTeamOut]:
    season = resolve_season(db, year)
    if season is None:
        return []
    q = (
        db.query(models.StandingTeam)
        .options(
            joinedload(models.StandingTeam.team).joinedload(models.Team.manufacturer),
            joinedload(models.StandingTeam.race_class),
        )
        .filter(models.StandingTeam.season_id == season.id)
    )
    q = q.filter(latest_snapshot_filter(models.StandingTeam))
    q = _class_filter(q, models.StandingTeam, race_class)
    rows = q.order_by(models.StandingTeam.position).all()
    return [
        schemas.StandingTeamOut(
            position=r.position,
            team_id=r.team_id,
            team_name=r.team.name,
            car_number=r.car_number,
            manufacturer=(
                r.team.manufacturer.name if r.team.manufacturer is not None else None
            ),
            manufacturer_id=(
                r.team.manufacturer.id if r.team.manufacturer is not None else None
            ),
            manufacturer_logo_url=(
                r.team.manufacturer.logo_url
                if r.team.manufacturer is not None
                else None
            ),
            race_class=r.race_class.name,
            points=r.points,
        )
        for r in rows
    ]


@router.get(
    "/drivers/progression", response_model=list[schemas.DriverProgressionOut]
)
def driver_progression(
    race_class: str | None = RaceClassParam,
    limit: int = Query(5, ge=1, le=20),
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.DriverProgressionOut]:
    """Estimated entry points; published championship standings remain separate."""
    if race_class is None:
        return []
    rc = db.query(models.RaceClass).filter_by(name=race_class.upper()).first()
    season = resolve_season(db, year)
    if rc is None or season is None:
        return []
    return [schemas.DriverProgressionOut(**row) for row in
            estimated_progression(db, season.id, rc.id, "drivers", limit)]


@router.get(
    "/manufacturers/progression",
    response_model=list[schemas.ManufacturerProgressionOut],
)
def manufacturer_progression(
    race_class: str | None = RaceClassParam,
    limit: int = Query(8, ge=1, le=20),
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.ManufacturerProgressionOut]:
    """Estimated entry points; published championship standings remain separate."""
    if race_class is None:
        return []
    rc = db.query(models.RaceClass).filter_by(name=race_class.upper()).first()
    season = resolve_season(db, year)
    if rc is None or season is None:
        return []
    return [schemas.ManufacturerProgressionOut(**row) for row in
            estimated_progression(db, season.id, rc.id, "manufacturers", limit)]


@router.get(
    "/teams/progression", response_model=list[schemas.TeamProgressionOut]
)
def team_progression(
    race_class: str | None = RaceClassParam,
    limit: int = Query(8, ge=1, le=20),
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.TeamProgressionOut]:
    """Estimated entry points; published championship standings remain separate."""
    if race_class is None:
        return []
    rc = db.query(models.RaceClass).filter_by(name=race_class.upper()).first()
    season = resolve_season(db, year)
    if rc is None or season is None:
        return []
    return [schemas.TeamProgressionOut(**row) for row in
            estimated_progression(db, season.id, rc.id, "teams", limit)]


@router.get(
    "/podiums",
    response_model=list[schemas.RoundPodiumOut],
)
def round_podiums(
    race_class: str | None = RaceClassParam,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.RoundPodiumOut]:
    """Per-round top-3 cars in a class. Walks every completed race
    session in the season, sorts overall results to derive class
    position, and returns the top three with team / manufacturer / car
    number / drivers per finish."""
    if race_class is None:
        return []
    rc = (
        db.query(models.RaceClass)
        .filter(models.RaceClass.name == race_class.upper())
        .first()
    )
    if rc is None:
        return []
    season = resolve_season(db, year)
    if season is None:
        return []

    by_event = {}
    for result, event in completed_class_results(db, season.id, rc.id):
        if not is_classified(result.status):
            continue
        by_event.setdefault(event.id, (event, []))[1].append(result)
    out = []
    for ev, results in by_event.values():
        podium = []
        for index, result in enumerate(results[:3], 1):
            car = result.car
            manufacturer = car_manufacturer(car)
            podium.append(schemas.PodiumCarOut(
                class_position=index, car_number=car.number,
                team=car.team.name, team_id=car.team_id,
                manufacturer=manufacturer.name if manufacturer else None,
                manufacturer_logo_url=manufacturer.logo_url if manufacturer else None,
                drivers=result.drivers or "",
            ))
        out.append(schemas.RoundPodiumOut(
            event_id=ev.id, round=ev.round, event_name=ev.name, podium=podium,
        ))
    return out


@router.get("/manufacturers", response_model=list[schemas.StandingManufacturerOut])
def manufacturer_standings(
    race_class: str | None = RaceClassParam,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.StandingManufacturerOut]:
    season = resolve_season(db, year)
    if season is None:
        return []
    q = (
        db.query(models.StandingManufacturer)
        .options(
            joinedload(models.StandingManufacturer.manufacturer),
            joinedload(models.StandingManufacturer.race_class),
        )
        .filter(models.StandingManufacturer.season_id == season.id)
    )
    q = q.filter(latest_snapshot_filter(models.StandingManufacturer))
    q = _class_filter(q, models.StandingManufacturer, race_class)
    rows = q.order_by(models.StandingManufacturer.position).all()
    return [
        schemas.StandingManufacturerOut(
            position=r.position,
            manufacturer_id=r.manufacturer_id,
            manufacturer_name=r.manufacturer.name,
            manufacturer_logo_url=r.manufacturer.logo_url,
            race_class=r.race_class.name,
            points=r.points,
        )
        for r in rows
    ]

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.rounds import driver_in_round
from app.scoring import class_position_for, points_for
from app.season import YearParam, resolve_season

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
    """Cumulative championship points per driver after each completed round.
    Returns the top `limit` drivers by current total."""
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

    today = date.today()
    completed_events = (
        db.query(models.Event)
        .filter(models.Event.season_id == season.id)
        .filter(models.Event.date_end < today)
        .order_by(models.Event.round)
        .all()
    )
    if not completed_events:
        return []

    running: dict[int, float] = {}
    name_by_id: dict[int, str] = {}
    progression: dict[int, list[dict]] = {}

    for event in completed_events:
        race_session = (
            db.query(models.Session)
            .filter_by(event_id=event.id, type="RACE")
            .first()
        )
        if race_session is None:
            continue

        results = (
            db.query(models.SessionResult, models.Car)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .filter(models.SessionResult.session_id == race_session.id)
            .filter(models.Car.race_class_id == rc.id)
            .all()
        )

        round_pts: dict[int, float] = {}
        for sr, car in results:
            cp = class_position_for(db, race_session.id, rc.id, sr.position)
            pts = points_for(event.name, cp)
            if pts <= 0:
                continue
            cd_rows = (
                db.query(models.CarDriver, models.Driver)
                .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
                .filter(models.CarDriver.car_id == car.id)
                .filter(models.CarDriver.season_id == season.id)
                .all()
            )
            for cd, d in cd_rows:
                if not driver_in_round(cd.rounds, event.round):
                    continue
                round_pts[d.id] = round_pts.get(d.id, 0.0) + pts
                name_by_id[d.id] = d.name

        # Make sure every driver who's been in any class car shows up,
        # even with zero progress this round.
        class_drivers = (
            db.query(models.Driver)
            .join(models.CarDriver, models.CarDriver.driver_id == models.Driver.id)
            .join(models.Car, models.CarDriver.car_id == models.Car.id)
            .filter(models.Car.race_class_id == rc.id)
            .filter(models.CarDriver.season_id == season.id)
            .distinct()
            .all()
        )
        for d in class_drivers:
            running.setdefault(d.id, 0.0)
            name_by_id.setdefault(d.id, d.name)

        for did, pts in round_pts.items():
            running[did] = running.get(did, 0.0) + pts

        for did, total in running.items():
            progression.setdefault(did, []).append(
                {"round": event.round, "cumulative_points": total}
            )

    if not progression:
        return []

    top = sorted(
        progression.items(),
        key=lambda kv: kv[1][-1]["cumulative_points"],
        reverse=True,
    )[:limit]

    return [
        schemas.DriverProgressionOut(
            driver_id=did,
            driver_name=name_by_id[did],
            points=[
                schemas.ProgressionPointOut(
                    round=p["round"], cumulative_points=p["cumulative_points"]
                )
                for p in pts
            ],
        )
        for did, pts in top
    ]


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
    """Cumulative points per manufacturer after each completed round.
    Each car's class-position points roll up to its manufacturer."""
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

    today = date.today()
    events = (
        db.query(models.Event)
        .filter(models.Event.season_id == season.id)
        .filter(models.Event.date_end < today)
        .order_by(models.Event.round)
        .all()
    )
    if not events:
        return []

    running: dict[int, float] = {}
    names: dict[int, str] = {}
    progression: dict[int, list[dict]] = {}

    # Initial roster of class manufacturers (so charts include zero-point lines)
    roster = (
        db.query(models.Manufacturer)
        .join(models.Team, models.Team.manufacturer_id == models.Manufacturer.id)
        .join(models.Car, models.Car.team_id == models.Team.id)
        .filter(models.Car.race_class_id == rc.id)
        .filter(models.Car.season_id == season.id)
        .distinct()
        .all()
    )
    for m in roster:
        running[m.id] = 0.0
        names[m.id] = m.name

    for event in events:
        race_session = (
            db.query(models.Session)
            .filter_by(event_id=event.id, type="RACE")
            .first()
        )
        if race_session is None:
            continue
        rows = (
            db.query(models.SessionResult, models.Car, models.Manufacturer)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .outerjoin(
                models.Manufacturer,
                models.Team.manufacturer_id == models.Manufacturer.id,
            )
            .filter(models.SessionResult.session_id == race_session.id)
            .filter(models.Car.race_class_id == rc.id)
            .all()
        )
        round_pts: dict[int, float] = {}
        for sr, _car, manuf in rows:
            if manuf is None:
                continue
            cp = class_position_for(db, race_session.id, rc.id, sr.position)
            pts = points_for(event.name, cp)
            if pts > 0:
                round_pts[manuf.id] = round_pts.get(manuf.id, 0.0) + pts
                names.setdefault(manuf.id, manuf.name)
                running.setdefault(manuf.id, 0.0)
        for mid, pts in round_pts.items():
            running[mid] = running.get(mid, 0.0) + pts
        for mid, total in running.items():
            progression.setdefault(mid, []).append(
                {"round": event.round, "cumulative_points": total}
            )

    top = sorted(
        progression.items(),
        key=lambda kv: kv[1][-1]["cumulative_points"],
        reverse=True,
    )[:limit]
    return [
        schemas.ManufacturerProgressionOut(
            manufacturer_id=mid,
            manufacturer_name=names[mid],
            points=[
                schemas.ProgressionPointOut(
                    round=p["round"], cumulative_points=p["cumulative_points"]
                )
                for p in pts
            ],
        )
        for mid, pts in top
    ]


@router.get(
    "/teams/progression", response_model=list[schemas.TeamProgressionOut]
)
def team_progression(
    race_class: str | None = RaceClassParam,
    limit: int = Query(8, ge=1, le=20),
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.TeamProgressionOut]:
    """Cumulative points per team-car (per car) after each completed round.
    LMGT3 teams' trophy is per-car, so a team running two cars produces two
    independent series."""
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

    today = date.today()
    events = (
        db.query(models.Event)
        .filter(models.Event.season_id == season.id)
        .filter(models.Event.date_end < today)
        .order_by(models.Event.round)
        .all()
    )
    if not events:
        return []

    Key = tuple[int, str]
    running: dict[Key, float] = {}
    info: dict[Key, dict] = {}
    progression: dict[Key, list[dict]] = {}

    roster = (
        db.query(models.Car, models.Team)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .filter(models.Car.race_class_id == rc.id)
        .filter(models.Car.season_id == season.id)
        .all()
    )
    for car, team in roster:
        key = (team.id, car.number)
        running[key] = 0.0
        info[key] = {
            "team_id": team.id,
            "team_name": team.name,
            "car_number": car.number,
        }

    for event in events:
        race_session = (
            db.query(models.Session)
            .filter_by(event_id=event.id, type="RACE")
            .first()
        )
        if race_session is None:
            continue
        rows = (
            db.query(models.SessionResult, models.Car, models.Team)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .filter(models.SessionResult.session_id == race_session.id)
            .filter(models.Car.race_class_id == rc.id)
            .all()
        )
        round_pts: dict[Key, float] = {}
        for sr, car, team in rows:
            cp = class_position_for(db, race_session.id, rc.id, sr.position)
            pts = points_for(event.name, cp)
            if pts > 0:
                key = (team.id, car.number)
                round_pts[key] = round_pts.get(key, 0.0) + pts
                info.setdefault(
                    key,
                    {
                        "team_id": team.id,
                        "team_name": team.name,
                        "car_number": car.number,
                    },
                )
                running.setdefault(key, 0.0)
        for key, pts in round_pts.items():
            running[key] = running.get(key, 0.0) + pts
        for key, total in running.items():
            progression.setdefault(key, []).append(
                {"round": event.round, "cumulative_points": total}
            )

    top = sorted(
        progression.items(),
        key=lambda kv: kv[1][-1]["cumulative_points"],
        reverse=True,
    )[:limit]
    return [
        schemas.TeamProgressionOut(
            team_id=info[key]["team_id"],
            team_name=info[key]["team_name"],
            car_number=info[key]["car_number"],
            points=[
                schemas.ProgressionPointOut(
                    round=p["round"], cumulative_points=p["cumulative_points"]
                )
                for p in pts
            ],
        )
        for key, pts in top
    ]


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

    events = (
        db.query(models.Event)
        .filter(models.Event.season_id == season.id)
        .order_by(models.Event.round)
        .all()
    )
    out: list[schemas.RoundPodiumOut] = []
    for ev in events:
        race_session = (
            db.query(models.Session)
            .filter_by(event_id=ev.id, type="RACE")
            .first()
        )
        if race_session is None:
            continue
        results = (
            db.query(
                models.SessionResult,
                models.Car,
                models.Team,
                models.Manufacturer,
            )
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .outerjoin(
                models.Manufacturer,
                models.Team.manufacturer_id == models.Manufacturer.id,
            )
            .filter(models.SessionResult.session_id == race_session.id)
            .filter(models.Car.race_class_id == rc.id)
            .order_by(models.SessionResult.position)
            .all()
        )
        if not results:
            continue
        podium = [
            schemas.PodiumCarOut(
                class_position=i + 1,
                car_number=car.number,
                team=team.name,
                team_id=team.id,
                manufacturer=manuf.name if manuf else None,
                manufacturer_logo_url=manuf.logo_url if manuf else None,
                drivers=sr.drivers or "",
            )
            for i, (sr, car, team, manuf) in enumerate(results[:3])
        ]
        out.append(
            schemas.RoundPodiumOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                podium=podium,
            )
        )
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

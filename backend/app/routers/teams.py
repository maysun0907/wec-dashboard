from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.scoring import class_position_for, points_for
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[schemas.TeamEntryOut])
def list_teams(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.TeamEntryOut]:
    """Team entries — one row per car in the selected season."""
    season = resolve_season(db, year)
    if season is None:
        return []
    cars = (
        db.query(models.Car)
        .options(
            joinedload(models.Car.team).joinedload(models.Team.manufacturer),
            joinedload(models.Car.race_class),
            joinedload(models.Car.car_model),
        )
        .filter(models.Car.season_id == season.id)
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
            model=c.model,
            car_model_slug=c.car_model.slug if c.car_model is not None else None,
            manufacturer=(
                c.team.manufacturer.name if c.team.manufacturer is not None else None
            ),
            manufacturer_logo_url=(
                c.team.manufacturer.logo_url
                if c.team.manufacturer is not None
                else None
            ),
        )
        for c in cars
    ]


def _team_career(db: Session, team_id: int) -> list[schemas.TeamSeasonOut]:
    """One row per (season, race_class, car_number) the team fielded.
    Pulls championship_position + points from standings_teams when it has
    a row matching all three (LMGT3 + LMP2 trophy in some seasons), else
    leaves both null."""
    rows = (
        db.query(models.Season, models.Car, models.RaceClass)
        .join(models.Car, models.Car.season_id == models.Season.id)
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.Car.team_id == team_id)
        .order_by(models.Season.year.desc())
        .all()
    )

    out: list[schemas.TeamSeasonOut] = []
    for season, car, rc in rows:
        # Match standing by car_number when set (LMGT3); else just by
        # (team, season, race_class) — older teams' trophies were per-team.
        standing = (
            db.query(models.StandingTeam)
            .filter_by(
                team_id=team_id,
                season_id=season.id,
                race_class_id=rc.id,
                car_number=car.number,
            )
            .first()
        )
        if standing is None:
            standing = (
                db.query(models.StandingTeam)
                .filter_by(
                    team_id=team_id,
                    season_id=season.id,
                    race_class_id=rc.id,
                    car_number=None,
                )
                .first()
            )

        result_rows = (
            db.query(models.SessionResult)
            .join(models.Session, models.SessionResult.session_id == models.Session.id)
            .filter(models.SessionResult.car_id == car.id)
            .filter(models.Session.type == "RACE")
            .all()
        )
        races = len(result_rows)
        wins = 0
        podiums = 0
        for sr in result_rows:
            cp = class_position_for(db, sr.session_id, rc.id, sr.position)
            if cp == 1:
                wins += 1
            if 1 <= cp <= 3:
                podiums += 1

        out.append(
            schemas.TeamSeasonOut(
                year=season.year,
                race_class=rc.name,
                car_number=car.number,
                championship_position=standing.position if standing else None,
                points=standing.points if standing else None,
                races=races,
                wins=wins,
                podiums=podiums,
            )
        )
    out.sort(key=lambda s: (-s.year, s.race_class, s.car_number))
    return out


@router.get("/{team_id}", response_model=schemas.TeamDetailOut)
def get_team(
    team_id: int,
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> schemas.TeamDetailOut:
    team = (
        db.query(models.Team)
        .options(joinedload(models.Team.manufacturer))
        .filter(models.Team.id == team_id)
        .first()
    )
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    career = _team_career(db, team_id)

    season = resolve_season(db, year)
    if season is None:
        return schemas.TeamDetailOut(
            id=team.id,
            name=team.name,
            manufacturer=team.manufacturer.name if team.manufacturer else None,
            seasons=career,
        )

    # All cars this team operates this season
    cars = (
        db.query(models.Car)
        .options(
            joinedload(models.Car.race_class),
            joinedload(models.Car.car_model),
        )
        .filter(models.Car.team_id == team_id)
        .filter(models.Car.season_id == season.id)
        .all()
    )
    cars.sort(key=lambda c: int(c.number) if c.number.isdigit() else 9999)

    # Drivers per car — keep CarDriver alongside Driver for rounds info.
    drivers_by_car: dict[int, list[tuple[models.CarDriver, models.Driver]]] = {}
    if cars:
        rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(models.CarDriver.car_id.in_([c.id for c in cars]))
            .filter(models.CarDriver.season_id == season.id)
            .order_by(models.Driver.name)
            .all()
        )
        for cd, d in rows:
            drivers_by_car.setdefault(cd.car_id, []).append((cd, d))

    # Race results across all team cars, ordered by round + position
    result_rows = []
    if cars:
        result_rows = (
            db.query(models.SessionResult, models.Event, models.Car, models.RaceClass)
            .join(models.Session, models.SessionResult.session_id == models.Session.id)
            .join(models.Event, models.Session.event_id == models.Event.id)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
            .filter(models.Car.team_id == team_id)
            .filter(models.Car.season_id == season.id)
            .filter(models.Session.type == "RACE")
            .filter(models.Event.season_id == season.id)
            .order_by(models.Event.round, models.SessionResult.position)
            .all()
        )

    return schemas.TeamDetailOut(
        id=team.id,
        name=team.name,
        manufacturer=team.manufacturer.name if team.manufacturer else None,
        manufacturer_logo_url=(
            team.manufacturer.logo_url if team.manufacturer else None
        ),
        cars=[
            schemas.TeamCarOut(
                car_id=c.id,
                number=c.number,
                race_class=c.race_class.name,
                model=c.model,
                car_model_slug=c.car_model.slug if c.car_model else None,
                drivers=[
                    schemas.DriverRef(
                        id=d.id,
                        name=d.name,
                        rounds=cd.rounds,
                        photo_url=d.photo_url,
                    )
                    for cd, d in drivers_by_car.get(c.id, [])
                ],
            )
            for c in cars
        ],
        results=[
            schemas.TeamResultOut(
                event_id=ev.id,
                round=ev.round,
                event_name=ev.name,
                car_number=car.number,
                race_class=rc.name,
                position=sr.position,
                class_position=class_position_for(
                    db, sr.session_id, car.race_class_id, sr.position
                ),
                points_awarded=points_for(
                    ev.name,
                    class_position_for(
                        db, sr.session_id, car.race_class_id, sr.position
                    ),
                ),
                laps=sr.laps,
                gap=sr.gap,
            )
            for sr, ev, car, rc in result_rows
        ],
        seasons=career,
    )

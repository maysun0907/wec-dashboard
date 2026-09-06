from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.rounds import driver_in_round

router = APIRouter(prefix="/stats", tags=["stats"])


def _championship_titles(
    db: Session, kind: str
) -> list[dict[str, Any]]:
    """Return top entities by championship titles (position == 1) across
    every (season, race_class). `kind` selects the table."""
    # Only completed calendars can contribute a championship title. This
    # deliberately excludes a current leader before the season's last race.
    completed = (
        db.query(models.Event.season_id)
        .group_by(models.Event.season_id)
        .having(func.max(models.Event.date_end) < datetime.now(timezone.utc).date())
    )
    if kind == "drivers":
        rows = (
            db.query(
                models.Driver.id,
                models.Driver.name,
                models.Driver.photo_url,
                func.count(models.StandingDriver.id),
            )
            .join(
                models.StandingDriver,
                models.StandingDriver.driver_id == models.Driver.id,
            )
            .filter(models.StandingDriver.position == 1,
                    models.StandingDriver.season_id.in_(completed))
            .group_by(models.Driver.id, models.Driver.name, models.Driver.photo_url)
            .order_by(func.count(models.StandingDriver.id).desc(), models.Driver.name)
            .limit(15)
            .all()
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "photo_url": r[2],
                "logo_url": None,
                "titles": r[3],
            }
            for r in rows
        ]
    if kind == "manufacturers":
        rows = (
            db.query(
                models.Manufacturer.id,
                models.Manufacturer.name,
                models.Manufacturer.logo_url,
                func.count(models.StandingManufacturer.id),
            )
            .join(
                models.StandingManufacturer,
                models.StandingManufacturer.manufacturer_id == models.Manufacturer.id,
            )
            .filter(models.StandingManufacturer.position == 1,
                    models.StandingManufacturer.season_id.in_(completed))
            .group_by(
                models.Manufacturer.id,
                models.Manufacturer.name,
                models.Manufacturer.logo_url,
            )
            .order_by(
                func.count(models.StandingManufacturer.id).desc(),
                models.Manufacturer.name,
            )
            .limit(15)
            .all()
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "photo_url": None,
                "logo_url": r[2],
                "titles": r[3],
            }
            for r in rows
        ]
    if kind == "teams":
        rows = (
            db.query(
                models.Team.id,
                models.Team.name,
                models.Manufacturer.logo_url,
                func.count(models.StandingTeam.id),
            )
            .join(models.StandingTeam, models.StandingTeam.team_id == models.Team.id)
            .outerjoin(
                models.Manufacturer,
                models.Team.manufacturer_id == models.Manufacturer.id,
            )
            .filter(models.StandingTeam.position == 1,
                    models.StandingTeam.season_id.in_(completed))
            .group_by(
                models.Team.id,
                models.Team.name,
                models.Manufacturer.logo_url,
            )
            .order_by(
                func.count(models.StandingTeam.id).desc(),
                models.Team.name,
            )
            .limit(15)
            .all()
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "photo_url": None,
                "logo_url": r[2],
                "titles": r[3],
            }
            for r in rows
        ]
    return []


def _driver_wins_and_podiums(db: Session) -> tuple[list[dict], list[dict]]:
    """Single-pass aggregation of class wins + podiums per driver across
    every season. Class position is computed inline by sorting each
    (session_id, race_class_id) group's results by overall position."""
    rows = (
        db.query(
            models.SessionResult.session_id,
            models.SessionResult.car_id,
            models.SessionResult.position,
            models.Car.race_class_id,
            models.Event.round,
            models.SessionResult.drivers,
        )
        .join(models.Car, models.SessionResult.car_id == models.Car.id)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Event, models.Session.event_id == models.Event.id)
        .filter(models.Session.type == "RACE",
                models.Event.date_end < datetime.now(timezone.utc).date())
        .all()
    )

    # Group by (session_id, race_class_id) → sorted [(position, car_id)]
    groups = defaultdict(list)
    for session_id, car_id, position, race_class_id, round_num, drivers in rows:
        groups[(session_id, race_class_id)].append((position, car_id, round_num, drivers))
    podium_results = []
    for cars in groups.values():
        cars.sort(key=lambda c: c[0])
        for class_pos, (_, car_id, round_num, drivers) in enumerate(cars[:3], start=1):
            podium_results.append((car_id, round_num, drivers, class_pos))

    # Resolve cars → drivers (one driver may have multiple cars across seasons)
    car_driver_rows = (
        db.query(
            models.CarDriver.car_id,
            models.Driver.id,
            models.Driver.name,
            models.Driver.photo_url,
            models.CarDriver.rounds,
        )
        .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
        .all()
    )
    driver_wins: dict[int, dict[str, Any]] = {}
    driver_podiums: dict[int, dict[str, Any]] = {}
    by_car = defaultdict(list)
    for car_id, driver_id, name, photo, rounds in car_driver_rows:
        by_car[car_id].append((driver_id, name, photo, rounds))
    for car_id, round_num, drivers, class_pos in podium_results:
        actual_names = {n.strip().casefold() for n in (drivers or "").split("/") if n.strip()}
        for driver_id, name, photo, rounds in by_car[car_id]:
            if actual_names:
                if name.casefold() not in actual_names:
                    continue
            elif not driver_in_round(rounds, round_num):
                continue
            if class_pos == 1:
                d = driver_wins.setdefault(
                    driver_id, {"id": driver_id, "name": name, "photo_url": photo, "wins": 0}
                )
                d["wins"] += 1
            d = driver_podiums.setdefault(
                driver_id,
                {"id": driver_id, "name": name, "photo_url": photo, "podiums": 0},
            )
            d["podiums"] += 1

    top_wins = sorted(
        driver_wins.values(), key=lambda d: (-d["wins"], d["name"])
    )[:15]
    top_pods = sorted(
        driver_podiums.values(), key=lambda d: (-d["podiums"], d["name"])
    )[:15]
    return top_wins, top_pods


def _le_mans_winners(db: Session) -> list[dict[str, Any]]:
    """Per-year Le Mans (top class) winners — i.e. who won the 24 Hours.
    Match on the circuit (Circuit de la Sarthe) to catch French-language
    names like '24 Heures du Mans' too. Excludes COTA's 'Lone Star Le
    Mans' round which shares the name but isn't the 24h race."""
    events = (
        db.query(models.Event, models.Season)
        .join(models.Season, models.Event.season_id == models.Season.id)
        .join(models.Circuit, models.Event.circuit_id == models.Circuit.id)
        .filter(models.Circuit.name.ilike("%Sarthe%"))
        .order_by(models.Season.year.desc(), models.Event.round)
        .all()
    )
    out: list[dict[str, Any]] = []
    seen_years: set[int] = set()
    for ev, _season in events:
        race_year = ev.date_start.year
        sess = (
            db.query(models.Session)
            .filter_by(event_id=ev.id, type="RACE")
            .first()
        )
        if sess is None:
            continue
        winner = (
            db.query(
                models.SessionResult, models.Car, models.Team, models.Manufacturer
            )
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .join(models.Team, models.Car.team_id == models.Team.id)
            .outerjoin(
                models.Manufacturer,
                models.Team.manufacturer_id == models.Manufacturer.id,
            )
            .filter(models.SessionResult.session_id == sess.id)
            .order_by(models.SessionResult.position)
            .first()
        )
        if winner is None:
            continue
        if race_year in seen_years:
            continue
        seen_years.add(race_year)
        sr, car, team, manuf = winner
        # Look up driver IDs by name for the winning car (so the front
        # end can /drivers/{id}-link each name in the slash-joined list).
        car_driver_rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(
                models.CarDriver.car_id == car.id,
                models.CarDriver.season_id == ev.season_id,
            )
            .all()
        )
        name_to_id = {d.name: d.id for _cd, d in car_driver_rows}
        refs: list[dict[str, Any]] = []
        if sr.drivers:
            for nm in (n.strip() for n in sr.drivers.split("/") if n.strip()):
                drv_id = name_to_id.get(nm)
                if drv_id is not None:
                    refs.append({"id": drv_id, "name": nm})
        out.append(
            {
                "year": race_year,
                "event_id": ev.id,
                "manufacturer": manuf.name if manuf else None,
                "manufacturer_id": manuf.id if manuf else None,
                "manufacturer_logo_url": manuf.logo_url if manuf else None,
                "team": team.name,
                "team_id": team.id,
                "car_number": car.number,
                "drivers": sr.drivers or "",
                "driver_refs": refs,
            }
        )
    return out


@router.get("/all-time", response_model=schemas.AllTimeStatsOut)
def all_time_stats(db: Session = Depends(get_db)) -> schemas.AllTimeStatsOut:
    """Aggregates spanning every ingested season — championship titles
    per entity, race-win and podium counts per driver, and Le Mans
    winner history. Cached aggressively at the API layer."""
    driver_titles = _championship_titles(db, "drivers")
    mfr_titles = _championship_titles(db, "manufacturers")
    team_titles = _championship_titles(db, "teams")
    driver_wins, driver_podiums = _driver_wins_and_podiums(db)
    le_mans = _le_mans_winners(db)

    return schemas.AllTimeStatsOut(
        driver_titles=[schemas.StatRowOut(**r) for r in driver_titles],
        manufacturer_titles=[schemas.StatRowOut(**r) for r in mfr_titles],
        team_titles=[schemas.StatRowOut(**r) for r in team_titles],
        driver_wins=[schemas.DriverStatOut(**r) for r in driver_wins],
        driver_podiums=[schemas.DriverPodiumStatOut(**r) for r in driver_podiums],
        le_mans_winners=[schemas.LeMansWinnerOut(**r) for r in le_mans],
    )

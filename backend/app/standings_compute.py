"""Legacy self-computed driver / team / manufacturer standings.

This module is intentionally not part of the ingestion pipeline. FIA WEC
scoring includes championship-specific eligibility, manufacturer-entry,
pole-bonus, classification and race-duration rules that cannot be derived
reliably from the dashboard's partial SessionResult rows. Current standings
are mirrored from FIA WEC's published championship tables instead.

The function remains available for development experiments and historical
comparison only; its output must not replace published standings.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session, joinedload

from app import models
from app.rounds import driver_in_round
from app.scoring import points_for


def _split_drivers(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [n.strip() for n in raw.split("/") if n.strip()]


def compute_self_standings(
    db: Session, season_id: int, year: int
) -> dict[str, int]:
    """Wipe and rebuild standings_drivers / standings_teams /
    standings_manufacturers for one season from SessionResults +
    Q pole-position bonuses. Returns row counts per table."""
    today = date.today()

    # Completed RACE events in round order.
    events = (
        db.query(models.Event)
        .filter(models.Event.season_id == season_id)
        .order_by(models.Event.round)
        .all()
    )
    completed_events = [e for e in events if e.date_end < today]
    if not completed_events:
        return {"drivers": 0, "teams": 0, "manufacturers": 0}

    # Pre-fetch lookups.
    name_to_driver_id: dict[str, int] = {
        d.name: d.id for d in db.query(models.Driver).all()
    }
    car_drivers: dict[int, list[tuple[int, str | None, str]]] = defaultdict(list)
    for cd, drv in (
        db.query(models.CarDriver, models.Driver)
        .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
        .filter(models.CarDriver.season_id == season_id)
        .all()
    ):
        car_drivers[cd.car_id].append((drv.id, cd.rounds, drv.name))

    # Cumulative totals as we walk events.
    driver_totals: dict[tuple[int, int], float] = defaultdict(float)
    team_totals: dict[tuple[int, int, str], float] = defaultdict(float)
    mfr_totals: dict[tuple[int, int], float] = defaultdict(float)

    # Snapshot rows we'll insert after the loop.
    driver_rows: list[models.StandingDriver] = []
    team_rows: list[models.StandingTeam] = []
    mfr_rows: list[models.StandingManufacturer] = []

    for event in completed_events:
        race_session = (
            db.query(models.Session)
            .filter(
                models.Session.event_id == event.id,
                models.Session.type == "RACE",
            )
            .first()
        )
        if race_session is None:
            continue

        race_results = (
            db.query(models.SessionResult)
            .options(
                joinedload(models.SessionResult.car).joinedload(models.Car.team),
                joinedload(models.SessionResult.car).joinedload(
                    models.Car.race_class
                ),
                joinedload(models.SessionResult.car).joinedload(
                    models.Car.car_model
                ),
            )
            .filter(models.SessionResult.session_id == race_session.id)
            .order_by(models.SessionResult.position)
            .all()
        )
        if not race_results:
            continue

        # Class-positions are derived in API today (not stored). Re-derive
        # here by sorting per-class, since we already iterate the rows.
        per_class_rank: dict[int, int] = {}
        for r in sorted(race_results, key=lambda x: x.position):
            cls_id = r.car.race_class_id
            per_class_rank[cls_id] = per_class_rank.get(cls_id, 0) + 1
            class_pos = per_class_rank[cls_id]
            pts = points_for(event.name, class_pos)
            if pts <= 0:
                continue

            # Drivers credited with this car's points: prefer the
            # explicit drivers string from the session result; else
            # fall back to the per-round CarDriver mapping.
            names = _split_drivers(r.drivers)
            driver_ids: list[int] = []
            if names:
                for n in names:
                    did = name_to_driver_id.get(n)
                    if did is not None:
                        driver_ids.append(did)
            if not driver_ids:
                for did, rounds_str, _name in car_drivers.get(r.car_id, []):
                    if driver_in_round(rounds_str, event.round):
                        driver_ids.append(did)
            for did in driver_ids:
                driver_totals[(did, cls_id)] += pts

            # Team standing — per-car since both Hypercar and LMGT3
            # award points per entry (a team running two cars has two
            # standings rows).
            team_totals[(r.car.team_id, cls_id, r.car.number)] += pts

            # Manufacturer — via CarModel link when populated, else
            # fall back to Team.manufacturer_id.
            mfr_id: int | None = None
            if r.car.car_model and r.car.car_model.manufacturer_id:
                mfr_id = r.car.car_model.manufacturer_id
            elif r.car.team.manufacturer_id is not None:
                mfr_id = r.car.team.manufacturer_id
            if mfr_id is not None:
                mfr_totals[(mfr_id, cls_id)] += pts

        # ---- Pole bonus (+1 to the driver who set the pole lap).
        # Hyperpole counts when present; otherwise the open-Q lap. Per
        # WEC rules pole bonus is for drivers only — not teams or
        # manufacturers.
        q_session = (
            db.query(models.Session)
            .filter(
                models.Session.event_id == event.id,
                models.Session.type == "Q",
            )
            .first()
        )
        if q_session is not None:
            q_results = (
                db.query(models.SessionResult)
                .options(joinedload(models.SessionResult.car))
                .filter(models.SessionResult.session_id == q_session.id)
                .all()
            )
            # Per-class pole sitter = best (lowest) overall position.
            best_per_class: dict[int, models.SessionResult] = {}
            for r in q_results:
                cls = r.car.race_class_id
                cur = best_per_class.get(cls)
                if cur is None or r.position < cur.position:
                    best_per_class[cls] = r
            for cls_id, pole in best_per_class.items():
                pole_driver_name = pole.hyperpole_driver or pole.qualifying_driver
                if not pole_driver_name:
                    continue
                did = name_to_driver_id.get(pole_driver_name)
                if did is None:
                    continue
                driver_totals[(did, cls_id)] += 1.0

        # Snapshot AFTER this event for the progression chart. We
        # rank per-class by points then write rows for every
        # accumulated driver/team/manufacturer in that class.
        _snapshot_rankings(
            event.id,
            season_id,
            driver_totals,
            team_totals,
            mfr_totals,
            driver_rows,
            team_rows,
            mfr_rows,
        )

    # Wipe + bulk-insert.
    db.query(models.StandingDriver).filter(
        models.StandingDriver.season_id == season_id
    ).delete(synchronize_session=False)
    db.query(models.StandingTeam).filter(
        models.StandingTeam.season_id == season_id
    ).delete(synchronize_session=False)
    db.query(models.StandingManufacturer).filter(
        models.StandingManufacturer.season_id == season_id
    ).delete(synchronize_session=False)
    db.flush()
    db.add_all(driver_rows)
    db.add_all(team_rows)
    db.add_all(mfr_rows)
    db.commit()
    return {
        "drivers": len(driver_rows),
        "teams": len(team_rows),
        "manufacturers": len(mfr_rows),
    }


def _snapshot_rankings(
    after_event_id: int,
    season_id: int,
    driver_totals: dict[tuple[int, int], float],
    team_totals: dict[tuple[int, int, str], float],
    mfr_totals: dict[tuple[int, int], float],
    driver_rows: list[models.StandingDriver],
    team_rows: list[models.StandingTeam],
    mfr_rows: list[models.StandingManufacturer],
) -> None:
    """Append per-class ranked rows for one event snapshot. We share
    the totals dicts across snapshots — they accumulate."""

    # Drivers: group by class, sort by points desc, assign positions.
    by_class: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for (did, cls_id), pts in driver_totals.items():
        by_class[cls_id].append((did, pts))
    for cls_id, rows in by_class.items():
        rows.sort(key=lambda x: -x[1])
        for pos, (did, pts) in enumerate(rows, start=1):
            driver_rows.append(
                models.StandingDriver(
                    season_id=season_id,
                    driver_id=did,
                    race_class_id=cls_id,
                    after_event_id=after_event_id,
                    position=pos,
                    points=pts,
                )
            )

    by_class_team: dict[int, list[tuple[int, str, float]]] = defaultdict(list)
    for (team_id, cls_id, car_no), pts in team_totals.items():
        by_class_team[cls_id].append((team_id, car_no, pts))
    for cls_id, rows in by_class_team.items():
        rows.sort(key=lambda x: -x[2])
        for pos, (team_id, car_no, pts) in enumerate(rows, start=1):
            team_rows.append(
                models.StandingTeam(
                    season_id=season_id,
                    team_id=team_id,
                    race_class_id=cls_id,
                    after_event_id=after_event_id,
                    position=pos,
                    points=pts,
                    car_number=car_no,
                )
            )

    by_class_mfr: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for (mid, cls_id), pts in mfr_totals.items():
        by_class_mfr[cls_id].append((mid, pts))
    for cls_id, rows in by_class_mfr.items():
        rows.sort(key=lambda x: -x[1])
        for pos, (mid, pts) in enumerate(rows, start=1):
            mfr_rows.append(
                models.StandingManufacturer(
                    season_id=season_id,
                    manufacturer_id=mid,
                    race_class_id=cls_id,
                    after_event_id=after_event_id,
                    position=pos,
                    points=pts,
                )
            )

"""Explicitly estimated race points, never a substitute for published tables.

Load a season in bounded queries instead of querying every car in every round.
Manufacturer series are entry-point sums, not manufacturer championship scores.
"""
from collections import defaultdict

from sqlalchemy.orm import Session, joinedload

from app import models
from app.race_state import completed_race_filter, driver_participated, is_classified
from app.scoring import points_for


def completed_class_results(db: Session, season_id: int, class_id: int):
    return (
        db.query(models.SessionResult, models.Event)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Event, models.Session.event_id == models.Event.id)
        .join(models.Car, models.SessionResult.car_id == models.Car.id)
        .options(
            joinedload(models.SessionResult.car).joinedload(models.Car.team)
            .joinedload(models.Team.manufacturer),
            joinedload(models.SessionResult.car).joinedload(models.Car.car_model)
            .joinedload(models.CarModel.manufacturer),
        )
        .filter(models.Event.season_id == season_id,
                models.Car.race_class_id == class_id,
                models.Session.type == "RACE", completed_race_filter())
        .order_by(models.Event.round, models.SessionResult.position,
                  models.SessionResult.car_id)
        .all()
    )


def car_manufacturer(car):
    return (car.car_model.manufacturer if car.car_model and car.car_model.manufacturer
            else car.team.manufacturer)


def estimated_progression(db: Session, season_id: int, class_id: int,
                          kind: str, limit: int) -> list[dict]:
    rows = completed_class_results(db, season_id, class_id)
    if not rows:
        return []
    crews = defaultdict(list)
    if kind == "drivers":
        for cd, driver in (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .join(models.Car, models.CarDriver.car_id == models.Car.id)
            .filter(models.CarDriver.season_id == season_id,
                    models.Car.race_class_id == class_id).all()
        ):
            crews[cd.car_id].append((cd, driver))

    by_round = defaultdict(list)
    for result, event in rows:
        by_round[event.round].append((result, event))
    running = defaultdict(float)
    info = {}
    series = defaultdict(list)
    for round_number, results in by_round.items():
        class_position = 0
        for result, event in results:
            classified = is_classified(result.status)
            if classified:
                class_position += 1
            car = result.car
            entries = []
            if kind == "drivers":
                for cd, driver in crews[car.id]:
                    if driver_participated(driver.name, cd.rounds, round_number, result.drivers):
                        entries.append((driver.id, {"driver_id": driver.id, "driver_name": driver.name}))
            elif kind == "teams":
                entries.append(((car.team_id, car.number), {
                    "team_id": car.team_id, "team_name": car.team.name, "car_number": car.number,
                }))
            else:
                manufacturer = car_manufacturer(car)
                if manufacturer:
                    entries.append((manufacturer.id, {
                        "manufacturer_id": manufacturer.id, "manufacturer_name": manufacturer.name,
                    }))
            for key, metadata in entries:
                running[key] += points_for(event.name, class_position) if classified else 0.0
                info[key] = metadata
        for key, total in running.items():
            series[key].append({"round": round_number, "cumulative_points": total})
    top = sorted(running, key=lambda key: (-running[key], str(key)))[:limit]
    return [{**info[key], "points": series[key], "is_estimate": True} for key in top]

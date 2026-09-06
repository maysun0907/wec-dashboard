"""Batch historical reads shared by driver, team and manufacturer profiles."""
from collections import defaultdict

from sqlalchemy.orm import joinedload

from app import models
from app.race_state import completed_race_filter, is_classified
from app.scoring import class_position_for, preload_class_positions


def career_results(db, car_ids):
    by_car = defaultdict(list)
    if not car_ids:
        return by_car
    rows = (
        db.query(models.SessionResult, models.Event)
        .join(models.Session, models.SessionResult.session_id == models.Session.id)
        .join(models.Event, models.Session.event_id == models.Event.id)
        .options(joinedload(models.SessionResult.car))
        .filter(models.SessionResult.car_id.in_(car_ids), models.Session.type == "RACE", completed_race_filter())
        .order_by(models.Event.round, models.SessionResult.position)
        .all()
    )
    preload_class_positions(db, (result.session_id for result, _ in rows))
    for result, event in rows:
        by_car[result.car_id].append((result, event))
    return by_car


def career_tallies(db, results):
    wins = podiums = 0
    for result in results:
        position = class_position_for(db, result.session_id, result.car.race_class_id,
                                      result.position if is_classified(result.status) else 0)
        wins += position == 1
        podiums += 1 <= position <= 3
    return len(results), wins, podiums

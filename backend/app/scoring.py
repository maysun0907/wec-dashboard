"""Helpers for WEC scoring + class-relative finishing position.

Used by the drivers, events, and teams routers so they share the same
points table and class-rank logic.
"""
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

_POINTS_LONG = [38, 27, 23, 18, 15, 12, 9, 6, 3, 2]
_POINTS_STANDARD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
_LONG_RACE_RE = re.compile(r"24 Hours|1812 km|8 Hours", re.IGNORECASE)


def points_for(event_name: str, class_position: int) -> float:
    """Points the FIA awards for a given finishing class position. Endurance
    rounds (Le Mans 24h, Bahrain 8h, Qatar 1812 km) use the long table."""
    table = _POINTS_LONG if _LONG_RACE_RE.search(event_name) else _POINTS_STANDARD
    if 1 <= class_position <= len(table):
        return float(table[class_position - 1])
    return 0.0


def class_position_for(
    db: Session, session_id: int, race_class_id: int, overall_position: int
) -> int:
    """Rank within the given race class. Counts session_results in the same
    class with a better overall position, plus one."""
    better = (
        db.query(func.count(models.SessionResult.id))
        .join(models.Car, models.SessionResult.car_id == models.Car.id)
        .filter(
            models.SessionResult.session_id == session_id,
            models.Car.race_class_id == race_class_id,
            models.SessionResult.position < overall_position,
        )
        .scalar()
        or 0
    )
    return int(better) + 1

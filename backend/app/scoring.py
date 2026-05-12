"""Helpers for WEC scoring + class-relative finishing position.

Used by the drivers, events, and teams routers so they share the same
points table and class-rank logic.
"""
import re

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
    """Rank within the given race class. Memoized per (DB session,
    session_id) so callers in a per-result loop don't fire N queries —
    the first hit pulls every (position, race_class_id) row for that
    timing session and bins them in Python. Subsequent calls are a
    pure dict lookup. The cache lives on `db.info`, scoped to the
    request, so it can never go stale relative to the data that
    populated it."""
    all_caches: dict[int, dict[tuple[int, int], int]] = db.info.setdefault(
        "_class_positions", {}
    )
    cache = all_caches.get(session_id)
    if cache is None:
        rows = (
            db.query(models.SessionResult.position, models.Car.race_class_id)
            .join(models.Car, models.SessionResult.car_id == models.Car.id)
            .filter(models.SessionResult.session_id == session_id)
            .all()
        )
        by_class: dict[int, list[int]] = {}
        for pos, rcid in rows:
            by_class.setdefault(rcid, []).append(pos)
        cache = {}
        for rcid, positions in by_class.items():
            positions.sort()
            for i, p in enumerate(positions, start=1):
                cache[(rcid, p)] = i
        all_caches[session_id] = cache
    return cache.get((race_class_id, overall_position), 1)

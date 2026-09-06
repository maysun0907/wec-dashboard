"""Helpers for WEC scoring + class-relative finishing position.

Used by the drivers, events, and teams routers so they share the same
points table and class-rank logic.
"""
import re
from collections.abc import Iterable

from sqlalchemy.orm import Session

from app import models
from app.race_state import classified_result_filter

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
    preload_class_positions(db, [session_id])
    all_caches: dict[int, dict[tuple[int, int], int]] = db.info[
        "_class_positions"
    ]
    cache = all_caches[session_id]
    return cache.get((race_class_id, overall_position), 0)


def preload_class_positions(db: Session, session_ids: Iterable[int]) -> None:
    """Warm class-position lookups for several timing sessions at once.

    Detail and history pages commonly render results spanning many rounds.
    ``class_position_for`` is request-memoized, but warming all missing session
    IDs in a single query avoids one additional SQL round-trip per round.
    """
    requested_ids = set(session_ids)
    if not requested_ids:
        return
    all_caches: dict[int, dict[tuple[int, int], int]] = db.info.setdefault(
        "_class_positions", {}
    )
    missing_ids = requested_ids.difference(all_caches)
    if not missing_ids:
        return

    rows = (
        db.query(
            models.SessionResult.session_id,
            models.SessionResult.position,
            models.Car.race_class_id,
        )
        .join(models.Car, models.SessionResult.car_id == models.Car.id)
        .filter(models.SessionResult.session_id.in_(missing_ids))
        .filter(classified_result_filter())
        .all()
    )
    positions_by_session: dict[int, dict[int, list[int]]] = {
        session_id: {} for session_id in missing_ids
    }
    for session_id, position, race_class_id in rows:
        positions_by_session[session_id].setdefault(race_class_id, []).append(
            position
        )

    for session_id, by_class in positions_by_session.items():
        cache: dict[tuple[int, int], int] = {}
        for race_class_id, positions in by_class.items():
            positions.sort()
            for class_position, position in enumerate(positions, start=1):
                cache[(race_class_id, position)] = class_position
        all_caches[session_id] = cache

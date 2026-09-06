"""Shared race-result eligibility; live snapshots are never career wins."""
from datetime import datetime, timezone

from sqlalchemy import and_, or_

from app import models
from app.rounds import driver_in_round


def completed_race_filter():
    """Legacy archives use the event date until a source is collected again."""
    return or_(
        models.Session.result_status.in_(("completed", "final")),
        and_(models.Session.result_status.is_(None),
             models.Event.date_end < datetime.now(timezone.utc).date()),
    )


def driver_participated(name: str, rounds: str | None, round_num: int,
                        actual_drivers: str | None) -> bool:
    if actual_drivers and actual_drivers.strip():
        return name.strip().casefold() in {
            n.strip().casefold() for n in actual_drivers.split("/") if n.strip()
        }
    return driver_in_round(rounds, round_num)

"""Select the latest published snapshot per season and class in one query.

Round chronology, not insertion IDs, defines freshness. Classes can have
different calendars (including Le Mans-only entries); never drop one class
because another class has a more recent round.
"""
from sqlalchemy import func, select

from app import models


def latest_snapshot_filter(model):
    ranked = (
        select(
            model.id.label("id"),
            func.dense_rank().over(
                partition_by=(model.season_id, model.race_class_id),
                order_by=(
                    func.coalesce(models.Event.round, -1).desc(),
                    func.coalesce(model.after_event_id, -1).desc(),
                ),
            ).label("snapshot_rank"),
        )
        .outerjoin(models.Event, model.after_event_id == models.Event.id)
        .subquery()
    )
    return model.id.in_(select(ranked.c.id).where(ranked.c.snapshot_rank == 1))

"""clear out-of-window session timestamps

Revision ID: 4f6b1d9a2c37
Revises: e7c4d2a91b58
Create Date: 2026-07-14 00:00:00.000000

"""
from datetime import date, datetime, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f6b1d9a2c37"
down_revision: Union[str, Sequence[str], None] = "e7c4d2a91b58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_within_event_window(
    event_start: date,
    event_end: date,
    session_start: datetime,
) -> bool:
    return event_start - timedelta(days=4) <= session_start.date() <= (
        event_end + timedelta(days=1)
    )


def upgrade() -> None:
    """Clear timestamps that clearly belong to another race.

    This uses SQLAlchemy values instead of database-specific date arithmetic.
    The data set is small (five sessions per event), so reading it once during
    deployment is inexpensive.
    """
    bind = op.get_bind()
    sessions = sa.table(
        "sessions",
        sa.column("id", sa.Integer()),
        sa.column("event_id", sa.Integer()),
        sa.column("start_time", sa.DateTime()),
    )
    events = sa.table(
        "events",
        sa.column("id", sa.Integer()),
        sa.column("date_start", sa.Date()),
        sa.column("date_end", sa.Date()),
    )
    rows = bind.execute(
        sa.select(
            sessions.c.id,
            sessions.c.start_time,
            events.c.date_start,
            events.c.date_end,
        )
        .select_from(sessions.join(events, sessions.c.event_id == events.c.id))
        .where(sessions.c.start_time.is_not(None))
    ).mappings()
    invalid_ids = [
        row["id"]
        for row in rows
        if not _is_within_event_window(
            row["date_start"], row["date_end"], row["start_time"]
        )
    ]
    if invalid_ids:
        bind.execute(
            sa.update(sessions)
            .where(sessions.c.id.in_(invalid_ids))
            .values(start_time=None)
        )


def downgrade() -> None:
    # Cleared timestamps were known-bad values and cannot be reconstructed.
    pass

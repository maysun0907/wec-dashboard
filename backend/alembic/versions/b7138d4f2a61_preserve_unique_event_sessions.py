"""preserve one stable session per event and type

Revision ID: b7138d4f2a61
Revises: 4f6b1d9a2c37
Create Date: 2026-07-21 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b7138d4f2a61"
down_revision: str | Sequence[str] | None = "4f6b1d9a2c37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Older collectors queried before inserting but had no DB constraint.
    # Collapse any pre-existing duplicates before enforcing that invariant.
    bind = op.get_bind()
    sessions = sa.table(
        "sessions",
        sa.column("id", sa.Integer()),
        sa.column("event_id", sa.Integer()),
        sa.column("type", sa.String()),
    )
    results = sa.table(
        "session_results",
        sa.column("session_id", sa.Integer()),
    )
    pit_stops = sa.table(
        "pit_stop_events",
        sa.column("session_id", sa.Integer()),
    )
    rows = bind.execute(
        sa.select(sessions.c.id, sessions.c.event_id, sessions.c.type).order_by(
            sessions.c.id
        )
    ).all()
    canonical: dict[tuple[int, str], int] = {}
    for session_id, event_id, session_type in rows:
        key = (event_id, session_type)
        keep_id = canonical.setdefault(key, session_id)
        if keep_id == session_id:
            continue
        bind.execute(
            sa.update(results)
            .where(results.c.session_id == session_id)
            .values(session_id=keep_id)
        )
        bind.execute(
            sa.update(pit_stops)
            .where(pit_stops.c.session_id == session_id)
            .values(session_id=keep_id)
        )
        bind.execute(sa.delete(sessions).where(sessions.c.id == session_id))

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.create_unique_constraint(
            "uq_sessions_event_type",
            ["event_id", "type"],
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_constraint("uq_sessions_event_type", type_="unique")

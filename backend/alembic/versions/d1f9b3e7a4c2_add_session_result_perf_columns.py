"""add v-max + Q sector columns to session_results

Revision ID: d1f9b3e7a4c2
Revises: c5e92f3a8f17
Create Date: 2026-05-11 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1f9b3e7a4c2"
down_revision: Union[str, Sequence[str], None] = "c5e92f3a8f17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_results",
        sa.Column("top_speed_kph", sa.Float(), nullable=True),
    )
    op.add_column(
        "session_results",
        sa.Column("s1_time", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "session_results",
        sa.Column("s2_time", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "session_results",
        sa.Column("s3_time", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_results", "s3_time")
    op.drop_column("session_results", "s2_time")
    op.drop_column("session_results", "s1_time")
    op.drop_column("session_results", "top_speed_kph")

"""add events.poster_url

Revision ID: 8a4d2f1c0e9a
Revises: 320c608fea44
Create Date: 2026-05-10 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8a4d2f1c0e9a"
down_revision: Union[str, Sequence[str], None] = "320c608fea44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("poster_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "poster_url")

"""add pit_stops to session_results

Revision ID: 98f379a4df2e
Revises: 15ef32d2c61b
Create Date: 2026-04-29 20:01:44.511782

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '98f379a4df2e'
down_revision: Union[str, Sequence[str], None] = '15ef32d2c61b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_results",
        sa.Column("pit_stops", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_results", "pit_stops")

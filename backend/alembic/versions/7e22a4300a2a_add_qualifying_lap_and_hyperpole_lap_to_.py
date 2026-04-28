"""add qualifying_lap and hyperpole_lap to session_results

Revision ID: 7e22a4300a2a
Revises: 813531c47568
Create Date: 2026-04-29 08:21:46.460938

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e22a4300a2a'
down_revision: Union[str, Sequence[str], None] = '813531c47568'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_results",
        sa.Column("qualifying_lap", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "session_results",
        sa.Column("hyperpole_lap", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_results", "hyperpole_lap")
    op.drop_column("session_results", "qualifying_lap")

"""add qualifying_driver and hyperpole_driver to session_results

Revision ID: 15ef32d2c61b
Revises: 7e22a4300a2a
Create Date: 2026-04-29 18:07:58.383003

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '15ef32d2c61b'
down_revision: Union[str, Sequence[str], None] = '7e22a4300a2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_results",
        sa.Column("qualifying_driver", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "session_results",
        sa.Column("hyperpole_driver", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_results", "hyperpole_driver")
    op.drop_column("session_results", "qualifying_driver")

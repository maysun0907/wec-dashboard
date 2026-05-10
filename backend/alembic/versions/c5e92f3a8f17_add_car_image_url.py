"""add cars.image_url

Revision ID: c5e92f3a8f17
Revises: 8a4d2f1c0e9a
Create Date: 2026-05-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5e92f3a8f17"
down_revision: Union[str, Sequence[str], None] = "8a4d2f1c0e9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cars",
        sa.Column("image_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cars", "image_url")

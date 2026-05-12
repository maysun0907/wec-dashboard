"""add weather + lap_chart_json to sessions

Revision ID: e7c4d2a91b58
Revises: d1f9b3e7a4c2
Create Date: 2026-05-11 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7c4d2a91b58"
down_revision: Union[str, Sequence[str], None] = "d1f9b3e7a4c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("air_temp_c", sa.Float(), nullable=True))
    op.add_column("sessions", sa.Column("track_temp_c", sa.Float(), nullable=True))
    op.add_column("sessions", sa.Column("humidity_pct", sa.Float(), nullable=True))
    op.add_column("sessions", sa.Column("wind_kph", sa.Float(), nullable=True))
    op.add_column("sessions", sa.Column("rain", sa.Boolean(), nullable=True))
    op.add_column("sessions", sa.Column("lap_chart_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "lap_chart_json")
    op.drop_column("sessions", "rain")
    op.drop_column("sessions", "wind_kph")
    op.drop_column("sessions", "humidity_pct")
    op.drop_column("sessions", "track_temp_c")
    op.drop_column("sessions", "air_temp_c")

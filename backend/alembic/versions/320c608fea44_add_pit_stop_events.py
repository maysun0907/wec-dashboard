"""add pit_stop_events table

Revision ID: 320c608fea44
Revises: d8c06731dbb8
Create Date: 2026-04-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '320c608fea44'
down_revision: Union[str, Sequence[str], None] = 'd8c06731dbb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'pit_stop_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('car_id', sa.Integer(), nullable=False),
        sa.Column('lap_number', sa.Integer(), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['car_id'], ['cars.id']),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_pit_stop_events_session_id'),
        'pit_stop_events',
        ['session_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_pit_stop_events_car_id'),
        'pit_stop_events',
        ['car_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_pit_stop_events_car_id'), table_name='pit_stop_events'
    )
    op.drop_index(
        op.f('ix_pit_stop_events_session_id'), table_name='pit_stop_events'
    )
    op.drop_table('pit_stop_events')

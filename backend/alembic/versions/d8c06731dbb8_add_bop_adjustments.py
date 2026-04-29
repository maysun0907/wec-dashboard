"""add bop_adjustments table

Revision ID: d8c06731dbb8
Revises: 0387da0f84d7
Create Date: 2026-04-30 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8c06731dbb8'
down_revision: Union[str, Sequence[str], None] = '0387da0f84d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'bop_adjustments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('car_model_id', sa.Integer(), nullable=False),
        sa.Column('min_weight_kg', sa.Integer(), nullable=True),
        sa.Column('max_power_kw', sa.Integer(), nullable=True),
        sa.Column('max_energy_per_stint_mj', sa.Float(), nullable=True),
        sa.Column('success_handicap_kg', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['car_model_id'], ['car_models.id']),
        sa.ForeignKeyConstraint(['event_id'], ['events.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_bop_adjustments_event_id'),
        'bop_adjustments',
        ['event_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_bop_adjustments_car_model_id'),
        'bop_adjustments',
        ['car_model_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_bop_adjustments_car_model_id'), table_name='bop_adjustments'
    )
    op.drop_index(
        op.f('ix_bop_adjustments_event_id'), table_name='bop_adjustments'
    )
    op.drop_table('bop_adjustments')

"""Track race result state and source provenance.

Revision ID: c81da729e304
Revises: b7138d4f2a61
"""
import sqlalchemy as sa
from alembic import op

revision = "c81da729e304"
down_revision = "b7138d4f2a61"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sessions", sa.Column("result_status", sa.String(20), nullable=True))
    op.add_column("sessions", sa.Column("result_source_url", sa.String(), nullable=True))
    op.add_column("sessions", sa.Column("results_updated_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("sessions", "results_updated_at")
    op.drop_column("sessions", "result_source_url")
    op.drop_column("sessions", "result_status")

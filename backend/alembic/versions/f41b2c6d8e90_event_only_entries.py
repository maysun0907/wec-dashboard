"""Distinguish event-only entries from the championship season grid."""
from alembic import op
import sqlalchemy as sa

revision = "f41b2c6d8e90"
down_revision = "e3a62d709bf1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cars", sa.Column("is_guest", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("cars", "is_guest")

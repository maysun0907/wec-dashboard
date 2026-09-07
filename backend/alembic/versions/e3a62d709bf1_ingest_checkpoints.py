"""Remember successfully ingested source fingerprints across cron runs."""
from alembic import op
import sqlalchemy as sa

revision = "e3a62d709bf1"
down_revision = "d924b01e781a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingest_checkpoints",
        sa.Column("scope", sa.String(100), primary_key=True),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("ingest_checkpoints")

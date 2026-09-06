"""Preserve changed source snapshots for post-race corrections.

Revision ID: d924b01e781a
Revises: c81da729e304
"""
from alembic import op
import sqlalchemy as sa

revision = "d924b01e781a"
down_revision = "c81da729e304"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("source_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("source_url", sa.String(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("collected_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_source_revisions_scope", "source_revisions", ["scope"])


def downgrade():
    op.drop_index("ix_source_revisions_scope", table_name="source_revisions")
    op.drop_table("source_revisions")

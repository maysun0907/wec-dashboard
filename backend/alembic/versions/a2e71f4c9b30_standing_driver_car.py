"""Keep published championship attribution separate from race attendance."""
from alembic import op
import sqlalchemy as sa

revision = "a2e71f4c9b30"
down_revision = "f41b2c6d8e90"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("standings_drivers", sa.Column("car_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_standings_drivers_car_id", "standings_drivers", "cars", ["car_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_standings_drivers_car_id", "standings_drivers", type_="foreignkey")
    op.drop_column("standings_drivers", "car_id")

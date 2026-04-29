"""add car_models table and link cars

Revision ID: 0387da0f84d7
Revises: 98f379a4df2e
Create Date: 2026-04-30 12:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0387da0f84d7'
down_revision: Union[str, Sequence[str], None] = '98f379a4df2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'car_models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('manufacturer_id', sa.Integer(), nullable=True),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('category', sa.String(length=20), nullable=True),
        sa.Column('engine', sa.String(length=120), nullable=True),
        sa.Column('power_hp', sa.Integer(), nullable=True),
        sa.Column('weight_kg', sa.Integer(), nullable=True),
        sa.Column('year_introduced', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['manufacturer_id'], ['manufacturers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_car_models_slug'), 'car_models', ['slug'], unique=True
    )

    op.add_column(
        'cars', sa.Column('car_model_id', sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f('ix_cars_car_model_id'), 'cars', ['car_model_id'], unique=False
    )
    op.create_foreign_key(
        'fk_cars_car_model_id', 'cars', 'car_models', ['car_model_id'], ['id']
    )

    # ---- Backfill: one CarModel per distinct (model, manufacturer_id) pair.
    # Manufacturer is reached via team — Car has no FK direct.
    bind = op.get_bind()
    pairs = bind.execute(sa.text(
        "SELECT DISTINCT TRIM(c.model) AS model, t.manufacturer_id "
        "FROM cars c "
        "JOIN teams t ON t.id = c.team_id "
        "WHERE c.model IS NOT NULL AND TRIM(c.model) <> ''"
    )).fetchall()

    used_slugs: set[str] = set()
    pair_to_id: dict[tuple[str, int | None], int] = {}
    for model, manuf_id in pairs:
        base = _slugify(model) or "model"
        slug = base
        i = 2
        while slug in used_slugs:
            slug = f"{base}-{i}"
            i += 1
        used_slugs.add(slug)
        new_id = bind.execute(
            sa.text(
                "INSERT INTO car_models (slug, name, manufacturer_id) "
                "VALUES (:slug, :name, :manuf_id) RETURNING id"
            ),
            {"slug": slug, "name": model, "manuf_id": manuf_id},
        ).scalar()
        pair_to_id[(model, manuf_id)] = new_id

    for (model, manuf_id), cm_id in pair_to_id.items():
        if manuf_id is None:
            bind.execute(
                sa.text(
                    "UPDATE cars SET car_model_id = :cm_id "
                    "WHERE TRIM(model) = :model "
                    "AND team_id IN (SELECT id FROM teams WHERE manufacturer_id IS NULL)"
                ),
                {"cm_id": cm_id, "model": model},
            )
        else:
            bind.execute(
                sa.text(
                    "UPDATE cars SET car_model_id = :cm_id "
                    "WHERE TRIM(model) = :model "
                    "AND team_id IN (SELECT id FROM teams WHERE manufacturer_id = :manuf_id)"
                ),
                {"cm_id": cm_id, "model": model, "manuf_id": manuf_id},
            )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_cars_car_model_id', 'cars', type_='foreignkey')
    op.drop_index(op.f('ix_cars_car_model_id'), table_name='cars')
    op.drop_column('cars', 'car_model_id')
    op.drop_index(op.f('ix_car_models_slug'), table_name='car_models')
    op.drop_table('car_models')

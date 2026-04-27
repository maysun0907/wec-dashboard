"""SQLAlchemy ORM models.

Importing this package registers all models with `Base.metadata`, which is
what Alembic introspects for autogenerate.
"""
from datetime import date

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(unique=True, index=True)
    championship_name: Mapped[str] = mapped_column(String(100))


class RaceClass(Base):
    __tablename__ = "race_classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    # e.g., "HYPERCAR", "LMP2", "LMGT3"


class Circuit(Base):
    __tablename__ = "circuits"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(3))  # ISO 3166-1 alpha-3
    length_km: Mapped[float]
    layout_image: Mapped[str | None] = mapped_column(default=None)
    lap_record: Mapped[str | None] = mapped_column(String(50), default=None)


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    country: Mapped[str | None] = mapped_column(String(3), default=None)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    round: Mapped[int]
    name: Mapped[str] = mapped_column(String(200))
    date_start: Mapped[date]
    date_end: Mapped[date]
    format: Mapped[str | None] = mapped_column(String(50), default=None)

    season: Mapped["Season"] = relationship()
    circuit: Mapped["Circuit"] = relationship()


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    manufacturer_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturers.id"), default=None
    )
    principal: Mapped[str | None] = mapped_column(String(200), default=None)

    manufacturer: Mapped["Manufacturer | None"] = relationship()


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    nationality: Mapped[str | None] = mapped_column(String(3), default=None)
    dob: Mapped[date | None] = mapped_column(default=None)
    photo_url: Mapped[str | None] = mapped_column(default=None)

"""SQLAlchemy ORM models.

Importing this package registers all models with `Base.metadata`, which is
what Alembic introspects for autogenerate.
"""
from datetime import date, datetime

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
    # Direct URL to a logo image (Wikimedia thumbnail). Populated by the
    # ingester from Wikipedia summary API.
    logo_url: Mapped[str | None] = mapped_column(default=None)


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


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    type: Mapped[str] = mapped_column(String(10))  # FP1/FP2/FP3/Q/RACE
    start_time: Mapped[datetime | None] = mapped_column(default=None)
    weather: Mapped[str | None] = mapped_column(String(50), default=None)

    event: Mapped["Event"] = relationship()


class Car(Base):
    __tablename__ = "cars"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    race_class_id: Mapped[int] = mapped_column(ForeignKey("race_classes.id"))
    # String — cars like Aston Martin Valkyrie use "007"/"009" as their actual number.
    number: Mapped[str] = mapped_column(String(10))
    model: Mapped[str | None] = mapped_column(String(100), default=None)

    season: Mapped["Season"] = relationship()
    team: Mapped["Team"] = relationship()
    race_class: Mapped["RaceClass"] = relationship()


class CarDriver(Base):
    """Junction table: which drivers race a given car in a given season.

    `rounds` stores the source's free-form scheduled-rounds string, e.g.
    "1", "1-3,5-8", "All", "TBC". Use the helper in app.ingest._common to
    test whether a given round is included.
    """

    __tablename__ = "car_drivers"

    car_id: Mapped[int] = mapped_column(ForeignKey("cars.id"), primary_key=True)
    driver_id: Mapped[int] = mapped_column(
        ForeignKey("drivers.id"), primary_key=True
    )
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    rounds: Mapped[str | None] = mapped_column(String(50), default=None)

    car: Mapped["Car"] = relationship()
    driver: Mapped["Driver"] = relationship()
    season: Mapped["Season"] = relationship()


class SessionResult(Base):
    __tablename__ = "session_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    car_id: Mapped[int] = mapped_column(ForeignKey("cars.id"))
    position: Mapped[int]  # overall position in session
    laps: Mapped[int | None] = mapped_column(default=None)
    gap: Mapped[str | None] = mapped_column(String(20), default=None)
    best_lap: Mapped[str | None] = mapped_column(String(20), default=None)
    # Qualifying-session breakdown — Q lap (set in the open Qualifying
    # session) and Hyperpole lap (set in the top-runners shootout).
    # Cars that didn't make the Hyperpole cut have hyperpole_lap=NULL.
    # Best_lap mirrors hyperpole_lap when present, else qualifying_lap,
    # so existing consumers keep working.
    qualifying_lap: Mapped[str | None] = mapped_column(String(20), default=None)
    hyperpole_lap: Mapped[str | None] = mapped_column(String(20), default=None)
    # Driver who actually set the listed Q / Hyperpole lap. Sourced from
    # Al Kamel timing CSVs (lap-by-lap with driver attribution); null when
    # we couldn't match — older seasons predate hyperpole, etc.
    qualifying_driver: Mapped[str | None] = mapped_column(String(120), default=None)
    hyperpole_driver: Mapped[str | None] = mapped_column(String(120), default=None)
    # Pit stop count per car for race sessions, derived from Al Kamel
    # lap analysis (laps with a non-empty PIT_TIME).
    pit_stops: Mapped[int | None] = mapped_column(default=None)
    status: Mapped[str | None] = mapped_column(String(50), default=None)
    # Slash-joined names of drivers who actually raced this car in this
    # session. Populated from race-page classification when available;
    # falls back to round-filtered car_drivers join in the API layer.
    drivers: Mapped[str | None] = mapped_column(String(300), default=None)

    session: Mapped["Session"] = relationship()
    car: Mapped["Car"] = relationship()


class StandingDriver(Base):
    __tablename__ = "standings_drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"))
    race_class_id: Mapped[int] = mapped_column(
        ForeignKey("race_classes.id"), index=True
    )
    after_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id"), default=None
    )
    position: Mapped[int]
    points: Mapped[float]

    season: Mapped["Season"] = relationship()
    driver: Mapped["Driver"] = relationship()
    race_class: Mapped["RaceClass"] = relationship()


class StandingTeam(Base):
    __tablename__ = "standings_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    race_class_id: Mapped[int] = mapped_column(
        ForeignKey("race_classes.id"), index=True
    )
    after_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id"), default=None
    )
    position: Mapped[int]
    points: Mapped[float]
    # In LMGT3 the trophy is per-car, so a team that runs two cars has two
    # standing rows — `car_number` disambiguates them.
    car_number: Mapped[str | None] = mapped_column(String(10), default=None)

    season: Mapped["Season"] = relationship()
    team: Mapped["Team"] = relationship()
    race_class: Mapped["RaceClass"] = relationship()


class StandingManufacturer(Base):
    __tablename__ = "standings_manufacturers"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    manufacturer_id: Mapped[int] = mapped_column(ForeignKey("manufacturers.id"))
    race_class_id: Mapped[int] = mapped_column(
        ForeignKey("race_classes.id"), index=True
    )
    after_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id"), default=None
    )
    position: Mapped[int]
    points: Mapped[float]

    season: Mapped["Season"] = relationship()
    manufacturer: Mapped["Manufacturer"] = relationship()
    race_class: Mapped["RaceClass"] = relationship()

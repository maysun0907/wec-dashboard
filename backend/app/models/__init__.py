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
    # FIA-published official race poster (transparent-bg PNG). Pulled
    # from `fiawec.com/en/race/{slug}` by `app.ingest.fiawec_assets`.
    poster_url: Mapped[str | None] = mapped_column(default=None)

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
    # Pre-computed weather summary (median across the session). Pulled
    # by app.ingest.alkamel from the 26_Weather CSV so /weather is a
    # pure DB read.
    air_temp_c: Mapped[float | None] = mapped_column(default=None)
    track_temp_c: Mapped[float | None] = mapped_column(default=None)
    humidity_pct: Mapped[float | None] = mapped_column(default=None)
    wind_kph: Mapped[float | None] = mapped_column(default=None)
    rain: Mapped[bool | None] = mapped_column(default=None)
    # Pre-computed per-car race lap chart (race sessions only). JSON
    # blob of `schemas.LapChart` so the API doesn't have to refetch +
    # reparse the 2 MB Al Kamel race-analysis CSV per page hit.
    lap_chart_json: Mapped[str | None] = mapped_column(default=None)

    event: Mapped["Event"] = relationship()


class CarModel(Base):
    # Created lazily by the ingester. Spec fields are nullable — filled
    # in via app.curate_car_models from app/data/car_specs.py.
    __tablename__ = "car_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    manufacturer_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturers.id"), default=None
    )
    image_url: Mapped[str | None] = mapped_column(default=None)
    # Category in the modern sense — "LMH" / "LMDh" / "LMP2" / "LMGT3".
    # Differs from race_class because LMH and LMDh both compete in HYPERCAR.
    category: Mapped[str | None] = mapped_column(String(20), default=None)
    engine: Mapped[str | None] = mapped_column(String(120), default=None)
    power_hp: Mapped[int | None] = mapped_column(default=None)
    weight_kg: Mapped[int | None] = mapped_column(default=None)
    year_introduced: Mapped[int | None] = mapped_column(default=None)

    manufacturer: Mapped["Manufacturer | None"] = relationship()


class Car(Base):
    __tablename__ = "cars"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    race_class_id: Mapped[int] = mapped_column(ForeignKey("race_classes.id"))
    # String — cars like Aston Martin Valkyrie use "007"/"009" as their actual number.
    number: Mapped[str] = mapped_column(String(10))
    # FIA-published per-car render (transparent-bg PNG, actual livery
    # for *this* entry's number). When a model has multiple entries
    # in different liveries (Ferrari #50/#51/#83) FIA ships one PNG
    # per number — we mirror them here. Falls back to
    # CarModel.image_url when null. Pulled by app.ingest.fiawec_assets.
    image_url: Mapped[str | None] = mapped_column(default=None)
    # Free-text model name kept for back-compat / when CarModel row is
    # missing. car_model_id is the canonical link once populated.
    model: Mapped[str | None] = mapped_column(String(100), default=None)
    car_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("car_models.id"), default=None, index=True
    )

    season: Mapped["Season"] = relationship()
    team: Mapped["Team"] = relationship()
    race_class: Mapped["RaceClass"] = relationship()
    car_model: Mapped["CarModel | None"] = relationship()


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
    # V-max — peak TOP_SPEED across all the car's race laps. Race
    # rows only; null on practice / qualifying. Populated at ingest
    # time from Al Kamel's race-analysis CSV so the API doesn't have
    # to refetch on every page hit.
    top_speed_kph: Mapped[float | None] = mapped_column(default=None)
    # Sector breakdown of the car's best Q (or HP) lap — raw "MM:SS.xxx"
    # strings as Al Kamel publishes them. Q rows only.
    s1_time: Mapped[str | None] = mapped_column(String(20), default=None)
    s2_time: Mapped[str | None] = mapped_column(String(20), default=None)
    s3_time: Mapped[str | None] = mapped_column(String(20), default=None)
    status: Mapped[str | None] = mapped_column(String(50), default=None)
    # Slash-joined names of drivers who actually raced this car in this
    # session. Populated from race-page classification when available;
    # falls back to round-filtered car_drivers join in the API layer.
    drivers: Mapped[str | None] = mapped_column(String(300), default=None)

    session: Mapped["Session"] = relationship()
    car: Mapped["Car"] = relationship()


class PitStopEvent(Base):
    """One row per car pit visit, derived from Al Kamel lap analysis.

    `lap_number` is the lap the car was crossing the line in pit lane;
    `duration_ms` is the published PIT_TIME (pit-in to pit-out crossing)
    when available. Replaced wholesale on re-ingest.
    """

    __tablename__ = "pit_stop_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"), index=True
    )
    car_id: Mapped[int] = mapped_column(ForeignKey("cars.id"), index=True)
    lap_number: Mapped[int]
    duration_ms: Mapped[int | None] = mapped_column(default=None)

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


class BopAdjustment(Base):
    """Balance of Performance values for a (event, car_model) pair.

    All numeric fields nullable — FIA may publish only weight + energy
    for one round, only power for another, etc. Curated via
    `app.curate_bop` from `app/data/bop.py`.
    """

    __tablename__ = "bop_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    car_model_id: Mapped[int] = mapped_column(
        ForeignKey("car_models.id"), index=True
    )
    min_weight_kg: Mapped[int | None] = mapped_column(default=None)
    max_power_kw: Mapped[int | None] = mapped_column(default=None)
    # Energy ration per stint (LMH/LMDh allotment). FIA publishes this
    # to balance hybrid drivetrains' fuel economy advantage.
    max_energy_per_stint_mj: Mapped[float | None] = mapped_column(default=None)
    # 2026+ "success handicap" added on top of base weight.
    success_handicap_kg: Mapped[int | None] = mapped_column(default=None)

    event: Mapped["Event"] = relationship()
    car_model: Mapped["CarModel"] = relationship()


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

"""Pydantic v2 response schemas for the API.

All responses use camelCase keys (via alias_generator) to match the
frontend's existing TypeScript types. Internally we still use snake_case
attribute names; pydantic translates on serialize.

Use `_OrmBase` for schemas that hydrate from SQLAlchemy ORM rows.
"""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
)
_ORM_CAMEL_CONFIG = ConfigDict(
    from_attributes=True,
    alias_generator=to_camel,
    populate_by_name=True,
)


class _BaseSchema(BaseModel):
    model_config = _CAMEL_CONFIG


class _OrmBase(BaseModel):
    model_config = _ORM_CAMEL_CONFIG


# --- Reference entities ---


class SeasonOut(_OrmBase):
    id: int
    year: int
    championship_name: str


class CircuitOut(_OrmBase):
    id: int
    name: str
    country: str
    length_km: float
    lap_record: str | None = None


class RaceClassOut(_OrmBase):
    id: int
    name: str


class ManufacturerOut(_OrmBase):
    id: int
    name: str
    country: str | None = None


# --- Listings tailored to frontend pages ---


class DriverEntryOut(_BaseSchema):
    """Row for the /drivers page — driver joined with current-season car."""

    id: int
    name: str
    nationality: str | None = None
    car_number: str
    team: str
    manufacturer_logo_url: str | None = None
    photo_url: str | None = None
    race_class: str


class TeamEntryOut(_BaseSchema):
    """Row for the /teams page — one entry per car in the current season."""

    id: int  # team id
    name: str
    car_number: str
    race_class: str
    model: str | None = None
    car_model_slug: str | None = None
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None


# --- Schedule / results ---


class EventOut(_OrmBase):
    id: int
    round: int
    name: str
    date_start: date
    date_end: date
    format: str | None = None
    circuit: CircuitOut


class SessionOut(_OrmBase):
    id: int
    type: str
    start_time: datetime | None = None


class EventDetailOut(_BaseSchema):
    id: int
    round: int
    name: str
    date_start: date
    date_end: date
    format: str | None = None
    circuit: CircuitOut
    sessions: list[SessionOut]


class SessionResultDriverRef(_BaseSchema):
    id: int
    name: str


class SessionResultOut(_BaseSchema):
    """Flattened result row matching the frontend mock shape."""

    position: int  # overall position
    class_position: int = 0  # rank within race_class
    points_awarded: float = 0.0
    car_number: str
    team: str
    team_id: int | None = None  # for /teams/{id} links from result tables
    drivers: str  # "Robert Kubica / Yifei Ye / Phil Hanson" (display)
    # Parallel id-bearing list — empty when al kamel ingest has driver
    # names that don't match a Driver row (class-specific roster, race
    # substitution, etc.). Frontend renders this when non-empty so each
    # name links to /drivers/{id}; falls back to the `drivers` string.
    driver_refs: list["SessionResultDriverRef"] = []
    race_class: str
    laps: int | None = None
    gap: str | None = None
    best_lap: str | None = None
    qualifying_lap: str | None = None
    hyperpole_lap: str | None = None
    qualifying_driver: str | None = None
    hyperpole_driver: str | None = None
    pit_stops: int | None = None


class LapChartCar(_BaseSchema):
    """One car's per-lap trajectory, used by the race position chart."""

    car_number: str
    team: str
    race_class: str
    drivers: str
    # Aligned arrays — points[i] is the (lap, position) reached when
    # this car completed lap_numbers[i].
    lap_numbers: list[int]
    positions: list[int]
    # Class-internal position at each lap (so LMGT3 P1, P2, ... show on
    # the chart even though they're behind hypercars overall).
    class_positions: list[int]


class LapChart(_BaseSchema):
    cars: list[LapChartCar]
    total_laps: int


# --- Standings ---


class DriverRef(_BaseSchema):
    id: int
    name: str
    rounds: str | None = None
    photo_url: str | None = None


class DriverResultOut(_BaseSchema):
    event_id: int
    round: int
    event_name: str
    position: int  # overall position
    class_position: int  # rank within race_class
    points_awarded: float  # WEC points scored for this result
    laps: int | None = None
    gap: str | None = None


class DriverStandingRef(_BaseSchema):
    position: int
    points: float


class DriverSeasonOut(_BaseSchema):
    """One row of a driver's career — what they did in a single season.
    Multiple rows may share a year if the driver swapped cars mid-season."""

    year: int
    team: str
    team_id: int | None = None
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    race_class: str
    car_number: str
    championship_position: int | None = None
    points: float | None = None
    races: int = 0
    wins: int = 0
    podiums: int = 0


class DriverDetailOut(_BaseSchema):
    """Full profile for a driver in the current season — joins their car,
    co-drivers, race finishes, and championship row in one shot.
    `seasons` is the cross-season career history regardless of year param."""

    id: int
    name: str
    nationality: str | None = None
    car_number: str | None = None
    team: str | None = None
    team_id: int | None = None
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    photo_url: str | None = None
    race_class: str | None = None
    car_model: str | None = None
    car_model_slug: str | None = None
    co_drivers: list[DriverRef] = []
    results: list[DriverResultOut] = []
    standing: DriverStandingRef | None = None
    seasons: list[DriverSeasonOut] = []


class TeamCarOut(_BaseSchema):
    car_id: int
    number: str
    race_class: str
    model: str | None = None
    car_model_slug: str | None = None  # for /cars/{slug} links
    drivers: list[DriverRef] = []


class TeamResultOut(_BaseSchema):
    event_id: int
    round: int
    event_name: str
    car_number: str
    race_class: str
    position: int  # overall
    class_position: int = 0
    points_awarded: float = 0.0
    laps: int | None = None
    gap: str | None = None


class TeamSeasonOut(_BaseSchema):
    """One row of a team's archive — per (year, race_class, car_number).
    LMGT3 teams running two cars produce two rows per season because the
    LMGT3 trophy is car-scoped."""

    year: int
    race_class: str
    car_number: str
    championship_position: int | None = None
    points: float | None = None
    races: int = 0
    wins: int = 0
    podiums: int = 0


class TeamDetailOut(_BaseSchema):
    id: int
    name: str
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    cars: list[TeamCarOut] = []
    results: list[TeamResultOut] = []
    seasons: list[TeamSeasonOut] = []


class ManufacturerCarOut(_BaseSchema):
    car_id: int
    car_number: str
    race_class: str
    team_id: int
    team_name: str
    model: str | None = None
    car_model_slug: str | None = None
    drivers: list[DriverRef] = []


class ManufacturerResultOut(_BaseSchema):
    event_id: int
    round: int
    event_name: str
    car_number: str
    team_id: int | None = None
    team_name: str
    race_class: str
    position: int  # overall
    class_position: int = 0
    points_awarded: float = 0.0
    laps: int | None = None
    gap: str | None = None


class ManufacturerStandingItem(_BaseSchema):
    """Per-class manufacturer championship row. Hypercar always populated;
    LMGT3 brands won't have one because LMGT3 has no manufacturers' trophy."""

    race_class: str
    position: int
    points: float


class ManufacturerSeasonOut(_BaseSchema):
    """One row of a manufacturer's archive — what they did in a single
    season, scoped to one race class. A brand active in two classes the
    same year produces two rows."""

    year: int
    race_class: str
    championship_position: int | None = None
    points: float | None = None
    cars: int = 0
    races: int = 0
    wins: int = 0
    podiums: int = 0


class ManufacturerDetailOut(_BaseSchema):
    id: int
    name: str
    country: str | None = None
    logo_url: str | None = None
    cars: list[ManufacturerCarOut] = []
    results: list[ManufacturerResultOut] = []
    standings: list[ManufacturerStandingItem] = []
    seasons: list[ManufacturerSeasonOut] = []


class CircuitWinnerOut(_BaseSchema):
    race_class: str
    car_number: str
    team: str
    team_id: int | None = None


class CircuitEventOut(_BaseSchema):
    event_id: int
    season_year: int
    round: int
    name: str
    date_start: date
    date_end: date
    winners: list[CircuitWinnerOut] = []


class CircuitDetailOut(_BaseSchema):
    id: int
    name: str
    country: str
    length_km: float
    lap_record: str | None = None
    events: list[CircuitEventOut] = []


class ProgressionPointOut(_BaseSchema):
    round: int
    cumulative_points: float


class DriverProgressionOut(_BaseSchema):
    driver_id: int
    driver_name: str
    points: list[ProgressionPointOut] = []


class ManufacturerProgressionOut(_BaseSchema):
    manufacturer_id: int
    manufacturer_name: str
    points: list[ProgressionPointOut] = []


class TeamProgressionOut(_BaseSchema):
    team_id: int
    team_name: str
    car_number: str
    points: list[ProgressionPointOut] = []


class StandingDriverOut(_BaseSchema):
    position: int
    driver_id: int
    driver_name: str
    team: str | None = None
    team_id: int | None = None
    manufacturer_logo_url: str | None = None
    race_class: str
    points: float


class StandingTeamOut(_BaseSchema):
    position: int
    team_id: int
    team_name: str
    car_number: str | None = None
    manufacturer: str | None = None
    manufacturer_id: int | None = None
    manufacturer_logo_url: str | None = None
    race_class: str
    points: float


class StandingManufacturerOut(_BaseSchema):
    position: int
    manufacturer_id: int
    manufacturer_name: str
    manufacturer_logo_url: str | None = None
    race_class: str
    points: float


class PodiumCarOut(_BaseSchema):
    class_position: int
    car_number: str
    team: str
    team_id: int
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    drivers: str


class RoundPodiumOut(_BaseSchema):
    event_id: int
    round: int
    event_name: str
    podium: list[PodiumCarOut] = []


class StatRowOut(_BaseSchema):
    """Generic title-leaderboard row (drivers / manufacturers / teams)."""

    id: int
    name: str
    photo_url: str | None = None
    logo_url: str | None = None
    titles: int


class DriverStatOut(_BaseSchema):
    id: int
    name: str
    photo_url: str | None = None
    wins: int


class DriverPodiumStatOut(_BaseSchema):
    id: int
    name: str
    photo_url: str | None = None
    podiums: int


class LeMansWinnerOut(_BaseSchema):
    year: int
    event_id: int
    manufacturer: str | None = None
    manufacturer_id: int | None = None
    manufacturer_logo_url: str | None = None
    team: str
    team_id: int
    car_number: str
    drivers: str
    driver_refs: list[SessionResultDriverRef] = []


class AllTimeStatsOut(_BaseSchema):
    driver_titles: list[StatRowOut] = []
    manufacturer_titles: list[StatRowOut] = []
    team_titles: list[StatRowOut] = []
    driver_wins: list[DriverStatOut] = []
    driver_podiums: list[DriverPodiumStatOut] = []
    le_mans_winners: list[LeMansWinnerOut] = []


# --- Car models ---


class CarModelOut(_BaseSchema):
    """Row for the /cars page — one entry per (model, race_class) running in
    the selected season."""

    id: int
    slug: str
    name: str
    race_class: str
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    image_url: str | None = None
    entries: int  # number of cars running this model in the season


class CarModelTeamRef(_BaseSchema):
    team_id: int
    team_name: str
    car_number: str
    race_class: str


class CarModelStats(_BaseSchema):
    """Season-scoped tally over every car using this model."""

    races: int = 0
    wins: int = 0
    podiums: int = 0
    poles: int = 0


class CarModelDetailOut(_BaseSchema):
    id: int
    slug: str
    name: str
    manufacturer: str | None = None
    manufacturer_logo_url: str | None = None
    image_url: str | None = None
    category: str | None = None
    engine: str | None = None
    power_hp: int | None = None
    weight_kg: int | None = None
    year_introduced: int | None = None
    teams: list[CarModelTeamRef] = []
    stats: CarModelStats = CarModelStats()


# --- Balance of Performance ---


class BopRowOut(_BaseSchema):
    car_model_id: int
    car_model_slug: str
    car_model_name: str
    manufacturer_logo_url: str | None = None
    min_weight_kg: int | None = None
    max_power_kw: int | None = None
    max_energy_per_stint_mj: float | None = None
    success_handicap_kg: int | None = None


class BopEventOut(_BaseSchema):
    event_id: int
    round: int
    event_name: str
    rows: list[BopRowOut] = []


# --- Pit stops ---


class PitStopOut(_BaseSchema):
    """One pit visit during a RACE session."""

    car_number: str
    team: str
    team_id: int | None = None
    race_class: str
    lap: int
    duration_ms: int | None = None

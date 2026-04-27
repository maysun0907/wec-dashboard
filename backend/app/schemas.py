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
    car_number: int
    team: str
    race_class: str


class TeamEntryOut(_BaseSchema):
    """Row for the /teams page — one entry per car in the current season."""

    id: int  # team id
    name: str
    car_number: int
    race_class: str
    manufacturer: str | None = None


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


class SessionResultOut(_BaseSchema):
    """Flattened result row matching the frontend mock shape."""

    position: int
    car_number: int
    team: str
    drivers: str  # "Robert Kubica / Yifei Ye / Phil Hanson"
    race_class: str
    laps: int | None = None
    gap: str | None = None
    best_lap: str | None = None


# --- Standings ---


class StandingDriverOut(_BaseSchema):
    position: int
    driver_id: int
    driver_name: str
    race_class: str
    points: float


class StandingTeamOut(_BaseSchema):
    position: int
    team_id: int
    team_name: str
    manufacturer: str | None = None
    race_class: str
    points: float


class StandingManufacturerOut(_BaseSchema):
    position: int
    manufacturer_id: int
    manufacturer_name: str
    race_class: str
    points: float

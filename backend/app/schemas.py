"""Pydantic v2 response schemas for the API.

Use `model_config = ConfigDict(from_attributes=True)` (via the _OrmBase) on
schemas that map directly from a SQLAlchemy ORM instance — that's what makes
`MyModel.model_validate(row)` work.
"""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class _OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


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


class DriverEntryOut(BaseModel):
    """Row for the /drivers page — driver joined with current-season car."""

    id: int
    name: str
    nationality: str | None = None
    car_number: int
    team: str
    race_class: str


class TeamEntryOut(BaseModel):
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


class EventDetailOut(BaseModel):
    id: int
    round: int
    name: str
    date_start: date
    date_end: date
    format: str | None = None
    circuit: CircuitOut
    sessions: list[SessionOut]


class SessionResultOut(BaseModel):
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


class StandingDriverOut(BaseModel):
    position: int
    driver_id: int
    driver_name: str
    race_class: str
    points: float


class StandingTeamOut(BaseModel):
    position: int
    team_id: int
    team_name: str
    manufacturer: str | None = None
    race_class: str
    points: float


class StandingManufacturerOut(BaseModel):
    position: int
    manufacturer_id: int
    manufacturer_name: str
    race_class: str
    points: float

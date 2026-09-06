"""Ingest the current championship tables published by FIA WEC.

The official season page renders all four modern WEC championships in its
HTML: Hypercar drivers and manufacturers, plus LMGT3 drivers and per-car
teams. This module parses those tables and resolves their public names back
to the season roster before replacing any database rows.

No partial write is allowed. Every table, car, driver and manufacturer is
resolved first; only then are the season's standings replaced.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Literal, TypedDict

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import models
from app.rounds import driver_in_round

BASE_URL = "https://www.fiawec.com"
USER_AGENT = "wec-dashboard/0.1 (open-source dashboard for FIA WEC fans)"

StandingKind = Literal["drivers", "manufacturers", "teams"]


class PublishedStanding(TypedDict):
    kind: StandingKind
    race_class: str
    position: int
    points: float
    name: str
    car_number: str | None


_REQUIRED_TABLES: set[tuple[StandingKind, str]] = {
    ("drivers", "HYPERCAR"),
    ("manufacturers", "HYPERCAR"),
    ("drivers", "LMGT3"),
    ("teams", "LMGT3"),
}


def fetch_season_page(year: int) -> str:
    response = httpx.get(
        f"{BASE_URL}/en/season/{year}",
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en",
        },
        follow_redirects=True,
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def _table_identity(title: str) -> tuple[StandingKind, str] | None:
    normalized = " ".join(title.casefold().split())
    if "hypercar" in normalized and "manufacturer" in normalized:
        return "manufacturers", "HYPERCAR"
    if "hypercar" in normalized and "driver" in normalized:
        return "drivers", "HYPERCAR"
    if "lmgt3" in normalized and "team" in normalized:
        return "teams", "LMGT3"
    if "lmgt3" in normalized and "driver" in normalized:
        return "drivers", "LMGT3"
    return None


def _column_index(headers: list[str], *names: str) -> int | None:
    normalized = [" ".join(h.casefold().split()) for h in headers]
    for name in names:
        if name in normalized:
            return normalized.index(name)
    return None


def _parse_position(value: str) -> int:
    match = re.search(r"\d+", value)
    if match is None:
        raise ValueError(f"invalid standings position: {value!r}")
    return int(match.group())


def _parse_points(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    # Penalties can produce a negative published championship total.
    cleaned = cleaned.replace("−", "-")
    match = re.fullmatch(r"-?\d+(?:\.\d+)?", cleaned)
    if match is None:
        raise ValueError(f"invalid standings points: {value!r}")
    return float(cleaned)


def _row_values(
    table: Tag,
    kind: StandingKind,
    race_class: str,
) -> list[PublishedStanding]:
    header_row = table.select_one("thead tr")
    if header_row is None:
        raise ValueError(f"{race_class} {kind} table has no header")
    headers = [
        cell.get_text(" ", strip=True)
        for cell in header_row.find_all(["th", "td"], recursive=False)
    ]
    position_col = _column_index(headers, "pos.", "pos")
    points_col = _column_index(headers, "total points", "points")
    number_col = _column_index(headers, "n°", "no.", "no")
    if position_col is None or points_col is None:
        raise ValueError(f"{race_class} {kind} table has unknown columns")

    if kind == "drivers":
        entity_col = _column_index(headers, "drivers", "driver")
    elif kind == "manufacturers":
        entity_col = _column_index(headers, "manufacturer")
    else:
        entity_col = _column_index(headers, "team")
    if entity_col is None:
        raise ValueError(f"{race_class} {kind} table has no entity column")
    if kind in {"drivers", "teams"} and number_col is None:
        raise ValueError(f"{race_class} {kind} table has no car number")

    out: list[PublishedStanding] = []
    for tr in table.select("tbody tr"):
        cells = tr.find_all(["th", "td"], recursive=False)
        required_index = max(position_col, points_col, entity_col)
        if number_col is not None:
            required_index = max(required_index, number_col)
        if len(cells) <= required_index:
            raise ValueError(f"short row in {race_class} {kind} table")

        position = _parse_position(cells[position_col].get_text(" ", strip=True))
        points = _parse_points(cells[points_col].get_text(" ", strip=True))
        car_number = None
        if number_col is not None:
            car_number = cells[number_col].get_text(" ", strip=True).lstrip("#")
            if not car_number:
                raise ValueError(f"missing car number in {race_class} {kind}")

        if kind == "drivers":
            names = [
                link.get_text(" ", strip=True)
                for link in cells[entity_col].select('a[href*="/driver/"]')
                if link.get_text(" ", strip=True)
            ]
            if not names:
                raise ValueError(
                    f"driver links missing in {race_class} standings row"
                )
        else:
            names = [cells[entity_col].get_text(" ", strip=True)]
            if not names[0]:
                raise ValueError(f"missing name in {race_class} {kind} row")

        for name in names:
            out.append(
                {
                    "kind": kind,
                    "race_class": race_class,
                    "position": position,
                    "points": points,
                    "name": name,
                    "car_number": car_number,
                }
            )
    if not out:
        raise ValueError(f"{race_class} {kind} table parsed zero rows")
    return out


def parse_published_standings(html: str) -> list[PublishedStanding]:
    soup = BeautifulSoup(html, "lxml")
    tables: dict[tuple[StandingKind, str], Tag] = {}
    for button in soup.find_all("button"):
        title = button.get_text(" ", strip=True)
        identity = _table_identity(title)
        if identity is None:
            continue
        table = button.find_next("table")
        if table is None or not isinstance(table, Tag):
            raise ValueError(f"standings table missing after {title!r}")
        if identity in tables:
            raise ValueError(f"duplicate FIA WEC standings table: {identity}")
        tables[identity] = table

    missing = sorted(_REQUIRED_TABLES - set(tables))
    if missing:
        labels = ", ".join(f"{race_class} {kind}" for kind, race_class in missing)
        raise ValueError(f"missing FIA WEC standings tables: {labels}")

    rows: list[PublishedStanding] = []
    for (kind, race_class), table in tables.items():
        rows.extend(_row_values(table, kind, race_class))

    seen: set[tuple[str, str, str, str | None]] = set()
    for row in rows:
        key = (
            row["kind"],
            row["race_class"],
            row["name"],
            row["car_number"],
        )
        if key in seen:
            raise ValueError(f"duplicate FIA WEC standings row: {key}")
        seen.add(key)
    return rows


def _normalize_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_like = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    )
    return " ".join(re.findall(r"[a-z0-9]+", ascii_like.casefold()))


def _resolve_driver(
    published_name: str,
    candidates: list[models.Driver],
    race_class: str,
    car_number: str,
) -> models.Driver:
    normalized = _normalize_name(published_name)
    exact = [
        driver
        for driver in candidates
        if _normalize_name(driver.name) == normalized
    ]
    if len(exact) == 1:
        return exact[0]

    surname = normalized.split()[-1] if normalized else ""
    surname_matches = [
        driver
        for driver in candidates
        if _normalize_name(driver.name).split()[-1] == surname
    ]
    if len(surname_matches) == 1:
        return surname_matches[0]
    raise ValueError(
        f"cannot resolve {race_class} #{car_number} driver {published_name!r}"
    )


def ingest_fiawec_standings(
    db: Session,
    season_id: int,
    year: int,
    after_event_id: int,
    *,
    html: str | None = None,
) -> dict[str, int]:
    """Replace one season's standings with the current official tables."""
    published = parse_published_standings(html or fetch_season_page(year))

    race_class_ids = {
        name: race_class_id
        for name, race_class_id in (
            db.query(models.RaceClass.name, models.RaceClass.id).all()
        )
    }
    for race_class in {row["race_class"] for row in published}:
        if race_class not in race_class_ids:
            raise ValueError(f"unknown standings class: {race_class}")

    cars_by_key: dict[tuple[str, str], models.Car] = {}
    for car, race_class in (
        db.query(models.Car, models.RaceClass)
        .join(
            models.RaceClass,
            models.Car.race_class_id == models.RaceClass.id,
        )
        .filter(models.Car.season_id == season_id)
        .all()
    ):
        cars_by_key[(race_class.name, car.number)] = car

    drivers_by_car: dict[tuple[str, str], list[models.Driver]] = {}
    after_event = (
        db.query(models.Event)
        .filter(
            models.Event.id == after_event_id,
            models.Event.season_id == season_id,
        )
        .one_or_none()
    )
    if after_event is None:
        raise ValueError(f"unknown standings event id: {after_event_id}")
    completed_rounds = {
        round_number
        for (round_number,) in (
            db.query(models.Event.round)
            .filter(
                models.Event.season_id == season_id,
                models.Event.round <= after_event.round,
            )
            .all()
        )
    }
    expected_driver_rows: set[tuple[int, int]] = set()
    driver_names: dict[int, str] = {}
    for car_driver, driver, car, race_class in (
        db.query(
            models.CarDriver,
            models.Driver,
            models.Car,
            models.RaceClass,
        )
        .join(
            models.Driver,
            models.CarDriver.driver_id == models.Driver.id,
        )
        .join(models.Car, models.Car.id == models.CarDriver.car_id)
        .join(
            models.RaceClass,
            models.RaceClass.id == models.Car.race_class_id,
        )
        .filter(models.CarDriver.season_id == season_id)
        .all()
    ):
        drivers_by_car.setdefault((race_class.name, car.number), []).append(
            driver
        )
        driver_names[driver.id] = driver.name
        if any(
            driver_in_round(car_driver.rounds, round_number)
            for round_number in completed_rounds
        ):
            expected_driver_rows.add((driver.id, car.race_class_id))

    manufacturers = {
        _normalize_name(manufacturer.name): manufacturer
        for manufacturer in db.query(models.Manufacturer).all()
    }

    driver_values: list[tuple[int, int, int, float]] = []
    team_values: list[tuple[int, int, int, float, str]] = []
    manufacturer_values: list[tuple[int, int, int, float]] = []

    for row in published:
        race_class = row["race_class"]
        race_class_id = race_class_ids[race_class]
        if row["kind"] == "drivers":
            car_number = row["car_number"]
            if car_number is None:
                raise ValueError(f"missing car number for driver {row['name']!r}")
            candidates = drivers_by_car.get((race_class, car_number), [])
            driver = _resolve_driver(
                row["name"], candidates, race_class, car_number
            )
            driver_values.append(
                (driver.id, race_class_id, row["position"], row["points"])
            )
        elif row["kind"] == "teams":
            car_number = row["car_number"]
            if car_number is None:
                raise ValueError(f"missing car number for team {row['name']!r}")
            car = cars_by_key.get((race_class, car_number))
            if car is None:
                raise ValueError(
                    f"cannot resolve {race_class} team car #{car_number}"
                )
            team_values.append(
                (
                    car.team_id,
                    race_class_id,
                    row["position"],
                    row["points"],
                    car_number,
                )
            )
        else:
            manufacturer = manufacturers.get(_normalize_name(row["name"]))
            if manufacturer is None:
                raise ValueError(
                    f"cannot resolve manufacturer {row['name']!r}"
                )
            manufacturer_values.append(
                (
                    manufacturer.id,
                    race_class_id,
                    row["position"],
                    row["points"],
                )
            )

    unique_driver_rows = {
        (driver_id, class_id)
        for driver_id, class_id, _, _ in driver_values
    }
    if len(unique_driver_rows) != len(driver_values):
        raise ValueError("one driver resolved to multiple FIA WEC standings rows")
    if unique_driver_rows != expected_driver_rows:
        missing = sorted(
            driver_names[driver_id]
            for driver_id, _ in expected_driver_rows - unique_driver_rows
        )
        unexpected = sorted(
            driver_names[driver_id]
            for driver_id, _ in unique_driver_rows - expected_driver_rows
        )
        raise ValueError(
            "driver standings do not match the completed-round roster: "
            f"missing={missing}, unexpected={unexpected}"
        )

    lmgt3_id = race_class_ids["LMGT3"]
    expected_team_cars = {
        car_number
        for (car_number,) in (
            db.query(models.Car.number)
            .filter(
                models.Car.season_id == season_id,
                models.Car.race_class_id == lmgt3_id,
            )
            .all()
        )
    }
    published_team_cars = {value[4] for value in team_values}
    if (
        published_team_cars != expected_team_cars
        or len(team_values) != len(expected_team_cars)
    ):
        raise ValueError(
            "LMGT3 team standings cars do not match the season grid: "
            f"published={sorted(published_team_cars)}, "
            f"expected={sorted(expected_team_cars)}"
        )

    hypercar_id = race_class_ids["HYPERCAR"]
    expected_manufacturers = {
        manufacturer_id
        for (manufacturer_id,) in (
            db.query(models.Team.manufacturer_id)
            .join(models.Car, models.Car.team_id == models.Team.id)
            .filter(
                models.Car.season_id == season_id,
                models.Car.race_class_id == hypercar_id,
                models.Team.manufacturer_id.is_not(None),
            )
            .distinct()
            .all()
        )
    }
    published_manufacturers = {value[0] for value in manufacturer_values}
    if (
        published_manufacturers != expected_manufacturers
        or len(manufacturer_values) != len(expected_manufacturers)
    ):
        manufacturer_names = {
            manufacturer.id: manufacturer.name
            for manufacturer in db.query(models.Manufacturer).all()
        }
        published_names = sorted(
            manufacturer_names[mid] for mid in published_manufacturers
        )
        expected_names = sorted(
            manufacturer_names[mid] for mid in expected_manufacturers
        )
        raise ValueError(
            "Hypercar manufacturer standings do not match the season grid: "
            f"published={published_names}, expected={expected_names}"
        )

    from app.ingest.revisions import record_revision
    record_revision(db, scope=f"standings:{year}",
                    source_url=f"{BASE_URL}/en/season/{year}", payload=published)
    db.execute(
        delete(models.StandingDriver).where(
            models.StandingDriver.season_id == season_id
        )
    )
    db.execute(
        delete(models.StandingTeam).where(
            models.StandingTeam.season_id == season_id
        )
    )
    db.execute(
        delete(models.StandingManufacturer).where(
            models.StandingManufacturer.season_id == season_id
        )
    )
    db.add_all(
        [
            models.StandingDriver(
                season_id=season_id,
                driver_id=driver_id,
                race_class_id=race_class_id,
                after_event_id=after_event_id,
                position=position,
                points=points,
            )
            for driver_id, race_class_id, position, points in driver_values
        ]
    )
    db.add_all(
        [
            models.StandingTeam(
                season_id=season_id,
                team_id=team_id,
                race_class_id=race_class_id,
                after_event_id=after_event_id,
                position=position,
                points=points,
                car_number=car_number,
            )
            for team_id, race_class_id, position, points, car_number in team_values
        ]
    )
    db.add_all(
        [
            models.StandingManufacturer(
                season_id=season_id,
                manufacturer_id=manufacturer_id,
                race_class_id=race_class_id,
                after_event_id=after_event_id,
                position=position,
                points=points,
            )
            for manufacturer_id, race_class_id, position, points in manufacturer_values
        ]
    )
    db.flush()
    return {
        "drivers": len(driver_values),
        "manufacturers": len(manufacturer_values),
        "teams": len(team_values),
    }

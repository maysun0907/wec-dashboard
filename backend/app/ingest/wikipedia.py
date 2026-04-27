"""Ingest WEC season data from Wikipedia.

Sections covered: calendar (events), entry list (teams/cars/drivers),
race-results summary (winners only), and standings (drivers, teams,
manufacturers — whichever championships exist for that class).

Run:
    .venv/bin/python -m app.ingest.wikipedia
"""
import re
import sys
from datetime import date

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import models
from app.db import SessionLocal
from app.ingest._common import (
    get_or_create_race_class,
    get_or_create_season,
    upsert_driver,
    upsert_manufacturer,
    upsert_team,
)

USER_AGENT = "wec-dashboard/0.1 (https://github.com/maysun0907/wec-dashboard)"
DEFAULT_URL = "https://en.wikipedia.org/wiki/2026_FIA_World_Endurance_Championship"
DEFAULT_YEAR = 2026

MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11,
    "December": 12,
}

# Minimal mapping for circuits we care about; expand as needed.
COUNTRY_CODES = {
    "Italy": "ITA", "France": "FRA", "Belgium": "BEL", "Brazil": "BRA",
    "United States": "USA", "Japan": "JPN", "Bahrain": "BHR", "Qatar": "QAT",
    "Spain": "ESP", "United Kingdom": "GBR", "Germany": "DEU",
    "Portugal": "PRT", "China": "CHN",
}


# ---------------------------------------------------------------------------
# HTML fetch + table parsing
# ---------------------------------------------------------------------------


def fetch_html(url: str) -> str:
    r = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=30.0,
    )
    r.raise_for_status()
    return r.text


_REF_RE = re.compile(r"\s*\[\s*\d+\s*\]\s*")


def _clean(text: str) -> str:
    """Strip Wikipedia footnote markers and normalize whitespace."""
    text = _REF_RE.sub("", text)
    return text.replace("\xa0", " ").strip()


def expand_rowspan(table: Tag) -> list[list[str]]:
    """Resolve rowspan/colspan into a uniform 2D grid of cell text."""
    rows_out: list[list[str]] = []
    pending: dict[int, tuple[str, int]] = {}  # col_idx -> (value, remaining)
    for tr in table.find_all("tr"):
        out_row: list[str] = []
        col = 0
        cells = list(tr.find_all(["th", "td"]))
        ci = 0
        while ci < len(cells) or col in pending:
            if col in pending:
                value, remaining = pending[col]
                out_row.append(value)
                if remaining > 1:
                    pending[col] = (value, remaining - 1)
                else:
                    del pending[col]
                col += 1
                continue
            td = cells[ci]
            ci += 1
            value = _clean(td.get_text(" ", strip=True))
            rs = int(td.get("rowspan") or 1)
            cs = int(td.get("colspan") or 1)
            for _ in range(cs):
                out_row.append(value)
                if rs > 1:
                    pending[col] = (value, rs - 1)
                col += 1
        rows_out.append(out_row)
    return rows_out


def find_table_by_heading(
    soup: BeautifulSoup, heading_pattern: str
) -> Tag | None:
    """Return the first wikitable preceded by a heading whose text matches `heading_pattern`
    (case-insensitive substring). Useful for locating section-specific tables."""
    pat = heading_pattern.lower()
    for table in soup.select("table.wikitable"):
        h = table.find_previous(["h2", "h3", "h4"])
        if h is not None and pat in h.get_text(" ", strip=True).lower():
            return table
    return None


def find_all_tables_by_heading(
    soup: BeautifulSoup, heading_pattern: str
) -> list[Tag]:
    """Return *all* wikitables whose nearest preceding heading matches."""
    pat = heading_pattern.lower()
    out: list[Tag] = []
    for table in soup.select("table.wikitable"):
        h = table.find_previous(["h2", "h3", "h4"])
        if h is not None and pat in h.get_text(" ", strip=True).lower():
            out.append(table)
    return out


def find_entry_tables(soup: BeautifulSoup) -> tuple[Tag | None, Tag | None]:
    """Identify Hypercar + LMGT3 entry tables by their header row."""
    hypercar = lmgt3 = None
    for table in soup.select("table.wikitable"):
        first_tr = table.find("tr")
        if first_tr is None:
            continue
        headers = [
            _clean(h.get_text(" ", strip=True)) for h in first_tr.find_all(["th", "td"])
        ]
        if "Entrant" not in headers or "Drivers" not in headers:
            continue
        if "Hybrid" in headers and hypercar is None:
            hypercar = table
        elif "Hybrid" not in headers and lmgt3 is None:
            lmgt3 = table
    return hypercar, lmgt3


# ---------------------------------------------------------------------------
# Domain parsing
# ---------------------------------------------------------------------------


def _extract_manufacturer(car_text: str) -> str:
    """Heuristic: first word(s) of the car's name. Handle multi-word brands."""
    for prefix in ("Aston Martin", "Mercedes-AMG", "Mercedes-Benz"):
        if car_text.startswith(prefix):
            return prefix
    return car_text.split()[0] if car_text else "Unknown"


def parse_entries(table: Tag, race_class: str) -> list[dict]:
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}

    required = {"Entrant", "Car", "Engine", "No.", "Drivers"}
    if not required.issubset(cols.keys()):
        raise ValueError(f"missing columns: {required - set(cols.keys())}")

    entries: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        try:
            entry = {
                "entrant": row[cols["Entrant"]],
                "car": row[cols["Car"]],
                "engine": row[cols["Engine"]],
                "number": row[cols["No."]],
                "driver": row[cols["Drivers"]],
                "rounds": row[cols["Rounds"]] if "Rounds" in cols else "",
                "race_class": race_class,
            }
        except IndexError:
            continue
        if not entry["driver"] or not entry["number"]:
            continue
        entries.append(entry)
    return entries


def group_by_car(entries: list[dict]) -> list[dict]:
    """Collapse driver rows into per-car aggregates."""
    grouped: dict[tuple[str, str], dict] = {}
    for e in entries:
        key = (e["entrant"], e["number"])
        if key not in grouped:
            grouped[key] = {
                "entrant": e["entrant"],
                "car": e["car"],
                "engine": e["engine"],
                "number": e["number"],
                "race_class": e["race_class"],
                "drivers": [],
            }
        if e["driver"] not in grouped[key]["drivers"]:
            grouped[key]["drivers"].append(e["driver"])
    return list(grouped.values())


# ---- Calendar ----


_DATE_RANGE_RE = re.compile(
    r"^\s*(\d{1,2})(?:\s*[–\-]\s*(\d{1,2}))?\s+(\w+)\s*$"
)


def parse_date_range(text: str, year: int) -> tuple[date, date] | None:
    """Parse '19 April' or '13–14 June' into (start, end). Returns None if unparseable."""
    m = _DATE_RANGE_RE.match(text)
    if m is None:
        return None
    d1 = int(m.group(1))
    d2 = int(m.group(2)) if m.group(2) else d1
    month_name = m.group(3)
    if month_name not in MONTHS:
        return None
    month = MONTHS[month_name]
    return date(year, month, d1), date(year, month, d2)


def parse_calendar(table: Tag, year: int) -> list[dict]:
    """Returns rounds (excluding Prologue) with circuit, location, date range."""
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    required = {"Rnd", "Race", "Circuit", "Location", "Date"}
    if not required.issubset(cols.keys()):
        raise ValueError(f"calendar missing columns: {required - set(cols.keys())}")

    out: list[dict] = []
    for row in rows[1:]:
        try:
            rnd_text = row[cols["Rnd"]]
            race_name = row[cols["Race"]]
            circuit_name = row[cols["Circuit"]]
            location = row[cols["Location"]]
            date_text = row[cols["Date"]]
        except IndexError:
            continue
        if not rnd_text.strip().isdigit():
            continue  # skip Prologue / non-round rows
        rng = parse_date_range(date_text, year)
        if rng is None:
            continue
        # Location often "City, Country" — last part is country
        country = None
        if "," in location:
            parts = [p.strip() for p in location.split(",")]
            country = COUNTRY_CODES.get(parts[-1])
        out.append({
            "round": int(rnd_text),
            "name": race_name,
            "circuit_name": circuit_name,
            "country": country,
            "date_start": rng[0],
            "date_end": rng[1],
        })
    return out


# ---- Race results (winners only) ----


_NO_RE = re.compile(r"^No\.\s+(\d+)\s+(.+)$")


def parse_results_summary(table: Tag) -> dict[int, dict]:
    """Extract winning car number + team for each round, per class.

    Wikipedia lays out two logical rows per round: one with "No. X TeamName"
    in the winner column and one with the driver crew names. We only pull
    car number + team since drivers are derived from car_drivers.
    """
    rows = expand_rowspan(table)
    if not rows:
        return {}
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    if "Rnd." not in cols or "Hypercar winners" not in cols:
        return {}

    out: dict[int, dict] = {}
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        rnd_text = row[cols["Rnd."]]
        if not rnd_text.strip().isdigit():
            continue
        rnd_num = int(rnd_text)
        hyper = row[cols["Hypercar winners"]]
        lmgt3 = row[cols.get("LMGT3 winners", -1)] if "LMGT3 winners" in cols else ""

        bucket = out.setdefault(rnd_num, {})
        m_h = _NO_RE.match(hyper.strip())
        if m_h:
            bucket["HYPERCAR"] = {
                "car_number": m_h.group(1),
                "team_name": m_h.group(2).strip(),
            }
        m_l = _NO_RE.match(lmgt3.strip())
        if m_l:
            bucket["LMGT3"] = {
                "car_number": m_l.group(1),
                "team_name": m_l.group(2).strip(),
            }
    return out


# ---- Standings ----


def parse_standings_drivers(table: Tag, race_class: str) -> list[dict]:
    """Returns rows with position/driver/points. Skip footers/legend rows."""
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    if "Driver" not in cols or "Points" not in cols:
        return []

    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[cols["Pos."]] if "Pos." in cols else ""
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[cols["Points"]])
        except (ValueError, IndexError):
            continue
        out.append({
            "position": int(pos_raw),
            "name": row[cols["Driver"]],
            "race_class": race_class,
            "points": pts,
        })
    return out


def _dedupe_standings(rows: list[dict]) -> list[dict]:
    """Wikipedia manufacturer/team standings often emit two consecutive rows per
    entity (one for finish positions, one for points scored). Both expand to
    the same (position, name, points) after rowspan resolution. Keep only the
    first occurrence."""
    seen: set[tuple[int, str]] = set()
    out: list[dict] = []
    for r in rows:
        key = (r["position"], r["name"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def parse_standings_manufacturers(table: Tag, race_class: str) -> list[dict]:
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    if "Manufacturer" not in cols or "Points" not in cols:
        return []
    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[cols["Pos."]] if "Pos." in cols else ""
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[cols["Points"]])
        except (ValueError, IndexError):
            continue
        out.append({
            "position": int(pos_raw),
            "name": row[cols["Manufacturer"]],
            "race_class": race_class,
            "points": pts,
        })
    return _dedupe_standings(out)


def parse_standings_teams(table: Tag, race_class: str) -> list[dict]:
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    if "Team" not in cols or "Points" not in cols:
        return []
    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[cols["Pos."]] if "Pos." in cols else ""
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[cols["Points"]])
        except (ValueError, IndexError):
            continue
        out.append({
            "position": int(pos_raw),
            "name": row[cols["Team"]],
            "race_class": race_class,
            "points": pts,
        })
    return _dedupe_standings(out)


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------


def _clear_season(db: Session, season_id: int) -> None:
    """Clear all season-2026 rows so re-ingestion is fully fresh."""
    # Standings (FK: events.id via after_event_id, drivers/teams/manufacturers)
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
    # Session results (via cars in season)
    car_ids_subq = select(models.Car.id).where(models.Car.season_id == season_id)
    db.execute(
        delete(models.SessionResult).where(
            models.SessionResult.car_id.in_(car_ids_subq)
        )
    )
    # Sessions (via events in season)
    event_ids_subq = select(models.Event.id).where(
        models.Event.season_id == season_id
    )
    db.execute(
        delete(models.Session).where(models.Session.event_id.in_(event_ids_subq))
    )
    # Events
    db.execute(delete(models.Event).where(models.Event.season_id == season_id))
    # Cars + car_drivers
    db.execute(
        delete(models.CarDriver).where(models.CarDriver.season_id == season_id)
    )
    db.execute(delete(models.Car).where(models.Car.season_id == season_id))
    db.flush()


def _upsert_circuit(db: Session, name: str, country: str | None) -> models.Circuit:
    obj = db.query(models.Circuit).filter_by(name=name).first()
    if obj is None:
        # length_km has no default; use a placeholder that can be updated later.
        obj = models.Circuit(name=name, country=country or "UNK", length_km=0.0)
        db.add(obj)
        db.flush()
    elif country and obj.country != country and obj.country == "UNK":
        obj.country = country
    return obj


def _ingest_calendar(
    soup: BeautifulSoup, db: Session, season_id: int
) -> int:
    table = find_table_by_heading(soup, "Calendar")
    if table is None:
        return 0
    rounds = parse_calendar(table, year=DEFAULT_YEAR)
    for rd in rounds:
        circuit = _upsert_circuit(db, rd["circuit_name"], rd["country"])
        db.add(
            models.Event(
                season_id=season_id,
                circuit_id=circuit.id,
                round=rd["round"],
                name=rd["name"],
                date_start=rd["date_start"],
                date_end=rd["date_end"],
                format=None,
            )
        )
    db.flush()
    return len(rounds)


def _ingest_entries(
    soup: BeautifulSoup, db: Session, season_id: int, race_class_ids: dict[str, int]
) -> tuple[int, int]:
    hyper_table, lmgt3_table = find_entry_tables(soup)
    if hyper_table is None or lmgt3_table is None:
        raise RuntimeError(
            f"could not find entry tables (hypercar={hyper_table is not None}, "
            f"lmgt3={lmgt3_table is not None})"
        )
    hyper = group_by_car(parse_entries(hyper_table, "HYPERCAR"))
    lmgt3 = group_by_car(parse_entries(lmgt3_table, "LMGT3"))
    car_drivers_count = 0
    for entry in hyper + lmgt3:
        manuf = upsert_manufacturer(db, _extract_manufacturer(entry["car"]))
        team = upsert_team(db, entry["entrant"], manufacturer_id=manuf.id)
        car = models.Car(
            season_id=season_id,
            team_id=team.id,
            race_class_id=race_class_ids[entry["race_class"]],
            number=entry["number"],
            model=entry["car"],
        )
        db.add(car)
        db.flush()
        for driver_name in entry["drivers"]:
            driver = upsert_driver(db, driver_name)
            db.add(
                models.CarDriver(
                    car_id=car.id, driver_id=driver.id, season_id=season_id
                )
            )
            car_drivers_count += 1
    db.flush()
    return len(hyper) + len(lmgt3), car_drivers_count


def _ingest_results_summary(
    soup: BeautifulSoup, db: Session, season_id: int, race_class_ids: dict[str, int]
) -> int:
    table = find_table_by_heading(soup, "Race results")
    if table is None:
        return 0
    winners_per_round = parse_results_summary(table)
    inserted = 0
    for round_num, classes in winners_per_round.items():
        event = (
            db.query(models.Event)
            .filter_by(season_id=season_id, round=round_num)
            .first()
        )
        if event is None:
            continue
        # Create a single RACE session per event for the winner row.
        session = models.Session(event_id=event.id, type="RACE")
        db.add(session)
        db.flush()
        for race_class, info in classes.items():
            car = (
                db.query(models.Car)
                .filter_by(
                    season_id=season_id,
                    number=info["car_number"],
                    race_class_id=race_class_ids[race_class],
                )
                .first()
            )
            if car is None:
                continue
            db.add(
                models.SessionResult(
                    session_id=session.id,
                    car_id=car.id,
                    position=1,
                    gap="—",
                )
            )
            inserted += 1
    db.flush()
    return inserted


def _last_completed_event_id(db: Session, season_id: int) -> int | None:
    today = date.today()
    ev = (
        db.query(models.Event)
        .filter(
            models.Event.season_id == season_id,
            models.Event.date_end < today,
        )
        .order_by(models.Event.round.desc())
        .first()
    )
    return ev.id if ev else None


def _ingest_standings(
    soup: BeautifulSoup, db: Session, season_id: int, race_class_ids: dict[str, int]
) -> dict[str, int]:
    after_event_id = _last_completed_event_id(db, season_id)

    counts = {"drivers": 0, "manufacturers": 0, "teams": 0}

    # Hypercar drivers
    table = find_table_by_heading(
        soup, "Hypercar World Endurance Drivers' Championship"
    )
    if table is not None:
        for row in parse_standings_drivers(table, "HYPERCAR"):
            driver = (
                db.query(models.Driver).filter_by(name=row["name"]).first()
            )
            if driver is None:
                continue
            db.add(
                models.StandingDriver(
                    season_id=season_id,
                    driver_id=driver.id,
                    race_class_id=race_class_ids["HYPERCAR"],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["drivers"] += 1

    # LMGT3 drivers
    table = find_table_by_heading(
        soup, "FIA Endurance Trophy for LMGT3 Drivers"
    )
    if table is not None:
        for row in parse_standings_drivers(table, "LMGT3"):
            driver = (
                db.query(models.Driver).filter_by(name=row["name"]).first()
            )
            if driver is None:
                continue
            db.add(
                models.StandingDriver(
                    season_id=season_id,
                    driver_id=driver.id,
                    race_class_id=race_class_ids["LMGT3"],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["drivers"] += 1

    # Hypercar manufacturers
    table = find_table_by_heading(
        soup, "Hypercar World Endurance Manufacturers' Championship"
    )
    if table is not None:
        for row in parse_standings_manufacturers(table, "HYPERCAR"):
            manuf = (
                db.query(models.Manufacturer)
                .filter_by(name=row["name"])
                .first()
            )
            if manuf is None:
                continue
            db.add(
                models.StandingManufacturer(
                    season_id=season_id,
                    manufacturer_id=manuf.id,
                    race_class_id=race_class_ids["HYPERCAR"],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["manufacturers"] += 1

    # LMGT3 teams
    table = find_table_by_heading(soup, "FIA Endurance Trophy for LMGT3 Teams")
    if table is not None:
        for row in parse_standings_teams(table, "LMGT3"):
            team = db.query(models.Team).filter_by(name=row["name"]).first()
            if team is None:
                continue
            db.add(
                models.StandingTeam(
                    season_id=season_id,
                    team_id=team.id,
                    race_class_id=race_class_ids["LMGT3"],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["teams"] += 1

    db.flush()
    return counts


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def ingest(year: int = DEFAULT_YEAR, url: str = DEFAULT_URL) -> dict:
    print(f"fetching {url}")
    html = fetch_html(url)
    soup = BeautifulSoup(html, "lxml")

    db = SessionLocal()
    try:
        season = get_or_create_season(db, year)
        for name in ("HYPERCAR", "LMP2", "LMGT3"):
            get_or_create_race_class(db, name)
        race_class_ids = {
            rc.name: rc.id for rc in db.query(models.RaceClass).all()
        }

        _clear_season(db, season.id)

        events_n = _ingest_calendar(soup, db, season.id)
        cars_n, car_drivers_n = _ingest_entries(
            soup, db, season.id, race_class_ids
        )
        winners_n = _ingest_results_summary(
            soup, db, season.id, race_class_ids
        )
        standings_counts = _ingest_standings(
            soup, db, season.id, race_class_ids
        )

        db.commit()
        summary = {
            "events": events_n,
            "cars": cars_n,
            "car_drivers": car_drivers_n,
            "winners": winners_n,
            "standings_drivers": standings_counts["drivers"],
            "standings_manufacturers": standings_counts["manufacturers"],
            "standings_teams": standings_counts["teams"],
        }
        print("ingested:")
        for k, v in summary.items():
            print(f"  {k}={v}")
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    ingest(year=DEFAULT_YEAR, url=url)


if __name__ == "__main__":
    main()

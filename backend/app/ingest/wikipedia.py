"""Ingest WEC season data from Wikipedia.

Today: entry list (Hypercar + LMGT3) — teams, cars, drivers, car_drivers.
Schedule, results, and standings are deferred to follow-up modules.

Run:
    .venv/bin/python -m app.ingest.wikipedia
"""
import re
import sys

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
        # Avoid duplicates if a driver name somehow appears twice
        if e["driver"] not in grouped[key]["drivers"]:
            grouped[key]["drivers"].append(e["driver"])
    return list(grouped.values())


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------


def _clear_season(db: Session, season_id: int) -> None:
    """Delete season-scoped rows so re-ingestion is clean. Standings/results
    will be empty until follow-up modules repopulate them."""
    db.execute(
        delete(models.StandingDriver).where(
            models.StandingDriver.season_id == season_id
        )
    )
    db.execute(
        delete(models.StandingTeam).where(models.StandingTeam.season_id == season_id)
    )
    db.execute(
        delete(models.StandingManufacturer).where(
            models.StandingManufacturer.season_id == season_id
        )
    )

    car_ids_subq = select(models.Car.id).where(models.Car.season_id == season_id)
    db.execute(
        delete(models.SessionResult).where(
            models.SessionResult.car_id.in_(car_ids_subq)
        )
    )
    db.execute(
        delete(models.CarDriver).where(models.CarDriver.season_id == season_id)
    )
    db.execute(delete(models.Car).where(models.Car.season_id == season_id))
    db.flush()


def ingest(year: int = DEFAULT_YEAR, url: str = DEFAULT_URL) -> dict[str, int]:
    print(f"fetching {url}")
    html = fetch_html(url)
    soup = BeautifulSoup(html, "lxml")
    hyper_table, lmgt3_table = find_entry_tables(soup)
    if hyper_table is None or lmgt3_table is None:
        raise RuntimeError(
            f"could not find entry tables (hypercar={hyper_table is not None}, "
            f"lmgt3={lmgt3_table is not None})"
        )

    hyper_entries = group_by_car(parse_entries(hyper_table, "HYPERCAR"))
    lmgt3_entries = group_by_car(parse_entries(lmgt3_table, "LMGT3"))
    print(
        f"parsed: hypercar={len(hyper_entries)} cars, "
        f"lmgt3={len(lmgt3_entries)} cars"
    )

    db = SessionLocal()
    counters = {"manufacturers": 0, "teams": 0, "drivers": 0, "cars": 0, "car_drivers": 0}
    try:
        season = get_or_create_season(db, year)
        for name in ("HYPERCAR", "LMP2", "LMGT3"):
            get_or_create_race_class(db, name)
        race_class_ids = {
            rc.name: rc.id for rc in db.query(models.RaceClass).all()
        }

        _clear_season(db, season.id)

        for entry in hyper_entries + lmgt3_entries:
            manuf_name = _extract_manufacturer(entry["car"])
            manuf = upsert_manufacturer(db, manuf_name)
            team = upsert_team(db, entry["entrant"], manufacturer_id=manuf.id)
            car = models.Car(
                season_id=season.id,
                team_id=team.id,
                race_class_id=race_class_ids[entry["race_class"]],
                number=entry["number"],
                model=entry["car"],
            )
            db.add(car)
            db.flush()
            counters["cars"] += 1

            for driver_name in entry["drivers"]:
                driver = upsert_driver(db, driver_name)
                db.add(
                    models.CarDriver(
                        car_id=car.id,
                        driver_id=driver.id,
                        season_id=season.id,
                    )
                )
                counters["car_drivers"] += 1

        # Counters are imprecise for upserts (we don't track new vs existing).
        # Just print final totals for visibility.
        counters["manufacturers"] = db.query(models.Manufacturer).count()
        counters["teams"] = db.query(models.Team).count()
        counters["drivers"] = db.query(models.Driver).count()

        db.commit()
        print("ingested:")
        for k, v in counters.items():
            print(f"  {k}={v}")
        return counters
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

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
from urllib.parse import unquote

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
DEFAULT_YEAR = 2026


def url_for_year(year: int) -> str:
    return f"https://en.wikipedia.org/wiki/{year}_FIA_World_Endurance_Championship"


DEFAULT_URL = url_for_year(DEFAULT_YEAR)

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

# Circuit length + country fallback by exact name match. Wikipedia's calendar
# table doesn't carry length and the location cell sometimes has no comma to
# parse a country code out of, so we hard-code 2026 circuits to keep the UI
# from showing "UNK · 0.000 km" rows.
CIRCUIT_INFO: dict[str, tuple[str, float]] = {
    "Imola Circuit": ("ITA", 4.909),
    "Circuit de Spa-Francorchamps": ("BEL", 7.004),
    "Circuit de la Sarthe": ("FRA", 13.626),
    "Interlagos Circuit": ("BRA", 4.309),
    "Circuit of the Americas": ("USA", 5.513),
    "Fuji Speedway": ("JPN", 4.563),
    "Losail International Circuit": ("QAT", 5.419),
    "Bahrain International Circuit": ("BHR", 5.412),
}

# Wikipedia article title per manufacturer. We resolve the article first to
# get its `wikibase_item` (Wikidata QID) — searching Wikidata directly often
# matches the wrong entity (e.g., 'Ferrari' → Enzo Ferrari instead of the
# company). For motorsport-tied names, prefer the racing-arm article.
MANUFACTURER_WP_TITLE: dict[str, str] = {
    "Alpine": "Alpine_(automobile)",
    "Genesis": "Genesis_Motor",
    "McLaren": "McLaren_Racing",
    "Aston Martin": "Aston_Martin",
    "Mercedes-AMG": "Mercedes-AMG",
    "Ford": "Ford_Motor_Company",
}

# Hand-picked overrides. Wikidata's P154 often returns wordmark logos for
# big brands; a motorsport dashboard reads better with iconic badges. URLs
# below have been verified to return 200.
MANUFACTURER_LOGO_OVERRIDE: dict[str, str] = {
    "Toyota": "https://upload.wikimedia.org/wikipedia/commons/9/9d/Toyota_carlogo.svg",
    "Genesis": "https://upload.wikimedia.org/wikipedia/en/8/83/Genesis_division_emblem.svg",
    # Wordmark → iconic badge:
    "Ferrari": "https://upload.wikimedia.org/wikipedia/en/3/36/Prancing_horse.svg",
    "Peugeot": "https://upload.wikimedia.org/wikipedia/en/9/9d/Peugeot_2021_Logo.svg",
    "Cadillac": "https://upload.wikimedia.org/wikipedia/en/6/66/Cadillac_logo_BW.svg",
    "BMW": "https://commons.wikimedia.org/wiki/Special:FilePath/BMW.svg",
    "Porsche": "https://upload.wikimedia.org/wikipedia/en/c/c2/Porsche_Logo_2024.png",
    "Aston Martin": "https://upload.wikimedia.org/wikipedia/en/8/8f/Aston_Martin_Lagonda_brand_logo.svg",
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


def fetch_manufacturer_logo(name: str) -> str | None:
    """Resolve a manufacturer's logo via Wikipedia → Wikidata P154.

    Steps:
    1. Manual override (curated URLs for cases Wikidata gets wrong).
    2. Hit Wikipedia summary on a known article title to read `wikibase_item`
       (the Wikidata QID); this avoids search ambiguity.
    3. Fetch the P154 (logo image) claim from Wikidata.
    4. Build a Special:FilePath URL on Wikimedia Commons.
    """
    if name in MANUFACTURER_LOGO_OVERRIDE:
        return MANUFACTURER_LOGO_OVERRIDE[name]
    title = MANUFACTURER_WP_TITLE.get(name, name.replace(" ", "_"))
    headers = {"User-Agent": USER_AGENT}

    try:
        summary = httpx.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
            headers=headers,
            timeout=10.0,
        )
        if summary.status_code != 200:
            return None
        qid = summary.json().get("wikibase_item")
        if not qid:
            return None
    except (httpx.HTTPError, KeyError):
        return None

    try:
        claims = httpx.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbgetclaims",
                "entity": qid,
                "property": "P154",
                "format": "json",
            },
            headers=headers,
            timeout=10.0,
        )
        if claims.status_code != 200:
            return None
        rows = claims.json().get("claims", {}).get("P154", [])
        if not rows:
            return None
        filename = rows[0]["mainsnak"]["datavalue"]["value"]
    except (httpx.HTTPError, KeyError):
        return None

    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{filename.replace(' ', '_')}"


def fetch_driver_photo(title: str) -> str | None:
    """Pull the lead-image thumbnail for a driver's Wikipedia article.

    `title` should be the article title (e.g., 'Sébastien_Buemi'), typically
    extracted from the entry-list anchor href. The summary REST endpoint
    returns disambiguation pages with type=='disambiguation' — those have no
    portrait; skip them. Returns the thumbnail.source URL (~320px wide) or
    None if the article has no lead image.
    """
    headers = {"User-Agent": USER_AGENT}
    try:
        r = httpx.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
            headers=headers,
            timeout=10.0,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("type") == "disambiguation":
            return None
        thumb = data.get("thumbnail") or {}
        src = thumb.get("source")
        return src if isinstance(src, str) else None
    except (httpx.HTTPError, ValueError):
        return None


def parse_driver_links(table: Tag) -> dict[str, str]:
    """Build a {anchor_text: wikipedia_title} map from any wikitable.

    The entry-list table links each driver to their article. We harvest
    every blue (non-redlink) anchor — overlapping with team/car names is
    harmless because consumers only look up by driver name.
    """
    out: dict[str, str] = {}
    for a in table.find_all("a", href=True):
        href = a["href"]
        if "redlink=1" in href or "action=edit" in href:
            continue
        if not href.startswith("/wiki/"):
            continue
        title = unquote(href.removeprefix("/wiki/").split("#")[0])
        name = _clean(a.get_text(" ", strip=True))
        if name and title:
            out.setdefault(name, title)
    return out


# Match Wikipedia footnote markers: [1], [12], [ a ], [b], etc.
_REF_RE = re.compile(r"\s*\[\s*[\w\d]+\s*\]\s*")


def _clean(text: str) -> str:
    """Strip Wikipedia footnote markers and normalize whitespace."""
    text = _REF_RE.sub("", text)
    return text.replace("\xa0", " ").strip()


def expand_rowspan(table: Tag, text_sep: str = " ") -> list[list[str]]:
    """Resolve rowspan/colspan into a uniform 2D grid of cell text.

    `text_sep` controls how text nodes within a single cell are joined.
    Use ``"\n"`` to preserve `<br>`/list-style separation (e.g., a Drivers
    column listing three names on three lines)."""
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
            value = _clean(td.get_text(text_sep, strip=True))
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


def find_entry_tables(soup: BeautifulSoup) -> list[tuple[str, Tag]]:
    """Return [(canonical_class, table), ...] for every entry-list table on
    the season page. Class is derived from the table's nearest preceding
    H2/H3/H4 heading text, then run through _normalize_class so
    'LMGTE Pro' becomes 'LMGTE_PRO' etc. Tables whose heading we can't
    map to a class are skipped — that drops e.g. the standings tables
    which also have Entrant + Drivers in some seasons."""
    out: list[tuple[str, Tag]] = []
    # Track (class, heading-id) so LMP1-H + LMP1-L both contribute (they map
    # to LMP1 but live under separate headings) while a single class' entry
    # table doesn't get scraped twice from a constructor/sub-section table.
    seen_headings: set[tuple[str, int]] = set()
    for table in soup.select("table.wikitable"):
        first_tr = table.find("tr")
        if first_tr is None:
            continue
        headers = [
            _clean(h.get_text(" ", strip=True)) for h in first_tr.find_all(["th", "td"])
        ]
        if "Drivers" not in headers:
            continue
        # Older season pages use 'Entrant/Team' as a single combined column.
        if "Entrant" not in headers and "Entrant/Team" not in headers:
            continue
        h = table.find_previous(["h2", "h3", "h4"])
        if h is None:
            continue
        cls = _normalize_class(h.get_text(" ", strip=True))
        if cls is None:
            continue
        key = (cls, id(h))
        if key in seen_headings:
            continue
        seen_headings.add(key)
        out.append((cls, table))
    return out


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

    if "Car" not in cols or "Drivers" not in cols:
        raise ValueError(
            f"missing required columns: {{'Car','Drivers'}} - {set(cols.keys())}"
        )
    entrant_key = next(
        (k for k in ("Entrant", "Entrant/Team") if k in cols), None
    )
    if entrant_key is None:
        raise ValueError("missing Entrant/Entrant-Team column")
    no_key = next((k for k in ("No.", "No") if k in cols), None)
    if no_key is None:
        raise ValueError("missing No./No column")

    entries: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        try:
            entry = {
                "entrant": row[cols[entrant_key]],
                "car": row[cols["Car"]],
                "engine": row[cols["Engine"]] if "Engine" in cols else "",
                "number": row[cols[no_key]],
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
    """Collapse driver rows into per-car aggregates. Each driver carries
    the source 'Rounds' string so partial-season entries (e.g. Le Mans
    fourth driver) can be filtered downstream."""
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
        bucket = grouped[key]["drivers"]
        if not any(d["name"] == e["driver"] for d in bucket):
            bucket.append({"name": e["driver"], "rounds": e.get("rounds") or None})
    return list(grouped.values())


# ---- Calendar ----


_DATE_RANGE_RE = re.compile(
    r"^\s*(\d{1,2})(?:\s*[–\-]\s*(\d{1,2}))?\s+(\w+)(?:\s+(\d{4}))?\s*$"
)


def parse_date_range(text: str, year: int) -> tuple[date, date] | None:
    """Parse '19 April', '13–14 June', or '5 May 2018' into (start, end).
    Returns None if unparseable. Wikipedia super-season pages append the
    explicit year because rounds span the calendar boundary; a present
    year suffix overrides the page-level fallback."""
    m = _DATE_RANGE_RE.match(text)
    if m is None:
        return None
    d1 = int(m.group(1))
    d2 = int(m.group(2)) if m.group(2) else d1
    month_name = m.group(3)
    if month_name not in MONTHS:
        return None
    month = MONTHS[month_name]
    actual_year = int(m.group(4)) if m.group(4) else year
    return date(actual_year, month, d1), date(actual_year, month, d2)


def parse_calendar(table: Tag, year: int) -> list[dict]:
    """Returns rounds (excluding Prologue) with circuit, location, date range."""
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    # Different season pages use 'Rnd', 'Round', or 'Rnd.'.
    rnd_key = next((k for k in ("Rnd", "Rnd.", "Round") if k in cols), None)
    required = {"Race", "Circuit", "Location", "Date"}
    if rnd_key is None or not required.issubset(cols.keys()):
        raise ValueError(
            f"calendar missing columns; header={header}"
        )
    cols["Rnd"] = cols[rnd_key]

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


def parse_race_report_urls(table: Tag) -> dict[int, str]:
    """From the season page's 'Race results' table, extract each round's
    Wikipedia race-page URL (the 'Report' column anchor). Skips redlinks
    (pages that don't exist yet — e.g., upcoming rounds)."""
    out: dict[int, str] = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        rnd_text = _clean(cells[0].get_text(" ", strip=True))
        if not rnd_text.isdigit():
            continue
        a = cells[-1].find("a", href=True)
        if a is None:
            continue
        href = a["href"]
        # Wikipedia redlinks point to an edit URL — skip future races.
        if "action=edit" in href or "redlink=1" in href:
            continue
        if href.startswith("/wiki/"):
            href = "https://en.wikipedia.org" + href
        elif not href.startswith("http"):
            continue
        out[int(rnd_text)] = href
    return out


def _normalize_class(raw: str) -> str | None:
    """Map free-form class labels (race-page Class column or page heading)
    onto our canonical class names. Covers every WEC class since 2012:
    HYPERCAR (LMH/LMDh), LMP1, LMP2, LMGT3, LMGTE_PRO, LMGTE_AM."""
    s = raw.strip().upper().replace(".", "").replace(" ", "").replace("-", "")
    if s in {"H", "HYPERCAR", "LMH", "LMDH"}:
        return "HYPERCAR"
    if s in {"GT3", "LMGT3"}:
        return "LMGT3"
    # 2014–2017 split LMP1 into LMP1-H (hybrid) and LMP1-L (privateer).
    # Treat both as plain LMP1 for our purposes.
    if s in {"LMP1", "LMP1H", "LMP1L"}:
        return "LMP1"
    if s == "LMP2":
        return "LMP2"
    if s in {"LMGTEPRO", "GTEPRO"}:
        return "LMGTE_PRO"
    if s in {"LMGTEAM", "GTEAM"}:
        return "LMGTE_AM"
    return None


def parse_race_classification(soup: BeautifulSoup) -> list[dict]:
    """Parse a single race page's classification table.

    Race pages use one combined table covering all classes; rows are sorted
    by overall position. Class column distinguishes Hypercar from LMGT3.
    """
    table = find_table_by_heading(soup, "Race")
    # Fall back to first wikitable that has Pos + Class + No. + Drivers
    if table is None:
        for t in soup.select("table.wikitable"):
            first_tr = t.find("tr")
            if first_tr is None:
                continue
            headers = [
                _clean(h.get_text(" ", strip=True))
                for h in first_tr.find_all(["th", "td"])
            ]
            if (
                any("Pos" in h for h in headers)
                and "Class" in headers
                and "No." in headers
                and "Drivers" in headers
            ):
                table = t
                break
    if table is None:
        return []

    # Use newline separator so the multi-name Drivers cell stays parseable.
    rows = expand_rowspan(table, text_sep="\n")
    if not rows:
        return []
    header = [h.replace("\n", " ").strip() for h in rows[0]]
    cols = {h: i for i, h in enumerate(header)}

    pos_key = next((k for k in ("Pos", "Pos.") if k in cols), None)
    no_key = next((k for k in ("No.", "No") if k in cols), None)
    if pos_key is None or "Class" not in cols or no_key is None:
        return []

    def flatten(s: str) -> str:
        return s.replace("\n", " ").strip()

    out: list[dict] = []
    seen: set[tuple[int, str]] = set()
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = flatten(row[cols[pos_key]])
        if not pos_raw.isdigit():
            continue  # skip DSQ/DNF/etc. rows
        time_key = next(
            (k for k in ("Time/Retired", "Time / Retired", "Time") if k in cols),
            None,
        )
        laps_key = "Laps" if "Laps" in cols else None
        drivers_key = "Drivers" if "Drivers" in cols else None
        try:
            drivers_raw = row[cols[drivers_key]] if drivers_key else ""
            drivers_norm = (
                " / ".join(p.strip() for p in drivers_raw.split("\n") if p.strip())
                if drivers_raw
                else ""
            )
            entry = {
                "position": int(pos_raw),
                "class": flatten(row[cols["Class"]]),
                "number": flatten(row[cols[no_key]]),
                "laps": flatten(row[cols[laps_key]]) if laps_key else "",
                "gap": (
                    flatten(row[cols[time_key]]).rstrip("‡†*") if time_key else ""
                ),
                "drivers": drivers_norm,
            }
        except IndexError:
            continue
        # Wikipedia race tables sometimes split each entry across two rows
        # (drivers + crew details); dedupe by (position, car number).
        key = (entry["position"], entry["number"])
        if key in seen:
            continue
        seen.add(key)
        out.append(entry)
    return out


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
    # Header capitalization + class set vary across season pages (Hypercar
    # winners / LMP1 winners / LMGTE Pro winners / etc). Discover any
    # column ending in 'winners' and map it to a canonical class.
    lower_to_idx = {h.lower(): i for i, h in enumerate(header)}
    rnd_key = next(
        (lower_to_idx[k] for k in ("rnd.", "rnd") if k in lower_to_idx), None
    )
    if rnd_key is None:
        return {}
    class_cols: list[tuple[str, int]] = []
    for raw, idx in lower_to_idx.items():
        if not raw.endswith(" winners"):
            continue
        cls = _normalize_class(raw[: -len(" winners")])
        if cls is not None:
            class_cols.append((cls, idx))
    if not class_cols:
        return {}

    out: dict[int, dict] = {}
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        rnd_text = row[rnd_key]
        if not rnd_text.strip().isdigit():
            continue
        rnd_num = int(rnd_text)
        bucket = out.setdefault(rnd_num, {})
        for cls, idx in class_cols:
            cell = row[idx].strip()
            m = _NO_RE.match(cell)
            if m:
                bucket[cls] = {
                    "car_number": m.group(1),
                    "team_name": m.group(2).strip(),
                }
    return out


# ---- Standings ----


def _resolve_points_col(cols: dict[str, int]) -> int | None:
    """Older standings tables use 'Total points' or 'Total' instead of
    'Points'."""
    for k in ("Points", "Total points", "Total"):
        if k in cols:
            return cols[k]
    return None


def _resolve_pos_col(cols: dict[str, int]) -> int | None:
    for k in ("Pos.", "Pos"):
        if k in cols:
            return cols[k]
    return None


def parse_standings_drivers(table: Tag, race_class: str) -> list[dict]:
    """Returns rows with position/driver/points. Skip footers/legend rows."""
    rows = expand_rowspan(table)
    if not rows:
        return []
    header = rows[0]
    cols = {h: i for i, h in enumerate(header)}
    if "Driver" not in cols:
        return []
    pts_idx = _resolve_points_col(cols)
    pos_idx = _resolve_pos_col(cols)
    if pts_idx is None or pos_idx is None:
        return []

    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[pos_idx]
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[pts_idx].replace(",", ""))
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
    the same data after rowspan resolution. Keep only the first occurrence."""
    seen: set[tuple] = set()
    out: list[dict] = []
    for r in rows:
        # Include car_number in the dedupe key so a team running two cars
        # (e.g., LMGT3 Team WRT #46 and #69) keeps both rows.
        key = (r["position"], r["name"], r.get("car_number"))
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
    if "Manufacturer" not in cols:
        return []
    pts_idx = _resolve_points_col(cols)
    pos_idx = _resolve_pos_col(cols)
    if pts_idx is None or pos_idx is None:
        return []
    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[pos_idx]
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[pts_idx].replace(",", ""))
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
    if "Team" not in cols:
        return []
    pts_idx = _resolve_points_col(cols)
    pos_idx = _resolve_pos_col(cols)
    if pts_idx is None or pos_idx is None:
        return []
    out: list[dict] = []
    for row in rows[1:]:
        if len(row) < len(header):
            continue
        pos_raw = row[pos_idx]
        if not pos_raw.strip().isdigit():
            continue
        try:
            pts = float(row[pts_idx].replace(",", ""))
        except (ValueError, IndexError):
            continue
        out.append({
            "position": int(pos_raw),
            "name": row[cols["Team"]],
            "car_number": (
                row[cols["Car"]].strip() if "Car" in cols else None
            ),
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
    fallback_country, fallback_length = CIRCUIT_INFO.get(name, (None, 0.0))
    resolved_country = country or fallback_country or "UNK"
    obj = db.query(models.Circuit).filter_by(name=name).first()
    if obj is None:
        obj = models.Circuit(
            name=name, country=resolved_country, length_km=fallback_length
        )
        db.add(obj)
        db.flush()
        return obj
    if obj.country in (None, "UNK") and resolved_country != "UNK":
        obj.country = resolved_country
    if not obj.length_km and fallback_length:
        obj.length_km = fallback_length
    return obj


def _ingest_calendar(
    soup: BeautifulSoup, db: Session, season_id: int, year: int
) -> int:
    # Recent seasons use 'Calendar', older ones used 'Schedule'.
    table = find_table_by_heading(soup, "Calendar") or find_table_by_heading(
        soup, "Schedule"
    )
    if table is None:
        return 0
    rounds = parse_calendar(table, year=year)
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
    tables = find_entry_tables(soup)
    if not tables:
        raise RuntimeError("no entry tables found on season page")
    grouped: list[dict] = []
    driver_titles: dict[str, str] = {}
    for cls, table in tables:
        grouped.extend(group_by_car(parse_entries(table, cls)))
        # Driver-link map for portrait fetches — merged across all classes.
        for name, title in parse_driver_links(table).items():
            driver_titles.setdefault(name, title)
    car_drivers_count = 0
    for entry in grouped:
        manuf = upsert_manufacturer(db, _extract_manufacturer(entry["car"]))
        if not manuf.logo_url:
            logo = fetch_manufacturer_logo(manuf.name)
            if logo:
                manuf.logo_url = logo
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
        for driver_info in entry["drivers"]:
            driver = upsert_driver(db, driver_info["name"])
            if not driver.photo_url:
                title = driver_titles.get(driver_info["name"])
                if title:
                    photo = fetch_driver_photo(title)
                    if photo:
                        driver.photo_url = photo
            db.add(
                models.CarDriver(
                    car_id=car.id,
                    driver_id=driver.id,
                    season_id=season_id,
                    rounds=driver_info.get("rounds"),
                )
            )
            car_drivers_count += 1
    db.flush()
    return len(grouped), car_drivers_count


def _ingest_results_summary(
    soup: BeautifulSoup, db: Session, season_id: int, race_class_ids: dict[str, int]
) -> int:
    """Create a RACE session per completed round and write the winner row.
    The detailed classification ingester replaces these with full grids
    when an individual race page is available."""
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


def _ingest_race_classifications(
    soup: BeautifulSoup,
    db: Session,
    season_id: int,
    race_class_ids: dict[str, int],
) -> dict[int, int]:
    """For each completed round, fetch its individual Wikipedia race page
    and replace the winner-only session_results with a full classification."""
    results_table = find_table_by_heading(soup, "Race results")
    if results_table is None:
        return {}
    round_urls = parse_race_report_urls(results_table)

    counts: dict[int, int] = {}
    for round_num, url in round_urls.items():
        event = (
            db.query(models.Event)
            .filter_by(season_id=season_id, round=round_num)
            .first()
        )
        if event is None:
            continue

        try:
            race_html = fetch_html(url)
        except Exception as exc:  # network/404
            print(f"  R{round_num}: failed to fetch {url} — {exc}")
            continue
        race_soup = BeautifulSoup(race_html, "lxml")
        rows = parse_race_classification(race_soup)
        if not rows:
            print(f"  R{round_num}: no classification table at {url}")
            continue

        session = (
            db.query(models.Session)
            .filter_by(event_id=event.id, type="RACE")
            .first()
        )
        if session is None:
            session = models.Session(event_id=event.id, type="RACE")
            db.add(session)
            db.flush()

        # Replace winner-only entries with detailed classification.
        db.execute(
            delete(models.SessionResult).where(
                models.SessionResult.session_id == session.id
            )
        )

        inserted = 0
        for r in rows:
            class_name = _normalize_class(r["class"])
            if class_name is None:
                continue
            car = (
                db.query(models.Car)
                .filter_by(
                    season_id=season_id,
                    number=r["number"],
                    race_class_id=race_class_ids[class_name],
                )
                .first()
            )
            if car is None:
                continue
            laps = int(r["laps"]) if r["laps"].isdigit() else None
            db.add(
                models.SessionResult(
                    session_id=session.id,
                    car_id=car.id,
                    position=r["position"],
                    laps=laps,
                    gap=r["gap"] or None,
                    drivers=r.get("drivers") or None,
                )
            )
            inserted += 1
        counts[round_num] = inserted
        print(f"  R{round_num}: classified {inserted} cars from {url}")
    db.flush()
    return counts


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


_CLASS_HEADING_KEYWORDS: dict[str, list[str]] = {
    "HYPERCAR": ["hypercar"],
    "LMP1": ["lmp1"],
    "LMP2": ["lmp2"],
    "LMGT3": ["lmgt3"],
    "LMGTE_PRO": ["lmgte pro", "gte pro"],
    "LMGTE_AM": ["lmgte am", "gte am"],
}


def _find_standings_tables_for(
    soup: BeautifulSoup, kind: str, top_class: str | None = None
) -> dict[str, Tag]:
    """Discover standings tables on a season page by walking every wikitable
    and asking 'does its preceding heading mention this class + this kind?'.
    Past seasons used many trophy names ('Endurance Trophy for LMP2 Drivers',
    'LMP1 Trophy', 'World Cup for ...') so name-matching needs to be loose.

    `kind` is one of 'drivers', 'manufacturers', 'teams'. `top_class` is the
    top-tier class for this season (e.g. 'LMP1' pre-2017, 'HYPERCAR' from
    2021 on) — used as a fallback when a heading is just 'World Endurance
    Drivers' Championship' with no class keyword."""
    out: dict[str, Tag] = {}
    for table in soup.select("table.wikitable"):
        h = table.find_previous(["h2", "h3", "h4"])
        if h is None:
            continue
        text = h.get_text(" ", strip=True).lower()
        if kind not in text:
            continue
        matched = False
        for cls, keywords in _CLASS_HEADING_KEYWORDS.items():
            if cls in out:
                continue
            if any(k in text for k in keywords):
                out[cls] = table
                matched = True
                break
        # 2012–2016 used "World Endurance Drivers' / Manufacturers' Championship"
        # (or just "Drivers' World Championship" in 2012) with no class keyword
        # to mean the top class. Recognize either pattern as a fallback to
        # the season's top class.
        if (
            not matched
            and top_class is not None
            and top_class not in out
            and "championship" in text
            and ("world endurance" in text or "world champion" in text)
        ):
            out[top_class] = table
    return out


def _ingest_standings(
    soup: BeautifulSoup,
    db: Session,
    season_id: int,
    race_class_ids: dict[str, int],
    year: int,
) -> dict[str, int]:
    after_event_id = _last_completed_event_id(db, season_id)
    # Top-tier class flipped from LMP1 to Hypercar in 2021.
    top_class = "HYPERCAR" if year >= 2021 else "LMP1"

    counts = {"drivers": 0, "manufacturers": 0, "teams": 0}

    # Drivers — every (class, table) pair we can locate.
    for cls, table in _find_standings_tables_for(
        soup, "drivers", top_class
    ).items():
        for row in parse_standings_drivers(table, cls):
            driver = (
                db.query(models.Driver).filter_by(name=row["name"]).first()
            )
            if driver is None:
                continue
            db.add(
                models.StandingDriver(
                    season_id=season_id,
                    driver_id=driver.id,
                    race_class_id=race_class_ids[cls],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["drivers"] += 1

    # Manufacturers
    for cls, table in _find_standings_tables_for(
        soup, "manufacturers", top_class
    ).items():
        for row in parse_standings_manufacturers(table, cls):
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
                    race_class_id=race_class_ids[cls],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                )
            )
            counts["manufacturers"] += 1

    # Teams
    for cls, table in _find_standings_tables_for(
        soup, "teams", top_class
    ).items():
        for row in parse_standings_teams(table, cls):
            team = db.query(models.Team).filter_by(name=row["name"]).first()
            if team is None:
                continue
            db.add(
                models.StandingTeam(
                    season_id=season_id,
                    team_id=team.id,
                    race_class_id=race_class_ids[cls],
                    after_event_id=after_event_id,
                    position=row["position"],
                    points=row["points"],
                    car_number=row.get("car_number"),
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
        for name in (
            "HYPERCAR",
            "LMP1",
            "LMP2",
            "LMGT3",
            "LMGTE_PRO",
            "LMGTE_AM",
        ):
            get_or_create_race_class(db, name)
        race_class_ids = {
            rc.name: rc.id for rc in db.query(models.RaceClass).all()
        }

        _clear_season(db, season.id)

        events_n = _ingest_calendar(soup, db, season.id, year)
        cars_n, car_drivers_n = _ingest_entries(
            soup, db, season.id, race_class_ids
        )
        winners_n = _ingest_results_summary(
            soup, db, season.id, race_class_ids
        )
        classified = _ingest_race_classifications(
            soup, db, season.id, race_class_ids
        )
        standings_counts = _ingest_standings(
            soup, db, season.id, race_class_ids, year
        )

        db.commit()
        summary = {
            "events": events_n,
            "cars": cars_n,
            "car_drivers": car_drivers_n,
            "winners": winners_n,
            "classified_rounds": len(classified),
            "classified_total": sum(classified.values()),
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
    """CLI: `python -m app.ingest.wikipedia [year] [url]`. Either or both
    optional. With `year` only, the URL is derived from the year. With
    `url` only, year stays the default — passing both is the safest
    when the article slug doesn't match the year."""
    year = DEFAULT_YEAR
    url = DEFAULT_URL
    if len(sys.argv) > 1:
        first = sys.argv[1]
        if first.isdigit():
            year = int(first)
            url = url_for_year(year)
        else:
            url = first
    if len(sys.argv) > 2:
        url = sys.argv[2]
    ingest(year=year, url=url)


if __name__ == "__main__":
    main()

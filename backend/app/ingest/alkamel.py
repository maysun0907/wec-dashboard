"""Scrape per-session driver attribution from Al Kamel timing CSVs.

fiawec.alkamelsystems.com hosts the official lap-by-lap data behind the
WEC results portal. The Wikipedia qualifying tables only carry the lap
*time*; Al Kamel's Analysis CSVs include DRIVER_NAME for every recorded
lap, which lets us identify who actually drove Q1 vs the Hyperpole
shootout for each car.

Pipeline:

    season form  →  event slug  →  session folder URL
        →  Classification CSV (best lap per car)
        →  Analysis CSV (lap-by-lap with driver)
        →  pick the lap matching the official best time
        →  that row's DRIVER_NAME is the session driver

The Q sessions in our DB are stored as a single row per car with both
qualifying_lap and hyperpole_lap populated. Al Kamel publishes Q1 and
Hyperpole as separate sessions, so we update the same row from two
different CSV pairs.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Iterable
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session, joinedload

from app import models
from app.circuit_tz import tz_for_circuit


def _timestamp_to_utc(stamp: str, circuit_tz: str | None) -> datetime | None:
    """Parse Al Kamel's `YYYYMMDDHHMM` folder prefix as circuit-local
    time and return a naive UTC datetime."""
    try:
        local = datetime.strptime(stamp, "%Y%m%d%H%M")
    except ValueError:
        return None
    tz = ZoneInfo(circuit_tz) if circuit_tz else ZoneInfo("UTC")
    return (
        local.replace(tzinfo=tz)
        .astimezone(ZoneInfo("UTC"))
        .replace(tzinfo=None)
    )

USER_AGENT = "wec-dashboard/0.1 (open-source dashboard for FIA WEC fans)"
BASE = "https://fiawec.alkamelsystems.com"


def _fetch(url: str) -> str:
    r = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
        follow_redirects=True,
        timeout=20.0,
    )
    r.raise_for_status()
    return r.text


# ---------------------------------------------------------------------------
# Discovery — season + event params
# ---------------------------------------------------------------------------


def _season_param_for_year(year: int) -> str | None:
    """Pull the season selector from the home page and find the option
    whose label matches `year` (or whose label contains it for the
    2018-2019 / 2019-2020 split-calendar seasons)."""
    try:
        html = _fetch(f"{BASE}/")
    except httpx.HTTPError:
        return None
    soup = BeautifulSoup(html, "lxml")
    sel = soup.find("select", {"name": "season"})
    if sel is None:
        return None
    needle = str(year)
    best: str | None = None
    for opt in sel.find_all("option"):
        label = opt.get_text(strip=True)
        value = opt.get("value") or opt.get("Value") or ""
        if label == needle:
            return value
        if needle in label and best is None:
            best = value
    return best


def _event_options_for_season(season_param: str) -> list[tuple[int, str]]:
    """Return [(round_num, evvent_param)] for the given season. Round
    is parsed from the leading 'NN_' prefix on each option value."""
    try:
        html = _fetch(f"{BASE}/?season={season_param}")
    except httpx.HTTPError:
        return []
    soup = BeautifulSoup(html, "lxml")
    sel = soup.find("select", {"name": "evvent"})
    if sel is None:
        return []
    out: list[tuple[int, str]] = []
    for opt in sel.find_all("option"):
        value = opt.get("value") or opt.get("Value") or ""
        m = re.match(r"^(\d{1,2})_", value)
        if m:
            out.append((int(m.group(1)), value))
    return out


# ---------------------------------------------------------------------------
# Per-event CSV discovery
# ---------------------------------------------------------------------------

# Match Q / Hyperpole / Free-Practice session folders that live under
# the main race-weekend event (`*_FIA WEC`, NOT `_FIA WEC Prologue`
# or support series like `_Legends of Le Mans`). Group 1 is the event
# folder name, 2 is the timestamp, 3 is the session-name body, 4 is the
# optional class qualifier.
_SESSION_FOLDER_RE = re.compile(
    r"Results/[^/]+/[^/]+/(\d+_FIA%20WEC)/(\d{12})_"
    r"(Qualifying|Hyperpole|Free%20Practice%20[123]|Final%20Practice)"
    r"(?:%20([A-Za-z0-9]+))?/",
    re.IGNORECASE,
)


def _name_to_kind(raw: str) -> str | None:
    n = raw.lower()
    if n.startswith("hyperpole"):
        return "HP"
    if n.startswith("qualifying"):
        return "Q"
    if n.startswith("free practice 1"):
        return "FP1"
    if n.startswith("free practice 2"):
        return "FP2"
    if n.startswith("free practice 3") or n.startswith("final practice"):
        return "FP3"
    return None


def _list_session_csvs(
    season_param: str, evvent_param: str
) -> list[tuple[str, str, str, str, str]]:
    """For one event, return [(kind, class_name, classification_url,
    analysis_url, timestamp)] where kind is 'Q', 'HP', 'FP1', 'FP2', or
    'FP3' and timestamp is the 12-char YYYYMMDDHHMM stamp from the
    folder name (circuit-local; convert with the event's tz)."""
    try:
        html = _fetch(
            f"{BASE}/?season={season_param}&evvent={evvent_param}"
        )
    except httpx.HTTPError:
        return []
    folders: dict[str, tuple[str, str, str]] = {}
    classifications: dict[str, str] = {}
    analyses: dict[str, str] = {}
    for href in re.findall(r'href="(Results/[^"]+\.CSV)"', html):
        decoded = href.replace("%20", " ")
        slash = decoded.rfind("/")
        if slash < 0:
            continue
        folder = decoded[:slash]
        fname = decoded[slash + 1 :]
        m = _SESSION_FOLDER_RE.search(href + "/")
        if m is None:
            continue
        kind = _name_to_kind(m.group(3).replace("%20", " "))
        if kind is None:
            continue
        cls_name = (m.group(4) or "").upper()
        timestamp = m.group(2)
        folders.setdefault(folder, (kind, cls_name, timestamp))
        if re.match(r"^(03|90)_Classification_", fname, re.IGNORECASE):
            classifications.setdefault(folder, f"{BASE}/{href}")
        elif re.match(r"^23_Analysis_", fname, re.IGNORECASE):
            analyses.setdefault(folder, f"{BASE}/{href}")
    out: list[tuple[str, str, str, str, str]] = []
    for folder, (kind, cls_name, timestamp) in folders.items():
        cl = classifications.get(folder)
        if cl is None:
            continue
        an = analyses.get(folder, "")
        out.append((kind, cls_name, cl, an, timestamp))
    return out


def find_weather_url(
    season_param: str, evvent_param: str, kind: str
) -> str | None:
    """Locate one ``26_Weather_*.CSV`` for the requested session kind.
    `kind` is 'RACE', 'Q', 'FP1', 'FP2', 'FP3', 'HP'. For RACE we pick
    the latest published hour so the hot collector advances through changing
    conditions. Returns None if no file exists yet."""
    try:
        html = _fetch(
            f"{BASE}/?season={season_param}&evvent={evvent_param}"
        )
    except httpx.HTTPError:
        return None
    race_candidates: list[tuple[int, str]] = []
    for href in re.findall(r'href="(Results/[^"]+\.CSV)"', html):
        decoded = href.replace("%20", " ")
        slash = decoded.rfind("/")
        if slash < 0:
            continue
        fname = decoded[slash + 1 :]
        if not re.match(r"^26_Weather_", fname, re.IGNORECASE):
            continue
        if kind == "RACE":
            race_match = _RACE_HOUR_RE.search(href + "/")
            if race_match is not None:
                race_candidates.append(
                    (int(race_match.group(4)), f"{BASE}/{href}")
                )
            continue
        m = _SESSION_FOLDER_RE.search(href + "/")
        if m is None:
            continue
        folder_kind = _name_to_kind(m.group(3).replace("%20", " "))
        if folder_kind == kind:
            return f"{BASE}/{href}"
    if race_candidates:
        return max(race_candidates, key=lambda item: item[0])[1]
    return None


def _to_float(raw: str) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def parse_weather_summary(text: str) -> dict[str, float | str | None]:
    """Aggregate the weather CSV — median temperatures, max humidity,
    rain flag if any reading > 0. Returns a small dict ready for the
    API layer."""
    rows = _parse_csv(text)
    air: list[float] = []
    track: list[float] = []
    humidity: list[float] = []
    wind: list[float] = []
    rain_seen = False
    for r in rows:
        a = _to_float((r.get("AIR_TEMP") or r.get(" AIR_TEMP") or "").strip())
        t = _to_float((r.get("TRACK_TEMP") or r.get(" TRACK_TEMP") or "").strip())
        h = _to_float((r.get("HUMIDITY") or r.get(" HUMIDITY") or "").strip())
        w = _to_float((r.get("WIND_SPEED") or r.get(" WIND_SPEED") or "").strip())
        rn = _to_float((r.get("RAIN") or r.get(" RAIN") or "").strip())
        if a is not None:
            air.append(a)
        if t is not None:
            track.append(t)
        if h is not None:
            humidity.append(h)
        if w is not None:
            wind.append(w)
        if rn is not None and rn > 0:
            rain_seen = True

    def median(xs: list[float]) -> float | None:
        if not xs:
            return None
        s = sorted(xs)
        return s[len(s) // 2]

    return {
        "air_temp_c": median(air),
        "track_temp_c": median(track),
        "humidity_pct": median(humidity),
        "wind_kph": median(wind),
        "rain": rain_seen,
    }


# Race folders look like `{event}_FIA WEC/{ts}_Race/{NN}_Hour {N}/`. The
# final-hour classification CSV is the official result; the analysis CSV
# next to it covers the whole race.
_RACE_HOUR_RE = re.compile(
    r"Results/[^/]+/[^/]+/(\d+_FIA%20WEC)/(\d{12})_Race/"
    r"(\d{2})_Hour%20(\d+)/",
    re.IGNORECASE,
)


def _list_race_csvs(
    season_param: str, evvent_param: str
) -> tuple[str, str, str] | None:
    """Find the final-hour Classification + Analysis CSVs for the race
    weekend's main race. Returns (timestamp, classification_url,
    analysis_url) or None when no race data has been published."""
    try:
        html = _fetch(
            f"{BASE}/?season={season_param}&evvent={evvent_param}"
        )
    except httpx.HTTPError:
        return None
    by_hour: dict[int, tuple[str, str, str]] = {}
    classifications: dict[int, str] = {}
    analyses: dict[int, str] = {}
    for href in re.findall(r'href="(Results/[^"]+\.CSV)"', html):
        decoded = href.replace("%20", " ")
        slash = decoded.rfind("/")
        if slash < 0:
            continue
        fname = decoded[slash + 1 :]
        m = _RACE_HOUR_RE.search(href + "/")
        if m is None:
            continue
        hour = int(m.group(4))
        timestamp = m.group(2)
        by_hour.setdefault(hour, (timestamp, "", ""))
        if re.match(r"^(03|90)_Classification_Race", fname, re.IGNORECASE):
            classifications[hour] = f"{BASE}/{href}"
        elif re.match(r"^23_Analysis_Race", fname, re.IGNORECASE):
            analyses[hour] = f"{BASE}/{href}"
    if not by_hour:
        return None
    last_hour = max(by_hour)
    cl = classifications.get(last_hour)
    if cl is None:
        return None
    an = analyses.get(last_hour, "")
    timestamp = by_hour[last_hour][0]
    return timestamp, cl, an


# ---------------------------------------------------------------------------
# CSV parsers
# ---------------------------------------------------------------------------


def _parse_csv(text: str) -> list[dict[str, str]]:
    """Al Kamel CSVs are semicolon-separated with a UTF-8 BOM. Whitespace
    around field names is inconsistent (some headers have a leading
    space), so we strip header keys."""
    text = text.lstrip("﻿")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]
    out: list[dict[str, str]] = []
    for row in rows[1:]:
        if not any(c.strip() for c in row):
            continue
        record: dict[str, str] = {}
        for i, key in enumerate(header):
            record[key] = row[i].strip() if i < len(row) else ""
        out.append(record)
    return out


def _parse_classification(text: str) -> dict[str, str]:
    """Map car number → official best lap time (e.g. '1:30.127')."""
    out: dict[str, str] = {}
    for r in _parse_csv(text):
        num = r.get("NUMBER") or r.get(" NUMBER")
        time = r.get("TIME") or r.get(" TIME")
        if num and time and time != "":
            out[num.strip()] = time.strip()
    return out


def _parse_classification_full(text: str) -> list[dict[str, str]]:
    """Full-field classification parse for practice. Returns ordered
    rows with position, car number, class, team, time, gap, laps,
    kph."""
    out: list[dict[str, str]] = []
    for r in _parse_csv(text):
        num = (r.get("NUMBER") or r.get(" NUMBER") or "").strip()
        if not num:
            continue
        out.append(
            {
                "position": (r.get("POS") or "").strip(),
                "number": num,
                "class": (r.get("CLASS") or "").strip(),
                "team": (r.get("TEAM") or "").strip(),
                "time": (r.get("TIME") or r.get(" TIME") or "").strip(),
                "gap": (
                    r.get("GAP_FIRST") or r.get(" GAP_FIRST") or ""
                ).strip(),
                "laps": (r.get(" LAPS") or r.get("LAPS") or "").strip(),
                "kph": (r.get("KPH") or r.get(" KPH") or "").strip(),
            }
        )
    return out


def _hms_to_ms(raw: str) -> int | None:
    """Parse `[H:]M:SS.xxx` cumulative time strings to milliseconds."""
    if not raw:
        return None
    parts = raw.split(":")
    try:
        if len(parts) == 3:
            h = int(parts[0])
            m = int(parts[1])
            s = float(parts[2])
        elif len(parts) == 2:
            h = 0
            m = int(parts[0])
            s = float(parts[1])
        else:
            return None
    except ValueError:
        return None
    return int(round(((h * 60 + m) * 60 + s) * 1000))


def _parse_lap_analysis(text: str) -> list[dict[str, str]]:
    """Lightweight parse of the race analysis CSV — one dict per lap
    with the fields we care about (NUMBER, LAP_NUMBER, LAP_TIME,
    ELAPSED, CLASS, TEAM, DRIVER_NAME, KPH, CROSSING_FINISH_LINE_IN_PIT,
    PIT_TIME, TOP_SPEED, S1/S2/S3)."""
    out: list[dict[str, str]] = []
    for r in _parse_csv(text):
        num = (r.get("NUMBER") or r.get(" NUMBER") or "").strip()
        lap = (r.get("LAP_NUMBER") or r.get(" LAP_NUMBER") or "").strip()
        if not num or not lap:
            continue
        out.append(
            {
                "number": num,
                "lap": lap,
                "lap_time": _normalize_lap_time(
                    (r.get("LAP_TIME") or r.get(" LAP_TIME") or "").strip()
                ),
                "elapsed": (r.get("ELAPSED") or r.get(" ELAPSED") or "").strip(),
                "class": (r.get("CLASS") or "").strip(),
                "team": (r.get("TEAM") or "").strip(),
                "driver": (r.get("DRIVER_NAME") or r.get(" DRIVER_NAME") or "").strip(),
                "kph": (r.get("KPH") or r.get(" KPH") or "").strip(),
                "in_pit": (
                    r.get("CROSSING_FINISH_LINE_IN_PIT")
                    or r.get(" CROSSING_FINISH_LINE_IN_PIT")
                    or ""
                ).strip(),
                "pit_time": (r.get("PIT_TIME") or r.get(" PIT_TIME") or "").strip(),
                "top_speed": (
                    r.get("TOP_SPEED") or r.get(" TOP_SPEED") or ""
                ).strip(),
                "s1": (r.get("S1") or r.get(" S1") or "").strip(),
                "s2": (r.get("S2") or r.get(" S2") or "").strip(),
                "s3": (r.get("S3") or r.get(" S3") or "").strip(),
            }
        )
    return out


def fetch_race_lap_data(
    season_param: str, evvent_param: str
) -> list[dict[str, str]]:
    """Convenience wrapper for the API layer: discover the race analysis
    CSV for an event and return parsed lap rows. Empty list when the
    race hasn't been published yet."""
    csvs = _list_race_csvs(season_param, evvent_param)
    if csvs is None:
        return []
    _ts, _cl, analysis_url = csvs
    if not analysis_url:
        return []
    try:
        return _parse_lap_analysis(_fetch(analysis_url))
    except httpx.HTTPError:
        return []


def resolve_event_params(
    year: int, round_num: int
) -> tuple[str, str] | None:
    """Translate (season year, round number) into the (season_param,
    evvent_param) URL slugs Al Kamel expects. None when the season or
    round can't be resolved on the upstream listing page."""
    season_param = _season_param_for_year(year)
    if season_param is None:
        return None
    options = _event_options_for_season(season_param)
    evvent_param = next((ev for r, ev in options if r == round_num), None)
    if evvent_param is None:
        return None
    return season_param, evvent_param


def fetch_qualifying_sectors(
    season_param: str, evvent_param: str
) -> dict[str, tuple[str, str, str]]:
    """For one race weekend, walk every Q + Hyperpole analysis CSV and
    return {car_number: (s1, s2, s3)} for each car's fastest Q lap.
    Hyperpole overrides Q when both ran. Empty dict when no Q/HP CSV
    has been published yet."""
    out_q: dict[str, tuple[str, str, str]] = {}
    out_hp: dict[str, tuple[str, str, str]] = {}
    for kind, _cls, _cl_url, an_url, _ts in _list_session_csvs(
        season_param, evvent_param
    ):
        if kind not in ("Q", "HP") or not an_url:
            continue
        try:
            laps = _parse_lap_analysis(_fetch(an_url))
        except httpx.HTTPError:
            continue
        # Per car: lap with the smallest LAP_TIME wins.
        best_by_car: dict[str, tuple[int, str, str, str]] = {}
        for r in laps:
            lt_ms = _hms_to_ms(r.get("lap_time") or "")
            if lt_ms is None or lt_ms <= 0:
                continue
            s1 = r.get("s1") or ""
            s2 = r.get("s2") or ""
            s3 = r.get("s3") or ""
            if not (s1 and s2 and s3):
                continue
            num = r["number"]
            cur = best_by_car.get(num)
            if cur is None or lt_ms < cur[0]:
                best_by_car[num] = (lt_ms, s1, s2, s3)
        bucket = out_hp if kind == "HP" else out_q
        for num, (_lt, s1, s2, s3) in best_by_car.items():
            bucket[num] = (s1, s2, s3)
    return {**out_q, **out_hp}  # HP wins when both present


def fetch_session_weather(
    season_param: str, evvent_param: str, session_kind: str
) -> dict[str, float | str | None] | None:
    """One-shot weather summary for a session — locates the relevant
    26_Weather CSV, parses, returns the aggregated dict. None when the
    CSV hasn't been published or the fetch fails."""
    url = find_weather_url(season_param, evvent_param, session_kind)
    if url is None:
        return None
    try:
        return parse_weather_summary(_fetch(url))
    except httpx.HTTPError:
        return None


def _normalize_lap_time(raw: str) -> str:
    """Race CSVs format laps like `1'32.625` (single-quote separator);
    timed sessions use `1:32.625`. Normalize to the colon form so the
    rest of the system stays uniform."""
    return raw.replace("'", ":")


def _parse_race_classification(text: str) -> list[dict[str, str]]:
    """Race classifications use a different schema than the timed
    sessions: POSITION/NUMBER/STATUS/LAPS/GAP_FIRST/FL_TIME etc."""
    out: list[dict[str, str]] = []
    for r in _parse_csv(text):
        num = (r.get("NUMBER") or r.get(" NUMBER") or "").strip()
        if not num:
            continue
        out.append(
            {
                "position": (r.get("POSITION") or "").strip(),
                "number": num,
                "class": (r.get("CLASS") or "").strip(),
                "team": (r.get("TEAM") or "").strip(),
                "status": (r.get("STATUS") or "").strip(),
                "laps": (r.get("LAPS") or r.get(" LAPS") or "").strip(),
                "gap": (
                    r.get("GAP_FIRST") or r.get(" GAP_FIRST") or ""
                ).strip(),
                "best_lap": _normalize_lap_time(
                    (r.get("FL_TIME") or r.get(" FL_TIME") or "").strip()
                ),
            }
        )
    return out


def _apply_race_classification(
    row: models.SessionResult,
    data: dict[str, str],
    *,
    pit_stops: int | None,
    top_speed_kph: float | None,
) -> bool:
    """Apply the latest published race-hour snapshot to an existing row.

    Al Kamel publishes a new classification throughout the race. Position and
    gap therefore need the same overwrite semantics as laps and status; only
    updating telemetry fields would leave the dashboard frozen at the first
    classification seen by the collector.
    """
    changed = False
    try:
        position = int(data["position"])
    except (KeyError, ValueError):
        position = None
    if position is not None and row.position != position:
        row.position = position
        changed = True

    gap = data.get("gap") or None
    if row.gap != gap:
        row.gap = gap
        changed = True

    best_lap = data.get("best_lap")
    if best_lap and row.best_lap != best_lap:
        row.best_lap = best_lap
        changed = True

    status = data.get("status") or None
    if row.status != status:
        row.status = status
        changed = True

    laps = data.get("laps")
    if laps:
        try:
            lap_count = int(laps)
        except ValueError:
            pass
        else:
            if row.laps != lap_count:
                row.laps = lap_count
                changed = True

    if pit_stops is not None and row.pit_stops != pit_stops:
        row.pit_stops = pit_stops
        changed = True
    if top_speed_kph is not None and row.top_speed_kph != top_speed_kph:
        row.top_speed_kph = top_speed_kph
        changed = True
    return changed


def _parse_pit_events(text: str) -> list[dict]:
    """One dict per pit visit: {'number', 'lap', 'duration_ms'}.
    Race lap 1 (rolling start) has no PIT_TIME so isn't picked up — each
    row corresponds to a real stop."""
    out: list[dict] = []
    for r in _parse_csv(text):
        num = (r.get("NUMBER") or r.get(" NUMBER") or "").strip()
        if not num:
            continue
        pit = (r.get("PIT_TIME") or r.get(" PIT_TIME") or "").strip()
        if not pit:
            continue
        lap = (r.get("LAP_NUMBER") or r.get(" LAP_NUMBER") or "").strip()
        try:
            lap_num = int(lap)
        except ValueError:
            continue
        out.append(
            {
                "number": num,
                "lap": lap_num,
                "duration_ms": _hms_to_ms(pit),
            }
        )
    return out


def _parse_pit_counts(text: str) -> dict[str, int]:
    """Backwards-compatible counts derived from `_parse_pit_events`."""
    counts: dict[str, int] = {}
    for ev in _parse_pit_events(text):
        counts[ev["number"]] = counts.get(ev["number"], 0) + 1
    return counts


def _normalize_class(raw: str) -> str | None:
    """Map Al Kamel's CLASS column to our canonical class keys."""
    s = raw.strip().upper().replace(".", "").replace(" ", "").replace("-", "")
    if s in {"HYPERCAR", "LMH", "LMDH"}:
        return "HYPERCAR"
    if s in {"GT3", "LMGT3"}:
        return "LMGT3"
    if s in {"LMP1", "LMP1H", "LMP1L"}:
        return "LMP1"
    if s == "LMP2":
        return "LMP2"
    if s in {"LMGTEPRO", "GTEPRO"}:
        return "LMGTE_PRO"
    if s in {"LMGTEAM", "GTEAM"}:
        return "LMGTE_AM"
    return None


def _parse_analysis_drivers(text: str) -> dict[str, list[tuple[str, str]]]:
    """Map car number → ordered list of (lap_time, driver_name) tuples.

    Multiple drivers may appear if the team rotated runners; we keep
    every lap so a later .get() can pick the one matching the official
    best time."""
    out: dict[str, list[tuple[str, str]]] = {}
    for r in _parse_csv(text):
        num = r.get("NUMBER") or r.get(" NUMBER")
        if not num:
            continue
        lap = r.get("LAP_TIME") or r.get(" LAP_TIME")
        driver = r.get("DRIVER_NAME") or r.get(" DRIVER_NAME")
        if not lap or not driver:
            continue
        out.setdefault(num.strip(), []).append((lap.strip(), driver.strip()))
    return out


def _format_driver_name(raw: str) -> str:
    """Al Kamel stores names as 'First LASTNAME' — the surname is upper
    case and separated by a space. Title-case the surname so display
    matches our other sources ('Sébastien BUEMI' → 'Sébastien Buemi')."""
    parts = raw.split()
    if not parts:
        return raw
    fixed = []
    for p in parts:
        if p.isupper() and len(p) > 1:
            # Preserve hyphenated all-caps surnames ("PIER GUIDI" stays;
            # last token still title-cased).
            fixed.append(p.title())
        else:
            fixed.append(p)
    return " ".join(fixed)


# ---------------------------------------------------------------------------
# Driver-per-car resolver
# ---------------------------------------------------------------------------


def _drivers_for_session(
    classification: dict[str, str],
    analysis: dict[str, list[tuple[str, str]]],
) -> dict[str, str]:
    """For each classified car, find the driver who set the official
    best lap. If the analysis CSV is missing, fall back to nothing."""
    out: dict[str, str] = {}
    for car_no, best in classification.items():
        laps = analysis.get(car_no)
        if not laps:
            continue
        # Direct hit on the formatted lap time.
        match = next((d for (t, d) in laps if t == best), None)
        if match is None:
            # Some sessions store the best lap in classification with
            # extra zero padding ('1:30.127' vs '01:30.127'); normalize.
            norm_best = best.lstrip("0")
            match = next(
                (d for (t, d) in laps if t.lstrip("0") == norm_best),
                None,
            )
        if match is None:
            # Last resort: who set the fastest lap of any kind in this
            # session. Works for hyperpole sessions where only one
            # driver runs, even if our time string can't be matched
            # due to formatting glitches.
            best_pair = min(
                ((t, d) for (t, d) in laps if t),
                key=lambda kv: _lap_to_ms(kv[0]) or 10**9,
                default=None,
            )
            match = best_pair[1] if best_pair else None
        if match:
            out[car_no] = _format_driver_name(match)
    return out


def _lap_to_ms(lap: str) -> int | None:
    m = re.match(r"^(\d+):(\d{2})\.(\d+)$", lap)
    if not m:
        return None
    return int(m.group(1)) * 60_000 + int(m.group(2)) * 1_000 + int(m.group(3))


# ---------------------------------------------------------------------------
# Enrichment entry-point
# ---------------------------------------------------------------------------


def enrich_qualifying_drivers(
    db: Session,
    season_id: int,
    year: int,
    *,
    event_id: int | None = None,
) -> int:
    """For every Q SessionResult in the given season, look up the Al
    Kamel timing folder. Creates the Q Session row and per-car
    SessionResult rows when Wikipedia hasn't published the qualifying
    table yet (e.g. the day after a race), and stamps qualifying_lap
    / hyperpole_lap / qualifying_driver / hyperpole_driver onto each
    row. Returns the number of rows touched."""
    season_param = _season_param_for_year(year)
    if season_param is None:
        return 0
    events = _event_options_for_season(season_param)
    if not events:
        return 0
    by_round: dict[int, str] = {r: ev for r, ev in events}

    event_query = db.query(models.Event).filter(
        models.Event.season_id == season_id
    )
    if event_id is not None:
        event_query = event_query.filter(models.Event.id == event_id)
    db_events = event_query.all()
    updated = 0
    for ev in db_events:
        evvent_param = by_round.get(ev.round)
        if evvent_param is None:
            continue

        # Walk every Q + HP CSV per class. We need the listing once
        # to know whether to spin up a Q Session row before any rows
        # land, so collect first.
        csvs = [
            entry
            for entry in _list_session_csvs(season_param, evvent_param)
            if entry[0] in ("Q", "HP")
        ]
        if not csvs:
            continue

        # Reuse season-wide Car list so we can resolve cars that have
        # no SessionResult yet (post-race-only winners case).
        season_cars = (
            db.query(models.Car)
            .filter(models.Car.season_id == season_id)
            .all()
        )
        if not season_cars:
            continue
        car_by_number = {c.number: c for c in season_cars}

        # Ensure the Q Session row exists. Use the earliest Q
        # timestamp from Al Kamel as start_time; HP slots in later
        # but folds into the same Session in our schema.
        q_session = (
            db.query(models.Session)
            .filter(
                models.Session.event_id == ev.id,
                models.Session.type == "Q",
            )
            .first()
        )
        circuit_tz = (
            tz_for_circuit(ev.circuit.name) if ev.circuit else None
        )
        if q_session is None:
            q_timestamps = [
                ts for kind, _cls, _cl, _an, ts in csvs if kind == "Q"
            ]
            stamp = min(q_timestamps) if q_timestamps else csvs[0][4]
            q_session = models.Session(
                event_id=ev.id,
                type="Q",
                start_time=_timestamp_to_utc(stamp, circuit_tz),
            )
            db.add(q_session)
            db.flush()

        results = (
            db.query(models.SessionResult)
            .options(joinedload(models.SessionResult.car))
            .filter(models.SessionResult.session_id == q_session.id)
            .all()
        )
        by_car_number = {r.car.number: r for r in results}

        for kind, _cls, classification_url, analysis_url, _ts in csvs:
            try:
                cl_csv = _fetch(classification_url)
            except httpx.HTTPError:
                continue
            classification = _parse_classification(cl_csv)
            if not classification:
                continue
            analysis: dict[str, list[tuple[str, str]]] = {}
            # Sectors of each car's best lap — same source CSV as the
            # driver attribution, computed inline so we only fetch
            # once. Stored to DB so the API doesn't need to refetch.
            sectors_by_car: dict[str, tuple[str, str, str]] = {}
            if analysis_url:
                try:
                    analysis_text = _fetch(analysis_url)
                except httpx.HTTPError:
                    analysis_text = ""
                if analysis_text:
                    analysis = _parse_analysis_drivers(analysis_text)
                    best_ms_by_car: dict[str, int] = {}
                    for lap in _parse_lap_analysis(analysis_text):
                        lt_ms = _hms_to_ms(lap.get("lap_time") or "")
                        if lt_ms is None or lt_ms <= 0:
                            continue
                        s1 = lap.get("s1") or ""
                        s2 = lap.get("s2") or ""
                        s3 = lap.get("s3") or ""
                        if not (s1 and s2 and s3):
                            continue
                        num = lap["number"]
                        if num not in best_ms_by_car or lt_ms < best_ms_by_car[num]:
                            best_ms_by_car[num] = lt_ms
                            sectors_by_car[num] = (s1, s2, s3)
            drivers = _drivers_for_session(classification, analysis)
            lap_field = "hyperpole_lap" if kind == "HP" else "qualifying_lap"
            drv_field = "hyperpole_driver" if kind == "HP" else "qualifying_driver"

            for car_no, lap_time in classification.items():
                row = by_car_number.get(car_no)
                if row is None:
                    car = car_by_number.get(car_no)
                    if car is None:
                        continue
                    row = models.SessionResult(
                        session_id=q_session.id,
                        car_id=car.id,
                        position=0,  # finalized after the loops below
                    )
                    db.add(row)
                    by_car_number[car_no] = row
                    updated += 1
                changed = False
                normalized = _normalize_lap_time(lap_time)
                if normalized and getattr(row, lap_field) != normalized:
                    setattr(row, lap_field, normalized)
                    changed = True
                preferred = (
                    row.hyperpole_lap or row.qualifying_lap or normalized
                )
                if preferred and row.best_lap != preferred:
                    row.best_lap = preferred
                    changed = True
                drv_name = drivers.get(car_no)
                if drv_name and getattr(row, drv_field) != drv_name:
                    setattr(row, drv_field, drv_name)
                    changed = True
                # HP sectors override Q sectors (same precedence as
                # best_lap above).
                triple = sectors_by_car.get(car_no)
                if triple is not None:
                    s1, s2, s3 = triple
                    if row.s1_time != s1 or row.s2_time != s2 or row.s3_time != s3:
                        row.s1_time = s1
                        row.s2_time = s2
                        row.s3_time = s3
                        changed = True
                if changed:
                    updated += 1

        # Re-rank Q SessionResult overall positions by best_lap ms
        # so the API layer's class_position_for derives sensible
        # per-class ranks. Rows without a parseable best_lap go to
        # the back.
        ranked = sorted(
            by_car_number.values(),
            key=lambda r: (
                _lap_to_ms(r.best_lap or "") or 10**12,
            ),
        )
        for i, r in enumerate(ranked, start=1):
            if r.position != i:
                r.position = i
                updated += 1
    if updated:
        db.commit()
    return updated


def ingest_practice_results(
    db: Session,
    season_id: int,
    year: int,
    *,
    event_id: int | None = None,
    session_types: set[str] | None = None,
) -> int:
    """Replace each Free Practice session's SessionResult rows with the
    full Al Kamel classification (vs. the class-fastest-only set we get
    from Wikipedia). Returns total rows inserted across all sessions."""
    from sqlalchemy import delete  # local import keeps module import cheap

    season_param = _season_param_for_year(year)
    if season_param is None:
        return 0
    events = _event_options_for_season(season_param)
    if not events:
        return 0
    by_round: dict[int, str] = {r: ev for r, ev in events}

    inserted_total = 0
    event_query = (
        db.query(models.Event)
        .options(joinedload(models.Event.circuit))
        .filter(models.Event.season_id == season_id)
    )
    if event_id is not None:
        event_query = event_query.filter(models.Event.id == event_id)
    for ev in event_query.all():
        evvent_param = by_round.get(ev.round)
        if evvent_param is None:
            continue
        sessions_by_kind: dict[str, models.Session] = {
            s.type: s
            for s in db.query(models.Session)
            .filter(
                models.Session.event_id == ev.id,
                models.Session.type.in_(["FP1", "FP2", "FP3"]),
            )
            .all()
        }
        cars = (
            db.query(models.Car)
            .filter(models.Car.season_id == season_id)
            .all()
        )
        if not cars:
            # No entry list for this season — practice rows would have
            # nothing to attach to.
            continue
        cars_by_key = {(c.number, c.race_class_id): c for c in cars}
        cars_by_number: dict[str, models.Car] = {}
        for c in cars:
            cars_by_number.setdefault(c.number, c)

        race_class_ids: dict[str, int] = {
            rc.name: rc.id for rc in db.query(models.RaceClass).all()
        }
        circuit_tz = (
            tz_for_circuit(ev.circuit.name) if ev.circuit else None
        )

        csvs = _list_session_csvs(season_param, evvent_param)
        for kind, _cls, classification_url, analysis_url, timestamp in csvs:
            if kind not in ("FP1", "FP2", "FP3") or (
                session_types is not None and kind not in session_types
            ):
                continue
            session = sessions_by_kind.get(kind)
            if session is None:
                # Older Wikipedia pages didn't have practice tables, so
                # we never created the session. Spin it up now from the
                # Al Kamel folder timestamp.
                session = models.Session(
                    event_id=ev.id,
                    type=kind,
                    start_time=_timestamp_to_utc(timestamp, circuit_tz),
                )
                db.add(session)
                db.flush()
                sessions_by_kind[kind] = session
            try:
                rows = _parse_classification_full(_fetch(classification_url))
            except httpx.HTTPError:
                continue
            if not rows:
                continue
            analysis: dict[str, list[tuple[str, str]]] = {}
            if analysis_url:
                try:
                    analysis = _parse_analysis_drivers(_fetch(analysis_url))
                except httpx.HTTPError:
                    analysis = {}
            classification = {r["number"]: r["time"] for r in rows if r["time"]}
            best_lap_drivers = _drivers_for_session(classification, analysis)

            db.execute(
                delete(models.SessionResult).where(
                    models.SessionResult.session_id == session.id
                )
            )
            for i, r in enumerate(rows):
                cls_key = _normalize_class(r["class"])
                car: models.Car | None = None
                if cls_key and cls_key in race_class_ids:
                    car = cars_by_key.get(
                        (r["number"], race_class_ids[cls_key])
                    )
                if car is None:
                    car = cars_by_number.get(r["number"])
                if car is None:
                    continue
                pos: int
                try:
                    pos = int(r["position"])
                except ValueError:
                    pos = i + 1
                laps_int: int | None
                try:
                    laps_int = int(r["laps"]) if r["laps"] else None
                except ValueError:
                    laps_int = None
                db.add(
                    models.SessionResult(
                        session_id=session.id,
                        car_id=car.id,
                        position=pos,
                        best_lap=r["time"] or None,
                        gap=r["gap"] or None,
                        laps=laps_int,
                        drivers=best_lap_drivers.get(r["number"]) or None,
                    )
                )
                inserted_total += 1
            db.commit()
    return inserted_total


def enrich_seasons(db: Session, years: Iterable[int]) -> dict[int, int]:
    """Run enrich_qualifying_drivers for several years; returns
    {year: rows_updated}. Skips years with no matching season row."""
    out: dict[int, int] = {}
    for y in years:
        season = (
            db.query(models.Season).filter(models.Season.year == y).first()
        )
        if season is None:
            continue
        out[y] = enrich_qualifying_drivers(db, season.id, y)
    return out


def ingest_practice_seasons(
    db: Session, years: Iterable[int]
) -> dict[int, int]:
    """Bulk practice ingest helper — {year: rows_inserted}."""
    out: dict[int, int] = {}
    for y in years:
        season = (
            db.query(models.Season).filter(models.Season.year == y).first()
        )
        if season is None:
            continue
        out[y] = ingest_practice_results(db, season.id, y)
    return out


def enrich_race_results(
    db: Session,
    season_id: int,
    year: int,
    *,
    event_id: int | None = None,
) -> int:
    """Pull each race's latest available race-hour Classification + Analysis
    CSVs from Al Kamel and stamp matching SessionResult rows with FL_TIME
    (best_lap), pit_stops, and lap count if Wikipedia missed it.
    Returns the count of rows touched."""
    season_param = _season_param_for_year(year)
    if season_param is None:
        return 0
    events = _event_options_for_season(season_param)
    if not events:
        return 0
    by_round = {r: ev for r, ev in events}

    updated = 0
    event_query = db.query(models.Event).filter(
        models.Event.season_id == season_id
    )
    if event_id is not None:
        event_query = event_query.filter(models.Event.id == event_id)
    for ev in event_query.all():
        evvent_param = by_round.get(ev.round)
        if evvent_param is None:
            continue
        race_session = (
            db.query(models.Session)
            .filter(
                models.Session.event_id == ev.id,
                models.Session.type == "RACE",
            )
            .first()
        )
        if race_session is None:
            continue
        results = (
            db.query(models.SessionResult)
            .options(joinedload(models.SessionResult.car))
            .filter(models.SessionResult.session_id == race_session.id)
            .all()
        )
        # `results` may be partial when Wikipedia's per-round article
        # is still a stub right after the race — only winners present.
        # Pre-fetch every Car for this season so pit-events and
        # classification-row creation can resolve a car_id without
        # depending on a pre-existing SessionResult row.
        by_car_number = {r.car.number: r for r in results}
        season_cars = (
            db.query(models.Car)
            .filter(models.Car.season_id == season_id)
            .all()
        )
        car_by_number = {c.number: c for c in season_cars}

        race_csvs = _list_race_csvs(season_param, evvent_param)
        if race_csvs is None:
            continue
        _ts, classification_url, analysis_url = race_csvs
        try:
            classification_rows = _parse_race_classification(
                _fetch(classification_url)
            )
        except httpx.HTTPError:
            continue
        if not classification_rows:
            continue

        pit_counts: dict[str, int] = {}
        pit_events: list[dict] = []
        analysis_laps: list[dict[str, str]] = []
        top_speed_by_car: dict[str, float] = {}
        if analysis_url:
            try:
                analysis_text = _fetch(analysis_url)
            except httpx.HTTPError:
                analysis_text = ""
            if analysis_text:
                pit_events = _parse_pit_events(analysis_text)
                for ev_row in pit_events:
                    pit_counts[ev_row["number"]] = (
                        pit_counts.get(ev_row["number"], 0) + 1
                    )
                # Walk every lap row and keep the per-car peak
                # TOP_SPEED reading. Same source as the V-max API
                # response — but stored to DB so the request path
                # doesn't have to refetch a 1-2 MB CSV.
                analysis_laps = _parse_lap_analysis(analysis_text)
                for lap in analysis_laps:
                    raw = lap.get("top_speed") or ""
                    try:
                        v = float(raw)
                    except ValueError:
                        continue
                    if v <= 0:
                        continue
                    num = lap["number"]
                    prev = top_speed_by_car.get(num)
                    if prev is None or v > prev:
                        top_speed_by_car[num] = v

        # Replace pit_stop_events for this session — idempotent on
        # re-ingest. Resolve car_id via the season-wide Car map so we
        # capture stops for every car, not just those that already
        # have a SessionResult row.
        if pit_events:
            db.query(models.PitStopEvent).filter(
                models.PitStopEvent.session_id == race_session.id
            ).delete(synchronize_session=False)
            for ev_row in pit_events:
                car = car_by_number.get(ev_row["number"])
                if car is None:
                    continue
                db.add(
                    models.PitStopEvent(
                        session_id=race_session.id,
                        car_id=car.id,
                        lap_number=ev_row["lap"],
                        duration_ms=ev_row["duration_ms"],
                    )
                )

        for r in classification_rows:
            row = by_car_number.get(r["number"])

            # ---- Create the SessionResult row when Wikipedia hasn't
            # populated the per-round classification table yet. Look
            # up the car by (number, season) so we don't accidentally
            # match a different season's #20 entry.
            # class_position and points_awarded aren't stored on the
            # model — the API layer computes them on read from the
            # overall position + race_class. ----
            if row is None:
                car = car_by_number.get(r["number"])
                if car is None:
                    continue
                try:
                    pos_int = int(r["position"])
                except ValueError:
                    continue
                try:
                    laps_int = int(r["laps"]) if r["laps"] else None
                except ValueError:
                    laps_int = None
                row = models.SessionResult(
                    session_id=race_session.id,
                    car_id=car.id,
                    position=pos_int,
                    laps=laps_int,
                    gap=r["gap"] or None,
                    best_lap=r["best_lap"] or None,
                    status=r["status"] or None,
                    pit_stops=pit_counts.get(r["number"]),
                    top_speed_kph=top_speed_by_car.get(r["number"]),
                )
                db.add(row)
                by_car_number[r["number"]] = row
                updated += 1
                continue

            if _apply_race_classification(
                row,
                r,
                pit_stops=pit_counts.get(r["number"]),
                top_speed_kph=top_speed_by_car.get(r["number"]),
            ):
                updated += 1

        # ---- Pre-compute the lap chart payload for /lap-chart so the
        # endpoint never has to refetch + reparse the analysis CSV at
        # request time. Done after SessionResult rows are settled (the
        # chart pulls driver names from r.drivers). Local import keeps
        # alkamel.py free of an app-level cyclic dep on app.lap_chart
        # (which itself imports alkamel for the parser helpers). ----
        from app.lap_chart import compute_lap_chart

        try:
            chart = compute_lap_chart(db, race_session, laps=analysis_laps)
        except Exception:  # noqa: BLE001 — one bad race shouldn't kill the whole season ingest
            chart = None
        if chart is not None:
            race_session.lap_chart_json = chart.model_dump_json(by_alias=False)

    if updated:
        db.commit()
    else:
        # Lap-chart writes happen even when no SessionResult rows
        # changed — flush them so they survive the function call.
        db.commit()
    return updated


def enrich_race_seasons(
    db: Session, years: Iterable[int]
) -> dict[int, int]:
    """Bulk race-enrichment helper — {year: rows_updated}."""
    out: dict[int, int] = {}
    for y in years:
        season = (
            db.query(models.Season).filter(models.Season.year == y).first()
        )
        if season is None:
            continue
        out[y] = enrich_race_results(db, season.id, y)
    return out


def enrich_session_weather(
    db: Session,
    season_id: int,
    year: int,
    *,
    event_id: int | None = None,
    session_types: set[str] | None = None,
) -> int:
    """Walk every Session for the season, locate its 26_Weather CSV
    and stash the median air/track temps + humidity + wind + a rain
    flag onto the Session row. Returns the number of session rows
    updated. Idempotent — re-runs overwrite stale readings."""
    season_param = _season_param_for_year(year)
    if season_param is None:
        return 0
    events = _event_options_for_season(season_param)
    if not events:
        return 0
    by_round = {r: ev for r, ev in events}

    updated = 0
    event_query = db.query(models.Event).filter(
        models.Event.season_id == season_id
    )
    if event_id is not None:
        event_query = event_query.filter(models.Event.id == event_id)
    for ev in event_query.all():
        evvent_param = by_round.get(ev.round)
        if evvent_param is None:
            continue
        sessions = (
            db.query(models.Session)
            .filter(models.Session.event_id == ev.id)
            .all()
        )
        for s in sessions:
            if session_types is not None and s.type not in session_types:
                continue
            try:
                summary = fetch_session_weather(season_param, evvent_param, s.type)
            except httpx.HTTPError:
                summary = None
            if summary is None:
                continue
            air = summary.get("air_temp_c")
            track = summary.get("track_temp_c")
            hum = summary.get("humidity_pct")
            wind = summary.get("wind_kph")
            rain = bool(summary.get("rain"))
            if (
                s.air_temp_c == air
                and s.track_temp_c == track
                and s.humidity_pct == hum
                and s.wind_kph == wind
                and bool(s.rain) == rain
            ):
                continue
            s.air_temp_c = air
            s.track_temp_c = track
            s.humidity_pct = hum
            s.wind_kph = wind
            s.rain = rain
            updated += 1
    if updated:
        db.commit()
    return updated


def enrich_weather_seasons(
    db: Session, years: Iterable[int]
) -> dict[int, int]:
    """Bulk weather-enrichment helper — {year: rows_updated}."""
    out: dict[int, int] = {}
    for y in years:
        season = (
            db.query(models.Season).filter(models.Season.year == y).first()
        )
        if season is None:
            continue
        out[y] = enrich_session_weather(db, season.id, y)
    return out

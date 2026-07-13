"""Scrape session schedules from fiawec.com race pages.

Each race page (e.g. https://www.fiawec.com/en/race/6-hours-of-imola-2026)
includes the weekend's session list right in the static HTML, formatted
roughly as:

    May 7 th
      Free Practice 1 11:00 AM Live
      Free Practice 2 03:40 PM Live
    May 8 th
      Free Practice 3 10:10 AM Live
      Qualifying - LMGT3 02:30 PM Live
      Hyperpole - LMGT3 02:55 PM Live
      ...

We parse those date / session / time triples and convert to UTC via the
circuit's IANA timezone.

Useful as a complement to the Wikipedia ingester: fiawec.com publishes
the schedule as soon as the round is announced (Wikipedia tends to lag
weeks), and the times are authoritative.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup

from app.circuit_tz import tz_for_circuit

USER_AGENT = "wec-dashboard/0.1 (https://github.com/maysun0907/wec-dashboard)"

# Slug pattern for race pages. We don't know sponsor prefixes (e.g.
# 'totalenergies-6-hours-of-spa-francorchamps') ahead of time, so we
# discover slugs by walking fiawec.com's home page — it lists every
# round of the current season.
HOME_URL = "https://www.fiawec.com/en"
RACE_URL_RE = re.compile(r"/en/race/([a-z0-9][a-z0-9-]*?)-(\d{4})(?:-\d+)?$")


def _fetch(url: str) -> str:
    r = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
        follow_redirects=True,
        timeout=15.0,
    )
    r.raise_for_status()
    return r.text


def discover_race_slugs(year: int) -> dict[str, str]:
    """Walk fiawec.com's home page and return a {label: race_slug} map.
    Race slug is the path body of /en/race/{slug}-{year}, including any
    trailing -N disambiguator (Le Mans 2025 has -1)."""
    try:
        html = _fetch(HOME_URL)
    except httpx.HTTPError:
        return {}
    soup = BeautifulSoup(html, "lxml")
    slugs: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = RACE_URL_RE.search(href)
        if not m:
            continue
        slug_body, slug_year = m.group(1), int(m.group(2))
        if slug_year != year:
            continue
        # Reconstruct the full slug (with optional -N tail).
        full = href.rsplit("/", 1)[-1]
        label = (a.get("title") or a.get_text(" ", strip=True) or full).strip()
        slugs[label.lower()] = full
    return slugs


def slug_for_event(event_name: str, year: int, slugs: dict[str, str]) -> str | None:
    """Pick the race slug that best matches `event_name`. Score each
    candidate by overlap of meaningful tokens, drop prologue / test
    pages outright, and break ties on the more specific (longer) slug."""
    tokens = re.findall(r"[a-z0-9]+", event_name.lower())
    tokens = [
        t
        for t in tokens
        if t not in {"the", "of", "hours", "hour", "km", "le", "mans"}
    ]
    if not tokens:
        return None
    discriminating = {t for t in tokens if len(t) >= 4 or t.isdigit()}
    if not discriminating:
        return None
    best: tuple[int, int, str] | None = None
    for slug in slugs.values():
        if "prologue" in slug or "test" in slug:
            continue
        body = slug.removesuffix(f"-{year}")
        # Strip optional numeric tail (e.g. "...-2025-1" → "...-2025"
        # already handled; this catches "-1" suffixes).
        body = re.sub(r"-\d+$", "", body)
        body_tokens = set(body.split("-"))
        score = len(discriminating & body_tokens)
        if score == 0:
            continue
        # Tiebreaker: prefer longer (more-specific) slug.
        cand = (score, len(slug), slug)
        if best is None or cand > best:
            best = cand
    return best[2] if best else None


_MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5,
    "June": 6, "July": 7, "August": 8, "September": 9, "October": 10,
    "November": 11, "December": 12,
}

_DATE_HEADER_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*(?:st|nd|rd|th))?\b"
)
_SESSION_LINE_RE = re.compile(
    r"\b(Free Practice [123]|Final Practice|Qualifying\s*(?:[-–]\s*\w+)?|Hyperpole\s*(?:[-–]\s*\w+)?|Race)\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b",
    re.IGNORECASE,
)


def is_session_time_within_event_window(
    event_start: date,
    event_end: date,
    session_start: datetime,
) -> bool:
    """Return whether a session belongs to its event's generous weekend window.

    FIA pages occasionally change structure and have previously caused a
    session timestamp from one round to be assigned to another. Practice can
    begin before the official event range, and a race can end after midnight,
    so this deliberately allows four days before and one day after it.
    """
    return event_start - timedelta(days=4) <= session_start.date() <= (
        event_end + timedelta(days=1)
    )


def _session_to_type(name: str) -> str | None:
    n = name.lower().strip()
    if n.startswith("free practice 1") or n == "practice 1":
        return "FP1"
    if n.startswith("free practice 2") or n == "practice 2":
        return "FP2"
    if n.startswith("free practice 3") or n.startswith("final practice"):
        return "FP3"
    if n.startswith("qualifying") or n.startswith("hyperpole"):
        return "Q"
    if n.startswith("race"):
        return "RACE"
    return None


def _schema_schedule(soup: BeautifulSoup, year: int) -> list[tuple[str, datetime]]:
    """Read FIA's JSON-LD ``SportsEvent`` entries when they are available.

    The rendered text contains the entire season calendar as well as the race
    timetable. JSON-LD has the session's ISO timestamp (including its UTC
    offset), so it is both less ambiguous and more resilient to layout changes.
    """
    by_type: dict[str, datetime] = {}
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text())
        except (json.JSONDecodeError, TypeError):
            continue

        nodes: list[object] = [payload]
        while nodes:
            node = nodes.pop()
            if isinstance(node, list):
                nodes.extend(node)
                continue
            if not isinstance(node, dict):
                continue
            nodes.extend(node.values())

            name = node.get("name")
            start_date = node.get("startDate")
            if not isinstance(name, str) or not isinstance(start_date, str):
                continue
            kind = _session_to_type(name)
            if kind is None:
                continue
            try:
                parsed = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except ValueError:
                continue
            if parsed.year != year:
                continue
            if parsed.tzinfo is None:
                # JSON-LD is expected to include an offset. Leave a malformed
                # entry to the text fallback rather than guessing its timezone.
                continue
            utc = parsed.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            if kind not in by_type or utc < by_type[kind]:
                by_type[kind] = utc
    return sorted(by_type.items(), key=lambda kv: kv[1])


def parse_race_page(
    html: str, year: int, circuit_tz: str
) -> list[tuple[str, datetime]]:
    """Walk the page text for the date / session / time block — looks
    like 'May 7 th  Free Practice 1 11:00 AM' lines — and convert each
    entry to UTC via the supplied IANA circuit timezone.

    Multiple Q sub-sessions (Hyperpole splits) collapse to a single Q
    with the earliest start, matching our 5-bucket schema."""
    soup = BeautifulSoup(html, "lxml")
    schema_schedule = _schema_schedule(soup, year)
    if schema_schedule:
        return schema_schedule

    text = soup.get_text(" ", strip=True)
    # The race timetable precedes the first "Track info" heading. Do not
    # start at "countdown to": FIA's season-calendar countdown is rendered
    # after the timetable, which used to make this parser skip every session.
    end_idx = text.lower().find("track info")
    block = text[:end_idx] if end_idx >= 0 else text

    # Walk the block, alternating between date headers and session lines.
    tz = ZoneInfo(circuit_tz) if circuit_tz else ZoneInfo("UTC")
    current_date: tuple[int, int] | None = None  # (month, day)
    by_type: dict[str, datetime] = {}
    cursor = 0
    while cursor < len(block):
        next_date = _DATE_HEADER_RE.search(block, cursor)
        next_sess = _SESSION_LINE_RE.search(block, cursor)
        if next_sess is None and next_date is None:
            break
        if next_date is not None and (
            next_sess is None or next_date.start() < next_sess.start()
        ):
            month_name, day = next_date.group(1), int(next_date.group(2))
            current_date = (_MONTHS[month_name], day)
            cursor = next_date.end()
            continue
        if next_sess is None:
            break
        if current_date is None:
            cursor = next_sess.end()
            continue
        name = next_sess.group(1)
        hh = int(next_sess.group(2))
        mm = int(next_sess.group(3))
        ap = next_sess.group(4).upper()
        if ap == "PM" and hh != 12:
            hh += 12
        if ap == "AM" and hh == 12:
            hh = 0
        kind = _session_to_type(name)
        cursor = next_sess.end()
        if kind is None:
            continue
        m, d = current_date
        try:
            local = datetime(year, m, d, hh, mm, tzinfo=tz)
        except ValueError:
            continue
        utc = local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        if kind not in by_type or utc < by_type[kind]:
            by_type[kind] = utc
    return sorted(by_type.items(), key=lambda kv: kv[1])


def fetch_schedule_for_event(
    event_name: str,
    year: int,
    circuit_name: str,
    slugs: dict[str, str] | None = None,
) -> list[tuple[str, datetime]]:
    """Discover slugs (if not provided), pick the matching race page,
    fetch it, and parse the schedule. `circuit_name` selects the IANA
    timezone for converting the page's circuit-local times to UTC."""
    if slugs is None:
        slugs = discover_race_slugs(year)
    slug = slug_for_event(event_name, year, slugs)
    if slug is None:
        return []
    try:
        html = _fetch(f"https://www.fiawec.com/en/race/{slug}")
    except httpx.HTTPError:
        return []
    tz = tz_for_circuit(circuit_name)
    return parse_race_page(html, year, tz)

"""Conservative, weekly refresh of official current-season driver profiles.

Profile failures never invalidate racing results. Resolve a complete name
within the season roster, validate the returned page's identity and reject
implausible dates before applying fields. HTTP requests are sequential.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
import structlog
from bs4 import BeautifulSoup

from app import models
from app.ingest.fiawec_standings import _normalize_name

BASE = "https://www.fiawec.com"
COUNTRIES = dict(pair.split(":") for pair in (
    "AO:AGO AR:ARG AU:AUS AT:AUT BE:BEL BR:BRA CA:CAN CH:CHE CN:CHN CO:COL CZ:CZE "
    "DE:DEU DK:DNK ES:ESP EE:EST FI:FIN FR:FRA GB:GBR GR:GRC HK:HKG HU:HUN "
    "ID:IDN IE:IRL IN:IND IT:ITA JP:JPN KR:KOR LV:LVA MA:MAR MC:MCO MX:MEX "
    "MY:MYS NL:NLD NO:NOR NZ:NZL PL:POL PT:PRT RO:ROU RU:RUS SA:SAU SG:SGP "
    "SK:SVK SI:SVN SE:SWE TH:THA TR:TUR TW:TWN UA:UKR US:USA UY:URY VE:VEN ZA:ZAF"
).split())
ALIASES = {"philip hanson": "phil hanson", "luis felipe derani": "pipo derani",
           "daniel harper": "dan harper", "thomas fleming": "tom fleming"}
# Official Quinn profile currently publishes a 2024 DOB (age 1).
# https://en.wikipedia.org/wiki/Alex_Quinn (birth-date microformat).
DOB_CORRECTIONS = {
    "alex quinn": date(2000, 12, 29),
    # Verified Wikipedia biography birth-date microformats where FIA omits
    # the date or publishes a clearly invalid infant age.
    "theo pourchaire": date(2003, 8, 20),
    "kobe pauwels": date(2004, 10, 23),
    "parker thompson": date(1998, 3, 2),
    "jack hawksworth": date(1991, 2, 28),
    # https://www.autosport.com/driver/johannes-zelger/958791/
    "johannes zelger": date(1979, 10, 15),
}
EXTRA_PROFILES = {"alex quinn": "11463", "alex lynn": "8316"}
PORTRAIT_ARTICLES = {"alex quinn": "Alex_Quinn"}


def identity(name: str) -> tuple[str, ...]:
    normalized = _normalize_name(name)
    return tuple(sorted(ALIASES.get(normalized, normalized).split()))


def _fetch(url: str) -> str:
    # Profiles have their own weekly checkpoint. Registering these documents
    # in the timing manifest would recheck 112 pages on every cold refresh.
    response = httpx.get(url, headers={"User-Agent": "wec-dashboard/0.1", "Accept-Language": "en"}, timeout=20)
    response.raise_for_status()
    return response.text


def profile_links(html: str, year: int) -> dict[tuple[str, ...], str]:
    out = {}
    for link in BeautifulSoup(html, "lxml").select("a[href]"):
        href = link["href"]
        if re.fullmatch(rf"/en/driver/{year}/\d+", href):
            key = identity(link.get_text(" ", strip=True))
            # Conflicting links cannot safely identify the person.
            if key in out and out[key] != BASE + href:
                raise ValueError(f"Conflicting profile links: {key}")
            out[key] = BASE + href
    return out


def parse_profile(html: str, expected_name: str, today: date) -> dict:
    soup = BeautifulSoup(html, "lxml")
    heading = soup.find("h1")
    if heading is None or identity(heading.get_text(" ", strip=True)) != identity(expected_name):
        raise ValueError("Official profile identity differs from roster")
    result = {}
    for label in soup.find_all("span"):
        text = label.get_text(" ", strip=True)
        if text == "Nationality":
            flag = label.parent.select_one('[class*="flag:"]')
            if flag:
                codes = [c.removeprefix("flag:") for c in flag.get("class", []) if c.startswith("flag:")]
                if len(codes) == 1 and codes[0] in COUNTRIES:
                    result["nationality"] = COUNTRIES[codes[0]]
        elif text == "Age":
            match = re.search(r"\b(\d{4})/(\d{2})/(\d{2})\b", label.parent.get_text(" ", strip=True))
            if match:
                try:
                    dob = date(*map(int, match.groups()))
                except ValueError:
                    continue
                if 16 * 365 <= (today - dob).days <= 85 * 366:
                    result["dob"] = dob
    correction = DOB_CORRECTIONS.get(_normalize_name(expected_name))
    if correction and "dob" not in result:
        result["dob"] = correction
    # Select the Person image, not sponsor logos or the driver's race car.
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.get_text())
        except (ValueError, TypeError):
            continue
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data if isinstance(data, list) else []
        for node in nodes:
            if not isinstance(node, dict) or node.get("@type") != "Person" or identity(node.get("name", "")) != identity(expected_name):
                continue
            image = node.get("image")
            if isinstance(image, str):
                url = urlsplit(image)
                if url.scheme == "https" and url.netloc == "www.fiawec.com" and url.path.startswith("/uploads/"):
                    result["photo_url"] = image
    return result


def enrich_driver_profiles(db, year: int, *, force: bool = False) -> dict[str, int]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    scope = f"profiles:{year}"
    drivers = (db.query(models.Driver).join(models.CarDriver).join(models.Season)
               .filter(models.Season.year == year).distinct().all())
    roster = sorted(driver.id for driver in drivers)
    previous = db.get(models.IngestCheckpoint, scope)
    if (not force and previous and previous.manifest.get("roster") == roster
            and timedelta(0) <= now - previous.completed_at < timedelta(days=7)):
        return {"profiles_checked": 0, "profiles_updated": 0}
    links = profile_links(_fetch(f"{BASE}/en/season/{year}"), year)
    for name, source_id in EXTRA_PROFILES.items():
        if year == 2026:
            links.setdefault(identity(name), f"{BASE}/en/driver/{year}/{source_id}")
    checked = updated = failed = 0
    log = structlog.get_logger(__name__)
    for driver in drivers:
        url = links.get(identity(driver.name))
        if url is None:
            failed += 1
            log.warning("driver_profile_unresolved", driver=driver.name)
            continue
        try:
            data = parse_profile(_fetch(url), driver.name, now.date())
        except (httpx.HTTPError, ValueError) as exc:
            failed += 1
            log.warning("driver_profile_unavailable", driver=driver.name, error=str(exc))
            continue
        checked += 1
        article = PORTRAIT_ARTICLES.get(_normalize_name(driver.name))
        if not driver.photo_url and not data.get("photo_url") and article:
            from app.ingest.wikipedia import fetch_driver_photo
            portrait = fetch_driver_photo(article)
            if portrait:
                data["photo_url"] = portrait
        changed = False
        for field, value in data.items():
            # Keep good existing portraits; use official images to fill gaps.
            if field == "photo_url" and driver.photo_url:
                continue
            if getattr(driver, field) != value:
                setattr(driver, field, value)
                changed = True
        updated += int(changed)
        if not data.get("dob") or not data.get("nationality"):
            failed += 1
            log.warning("driver_profile_incomplete", driver=driver.name, fields=list(data))
    db.flush()
    # Retry failures on the next scheduled pass, not a week later.
    if not failed:
        db.merge(models.IngestCheckpoint(scope=scope, completed_at=now,
                                        manifest={"checked": checked, "updated": updated, "roster": roster}))
    return {"profiles_checked": checked, "profiles_updated": updated}

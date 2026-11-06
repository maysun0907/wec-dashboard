"""Fill event-only biography gaps from the race entry list's linked biographies."""
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import httpx
import structlog
from bs4 import BeautifulSoup

from app import models
from app.ingest.fiawec_profiles import identity
from app.ingest.wikipedia import parse_driver_links, COUNTRY_CODES, USER_AGENT
from app.ingest.snapshot import documents


def _fetch(url):
    # Reuse the race article already fetched by this refresh. Biographies
    # have a weekly checkpoint and must not enter the timing dependency list.
    cache = documents.get()
    if cache is not None and url in cache:
        return cache[url]
    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=20, follow_redirects=True)
    response.raise_for_status()
    if cache is not None:
        cache[url] = response.text
    return response.text


def _retry_at(exc, now):
    delay = timedelta(hours=6)
    if isinstance(exc, httpx.HTTPStatusError):
        value = exc.response.headers.get("Retry-After", "")
        try:
            requested = timedelta(seconds=max(0, int(value)))
        except ValueError:
            try:
                requested = parsedate_to_datetime(value).astimezone(timezone.utc).replace(tzinfo=None) - now
            except (ValueError, TypeError, OverflowError):
                requested = delay
        delay = max(delay, requested)
    return now + delay

COUNTRIES = {**COUNTRY_CODES, "United Kingdom": "GBR", "England": "GBR", "Scotland": "GBR",
             "Northern Ireland": "GBR", "United States of America": "USA", "Netherlands": "NLD",
             "Switzerland": "CHE", "Denmark": "DNK", "Sweden": "SWE", "Finland": "FIN",
             "Austria": "AUT", "Germany": "DEU", "Poland": "POL", "Mexico": "MEX",
             "Malaysia": "MYS", "Canada": "CAN", "South Africa": "ZAF", "Hong Kong": "HKG",
             "Australia": "AUS", "New Zealand": "NZL", "Portugal": "PRT", "Russia": "RUS"}


def parse_biography(html, expected_name, today):
    soup = BeautifulSoup(html, "lxml")
    heading = soup.find("h1")
    if not heading or identity(heading.get_text(" ", strip=True).split(" (")[0]) != identity(expected_name):
        raise ValueError("Biography identity mismatch")
    box = soup.select_one("table.infobox")
    if box is None:
        return {}
    data = {}
    birthday = box.select_one(".bday")
    if birthday:
        try:
            dob = date.fromisoformat(birthday.get_text(strip=True))
            if 16 * 365 <= (today - dob).days <= 85 * 366:
                data["dob"] = dob
        except ValueError:
            pass
    for row in box.select("tr"):
        label = row.find("th")
        if label and label.get_text(" ", strip=True) == "Nationality":
            codes = {COUNTRIES[img.get("alt")] for img in row.select("td img") if img.get("alt") in COUNTRIES}
            if len(codes) == 1:
                data["nationality"] = codes.pop()
    image = box.select_one("td.infobox-image img")
    if image:
        url = "https:" + image["src"] if image.get("src", "").startswith("//") else image.get("src", "")
        parts = urlsplit(url)
        if parts.scheme == "https" and parts.netloc in {"upload.wikimedia.org", "thumb.wikimedia.org"}:
            data["photo_url"] = url
    return data


def enrich_guest_profiles(db, year, *, now=None, force=False):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo:
        now = now.astimezone(timezone.utc)
    now = now.replace(tzinfo=None)
    scope = f"guest-profiles:{year}"
    drivers = (db.query(models.Driver).join(models.CarDriver).join(models.Car)
               .join(models.Season, models.Car.season_id == models.Season.id)
               .filter(models.Season.year == year, models.Car.is_guest.is_(True)).distinct().all())
    roster = sorted(d.id for d in drivers)
    previous = db.get(models.IngestCheckpoint, scope)
    data = dict(previous.manifest) if previous else {}
    if not force and data.get("retry_at"):
        try:
            retry_at = datetime.fromisoformat(data["retry_at"])
            if retry_at.tzinfo:
                retry_at = retry_at.astimezone(timezone.utc).replace(tzinfo=None)
        except (TypeError, ValueError):
            retry_at = now
        if retry_at > now:
            structlog.get_logger(__name__).info("guest_profiles_retry_deferred", retry_at=data["retry_at"])
            return 0
    if not drivers or (not force and previous and data.get("outcome", "ok") == "ok"
                       and previous.manifest.get("roster") == roster
                       and timedelta(0) <= now - previous.completed_at < timedelta(days=7)):
        return 0
    def failed(exc, updated=0):
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        retry_at = _retry_at(exc, now)
        data.update(roster=roster, outcome="failed", attempted_at=now.isoformat(),
                    retry_at=retry_at.isoformat(), http_status=status, updated=updated)
        db.merge(models.IngestCheckpoint(scope=scope, completed_at=previous.completed_at if previous else now,
                                        manifest=data))
        db.flush()
        structlog.get_logger(__name__).warning("guest_profiles_refresh_failed", error=str(exc),
                                               http_status=status, retry_at=retry_at.isoformat(), updated=updated)
        return updated
    try:
        html = _fetch(f"https://en.wikipedia.org/wiki/{year}_24_Hours_of_Le_Mans")
        soup = BeautifulSoup(html, "lxml")
        heading = soup.find("h1")
        if not heading or heading.get_text(" ", strip=True) != f"{year} 24 Hours of Le Mans":
            raise ValueError("Guest entry article identity mismatch")
    except (httpx.HTTPError, ValueError) as exc:
        return failed(exc)
    links = {}
    for table in soup.find_all("table"):
        for name, title in parse_driver_links(table).items():
            links.setdefault(identity(name), title)
    if not links:
        return failed(ValueError("Guest entry article has no biography links"))
    updated = 0
    for driver in drivers:
        if driver.nationality and driver.dob and driver.photo_url:
            continue
        title = links.get(identity(driver.name))
        if title is None:
            continue
        try:
            profile = parse_biography(_fetch("https://en.wikipedia.org/wiki/" + title), driver.name, now.date())
        except httpx.HTTPError as exc:
            # A blocked host must not receive one request per remaining driver.
            return failed(exc, updated)
        except ValueError:
            continue
        for key, value in profile.items():
            if not getattr(driver, key):
                setattr(driver, key, value)
                updated += 1
    db.merge(models.IngestCheckpoint(scope=scope, completed_at=now,
                                    manifest={"roster": roster, "outcome": "ok", "succeeded_at": now.isoformat(),
                                              "attempted_at": now.isoformat(), "updated": updated}))
    db.flush()
    structlog.get_logger(__name__).info("guest_profiles_refresh_completed", drivers=len(drivers), updated=updated)
    return updated

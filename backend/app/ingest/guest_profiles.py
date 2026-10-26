"""Fill event-only biography gaps from the race entry list's linked biographies."""
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

from app import models
from app.ingest.fiawec_profiles import identity, _fetch
from app.ingest.wikipedia import parse_driver_links, COUNTRY_CODES

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


def enrich_guest_profiles(db, year):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    scope = f"guest-profiles:{year}"
    drivers = (db.query(models.Driver).join(models.CarDriver).join(models.Car)
               .join(models.Season, models.Car.season_id == models.Season.id)
               .filter(models.Season.year == year, models.Car.is_guest.is_(True)).distinct().all())
    roster = sorted(d.id for d in drivers)
    previous = db.get(models.IngestCheckpoint, scope)
    if not drivers or (previous and previous.manifest.get("roster") == roster
                       and timedelta(0) <= now - previous.completed_at < timedelta(days=7)):
        return 0
    html = _fetch(f"https://en.wikipedia.org/wiki/{year}_24_Hours_of_Le_Mans")
    links = {}
    for table in BeautifulSoup(html, "lxml").find_all("table"):
        for name, title in parse_driver_links(table).items():
            links.setdefault(identity(name), title)
    updated = 0
    for driver in drivers:
        if driver.nationality and driver.dob and driver.photo_url:
            continue
        title = links.get(identity(driver.name))
        if title is None:
            continue
        try:
            data = parse_biography(_fetch("https://en.wikipedia.org/wiki/" + title), driver.name, now.date())
        except (httpx.HTTPError, ValueError):
            continue
        for key, value in data.items():
            if not getattr(driver, key):
                setattr(driver, key, value)
                updated += 1
    db.merge(models.IngestCheckpoint(scope=scope, completed_at=now, manifest={"roster": roster}))
    db.flush()
    return updated

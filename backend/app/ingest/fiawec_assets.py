"""Mirror officially-published FIA WEC asset URLs into our DB.

`fiawec.com` publishes transparent-background PNGs for every entered
manufacturer logo, every car (side-profile render in the actual race
livery), and every circuit (track layout). These are FIA-blessed,
visually consistent across the grid, and refreshed when liveries
change mid-season — much better than the Wikidata thumbnails we'd
otherwise scrape.

This module pulls those URLs and stamps them onto:
- `Manufacturer.logo_url`
- `CarModel.image_url`
- `Circuit.layout_image`

Run automatically as the last step of the cron / wikipedia ingest
pipeline; safe to re-run (only writes when the URL changed).
"""
from __future__ import annotations

import re

import httpx
from sqlalchemy.orm import Session

from app import models

USER_AGENT = "wec-dashboard/0.1 (open-source dashboard for FIA WEC fans)"
BASE = "https://www.fiawec.com"

# FIA's short slug on each manufacturer logo PNG → our DB
# `Manufacturer.name`. Corvette is a Chevrolet sub-brand in our
# schema, so the badge maps to "Chevrolet".
MFR_NAME_BY_FIA_SLUG: dict[str, str] = {
    "alpine": "Alpine",
    "aston": "Aston Martin",
    "bmw": "BMW",
    "cadillac": "Cadillac",
    "corvette": "Chevrolet",
    "ferrari": "Ferrari",
    "ford": "Ford",
    "genesis": "Genesis",
    "lexus": "Lexus",
    "mclaren": "McLaren",
    "mercedes": "Mercedes-AMG",
    "peugeot": "Peugeot",
    "porsche": "Porsche",
    "toyota": "Toyota",
}

# FIA's per-car model slug (in the file name) → our DB
# `CarModel.slug`. The FIA drops "evo" / "hybrid" / "p" suffixes;
# Spa-specific liveries (one-off) collapse onto the base model.
CAR_MODEL_SLUG_BY_FIA: dict[str, str] = {
    # Hypercar
    "alpine-a424": "alpine-a424",
    "aston-martin-valkyrie": "aston-martin-valkyrie",
    "bmwm-hybrid-v8": "bmw-m-hybrid-v8",
    "cadillac": "cadillac-v-series-r",
    "ferrari-499": "ferrari-499p",
    "genesis": "genesis-gmr-001",
    "peugeot-9x8": "peugeot-9x8",
    "toyota-gr010": "toyota-tr010-hybrid",
    # LMGT3
    "aston-martin-gt3": "aston-martin-vantage-amr-gt3-evo",
    "bmw-m4-gt3": "bmw-m4-gt3-evo",
    "bmw-m4-gt3-spa": "bmw-m4-gt3-evo",
    "corvette-z06-gt3-r": "chevrolet-corvette-z06-gt3-r",
    "ferrari-296-gt3": "ferrari-296-gt3-evo",
    "ford-mustang": "ford-mustang-gt3-evo",
    "lexus-rc-f-lmgt3": "lexus-rc-f-gt3",
    "mclaren-720s": "mclaren-720s-gt3-evo-2",
    "mercedes": "mercedes-amg-gt3-evo",
    "mercedes-spa": "mercedes-amg-gt3-evo",
    "porsche-911-gt3-r": "porsche-911-gt3-r-992-2",
}

# Distinguishing substring per country to look up an FIA race page
# slug. Slugs change year-on-year because of title sponsors
# (totalenergies-, rolex-, bapco-energies-), so we resolve them
# dynamically from the homepage rather than hard-coding.
RACE_SLUG_HINT_BY_COUNTRY: dict[str, str] = {
    "QAT": "qatar",
    "ITA": "imola",
    "BEL": "spa-francorchamps",
    "FRA": "24-hours-of-le-mans",
    "BRA": "sao-paulo",
    "USA": "lone-star",
    "JPN": "fuji",
    "BHR": "bahrain",
}

# Manufacturer-logo URL pattern: `/uploads/{slug}[-{hash6}]-{hashlong}.png`.
_LOGO_RE = re.compile(r"/uploads/([a-z]+(?:-[a-z]+)*?)-[a-f0-9-]{16,}\.png$")
# Car-render URL pattern: `/uploads/{year}-wec-{number}-{model}-droit[e]-{hash}.png`.
# Numbers run 1-3 digits — Toyota's #7 / #8 entries match the lower
# bound, Aston's #007 / #009 the upper.
_CAR_RE = re.compile(
    r"/uploads/(\d{4})-wec-(\d{1,3})-([a-z0-9-]+?)-droite?-[a-f0-9]+\.png$"
)
# Track-map URL pattern: `/uploads/{year}-tracks-rvb-{slug}-{hash}.png`.
_TRACK_RE = re.compile(
    r"/uploads/\d{4}-tracks-rvb-[a-z]+-[a-f0-9-]+\.png"
)
# Race-poster URL pattern (FIA's "WEC Round Logo" format):
# `/uploads/wec-rl-{event}{yy}-classic-bluexnavy-rgb-{hash}.png`.
_POSTER_RE = re.compile(
    r"/uploads/wec-rl-[a-z0-9]+\d{2}-classic-[a-z]+-rgb-[a-f0-9-]+\.png"
)


def _fetch(url: str) -> str:
    # follow_redirects=True is required: fiawec.com 301-redirects
    # `/en` to `/en/`; without follow we'd get an empty body and the
    # race-slug resolver would silently return zero matches.
    r = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
        timeout=20,
        follow_redirects=True,
    )
    r.raise_for_status()
    return r.text


def _scrape_grid(year: int) -> tuple[dict[str, str], dict[str, str]]:
    """Returns ``(mfr_logos_by_fia_slug, car_renders_by_fia_model_slug)``.
    Multiple cars of the same model resolve to the first PNG seen on
    the page (each model only has one render in the dashboard)."""
    try:
        html = _fetch(f"{BASE}/en/page/grid")
    except httpx.HTTPError:
        return {}, {}
    candidates = list(
        dict.fromkeys(
            re.findall(r'<img[^>]+src="(/uploads/[^"]+)"', html)
        )
    )
    mfr_logos: dict[str, str] = {}
    car_renders: dict[str, str] = {}
    skip_logo_slugs = {"wec-logo", "manufacturers-logos-couleur-rvb-footer"}
    for u in candidates:
        full = BASE + u
        m = _CAR_RE.search(u)
        if m and m.group(1) == str(year):
            car_renders.setdefault(m.group(3), full)
            continue
        m = _LOGO_RE.search(u)
        if m and m.group(1) not in skip_logo_slugs:
            mfr_logos.setdefault(m.group(1), full)
    return mfr_logos, car_renders


def _resolve_race_slugs(year: int) -> dict[str, str]:
    """Walk the FIA homepage and return ``{country: race_page_slug}``
    for every round in the given season. The home page lists each
    race link as ``/en/race/<slug>-<year>``."""
    # Trailing slash matters — `/en` 301-redirects to `/en/` and
    # using the canonical form skips the redirect hop entirely.
    try:
        html = _fetch(f"{BASE}/en/")
    except httpx.HTTPError:
        return {}
    out: dict[str, str] = {}
    # Find every /en/race/<slug>-<year> link on the page first, then
    # match per-country. Skip prologue listings — those are pre-season
    # test days, not the actual round.
    candidates = [
        m
        for m in re.findall(rf'/en/race/([a-z0-9-]+-{year})\b', html)
        if "prologue" not in m
    ]
    for country, hint in RACE_SLUG_HINT_BY_COUNTRY.items():
        match = next((c for c in candidates if hint in c), None)
        if match is not None:
            out[country] = match
    return out


def _scrape_race_assets(race_slug: str) -> tuple[str | None, str | None]:
    """Return ``(track_map_url, poster_url)`` from a per-race page.
    Either may be None when FIA hasn't uploaded that asset yet for
    the round (e.g. a future season's pages)."""
    try:
        html = _fetch(f"{BASE}/en/race/{race_slug}")
    except httpx.HTTPError:
        return None, None
    track = _TRACK_RE.search(html)
    poster = _POSTER_RE.search(html)
    return (
        BASE + track.group() if track else None,
        BASE + poster.group() if poster else None,
    )


def ingest_fiawec_assets(
    db: Session, year: int = 2026, *, verbose: bool = False
) -> dict[str, int]:
    """Refresh manufacturer / car-render / circuit URLs from the
    fiawec.com grid + race pages. Idempotent — only writes when the
    URL has actually changed."""
    mfr_logos, car_renders = _scrape_grid(year)
    if verbose:
        print(
            f"  grid: {len(mfr_logos)} mfr logos, {len(car_renders)} car renders"
        )
    updated_mfr = 0
    updated_cars = 0
    updated_circuits = 0

    for fia_slug, url in mfr_logos.items():
        name = MFR_NAME_BY_FIA_SLUG.get(fia_slug)
        if name is None:
            continue
        mfr = (
            db.query(models.Manufacturer)
            .filter(models.Manufacturer.name == name)
            .first()
        )
        if mfr is None or mfr.logo_url == url:
            continue
        mfr.logo_url = url
        updated_mfr += 1

    for fia_model_slug, url in car_renders.items():
        our_slug = CAR_MODEL_SLUG_BY_FIA.get(fia_model_slug)
        if our_slug is None:
            continue
        cm = (
            db.query(models.CarModel)
            .filter(models.CarModel.slug == our_slug)
            .first()
        )
        if cm is None or cm.image_url == url:
            continue
        cm.image_url = url
        updated_cars += 1

    updated_posters = 0
    race_slugs = _resolve_race_slugs(year)
    if verbose:
        print(f"  race-slug resolver: {len(race_slugs)} resolved")
        for country, slug in race_slugs.items():
            print(f"    {country} -> {slug}")
    for country, race_slug in race_slugs.items():
        track_url, poster_url = _scrape_race_assets(race_slug)
        if verbose:
            print(
                f"  {country}: track={'ok' if track_url else 'no'}, "
                f"poster={'ok' if poster_url else 'no'}"
            )
        if track_url is not None:
            circuit = (
                db.query(models.Circuit)
                .filter(models.Circuit.country == country)
                .first()
            )
            if circuit is not None and circuit.layout_image != track_url:
                circuit.layout_image = track_url
                updated_circuits += 1
        if poster_url is not None:
            event = (
                db.query(models.Event)
                .join(models.Season, models.Event.season_id == models.Season.id)
                .join(models.Circuit, models.Event.circuit_id == models.Circuit.id)
                .filter(models.Season.year == year)
                .filter(models.Circuit.country == country)
                .first()
            )
            if event is not None and event.poster_url != poster_url:
                event.poster_url = poster_url
                updated_posters += 1

    if updated_mfr or updated_cars or updated_circuits or updated_posters:
        db.commit()

    return {
        "manufacturer_logos": updated_mfr,
        "car_renders": updated_cars,
        "circuits": updated_circuits,
        "posters": updated_posters,
    }


def main() -> None:
    """Standalone trigger for manual debug from the Railway shell.
    Usage: ``python -m app.ingest.fiawec_assets [year]`` (defaults to
    2026). Prints per-step diagnostics."""
    import argparse

    from app.db import SessionLocal

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("year", nargs="?", type=int, default=2026)
    args = parser.parse_args()
    db = SessionLocal()
    try:
        report = ingest_fiawec_assets(db, args.year, verbose=True)
        print(report)
    finally:
        db.close()


if __name__ == "__main__":
    main()

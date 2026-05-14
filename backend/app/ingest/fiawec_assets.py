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
WAYBACK = "https://web.archive.org"
# Only FIA's grid renders for years <= this hit the Wayback fallback;
# the current season is served live. Update this when the season ages
# out of fiawec.com's live grid page.
LIVE_GRID_MIN_YEAR = 2026

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
    # Past-season Hypercar entries — kept around so Wayback backfill
    # of 2023-2025 still maps the per-model PNG onto our DB slug.
    "porsche-963": "porsche-963",
    "lamborghini-sc63": "lamborghini-sc63",
    "lamborghini": "lamborghini-sc63",
    "isotta-fraschini": "isotta-fraschini-tipo-6c",
    "isotta": "isotta-fraschini-tipo-6c",
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
# Pre-2018 FIA WEC site (Symfony /ecm/) car-render filename pattern.
# Examples:
#   2017_WEC_n1_Porsche_919_Spa_Droite_f86a18.png
#   2017_Le Mans_n1_Porsche_919_Droite_659425.png  (literal space)
#   2017_WEC_n1_Porsche_919_Nürburgring_Droite_5971c4.png  (utf-8)
# We just need to match the trailing `_Droite_{hash6}.png` to filter
# out non-car images on the per-car page (team logos, tyres, etc.).
_LEGACY_CAR_RE = re.compile(
    r"/ecm/assets/1/engage/(\d+)/([^\"']+?_Droite_[a-f0-9]{6}\.png)",
    re.IGNORECASE,
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


def _wayback_closest(target_url: str, year: int) -> tuple[str, str] | None:
    """Find the latest Wayback Machine snapshot of `target_url` that
    fell within `year`. Returns ``(timestamp, snapshot_url)`` — the
    timestamp is needed to rewrite asset URLs to their own Wayback
    captures, and the snapshot_url is the page HTML we'll parse.
    Returns None when Wayback has no snapshot for that year."""
    # CDX API: search for captures of the target URL between
    # YYYY-01-01 and YYYY-12-31, take the most recent successful one.
    try:
        r = httpx.get(
            f"{WAYBACK}/cdx/search/cdx",
            params={
                "url": target_url,
                "from": f"{year}0101",
                "to": f"{year}1231",
                "filter": "statuscode:200",
                "output": "json",
                "limit": "-1",  # newest first
            },
            headers={"User-Agent": USER_AGENT},
            timeout=30,
        )
        r.raise_for_status()
        rows = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not rows or len(rows) < 2:
        return None
    # First row is the column header — skip it.
    ts = rows[1][1]
    return ts, f"{WAYBACK}/web/{ts}/{target_url}"


def _to_wayback_asset(url: str, timestamp: str) -> str:
    """Convert a live fiawec.com asset URL into the Wayback `im_` form
    (no toolbar, raw image). Uses the same timestamp as the page
    snapshot so the asset comes from roughly the same moment."""
    return f"{WAYBACK}/web/{timestamp}im_/{url}"


def _is_archive_url(url: str) -> bool:
    return url.startswith(WAYBACK)


def _scrape_legacy_per_car(
    year: int, car_numbers: list[str]
) -> dict[str, str]:
    """Per-car Wayback walk for the 2016-2017 era. FIA's pre-2018
    site put every entry on `/en/car/{year}/{number}` and the asset
    URLs sit under `/ecm/assets/1/engage/{id}/...Droite_{hash}.png`
    instead of the modern `/uploads/{year}-wec-*-droite-*.png`. The
    grid page didn't exist back then, so there's no single endpoint
    to scrape — we have to hit one Wayback snapshot per car.

    Returns ``{car_number: wayback_url}`` — first 'Droite' (right-
    side livery) PNG we find on each car's page. Multiple races'
    photos exist; we pick the first because they're all the same
    season livery for a given number."""
    out: dict[str, str] = {}
    for num in car_numbers:
        # Closest snapshot to that car's /en/car/{year}/{number} page
        # taken within the calendar year + 1 (FIA captures often
        # land in Jan of the following year).
        target = f"https://www.fiawec.com/en/car/{year}/{num}"
        snap = _wayback_closest(target, year)
        if snap is None:
            # Try the following year's captures too — old pages
            # remained served well into the next calendar year.
            snap = _wayback_closest(target, year + 1)
        if snap is None:
            continue
        ts, page_url = snap
        try:
            html = _fetch(page_url)
        except httpx.HTTPError:
            continue
        m = _LEGACY_CAR_RE.search(html)
        if m is None:
            continue
        # m.group(0) is the path-relative portion; rebuild full live URL
        # then route through Wayback so the asset stays resolvable.
        live = f"https://www.fiawec.com{m.group(0)}"
        out[num] = _to_wayback_asset(live, ts)
    return out


def _scrape_grid(
    year: int,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Walk every uploaded asset on the season's grid page. Returns
    three dicts:

    1. ``mfr_logos`` — ``{fia_slug: url}`` — one logo per brand.
    2. ``car_renders_by_model`` — ``{fia_model_slug: url}`` — first
       render of each model (back-compat fallback for cars that don't
       have a per-number entry yet).
    3. ``car_renders_by_number`` — ``{car_number: url}`` — every
       per-entry livery PNG, keyed by the number on the actual car.
       Powers Genesis #17 vs #19, Ferrari #50/#51/#83 etc.

    For the live current season we hit fiawec.com directly. For past
    seasons fiawec.com 301-redirects every per-year URL to the
    current grid, so we fall back to Wayback Machine snapshots taken
    in that season's year — the assets they reference are rewritten
    into Wayback's `im_` form so they keep resolving even if the
    fiawec CDN later expires the originals.
    """
    if year >= LIVE_GRID_MIN_YEAR:
        return _scrape_grid_live(year)
    return _scrape_grid_wayback(year)


def _scrape_grid_live(
    year: int,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    candidates: list[str] = []
    for path in (f"/en/page/grid", f"/en/car/{year}"):
        try:
            html = _fetch(f"{BASE}{path}")
        except httpx.HTTPError:
            continue
        candidates.extend(
            re.findall(r'<img[^>]+src="(/uploads/[^"]+)"', html)
        )
    candidates = list(dict.fromkeys(candidates))

    mfr_logos: dict[str, str] = {}
    car_renders_by_model: dict[str, str] = {}
    car_renders_by_number: dict[str, str] = {}
    skip_logo_slugs = {"wec-logo", "manufacturers-logos-couleur-rvb-footer"}
    for u in candidates:
        full = BASE + u
        m = _CAR_RE.search(u)
        if m and m.group(1) == str(year):
            number = m.group(2)
            model_slug = m.group(3)
            car_renders_by_model.setdefault(model_slug, full)
            car_renders_by_number.setdefault(number, full)
            continue
        m = _LOGO_RE.search(u)
        if m and m.group(1) not in skip_logo_slugs:
            mfr_logos.setdefault(m.group(1), full)
    return mfr_logos, car_renders_by_model, car_renders_by_number


def _scrape_grid_wayback(
    year: int,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Past-season variant. Pulls a Wayback snapshot of /en/page/grid
    taken during `year`, regexes the same `/uploads/...png` paths
    out, then rewrites each one through `im_` so the asset itself
    is fetched from archive.org rather than the (long-dead) live CDN.

    Manufacturer logos are not year-specific (they don't carry a year
    in the filename) — we still grab them but most are already in the
    DB from current-season ingest, so they no-op."""
    mfr_logos: dict[str, str] = {}
    car_renders_by_model: dict[str, str] = {}
    car_renders_by_number: dict[str, str] = {}
    skip_logo_slugs = {"wec-logo", "manufacturers-logos-couleur-rvb-footer"}

    # Multiple Wayback snapshots cover different points of the season.
    # Walk a few — first the year overall, then add per-quarter samples
    # if more URLs surface. Each snapshot can list different per-car
    # renders (a Spa-one-off livery uploaded mid-July only shows in
    # captures from July onwards).
    snapshots: list[tuple[str, str]] = []
    for target in (
        f"https://www.fiawec.com/en/page/grid",
        f"https://www.fiawec.com/en/car/{year}",
    ):
        snap = _wayback_closest(target, year)
        if snap is not None:
            snapshots.append(snap)
    if not snapshots:
        return mfr_logos, car_renders_by_model, car_renders_by_number

    for ts, page_url in snapshots:
        try:
            html = _fetch(page_url)
        except httpx.HTTPError:
            continue
        for u in re.findall(r'<img[^>]+src="([^"]*?/uploads/[^"]+)"', html):
            # Wayback rewrites image src to either
            #   /web/{ts}im_/https://www.fiawec.com/uploads/...
            # or a relative `/web/{ts}im_/https://www.fiawec.com/...`.
            # We want the live fiawec path for parsing + the Wayback
            # form for the asset URL we store in the DB.
            m = re.search(r"https?://www\.fiawec\.com(/uploads/[^\"']+)", u)
            if m is None:
                continue
            live_path = m.group(1)
            wayback_url = _to_wayback_asset(
                f"https://www.fiawec.com{live_path}", ts
            )
            car_m = _CAR_RE.search(live_path)
            if car_m and car_m.group(1) == str(year):
                number = car_m.group(2)
                model_slug = car_m.group(3)
                car_renders_by_model.setdefault(model_slug, wayback_url)
                car_renders_by_number.setdefault(number, wayback_url)
                continue
            logo_m = _LOGO_RE.search(live_path)
            if logo_m and logo_m.group(1) not in skip_logo_slugs:
                mfr_logos.setdefault(logo_m.group(1), wayback_url)
    return mfr_logos, car_renders_by_model, car_renders_by_number


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
    URL has actually changed.

    For `year < LIVE_GRID_MIN_YEAR` the data is fetched from a
    Wayback Machine snapshot taken during that season; live fiawec
    URLs only serve the current grid. Race posters + track maps are
    skipped on past-season runs because per-race pages are all 404 on
    the live site too — manufacturer logos + car renders are the
    only assets we can reliably backfill."""
    mfr_logos, car_renders_by_model, car_renders_by_number = _scrape_grid(year)
    source = "live fiawec" if year >= LIVE_GRID_MIN_YEAR else "wayback"
    if verbose:
        print(
            f"  grid [{source}]: {len(mfr_logos)} mfr logos, "
            f"{len(car_renders_by_model)} car-model renders, "
            f"{len(car_renders_by_number)} per-car-number renders"
        )
    updated_mfr = 0
    updated_cars = 0
    updated_circuits = 0
    updated_per_car = 0

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

    for fia_model_slug, url in car_renders_by_model.items():
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

    # Per-car renders — match by (year-season, car number). Each
    # entry's actual livery (Genesis #17 vs #19, Ferrari #50 vs #51 vs
    # #83). Falls through to the per-model render at API read time
    # when null.
    season = (
        db.query(models.Season).filter(models.Season.year == year).first()
    )
    if season is not None:
        cars_in_season = (
            db.query(models.Car)
            .filter(models.Car.season_id == season.id)
            .all()
        )
        car_by_number = {c.number: c for c in cars_in_season}
        # Pre-2018 fallback: FIA's then-CMS put car PNGs at
        # /ecm/assets/1/engage/... and never had a grid index, so the
        # grid scrape returns 0 for those years. Walk the DB cars and
        # hit each /en/car/{year}/{n} page individually via Wayback.
        # Skip if the grid scrape already produced renders for this
        # number (the modern format wins).
        if year < LIVE_GRID_MIN_YEAR and year <= 2017:
            missing_numbers = [
                c.number
                for c in cars_in_season
                if c.number not in car_renders_by_number
            ]
            if missing_numbers:
                legacy = _scrape_legacy_per_car(year, missing_numbers)
                if verbose:
                    print(
                        f"  legacy /ecm/ per-car walk: "
                        f"{len(legacy)}/{len(missing_numbers)} resolved"
                    )
                for num, url in legacy.items():
                    car_renders_by_number.setdefault(num, url)

        for car_number, url in car_renders_by_number.items():
            car = car_by_number.get(car_number)
            if car is None or car.image_url == url:
                continue
            car.image_url = url
            updated_per_car += 1
        if verbose:
            print(f"  per-car renders updated: {updated_per_car}")

    # Per-race assets (posters + track maps) — live only. Past-season
    # race-weekend pages are 404 on fiawec.com and Wayback's coverage
    # of them is thin and per-week (different slugs each round), so
    # the cost/benefit doesn't pencil out for a backfill.
    updated_posters = 0
    race_slugs = _resolve_race_slugs(year) if year >= LIVE_GRID_MIN_YEAR else {}
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

    if (
        updated_mfr
        or updated_cars
        or updated_per_car
        or updated_circuits
        or updated_posters
    ):
        db.commit()

    return {
        "manufacturer_logos": updated_mfr,
        "car_renders": updated_cars,
        "per_car_renders": updated_per_car,
        "circuits": updated_circuits,
        "posters": updated_posters,
    }


def main() -> None:
    """Standalone trigger for manual debug from the Railway shell.

    Usage:
        python -m app.ingest.fiawec_assets             # current season
        python -m app.ingest.fiawec_assets 2024        # one past year
        python -m app.ingest.fiawec_assets all         # every season in
                                                       # the DB (one-shot
                                                       # past-season
                                                       # backfill via
                                                       # Wayback)
    """
    import argparse

    from app.db import SessionLocal

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "year",
        nargs="?",
        default="2026",
        help="Season year, or 'all' to walk every Season row in the DB.",
    )
    args = parser.parse_args()
    db = SessionLocal()
    try:
        if args.year == "all":
            years = [
                y
                for (y,) in db.query(models.Season.year)
                .order_by(models.Season.year.desc())
                .all()
            ]
            print(f"backfilling {len(years)} seasons: {years}")
            totals: dict[str, int] = {}
            for y in years:
                print(f"\n=== {y} ===")
                report = ingest_fiawec_assets(db, y, verbose=True)
                print(report)
                for k, v in report.items():
                    totals[k] = totals.get(k, 0) + v
            print(f"\nTotal across all seasons: {totals}")
        else:
            report = ingest_fiawec_assets(db, int(args.year), verbose=True)
            print(report)
    finally:
        db.close()


if __name__ == "__main__":
    main()

"""Seed Railway Postgres with development mock data.

Idempotent: deletes existing rows in FK-safe order, then re-inserts.
Run from `backend/`:

    .venv/bin/python -m app.seed
"""
from datetime import date

from sqlalchemy import delete

from app import models
from app.db import SessionLocal

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

SEASONS = [{"slug": "s2026", "year": 2026, "championship_name": "FIA WEC"}]

RACE_CLASSES = [
    {"slug": "HYPERCAR", "name": "HYPERCAR"},
    {"slug": "LMP2", "name": "LMP2"},
    {"slug": "LMGT3", "name": "LMGT3"},
]

CIRCUITS = [
    {"slug": "qatar", "name": "Lusail International Circuit", "country": "QAT", "length_km": 5.419},
    {"slug": "imola", "name": "Autodromo Enzo e Dino Ferrari", "country": "ITA", "length_km": 4.909},
    {"slug": "spa", "name": "Circuit de Spa-Francorchamps", "country": "BEL", "length_km": 7.004},
    {"slug": "lemans", "name": "Circuit de la Sarthe", "country": "FRA", "length_km": 13.626},
    {"slug": "interlagos", "name": "Autódromo José Carlos Pace", "country": "BRA", "length_km": 4.309},
    {"slug": "cota", "name": "Circuit of the Americas", "country": "USA", "length_km": 5.513},
    {"slug": "fuji", "name": "Fuji Speedway", "country": "JPN", "length_km": 4.563},
    {"slug": "bahrain", "name": "Bahrain International Circuit", "country": "BHR", "length_km": 5.412},
]

MANUFACTURERS = [
    {"slug": "ferrari", "name": "Ferrari", "country": "ITA"},
    {"slug": "toyota", "name": "Toyota", "country": "JPN"},
    {"slug": "porsche", "name": "Porsche", "country": "DEU"},
    {"slug": "cadillac", "name": "Cadillac", "country": "USA"},
    {"slug": "bmw", "name": "BMW", "country": "DEU"},
    {"slug": "alpine", "name": "Alpine", "country": "FRA"},
    {"slug": "oreca", "name": "Oreca", "country": "FRA"},
    {"slug": "mclaren", "name": "McLaren", "country": "GBR"},
    {"slug": "mercedes", "name": "Mercedes-AMG", "country": "DEU"},
]

TEAMS = [
    {"slug": "ferrari-51", "name": "Ferrari AF Corse", "manufacturer": "ferrari", "car_number": 51, "race_class": "HYPERCAR"},
    {"slug": "ferrari-50", "name": "Ferrari AF Corse", "manufacturer": "ferrari", "car_number": 50, "race_class": "HYPERCAR"},
    {"slug": "ferrari-83", "name": "AF Corse", "manufacturer": "ferrari", "car_number": 83, "race_class": "HYPERCAR"},
    {"slug": "toyota-7", "name": "Toyota Gazoo Racing", "manufacturer": "toyota", "car_number": 7, "race_class": "HYPERCAR"},
    {"slug": "toyota-8", "name": "Toyota Gazoo Racing", "manufacturer": "toyota", "car_number": 8, "race_class": "HYPERCAR"},
    {"slug": "porsche-6", "name": "Porsche Penske Motorsport", "manufacturer": "porsche", "car_number": 6, "race_class": "HYPERCAR"},
    {"slug": "porsche-5", "name": "Porsche Penske Motorsport", "manufacturer": "porsche", "car_number": 5, "race_class": "HYPERCAR"},
    {"slug": "cadillac-12", "name": "Cadillac Hertz Team Jota", "manufacturer": "cadillac", "car_number": 12, "race_class": "HYPERCAR"},
    {"slug": "bmw-15", "name": "BMW M Team WRT", "manufacturer": "bmw", "car_number": 15, "race_class": "HYPERCAR"},
    {"slug": "alpine-36", "name": "Alpine Endurance Team", "manufacturer": "alpine", "car_number": 36, "race_class": "HYPERCAR"},
    # LMP2 — privateer prototypes on Oreca 07 chassis
    {"slug": "ao-tf-22", "name": "AO by TF", "manufacturer": "oreca", "car_number": 22, "race_class": "LMP2"},
    {"slug": "ieurop-43", "name": "Inter Europol Competition", "manufacturer": "oreca", "car_number": 43, "race_class": "LMP2"},
    {"slug": "vector-10", "name": "Vector Sport", "manufacturer": "oreca", "car_number": 10, "race_class": "LMP2"},
    {"slug": "idec-28", "name": "IDEC Sport", "manufacturer": "oreca", "car_number": 28, "race_class": "LMP2"},
    {"slug": "nielsen-24", "name": "Nielsen Racing", "manufacturer": "oreca", "car_number": 24, "race_class": "LMP2"},
    # LMGT3
    {"slug": "manthey-92", "name": "Manthey EMA", "manufacturer": "porsche", "car_number": 92, "race_class": "LMGT3"},
    {"slug": "wrt-46", "name": "Team WRT", "manufacturer": "bmw", "car_number": 46, "race_class": "LMGT3"},
    {"slug": "vista-21", "name": "Vista AF Corse", "manufacturer": "ferrari", "car_number": 21, "race_class": "LMGT3"},
    {"slug": "united-59", "name": "United Autosports", "manufacturer": "mclaren", "car_number": 59, "race_class": "LMGT3"},
    {"slug": "ironlynx-77", "name": "Iron Dames", "manufacturer": "mercedes", "car_number": 77, "race_class": "LMGT3"},
]

# Approximate model names for current Hypercar field
CAR_MODELS = {
    # Hypercar
    "ferrari-51": "Ferrari 499P",
    "ferrari-50": "Ferrari 499P",
    "ferrari-83": "Ferrari 499P",
    "toyota-7": "Toyota GR010 Hybrid",
    "toyota-8": "Toyota GR010 Hybrid",
    "porsche-6": "Porsche 963",
    "porsche-5": "Porsche 963",
    "cadillac-12": "Cadillac V-Series.R",
    "bmw-15": "BMW M Hybrid V8",
    "alpine-36": "Alpine A424",
    # LMP2
    "ao-tf-22": "Oreca 07",
    "ieurop-43": "Oreca 07",
    "vector-10": "Oreca 07",
    "idec-28": "Oreca 07",
    "nielsen-24": "Oreca 07",
    # LMGT3
    "manthey-92": "Porsche 911 GT3 R",
    "wrt-46": "BMW M4 GT3 EVO",
    "vista-21": "Ferrari 296 GT3",
    "united-59": "McLaren 720S GT3 EVO",
    "ironlynx-77": "Mercedes-AMG GT3",
}

DRIVERS = [
    {"slug": "kubica", "name": "Robert Kubica", "nationality": "POL", "team": "ferrari-83"},
    {"slug": "ye-yifei", "name": "Yifei Ye", "nationality": "CHN", "team": "ferrari-83"},
    {"slug": "hanson", "name": "Phil Hanson", "nationality": "GBR", "team": "ferrari-83"},
    {"slug": "pier-guidi", "name": "Alessandro Pier Guidi", "nationality": "ITA", "team": "ferrari-51"},
    {"slug": "calado", "name": "James Calado", "nationality": "GBR", "team": "ferrari-51"},
    {"slug": "giovinazzi", "name": "Antonio Giovinazzi", "nationality": "ITA", "team": "ferrari-51"},
    {"slug": "fuoco", "name": "Antonio Fuoco", "nationality": "ITA", "team": "ferrari-50"},
    {"slug": "molina", "name": "Miguel Molina", "nationality": "ESP", "team": "ferrari-50"},
    {"slug": "nielsen", "name": "Nicklas Nielsen", "nationality": "DNK", "team": "ferrari-50"},
    {"slug": "kobayashi", "name": "Kamui Kobayashi", "nationality": "JPN", "team": "toyota-7"},
    {"slug": "lopez", "name": "José María López", "nationality": "ARG", "team": "toyota-7"},
    {"slug": "buemi", "name": "Sébastien Buemi", "nationality": "CHE", "team": "toyota-8"},
    {"slug": "hirakawa", "name": "Ryo Hirakawa", "nationality": "JPN", "team": "toyota-8"},
    {"slug": "estre", "name": "Kévin Estre", "nationality": "FRA", "team": "porsche-6"},
    {"slug": "vanthoor", "name": "Laurens Vanthoor", "nationality": "BEL", "team": "porsche-6"},
]

EVENTS = [
    {"slug": "2026-r1-qatar", "round": 1, "name": "Qatar 1812 km", "circuit": "qatar", "date_start": date(2026, 2, 27), "date_end": date(2026, 2, 28), "format": "1812 km"},
    {"slug": "2026-r2-imola", "round": 2, "name": "6 Hours of Imola", "circuit": "imola", "date_start": date(2026, 4, 18), "date_end": date(2026, 4, 18), "format": "6 Hours"},
    {"slug": "2026-r3-spa", "round": 3, "name": "TotalEnergies 6 Hours of Spa-Francorchamps", "circuit": "spa", "date_start": date(2026, 5, 9), "date_end": date(2026, 5, 9), "format": "6 Hours"},
    {"slug": "2026-r4-lemans", "round": 4, "name": "24 Hours of Le Mans", "circuit": "lemans", "date_start": date(2026, 6, 13), "date_end": date(2026, 6, 14), "format": "24 Hours"},
    {"slug": "2026-r5-interlagos", "round": 5, "name": "Rolex 6 Hours of São Paulo", "circuit": "interlagos", "date_start": date(2026, 7, 12), "date_end": date(2026, 7, 12), "format": "6 Hours"},
    {"slug": "2026-r6-cota", "round": 6, "name": "Lone Star Le Mans", "circuit": "cota", "date_start": date(2026, 9, 5), "date_end": date(2026, 9, 5), "format": "6 Hours"},
    {"slug": "2026-r7-fuji", "round": 7, "name": "6 Hours of Fuji", "circuit": "fuji", "date_start": date(2026, 9, 27), "date_end": date(2026, 9, 27), "format": "6 Hours"},
    {"slug": "2026-r8-bahrain", "round": 8, "name": "Bapco Energies 8 Hours of Bahrain", "circuit": "bahrain", "date_start": date(2026, 11, 7), "date_end": date(2026, 11, 7), "format": "8 Hours"},
]

# (event_slug, session_type) -> [(position, team_slug, gap, laps), ...]
SESSION_RESULTS = {
    ("2026-r1-qatar", "RACE"): [
        (1, "ferrari-51", "—", 380),
        (2, "toyota-7", "+5.234", 380),
        (3, "ferrari-50", "+12.881", 380),
        (4, "porsche-6", "+19.444", 380),
        (5, "ferrari-83", "+24.118", 380),
    ],
    ("2026-r2-imola", "FP1"): [
        (1, "ferrari-51", "—", 28),
        (2, "ferrari-50", "+0.245", 30),
        (3, "porsche-6", "+0.418", 26),
        (4, "toyota-7", "+0.612", 31),
        (5, "ferrari-83", "+0.823", 27),
    ],
    ("2026-r2-imola", "FP2"): [
        (1, "ferrari-50", "—", 24),
        (2, "ferrari-51", "+0.122", 25),
        (3, "ferrari-83", "+0.298", 23),
        (4, "toyota-7", "+0.475", 26),
        (5, "porsche-6", "+0.611", 25),
    ],
    ("2026-r2-imola", "Q"): [
        (1, "ferrari-51", "—", 4),
        (2, "ferrari-50", "+0.087", 4),
        (3, "ferrari-83", "+0.211", 4),
        (4, "toyota-7", "+0.355", 4),
        (5, "porsche-6", "+0.502", 4),
    ],
    ("2026-r2-imola", "RACE"): [
        (1, "ferrari-83", "—", 174),
        (2, "ferrari-51", "+8.412", 174),
        (3, "toyota-7", "+15.207", 174),
        (4, "porsche-6", "+22.843", 174),
        (5, "ferrari-50", "+31.106", 174),
        (6, "manthey-92", "+1 lap", 165),
        (7, "wrt-46", "+1 lap", 165),
        (8, "vista-21", "+1 lap", 165),
        (9, "united-59", "+1 lap", 165),
        (10, "ironlynx-77", "+1 lap", 165),
    ],
}

# (driver_slug, points) — Hypercar after R2
DRIVER_STANDINGS = [
    (1, "kubica", 50),
    (2, "pier-guidi", 38),
    (3, "fuoco", 32),
    (4, "kobayashi", 28),
    (5, "estre", 24),
]

TEAM_STANDINGS = [
    (1, "ferrari-83", 50),
    (2, "ferrari-51", 38),
    (3, "ferrari-50", 32),
    (4, "toyota-7", 28),
    (5, "porsche-6", 24),
]

MANUFACTURER_STANDINGS = [
    (1, "ferrari", 95),
    (2, "toyota", 58),
    (3, "porsche", 47),
    (4, "cadillac", 31),
    (5, "bmw", 22),
]


# ---------------------------------------------------------------------------
# Seed runner
# ---------------------------------------------------------------------------


def _clear(db) -> None:
    # Delete in reverse FK dependency order.
    for model in [
        models.SessionResult,
        models.StandingDriver,
        models.StandingTeam,
        models.StandingManufacturer,
        models.CarDriver,
        models.Session,
        models.Car,
        models.Event,
        models.Driver,
        models.Team,
        models.Manufacturer,
        models.Circuit,
        models.RaceClass,
        models.Season,
    ]:
        db.execute(delete(model))
    db.flush()


def _seed_reference(db):
    season_ids: dict[str, int] = {}
    for s in SEASONS:
        obj = models.Season(year=s["year"], championship_name=s["championship_name"])
        db.add(obj)
        db.flush()
        season_ids[s["slug"]] = obj.id

    class_ids: dict[str, int] = {}
    for c in RACE_CLASSES:
        obj = models.RaceClass(name=c["name"])
        db.add(obj)
        db.flush()
        class_ids[c["slug"]] = obj.id

    circuit_ids: dict[str, int] = {}
    for c in CIRCUITS:
        obj = models.Circuit(name=c["name"], country=c["country"], length_km=c["length_km"])
        db.add(obj)
        db.flush()
        circuit_ids[c["slug"]] = obj.id

    manufacturer_ids: dict[str, int] = {}
    for m in MANUFACTURERS:
        obj = models.Manufacturer(name=m["name"], country=m["country"])
        db.add(obj)
        db.flush()
        manufacturer_ids[m["slug"]] = obj.id

    return season_ids, class_ids, circuit_ids, manufacturer_ids


def _seed_orgs(db, manufacturer_ids):
    team_ids: dict[str, int] = {}
    for t in TEAMS:
        obj = models.Team(
            name=t["name"],
            manufacturer_id=manufacturer_ids[t["manufacturer"]],
        )
        db.add(obj)
        db.flush()
        team_ids[t["slug"]] = obj.id

    driver_ids: dict[str, int] = {}
    for d in DRIVERS:
        obj = models.Driver(name=d["name"], nationality=d["nationality"])
        db.add(obj)
        db.flush()
        driver_ids[d["slug"]] = obj.id

    return team_ids, driver_ids


def _seed_events(db, season_ids, circuit_ids):
    event_ids: dict[str, int] = {}
    for e in EVENTS:
        obj = models.Event(
            season_id=season_ids["s2026"],
            circuit_id=circuit_ids[e["circuit"]],
            round=e["round"],
            name=e["name"],
            date_start=e["date_start"],
            date_end=e["date_end"],
            format=e["format"],
        )
        db.add(obj)
        db.flush()
        event_ids[e["slug"]] = obj.id
    return event_ids


def _seed_cars(db, season_ids, team_ids, class_ids):
    """One car per team, slug-keyed by team slug (which encodes #number)."""
    car_ids: dict[str, int] = {}
    for t in TEAMS:
        obj = models.Car(
            season_id=season_ids["s2026"],
            team_id=team_ids[t["slug"]],
            race_class_id=class_ids[t["race_class"]],
            number=t["car_number"],
            model=CAR_MODELS.get(t["slug"]),
        )
        db.add(obj)
        db.flush()
        car_ids[t["slug"]] = obj.id
    return car_ids


def _seed_car_drivers(db, season_ids, car_ids, driver_ids):
    for d in DRIVERS:
        db.add(
            models.CarDriver(
                car_id=car_ids[d["team"]],
                driver_id=driver_ids[d["slug"]],
                season_id=season_ids["s2026"],
            )
        )
    db.flush()


def _seed_sessions_and_results(db, event_ids, car_ids):
    # Track session ids by (event_slug, session_type)
    session_ids: dict[tuple[str, str], int] = {}
    # Distinct sessions to create
    keys = set(SESSION_RESULTS.keys())
    for event_slug, stype in keys:
        s = models.Session(event_id=event_ids[event_slug], type=stype)
        db.add(s)
        db.flush()
        session_ids[(event_slug, stype)] = s.id

    for (event_slug, stype), rows in SESSION_RESULTS.items():
        sid = session_ids[(event_slug, stype)]
        for position, team_slug, gap, laps in rows:
            db.add(
                models.SessionResult(
                    session_id=sid,
                    car_id=car_ids[team_slug],
                    position=position,
                    gap=gap,
                    laps=laps,
                )
            )
    db.flush()


def _seed_standings(db, season_ids, event_ids, driver_ids, team_ids, manufacturer_ids):
    # Standings as of after R2 (Imola).
    after = event_ids["2026-r2-imola"]

    for position, driver_slug, points in DRIVER_STANDINGS:
        db.add(
            models.StandingDriver(
                season_id=season_ids["s2026"],
                driver_id=driver_ids[driver_slug],
                after_event_id=after,
                position=position,
                points=points,
            )
        )

    for position, team_slug, points in TEAM_STANDINGS:
        db.add(
            models.StandingTeam(
                season_id=season_ids["s2026"],
                team_id=team_ids[team_slug],
                after_event_id=after,
                position=position,
                points=points,
            )
        )

    for position, manuf_slug, points in MANUFACTURER_STANDINGS:
        db.add(
            models.StandingManufacturer(
                season_id=season_ids["s2026"],
                manufacturer_id=manufacturer_ids[manuf_slug],
                after_event_id=after,
                position=position,
                points=points,
            )
        )

    db.flush()


def main() -> None:
    db = SessionLocal()
    try:
        _clear(db)
        season_ids, class_ids, circuit_ids, manufacturer_ids = _seed_reference(db)
        team_ids, driver_ids = _seed_orgs(db, manufacturer_ids)
        event_ids = _seed_events(db, season_ids, circuit_ids)
        car_ids = _seed_cars(db, season_ids, team_ids, class_ids)
        _seed_car_drivers(db, season_ids, car_ids, driver_ids)
        _seed_sessions_and_results(db, event_ids, car_ids)
        _seed_standings(
            db,
            season_ids,
            event_ids,
            driver_ids,
            team_ids,
            manufacturer_ids,
        )
        db.commit()
        print("seeded:")
        print(f"  seasons={len(SEASONS)} race_classes={len(RACE_CLASSES)}")
        print(f"  circuits={len(CIRCUITS)} manufacturers={len(MANUFACTURERS)}")
        print(f"  teams={len(TEAMS)} drivers={len(DRIVERS)}")
        print(f"  events={len(EVENTS)} cars={len(TEAMS)}")
        print(f"  car_drivers={len(DRIVERS)} sessions={len(SESSION_RESULTS)}")
        print(
            "  session_results=" + str(sum(len(v) for v in SESSION_RESULTS.values()))
        )
        print(
            "  standings: drivers="
            + str(len(DRIVER_STANDINGS))
            + " teams="
            + str(len(TEAM_STANDINGS))
            + " manufacturers="
            + str(len(MANUFACTURER_STANDINGS))
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

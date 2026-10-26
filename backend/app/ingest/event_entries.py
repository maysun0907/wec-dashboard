"""Resolve official Le Mans event-only entries without changing season eligibility."""
import re

from app import models
from app.ingest import alkamel
from app.ingest._common import (
    get_or_create_race_class, upsert_car_model, upsert_driver,
    upsert_manufacturer, upsert_team,
)
from app.ingest.fiawec_profiles import identity
from app.ingest.fiawec_standings import _normalize_name

# Full-name variants published by official timing and linked race entry lists.
NAME_ALIASES = {"nicholas yelloly": "Nick Yelloly", "alexander quinn": "Alex Quinn",
                "benjamin hanley": "Ben Hanley", "pj hyett": "PJ Hyett",
                "horst jr felbermayr": "Horst Felbermayr Jr.",
                "job van uitert": "Job van Uitert", "tobias lutke": "Tobias Lütke"}


def apply_event_entries(db, event, records):
    """Upsert identified guests from a complete official race classification.

    Stable IDs survive full rebuilds. Crew attendance is limited to this round;
    guests are never added to the championship's required entrant coverage.
    """
    if not re.search(r"24\s+Hours", event.name, re.I):
        return 0
    numbers = [r.get("NUMBER", "").strip() for r in records]
    if not records or any(not n.isdigit() for n in numbers) or len(set(numbers)) != len(numbers):
        raise ValueError("Invalid event entry classification")
    cars = {c.number: c for c in db.query(models.Car).filter_by(season_id=event.season_id)}
    drivers = {}
    for driver in db.query(models.Driver):
        drivers.setdefault(identity(driver.name), []).append(driver)
    teams = {_normalize_name(t.name): t for t in db.query(models.Team)}
    car_models = {_normalize_name(m.name): m for m in db.query(models.CarModel)}
    prepared = []
    for record, number in zip(records, numbers):
        if number in cars and not cars[number].is_guest:
            if cars[number].race_class.name != alkamel._normalize_class(record.get("CLASS", "")):
                raise ValueError(f"Event entry class changed for #{number}")
            continue
        cls = alkamel._normalize_class(record.get("CLASS", ""))
        team_name = record.get("TEAM", "").strip()
        vehicle = record.get("VEHICLE", "").strip()
        crew = [record[f"DRIVER_{i}"].strip() for i in range(1, 6) if record.get(f"DRIVER_{i}", "").strip()]
        if cls not in {"HYPERCAR", "LMP2", "LMGT3", "LMGTE_PRO", "LMGTE_AM"} or not team_name or not vehicle or not crew:
            raise ValueError(f"Incomplete official event entry #{number}")
        if len({identity(n) for n in crew}) != len(crew) or any(len(drivers.get(identity(n), [])) > 1 for n in crew):
            raise ValueError(f"Ambiguous official event crew #{number}")
        prepared.append((number, cls, team_name, vehicle, crew))
    for number, cls, team_name, vehicle, crew in prepared:
        model = car_models.get(_normalize_name(vehicle))
        if model is None:
            from app.ingest.wikipedia import _extract_manufacturer
            manufacturer = upsert_manufacturer(db, _extract_manufacturer(vehicle))
            model = upsert_car_model(db, vehicle, manufacturer_id=manufacturer.id)
            car_models[_normalize_name(vehicle)] = model
        team = teams.get(_normalize_name(team_name))
        if team is None:
            team = upsert_team(db, team_name, manufacturer_id=model.manufacturer_id)
            teams[_normalize_name(team_name)] = team
        race_class = get_or_create_race_class(db, cls)
        car = cars.get(number)
        if car is None:
            car = models.Car(season_id=event.season_id, number=number,
                             race_class_id=race_class.id, team_id=team.id, is_guest=True)
            db.add(car)
        elif car.race_class_id != race_class.id:
            raise ValueError(f"Event entry class changed for #{number}")
        car.team_id = team.id
        car.model = vehicle
        car.car_model_id = model.id
        db.flush()
        for raw_name in crew:
            display_name = NAME_ALIASES.get(_normalize_name(raw_name), alkamel._format_driver_name(raw_name))
            key = identity(display_name)
            candidates = drivers.get(key, [])
            driver = candidates[0] if candidates else upsert_driver(db, display_name)
            drivers[key] = [driver]
            link = db.get(models.CarDriver, (car.id, driver.id))
            if link is None:
                db.add(models.CarDriver(car_id=car.id, driver_id=driver.id,
                                        season_id=event.season_id, rounds=str(event.round)))
            elif link.rounds != str(event.round):
                raise ValueError(f"Guest crew attendance conflict for #{number}")
    db.flush()
    return len(prepared)


def enrich_event_entries(db, season_id, year):
    count = 0
    for event in db.query(models.Event).filter_by(season_id=season_id):
        if not re.search(r"24\s+Hours", event.name, re.I):
            continue
        params = alkamel.resolve_event_params(year, event.round)
        selected = alkamel._list_race_csvs(*params) if params else None
        if selected and alkamel.race_result_status(selected[1], event.name) in {"completed", "final"}:
            count += apply_event_entries(db, event, alkamel._parse_csv(alkamel._fetch(selected[1])))
    return count

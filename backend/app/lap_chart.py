"""Per-lap position trajectories for a race session, derived from
Al Kamel's lap-by-lap analysis CSV. Lifted out of the events router
so the ingest pipeline can pre-compute and stash the payload as JSON
on `Session.lap_chart_json` — avoiding a 1-2 MB CSV refetch on every
request to /sessions/{id}/lap-chart."""

from sqlalchemy.orm import Session as DbSession, joinedload

from app import models, schemas
from app.ingest import alkamel


def compute_lap_chart(
    db: DbSession, session: models.Session
) -> schemas.LapChart | None:
    """Build the LapChart payload for a race session, or None when no
    upstream timing data is available yet. Caller must verify that
    session.type == 'RACE' before calling."""
    event = db.get(models.Event, session.event_id)
    if event is None:
        return None
    season = db.get(models.Season, event.season_id)
    if season is None:
        return None
    params = alkamel.resolve_event_params(season.year, event.round)
    if params is None:
        return None

    laps = alkamel.fetch_race_lap_data(*params)
    if not laps:
        return None

    cars = (
        db.query(models.Car)
        .options(joinedload(models.Car.team), joinedload(models.Car.race_class))
        .filter(models.Car.season_id == season.id)
        .all()
    )
    drivers_by_number: dict[str, str] = {
        r.car.number: (r.drivers or "")
        for r in (
            db.query(models.SessionResult)
            .options(joinedload(models.SessionResult.car))
            .filter(models.SessionResult.session_id == session.id)
            .all()
        )
        if r.drivers
    }
    by_number = {
        c.number: {
            "team": c.team.name,
            "race_class": c.race_class.name,
            "drivers": drivers_by_number.get(c.number, ""),
        }
        for c in cars
    }

    by_car: dict[str, list[tuple[int, int]]] = {}  # number -> [(lap, elapsed_ms)]
    for r in laps:
        try:
            lap_n = int(r["lap"])
        except ValueError:
            continue
        elapsed = alkamel._hms_to_ms(r["elapsed"])
        if elapsed is None:
            continue
        by_car.setdefault(r["number"], []).append((lap_n, elapsed))

    if not by_car:
        return None

    total_laps = max(max(l for l, _ in laps_) for laps_ in by_car.values())

    overall_pos: dict[str, list[tuple[int, int]]] = {n: [] for n in by_car}
    class_pos: dict[str, list[tuple[int, int]]] = {n: [] for n in by_car}
    car_class = {n: by_number.get(n, {}).get("race_class", "") for n in by_car}

    for lap_n in range(1, total_laps + 1):
        ranked: list[tuple[int, str]] = []
        for car_n, points in by_car.items():
            here = next((e for l, e in points if l == lap_n), None)
            if here is None:
                continue
            ranked.append((here, car_n))
        if not ranked:
            continue
        ranked.sort()
        for i, (_, num) in enumerate(ranked):
            overall_pos[num].append((lap_n, i + 1))
        per_class_seen: dict[str, int] = {}
        for _, num in ranked:
            cls = car_class.get(num) or "?"
            per_class_seen[cls] = per_class_seen.get(cls, 0) + 1
            class_pos[num].append((lap_n, per_class_seen[cls]))

    cars_out: list[schemas.LapChartCar] = []
    for num in sorted(
        by_car, key=lambda n: overall_pos[n][-1][1] if overall_pos[n] else 99
    ):
        meta = by_number.get(num, {"team": "", "race_class": "?", "drivers": ""})
        ov = overall_pos[num]
        cl = class_pos[num]
        cars_out.append(
            schemas.LapChartCar(
                car_number=num,
                team=meta["team"],
                race_class=meta["race_class"],
                drivers=meta["drivers"],
                lap_numbers=[l for l, _ in ov],
                positions=[p for _, p in ov],
                class_positions=[p for _, p in cl],
            )
        )
    return schemas.LapChart(cars=cars_out, total_laps=total_laps, incidents=[])

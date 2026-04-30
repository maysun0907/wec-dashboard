from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.rounds import driver_in_round
from app.scoring import class_position_for, points_for
from app.season import YearParam, resolve_season

router = APIRouter(tags=["events"])

# Tiny in-process cache for race lap charts. The Al Kamel CSVs run
# 200KB-2MB and the position computation is cheap, but we render the
# same response for every page hit, so the network fetch dominates.
_LAP_CHART_CACHE: dict[int, "schemas.LapChart"] = {}

_SESSION_ORDER = {"FP1": 1, "FP2": 2, "FP3": 3, "Q": 4, "RACE": 5}


@router.get("/events", response_model=list[schemas.EventOut])
def list_events(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[models.Event]:
    season = resolve_season(db, year)
    if season is None:
        return []
    return (
        db.query(models.Event)
        .options(joinedload(models.Event.circuit))
        .filter(models.Event.season_id == season.id)
        .order_by(models.Event.round)
        .all()
    )


@router.get("/events/{event_id}", response_model=schemas.EventDetailOut)
def get_event(event_id: int, db: Session = Depends(get_db)) -> schemas.EventDetailOut:
    event = (
        db.query(models.Event)
        .options(joinedload(models.Event.circuit))
        .filter(models.Event.id == event_id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    sessions = (
        db.query(models.Session)
        .filter(models.Session.event_id == event_id)
        .all()
    )
    sessions.sort(key=lambda s: _SESSION_ORDER.get(s.type, 99))
    return schemas.EventDetailOut(
        id=event.id,
        round=event.round,
        name=event.name,
        date_start=event.date_start,
        date_end=event.date_end,
        format=event.format,
        circuit=schemas.CircuitOut.model_validate(event.circuit),
        sessions=[schemas.SessionOut.model_validate(s) for s in sessions],
    )


@router.get(
    "/sessions/{session_id}/results",
    response_model=list[schemas.SessionResultOut],
)
def session_results(
    session_id: int, db: Session = Depends(get_db)
) -> list[schemas.SessionResultOut]:
    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    event = db.get(models.Event, session.event_id)
    season_id = event.season_id if event else None
    round_num = event.round if event else None

    results = (
        db.query(models.SessionResult)
        .options(
            joinedload(models.SessionResult.car).joinedload(models.Car.team),
            joinedload(models.SessionResult.car).joinedload(models.Car.race_class),
        )
        .filter(models.SessionResult.session_id == session_id)
        .order_by(models.SessionResult.position)
        .all()
    )

    # Per-result drivers come from the race classification when ingested;
    # otherwise we reconstruct from car_drivers, filtered by event round so
    # TBC / Le-Mans-only drivers don't bleed into other rounds.
    drivers_by_car: dict[int, list[str]] = {}
    # Parallel id-bearing list keyed the same way as drivers_by_car. Used
    # to populate `driver_refs` so the frontend can /drivers/{id}-link
    # each name; the join already has Driver rows, so this is free.
    driver_refs_by_car: dict[int, list[tuple[int, str]]] = {}
    name_to_id: dict[str, int] = {}
    if results and season_id is not None:
        car_ids = [r.car_id for r in results]
        rows = (
            db.query(models.CarDriver, models.Driver)
            .join(models.Driver, models.CarDriver.driver_id == models.Driver.id)
            .filter(
                models.CarDriver.car_id.in_(car_ids),
                models.CarDriver.season_id == season_id,
            )
            .all()
        )
        for cd, d in rows:
            if round_num is not None and not driver_in_round(cd.rounds, round_num):
                continue
            drivers_by_car.setdefault(cd.car_id, []).append(d.name)
            driver_refs_by_car.setdefault(cd.car_id, []).append((d.id, d.name))
            name_to_id[d.name] = d.id

    out: list[schemas.SessionResultOut] = []
    for r in results:
        cp = class_position_for(
            db, session_id, r.car.race_class_id, r.position
        )
        # Only race sessions award championship points.
        pts = (
            points_for(event.name, cp)
            if (event is not None and session.type == "RACE")
            else 0.0
        )
        # Pick refs — prefer al kamel's `r.drivers` order when set so the
        # display text matches the listed lineup, falling back to the
        # car_drivers join. Names without a Driver match drop from refs
        # but stay in the display string.
        refs: list[schemas.SessionResultDriverRef] = []
        if r.drivers:
            for nm in (n.strip() for n in r.drivers.split("/") if n.strip()):
                drv_id = name_to_id.get(nm)
                if drv_id is not None:
                    refs.append(schemas.SessionResultDriverRef(id=drv_id, name=nm))
        else:
            for did, nm in driver_refs_by_car.get(r.car_id, []):
                refs.append(schemas.SessionResultDriverRef(id=did, name=nm))

        out.append(
            schemas.SessionResultOut(
                position=r.position,
                class_position=cp,
                points_awarded=pts,
                car_number=r.car.number,
                team=r.car.team.name,
                team_id=r.car.team_id,
                drivers=r.drivers or " / ".join(drivers_by_car.get(r.car_id, [])),
                driver_refs=refs,
                race_class=r.car.race_class.name,
                laps=r.laps,
                gap=r.gap,
                best_lap=r.best_lap,
                qualifying_lap=r.qualifying_lap,
                hyperpole_lap=r.hyperpole_lap,
                qualifying_driver=r.qualifying_driver,
                hyperpole_driver=r.hyperpole_driver,
                pit_stops=r.pit_stops,
            )
        )
    return out


@router.get(
    "/sessions/{session_id}/lap-chart",
    response_model=schemas.LapChart,
)
def session_lap_chart(
    session_id: int, db: Session = Depends(get_db)
) -> schemas.LapChart:
    """Per-lap position trajectories for a race session, derived from
    Al Kamel's lap-by-lap analysis CSV (cumulative ELAPSED time)."""
    cached = _LAP_CHART_CACHE.get(session_id)
    if cached is not None:
        return cached

    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.type != "RACE":
        raise HTTPException(
            status_code=400, detail="Lap chart is only available for races"
        )
    event = db.get(models.Event, session.event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    season = db.get(models.Season, event.season_id)
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")

    # Resolve the Al Kamel slugs for this season + round.
    from app.ingest import alkamel

    season_param = alkamel._season_param_for_year(season.year)
    if season_param is None:
        raise HTTPException(status_code=404, detail="No timing data available")
    events = alkamel._event_options_for_season(season_param)
    evvent_param = next(
        (ev for r, ev in events if r == event.round), None
    )
    if evvent_param is None:
        raise HTTPException(status_code=404, detail="No timing data available")

    laps = alkamel.fetch_race_lap_data(season_param, evvent_param)
    if not laps:
        raise HTTPException(status_code=404, detail="No timing data available")

    # Look up per-car metadata from our DB so the chart picks up the
    # team / class names the rest of the app uses.
    results = (
        db.query(models.SessionResult)
        .options(
            joinedload(models.SessionResult.car).joinedload(models.Car.team),
            joinedload(models.SessionResult.car).joinedload(
                models.Car.race_class
            ),
        )
        .filter(models.SessionResult.session_id == session_id)
        .all()
    )
    by_number = {
        r.car.number: {
            "team": r.car.team.name,
            "race_class": r.car.race_class.name,
            "drivers": r.drivers or "",
        }
        for r in results
    }

    # Group laps by car. Compute cumulative elapsed in milliseconds so we
    # can sort cars at each lap by who reached it first.
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
        raise HTTPException(status_code=404, detail="No timing data available")

    total_laps = max(max(l for l, _ in laps_) for laps_ in by_car.values())

    # For each lap N, rank cars by their elapsed time at that lap (or
    # the most recent earlier lap for cars that have already retired).
    overall_pos: dict[str, list[tuple[int, int]]] = {n: [] for n in by_car}
    class_pos: dict[str, list[tuple[int, int]]] = {n: [] for n in by_car}
    car_class = {n: by_number.get(n, {}).get("race_class", "") for n in by_car}

    for lap_n in range(1, total_laps + 1):
        ranked: list[tuple[int, str]] = []  # (elapsed_ms, number)
        for car_n, points in by_car.items():
            here = next((e for l, e in points if l == lap_n), None)
            if here is None:
                continue
            ranked.append((here, car_n))
        if not ranked:
            continue
        ranked.sort()
        # Overall positions.
        for i, (_, num) in enumerate(ranked):
            overall_pos[num].append((lap_n, i + 1))
        # Class-internal positions.
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
    chart = schemas.LapChart(cars=cars_out, total_laps=total_laps)
    _LAP_CHART_CACHE[session_id] = chart
    return chart


@router.get(
    "/sessions/{session_id}/pit-stops",
    response_model=list[schemas.PitStopOut],
)
def session_pit_stops(
    session_id: int, db: Session = Depends(get_db)
) -> list[schemas.PitStopOut]:
    """Pit visits for a race session, sorted by lap. Empty when the
    session isn't a race or ingestion hasn't run yet."""
    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    rows = (
        db.query(
            models.PitStopEvent,
            models.Car,
            models.Team,
            models.RaceClass,
        )
        .join(models.Car, models.PitStopEvent.car_id == models.Car.id)
        .join(models.Team, models.Car.team_id == models.Team.id)
        .join(models.RaceClass, models.Car.race_class_id == models.RaceClass.id)
        .filter(models.PitStopEvent.session_id == session_id)
        .order_by(
            models.PitStopEvent.lap_number,
            models.Car.race_class_id,
            models.Car.number,
        )
        .all()
    )
    return [
        schemas.PitStopOut(
            car_number=car.number,
            team=team.name,
            team_id=team.id,
            race_class=rc.name,
            lap=ps.lap_number,
            duration_ms=ps.duration_ms,
        )
        for ps, car, team, rc in rows
    ]

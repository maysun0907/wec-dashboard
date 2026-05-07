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
# Per-car race V-max (km/h), keyed by session_id. Same source CSV as
# the lap chart — we fetch on first hit from either endpoint.
_TOP_SPEED_CACHE: dict[int, dict[str, float]] = {}
# Per-car sectors of the best Q (or Hyperpole) lap, keyed by Q
# session_id. value = {car_number: (s1, s2, s3)} where each is the
# raw seconds string from Al Kamel's analysis CSV.
_QUAL_SECTORS_CACHE: dict[int, dict[str, tuple[str, str, str]]] = {}


def _get_qual_sectors_by_car(
    session_id: int, db: Session
) -> dict[str, tuple[str, str, str]]:
    """For a Q session, fetch every analysis CSV (one per class, plus a
    Hyperpole CSV when one was run) and pull the sector triple of each
    car's fastest lap. When both Q and HP exist we prefer HP because
    that's where pole was decided. Returns {} for non-Q sessions."""
    cached = _QUAL_SECTORS_CACHE.get(session_id)
    if cached is not None:
        return cached
    session = db.get(models.Session, session_id)
    if session is None or session.type != "Q":
        _QUAL_SECTORS_CACHE[session_id] = {}
        return {}
    event = db.get(models.Event, session.event_id)
    season = db.get(models.Season, event.season_id) if event else None
    if event is None or season is None:
        _QUAL_SECTORS_CACHE[session_id] = {}
        return {}
    from app.ingest import alkamel

    season_param = alkamel._season_param_for_year(season.year)
    if season_param is None:
        _QUAL_SECTORS_CACHE[session_id] = {}
        return {}
    events_ = alkamel._event_options_for_season(season_param)
    evvent_param = next((ev for r, ev in events_ if r == event.round), None)
    if evvent_param is None:
        _QUAL_SECTORS_CACHE[session_id] = {}
        return {}

    # Walk Q + HP CSVs. We track HP separately so it overrides Q in the
    # final dict — the pole-relevant lap is the Hyperpole one.
    out_q: dict[str, tuple[str, str, str]] = {}
    out_hp: dict[str, tuple[str, str, str]] = {}
    for kind, _cls, _cl_url, an_url, _ts in alkamel._list_session_csvs(
        season_param, evvent_param
    ):
        if kind not in ("Q", "HP") or not an_url:
            continue
        try:
            laps = alkamel._parse_lap_analysis(alkamel._fetch(an_url))
        except Exception:
            continue
        # Per car: lap with the smallest LAP_TIME wins.
        best_by_car: dict[str, tuple[int, str, str, str]] = {}
        for r in laps:
            lt_ms = alkamel._hms_to_ms(r.get("lap_time") or "")
            if lt_ms is None or lt_ms <= 0:
                continue
            s1, s2, s3 = r.get("s1") or "", r.get("s2") or "", r.get("s3") or ""
            if not (s1 and s2 and s3):
                continue
            num = r["number"]
            cur = best_by_car.get(num)
            if cur is None or lt_ms < cur[0]:
                best_by_car[num] = (lt_ms, s1, s2, s3)
        bucket = out_hp if kind == "HP" else out_q
        for num, (_lt, s1, s2, s3) in best_by_car.items():
            bucket[num] = (s1, s2, s3)
    merged = {**out_q, **out_hp}  # HP wins when both present
    _QUAL_SECTORS_CACHE[session_id] = merged
    return merged


def _get_top_speeds_by_car(
    session_id: int, db: Session
) -> dict[str, float]:
    """Return {car_number: max TOP_SPEED across the race}, fetching the
    Al Kamel race analysis CSV if not yet cached for this session."""
    cached = _TOP_SPEED_CACHE.get(session_id)
    if cached is not None:
        return cached
    session = db.get(models.Session, session_id)
    if session is None or session.type != "RACE":
        _TOP_SPEED_CACHE[session_id] = {}
        return {}
    event = db.get(models.Event, session.event_id)
    season = db.get(models.Season, event.season_id) if event else None
    if event is None or season is None:
        _TOP_SPEED_CACHE[session_id] = {}
        return {}
    from app.ingest import alkamel

    season_param = alkamel._season_param_for_year(season.year)
    if season_param is None:
        _TOP_SPEED_CACHE[session_id] = {}
        return {}
    events_ = alkamel._event_options_for_season(season_param)
    evvent_param = next((ev for r, ev in events_ if r == event.round), None)
    if evvent_param is None:
        _TOP_SPEED_CACHE[session_id] = {}
        return {}
    laps = alkamel.fetch_race_lap_data(season_param, evvent_param)
    out: dict[str, float] = {}
    for r in laps:
        raw = r.get("top_speed") or ""
        try:
            v = float(raw)
        except ValueError:
            continue
        if v <= 0:
            continue
        num = r["number"]
        prev = out.get(num)
        if prev is None or v > prev:
            out[num] = v
    _TOP_SPEED_CACHE[session_id] = out
    return out

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

    # Race-only V-max lookup. Empty dict for non-race sessions or when
    # the CSV hasn't been published yet — falls through as None per car.
    top_speeds = (
        _get_top_speeds_by_car(session_id, db)
        if session.type == "RACE"
        else {}
    )
    # Q-only sector breakdown of the pole lap.
    qual_sectors = (
        _get_qual_sectors_by_car(session_id, db)
        if session.type == "Q"
        else {}
    )

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
                top_speed_kph=top_speeds.get(r.car.number),
                pole_sectors=(
                    list(qual_sectors[r.car.number])
                    if r.car.number in qual_sectors
                    else None
                ),
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

    # Safety-car / FCY periods would go here, but we don't surface
    # heuristic guesses — Al Kamel doesn't publish a race-control feed
    # publicly. The schema field stays in place for a future manual
    # curation pipeline (race_incidents table + curate script) so the
    # frontend overlay code keeps working when real data lands.
    chart = schemas.LapChart(
        cars=cars_out, total_laps=total_laps, incidents=[]
    )
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

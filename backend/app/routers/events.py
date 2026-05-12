from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.ingest import alkamel
from app.lap_chart import compute_lap_chart
from app.rounds import driver_in_round
from app.scoring import points_for
from app.season import YearParam, resolve_season

router = APIRouter(tags=["events"])


def _resolve_alkamel_for_session(
    session: models.Session, db: Session
) -> tuple[str, str] | None:
    """Map a DB Session row to the (season_param, evvent_param) slugs
    Al Kamel expects. Raises 404 on broken FKs (a Session pointing at
    a missing Event is integrity corruption, not a "no upstream data"
    case). Returns None when the upstream listing simply doesn't have
    that year/round yet."""
    event = db.get(models.Event, session.event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    season = db.get(models.Season, event.season_id)
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")
    return alkamel.resolve_event_params(season.year, event.round)

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
        poster_url=event.poster_url,
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

    # Compute class positions in Python from the already-loaded result
    # set rather than running one count() per result. The previous
    # `class_position_for` call hit the DB N times per session — Spa
    # (~37 cars × 5 sessions) was firing ~185 round-trips per page hit.
    class_pos_by_id: dict[int, int] = {}
    by_class: dict[int, list[models.SessionResult]] = {}
    for r in results:
        by_class.setdefault(r.car.race_class_id, []).append(r)
    for rows_in_class in by_class.values():
        rows_in_class.sort(key=lambda r: r.position)
        for i, r in enumerate(rows_in_class, start=1):
            class_pos_by_id[r.id] = i

    out: list[schemas.SessionResultOut] = []
    for r in results:
        cp = class_pos_by_id[r.id]
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
                top_speed_kph=r.top_speed_kph,
                pole_sectors=(
                    [r.s1_time, r.s2_time, r.s3_time]
                    if r.s1_time and r.s2_time and r.s3_time
                    else None
                ),
            )
        )
    return out


_EMPTY_WEATHER = schemas.SessionWeather()


@router.get(
    "/sessions/{session_id}/weather",
    response_model=schemas.SessionWeather,
)
def session_weather(
    session_id: int, db: Session = Depends(get_db)
) -> schemas.SessionWeather:
    """Median air/track temps, humidity, wind, and a rain flag for one
    session. Pure DB read from pre-computed Session columns — the cron
    job's `enrich_session_weather` pass populates them. Returns an
    empty payload when those columns are still NULL so the frontend
    hides the badge; we deliberately do *not* trigger a live CSV
    fetch here because the race-detail page renders five of these in
    parallel and any single 1-3 s upstream call drags the whole tab."""
    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.air_temp_c is None and session.track_temp_c is None and not session.rain:
        return _EMPTY_WEATHER
    return schemas.SessionWeather(
        air_temp_c=session.air_temp_c,
        track_temp_c=session.track_temp_c,
        humidity_pct=session.humidity_pct,
        wind_kph=session.wind_kph,
        rain=bool(session.rain),
    )


@router.get(
    "/sessions/{session_id}/lap-chart",
    response_model=schemas.LapChart,
)
def session_lap_chart(
    session_id: int, db: Session = Depends(get_db)
) -> schemas.LapChart:
    """Per-lap position trajectories for a race session. Reads from
    `Session.lap_chart_json` (computed at ingest from Al Kamel's
    analysis CSV). Falls back to a live compute when the column is
    still NULL — that result is then persisted so subsequent requests
    are pure DB reads."""
    session = db.get(models.Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.type != "RACE":
        raise HTTPException(
            status_code=400, detail="Lap chart is only available for races"
        )

    if session.lap_chart_json:
        return schemas.LapChart.model_validate_json(session.lap_chart_json)

    chart = compute_lap_chart(db, session)
    if chart is None:
        raise HTTPException(status_code=404, detail="No timing data available")
    session.lap_chart_json = chart.model_dump_json(by_alias=False)
    db.commit()
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

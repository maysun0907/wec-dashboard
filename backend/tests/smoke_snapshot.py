"""Exhaust existing API identifiers on a LOCAL snapshot without source I/O.

DATABASE_URL=sqlite:////absolute/path/snapshot.sqlite PYTHONPATH=. \
    .venv/bin/python tests/smoke_snapshot.py
"""
import json
import logging
from collections import Counter
from time import perf_counter

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models
from app.db import engine
from app.main import app


def main():
    if engine.url.get_backend_name() != "sqlite":
        raise RuntimeError("API sweep requires a local SQLite snapshot")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    with engine.connect() as db:
        ids = {key: db.execute(select(model.id)).scalars().all() for key, model in {
            "event_id": models.Event, "session_id": models.Session,
            "driver_id": models.Driver, "team_id": models.Team,
            "circuit_id": models.Circuit, "manufacturer_id": models.Manufacturer,
        }.items()}
        ids["slug"] = db.execute(select(models.CarModel.slug)).scalars().all()
        years = db.execute(select(models.Season.year)).scalars().all()
    requests = []
    for path, methods in app.openapi()["paths"].items():
        operation = methods.get("get")
        if operation is None:
            continue
        query_params = {p["name"] for p in operation.get("parameters", []) if p["in"] == "query"}
        paths = [path]
        for parameter, values in ids.items():
            if "{" + parameter + "}" in path:
                paths = [path.replace("{" + parameter + "}", str(value)) for value in [*values, -1]]
        for resolved in paths:
            requests.append((resolved, {}))
            if "year" in query_params:
                requests.extend((resolved, {"year": year}) for year in [*years, 2011, 9999, "invalid"])
            if "raceClass" in query_params:
                requests.extend((resolved, {"raceClass": cls, **({"year": year} if "year" in query_params else {})})
                                for cls in ["HYPERCAR", "LMGT3", "LMP1", "LMP2", "LMGTE_PRO", "LMGTE_AM", "invalid"]
                                for year in years)
    counts = Counter()
    failures = []
    timings = []
    with TestClient(app, raise_server_exceptions=False) as client:
        for index, (path, params) in enumerate(requests, 1):
            started = perf_counter()
            response = client.get(path, params=params)
            elapsed = perf_counter() - started
            counts[response.status_code] += 1
            timings.append((round(elapsed * 1000, 2), path))
            if response.status_code >= 500:
                failures.append((path, params, response.status_code, response.text[:200]))
            if index % 1000 == 0:
                print(json.dumps({"checked": index, "failures": len(failures)}), flush=True)
    print(json.dumps({"checked": len(requests), "status_counts": counts,
                      "slowest_ms": sorted(timings, reverse=True)[:10], "failures": failures}), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

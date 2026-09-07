from datetime import timedelta

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import Base
from app.ingest import change_detection as changes


@pytest.fixture
def collector(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(changes, "SessionLocal", sessions)
    calls, requests = [], []
    payloads = {"listing": "same links", "file": "original result"}
    status = {"value": 200}
    fail = {"value": False}

    def get(url, **kwargs):
        requests.append((url, kwargs["headers"]))
        return httpx.Response(status["value"], text=payloads[url.rsplit("/", 1)[-1]],
                              headers={"ETag": '"version"'}, request=httpx.Request("GET", url))

    monkeypatch.setattr(changes.httpx, "get", get)

    @changes.unchanged_sources("test")
    def refresh(year=2026, url="https://example.test"):
        calls.append(year)
        for name in payloads:
            changes.fetch_text(f"{url}/{name}", headers={}, timeout=2)
        if fail["value"]:
            raise ValueError("rejected input")
        return {"rebuilt": True}

    yield refresh, calls, requests, payloads, status, fail, sessions
    engine.dispose()


def test_identical_bodies_skip_reprocessing(collector):
    refresh, calls, requests, *_ = collector
    assert refresh() == {"rebuilt": True}
    assert refresh()["unchanged"]
    assert len(calls) == 1
    assert len(requests) == 4  # Every input is still checked.


def test_conditional_304_skips_download_and_processing(collector):
    refresh, calls, requests, _, status, *_ = collector
    refresh()
    status["value"] = 304
    assert refresh()["unchanged"]
    assert requests[-1][1]["If-None-Match"] == '"version"'
    assert len(calls) == 1


def test_same_url_correction_rebuilds_and_reuses_download(collector):
    refresh, calls, requests, payloads, *_ = collector
    refresh()
    payloads["file"] = "amended result"
    assert refresh() == {"rebuilt": True}
    assert len(requests) == 4  # Preflight bodies are not downloaded twice.
    assert refresh()["unchanged"]
    assert len(calls) == 2


def test_new_document_in_listing_is_discovered(collector):
    refresh, calls, _, payloads, *_ = collector
    refresh()
    payloads["listing"] = "links plus new final result"
    payloads["new"] = "final classification"
    refresh()
    assert len(calls) == 2
    assert refresh()["sources_checked"] == 3


def test_failed_refresh_cannot_mark_change_as_applied(collector):
    refresh, calls, _, payloads, _, fail, sessions = collector
    refresh()
    payloads["file"] = "invalid amendment"
    fail["value"] = True
    with pytest.raises(ValueError):
        refresh()
    with sessions() as db:
        assert db.query(models.IngestCheckpoint).count() == 0
    fail["value"] = False
    refresh()
    assert len(calls) == 3


def test_network_error_is_not_unchanged(collector):
    refresh, _, _, _, status, *_ = collector
    refresh()
    status["value"] = 503
    with pytest.raises(httpx.HTTPStatusError):
        refresh()


def test_daily_rebuild_and_scope_isolation(collector):
    refresh, calls, _, _, _, _, sessions = collector
    refresh()
    with sessions() as db:
        checkpoint = db.get(models.IngestCheckpoint, "test:2026")
        checkpoint.completed_at -= timedelta(days=1)
        db.commit()
    assert refresh() == {"rebuilt": True}
    assert refresh(2025) == {"rebuilt": True}
    assert calls == [2026, 2026, 2025]


def test_validator_free_server_uses_content_hash(collector, monkeypatch):
    refresh, calls, *_ = collector
    headers_seen = []
    def get(url, **kwargs):
        headers_seen.append(kwargs["headers"])
        return httpx.Response(200, text="content", request=httpx.Request("GET", url))
    monkeypatch.setattr(changes.httpx, "get", get)
    refresh()
    assert refresh()["unchanged"]
    assert len(calls) == 1
    assert all("If-None-Match" not in headers for headers in headers_seen)


def test_changed_input_address_forces_rebuild(collector):
    refresh, calls, *_ = collector
    refresh()
    assert refresh(url="https://replacement.test") == {"rebuilt": True}
    assert len(calls) == 2


def test_parser_version_change_forces_rebuild(collector, monkeypatch):
    refresh, calls, *_ = collector
    refresh()
    monkeypatch.setattr(changes, "FORMAT_VERSION", changes.FORMAT_VERSION + 1)
    assert refresh() == {"rebuilt": True}
    assert len(calls) == 2


def test_304_inputs_are_refetched_when_another_input_changed(collector, monkeypatch):
    refresh, calls, requests, *_ = collector
    refresh()
    def get(url, **kwargs):
        requests.append((url, kwargs["headers"]))
        conditional = "If-None-Match" in kwargs["headers"]
        status = 304 if conditional and url.endswith("listing") else 200
        return httpx.Response(status, text="changed result", request=httpx.Request("GET", url))
    monkeypatch.setattr(changes.httpx, "get", get)
    assert refresh() == {"rebuilt": True}
    assert len(calls) == 2
    assert any(url.endswith("listing") and "If-None-Match" not in headers
               for url, headers in requests[2:])


def test_cold_scheduler_uses_change_detection(collector, monkeypatch):
    from contextlib import nullcontext
    from datetime import date, datetime, timezone
    from app.ingest import scheduled

    refresh, calls, *_ = collector
    snapshot = scheduled.ScheduleSnapshot(events=(scheduled.EventSchedule(
        1, 1, 2026, 1, "6 Hours", date(2026, 5, 9), date(2026, 5, 9)),))
    monkeypatch.setattr(scheduled, "scheduler_lock", lambda: nullcontext(True))
    monkeypatch.setattr(scheduled, "load_schedule", lambda _: snapshot)
    for _ in range(2):
        scheduled.run_scheduled_ingest(
            year=2026, url="https://example.test", ingest_once=refresh.__wrapped__,
            now_fn=lambda: datetime(2026, 7, 21, 6, tzinfo=timezone.utc),
        )
    assert len(calls) == 1

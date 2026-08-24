from contextlib import contextmanager
from datetime import datetime, timezone

import pytest
from bs4 import BeautifulSoup

from app.ingest import scheduled, wikipedia
from app.ingest.scheduled import ScheduleSnapshot
from app.ingest.wikipedia import SourceDataError, parse_entries


UTC = timezone.utc


def _table(html: str):
    soup = BeautifulSoup(html, "lxml")
    assert soup.table is not None
    return soup.table


def _entry_table(rows: str) -> str:
    return f"""
    <h2>Hypercar</h2>
    <table class="wikitable">
      <tr>
        <th>Entrant</th><th>Car</th><th>Engine</th><th>Hybrid</th>
        <th>Tyre</th><th>No.</th><th>Drivers</th><th>Rounds</th>
      </tr>
      {rows}
    </table>
    """


def test_empty_mediawiki_row_does_not_shift_later_entry_columns() -> None:
    """A formatting-only tr used to make BMW #15 look like a driver's name."""
    table = _table(
        _entry_table(
            """
            <tr>
              <td rowspan="4">Cadillac Team</td><td rowspan="4">Cadillac V-Series.R</td>
              <td rowspan="4">V8</td><td rowspan="4">Hybrid</td><td rowspan="4">M</td>
              <td rowspan="2">12</td><td>Driver A</td><td>1</td>
            </tr>
            <tr><td>Driver B</td><td>1</td></tr>
            <tr class="mw-empty-elt"></tr>
            <tr><td rowspan="2">38</td><td>Driver C</td><td>1</td></tr>
            <tr><td>Driver D</td><td>1</td></tr>
            <tr>
              <td rowspan="2">BMW M Team WRT</td><td rowspan="2">BMW M Hybrid V8</td>
              <td rowspan="2">V8</td><td rowspan="2">Hybrid</td><td rowspan="2">M</td>
              <td rowspan="2">15</td><td>Kevin Magnussen</td><td>1–4</td>
            </tr>
            <tr><td>Raffaele Marciello</td><td>1–4</td></tr>
            """
        )
    )

    entries = parse_entries(table, "HYPERCAR")
    bmw_entries = [entry for entry in entries if entry["entrant"] == "BMW M Team WRT"]

    assert [(entry["number"], entry["driver"]) for entry in bmw_entries] == [
        ("15", "Kevin Magnussen"),
        ("15", "Raffaele Marciello"),
    ]
    assert all(entry["number"].isdigit() for entry in entries)


def test_shifted_entry_row_is_rejected_before_database_write() -> None:
    malformed_html = _entry_table(
        """
        <tr>
          <td>BMW M Team WRT</td><td>BMW M Hybrid V8</td><td>V8</td><td>Hybrid</td>
          <td>M</td><td>Raffaele Marciello</td><td>15</td><td>1–4</td>
        </tr>
        """
    )

    with pytest.raises(SourceDataError, match="invalid car number"):
        parse_entries(_table(malformed_html), "HYPERCAR")


def test_ingest_validates_entries_before_opening_a_database_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    malformed_html = _entry_table(
        """
        <tr>
          <td>BMW M Team WRT</td><td>BMW M Hybrid V8</td><td>V8</td><td>Hybrid</td>
          <td>M</td><td>Raffaele Marciello</td><td>15</td><td>1–4</td>
        </tr>
        """
    )
    opened_session = False

    def unexpected_session():
        nonlocal opened_session
        opened_session = True
        raise AssertionError("invalid source must not reach database work")

    monkeypatch.setattr(wikipedia, "fetch_html", lambda _url: malformed_html)
    monkeypatch.setattr(wikipedia, "SessionLocal", unexpected_session)

    with pytest.raises(SourceDataError, match="invalid car number"):
        wikipedia.ingest(year=2026, url="https://example.test/season")

    assert opened_session is False


def test_scheduled_ingest_logs_source_rejection_without_crashing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[int, str]] = []

    @contextmanager
    def fake_lock():
        yield True

    def rejected_source(*, year: int, url: str) -> dict:
        calls.append((year, url))
        raise SourceDataError("HYPERCAR entry has invalid car number")

    monkeypatch.setattr(scheduled, "scheduler_lock", fake_lock)
    monkeypatch.setattr(
        scheduled, "load_schedule", lambda _year: ScheduleSnapshot()
    )

    scheduled.run_scheduled_ingest(
        year=2026,
        url="https://example.test/season",
        ingest_once=rejected_source,
        now_fn=lambda: datetime(2026, 7, 21, 6, 0, tzinfo=UTC),
        monotonic_fn=lambda: 0.0,
    )

    assert calls == [(2026, "https://example.test/season")]

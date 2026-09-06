from datetime import date, datetime

from app.ingest.fiawec_schedule import (
    is_session_time_within_event_window,
    parse_race_page,
    slug_for_event,
)


def test_race_slug_requires_venue_match_not_shared_duration():
    slugs = {"imola": "6-hours-of-imola-2026", "monza": "6-hours-of-monza-2026", "le mans": "24-hours-of-le-mans-2026-1"}
    assert slug_for_event("6 Hours of Monza", 2026, slugs) == slugs["monza"]
    assert slug_for_event("6 Hours of Barcelona", 2026, slugs) is None
    assert slug_for_event("24 Hours of Le Mans", 2026, slugs) == slugs["le mans"]


RACE_PAGE_WITH_JSON_LD = """
<html><head>
  <script type="application/ld+json">
    {
      "@type": "SportsEvent",
      "name": "6 Hours of Imola",
      "subEvent": [
        {
          "@type": "SportsEvent",
          "name": "Free Practice 1 - 6 Hours of Imola",
          "startDate": "2026-04-17T10:15:00+02:00"
        },
        {
          "@type": "SportsEvent",
          "name": "Qualifying - LMGT3 - 6 Hours of Imola",
          "startDate": "2026-04-18T14:30:00+02:00"
        },
        {
          "@type": "SportsEvent",
          "name": "Hyperpole - HYPERCAR - 6 Hours of Imola",
          "startDate": "2026-04-18T15:30:00+02:00"
        },
        {
          "@type": "SportsEvent",
          "name": "Race - 6 Hours of Imola",
          "startDate": "2026-04-19T13:00:00+02:00"
        }
      ]
    }
  </script>
</head><body></body></html>
"""


def test_parse_race_page_uses_fia_json_ld_schedule() -> None:
    assert parse_race_page(RACE_PAGE_WITH_JSON_LD, 2026, "Europe/Rome") == [
        ("FP1", datetime(2026, 4, 17, 8, 15)),
        # Hyperpole collapses into the Q bucket and is later than qualifying.
        ("Q", datetime(2026, 4, 18, 12, 30)),
        ("RACE", datetime(2026, 4, 19, 11, 0)),
    ]


def test_session_time_window_rejects_another_round() -> None:
    event_start = date(2026, 4, 17)
    event_end = date(2026, 4, 19)

    assert is_session_time_within_event_window(
        event_start, event_end, datetime(2026, 4, 13, 8, 0)
    )
    assert is_session_time_within_event_window(
        event_start, event_end, datetime(2026, 4, 20, 23, 59)
    )
    assert not is_session_time_within_event_window(
        event_start, event_end, datetime(2026, 7, 10, 8, 0)
    )

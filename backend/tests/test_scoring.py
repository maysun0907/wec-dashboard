from datetime import date

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.scoring import class_position_for, points_for, preload_class_positions


class TestPointsFor:
    """The FIA awards two distinct points tables: the standard one for
    6-hour rounds (25/18/15/…) and the "long" one for endurance rounds
    — Le Mans, Bahrain 8h, Qatar 1812 km — where P1 takes 38 instead
    of 25."""

    # --- standard 6h table -----------------------------------------

    def test_standard_p1(self) -> None:
        assert points_for("6 Hours of Imola", 1) == 25

    def test_standard_p10(self) -> None:
        assert points_for("6 Hours of Imola", 10) == 1

    def test_standard_p11_and_below_score_zero(self) -> None:
        assert points_for("6 Hours of Imola", 11) == 0
        assert points_for("6 Hours of Spa-Francorchamps", 99) == 0

    # --- long table (endurance rounds) -----------------------------

    def test_le_mans_p1(self) -> None:
        assert points_for("24 Hours of Le Mans", 1) == 38

    def test_le_mans_p3(self) -> None:
        assert points_for("24 Hours of Le Mans", 3) == 23

    def test_qatar_1812_p1(self) -> None:
        # The season-opening 1812 km race at Lusail is on the long table.
        assert points_for("Qatar 1812 km", 1) == 38

    def test_bahrain_8h_p1(self) -> None:
        assert points_for("Bapco Energies 8 Hours of Bahrain", 1) == 38

    # --- edge cases ------------------------------------------------

    def test_zero_class_position_is_zero_points(self) -> None:
        # `class_position_for` returns 0 when the row is somehow
        # unranked; scoring should not award points.
        assert points_for("6 Hours of Imola", 0) == 0

    def test_long_table_keyword_is_case_insensitive(self) -> None:
        # The matcher uses `re.IGNORECASE` so all-caps event names
        # still pick the long table.
        assert points_for("24 HOURS OF LE MANS", 1) == 38


def test_preload_class_positions_batches_multiple_sessions() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)
    try:
        season = models.Season(year=2026, championship_name="FIA WEC")
        circuit = models.Circuit(name="Spa", country="BEL", length_km=7.0)
        hypercar = models.RaceClass(name="HYPERCAR")
        lmgt3 = models.RaceClass(name="LMGT3")
        db.add_all([season, circuit, hypercar, lmgt3])
        db.flush()
        event_row = models.Event(
            season_id=season.id,
            circuit_id=circuit.id,
            round=3,
            name="6 Hours of Spa",
            date_start=date(2026, 5, 9),
            date_end=date(2026, 5, 10),
        )
        teams = [models.Team(name="A"), models.Team(name="B"), models.Team(name="C")]
        db.add_all([event_row, *teams])
        db.flush()
        cars = [
            models.Car(
                season_id=season.id,
                team_id=teams[0].id,
                race_class_id=hypercar.id,
                number="1",
            ),
            models.Car(
                season_id=season.id,
                team_id=teams[1].id,
                race_class_id=hypercar.id,
                number="2",
            ),
            models.Car(
                season_id=season.id,
                team_id=teams[2].id,
                race_class_id=lmgt3.id,
                number="3",
            ),
        ]
        db.add_all(cars)
        db.flush()
        sessions = [
            models.Session(event_id=event_row.id, type="RACE"),
            models.Session(event_id=event_row.id, type="Q"),
        ]
        db.add_all(sessions)
        db.flush()
        race_session_id, qualifying_session_id = (session.id for session in sessions)
        hypercar_id = hypercar.id
        lmgt3_id = lmgt3.id
        db.add_all(
            [
                models.SessionResult(
                    session_id=race_session_id, car_id=cars[0].id, position=1
                ),
                models.SessionResult(
                    session_id=race_session_id, car_id=cars[1].id, position=3
                ),
                models.SessionResult(
                    session_id=race_session_id, car_id=cars[2].id, position=2
                ),
                models.SessionResult(
                    session_id=qualifying_session_id,
                    car_id=cars[1].id,
                    position=1,
                ),
            ]
        )
        db.commit()

        query_count = 0

        def count_queries(*_args: object) -> None:
            nonlocal query_count
            query_count += 1

        event.listen(engine, "before_cursor_execute", count_queries)
        try:
            preload_class_positions(db, [race_session_id, qualifying_session_id])
            assert class_position_for(db, race_session_id, hypercar_id, 1) == 1
            assert class_position_for(db, race_session_id, hypercar_id, 3) == 2
            assert class_position_for(db, race_session_id, lmgt3_id, 2) == 1
            assert (
                class_position_for(db, qualifying_session_id, hypercar_id, 1)
                == 1
            )
        finally:
            event.remove(engine, "before_cursor_execute", count_queries)

        assert query_count == 1
    finally:
        db.close()

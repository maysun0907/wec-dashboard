from app.scoring import points_for


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

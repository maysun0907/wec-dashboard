"""Curated Balance of Performance per (season_year, event_round, car_model_slug).

Applied to ``bop_adjustments`` by ``app.curate_bop``. Idempotent —
re-running with no changes is a no-op.

The FIA publishes Hypercar BoP a few days before each round (see
fiawec.com / fia.com). Source links plus PDF dates should land in
commit messages so a future maintainer can audit.

Schema:

    BOP[(season_year, round_number, car_model_slug)] = {
        "min_weight_kg": int,
        "max_power_kw": int,
        "max_energy_per_stint_mj": float,
        "success_handicap_kg": int,  # 2026+ only
    }

All fields optional — leave out what FIA didn't publish for that round.
"""
from typing import TypedDict


class BopValues(TypedDict, total=False):
    min_weight_kg: int
    max_power_kw: int
    max_energy_per_stint_mj: float
    success_handicap_kg: int


# Empty by default. Add entries here once the FIA tables for the season
# have been transcribed. Example shape (uncommented when filled in):
#
# BOP: dict[tuple[int, int, str], BopValues] = {
#     (2026, 1, "ferrari-499p"): {"min_weight_kg": 1066, "max_power_kw": 510},
#     (2026, 1, "toyota-tr010-hybrid"): {"min_weight_kg": 1059, "max_power_kw": 506},
#     ...
# }
BOP: dict[tuple[int, int, str], BopValues] = {}

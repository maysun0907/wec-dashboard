"""Curated car-model specs.

Slug-keyed dict, applied to ``car_models`` rows by
``app.curate_car_models``. Idempotent — running the curator again only
overwrites the fields you list here.

Conservative defaults: category + engine config + year of introduction
are public and stable. Hypercar power/weight are set to the BoP-equalized
target (~680 hp combined, 1030 kg minimum) shared across the field.
GT3 BoP varies more between cars — left null until verified.

``image_url`` should point to a transparent-background PNG hosted under
``frontend/public/cars/`` (e.g. ``/cars/ferrari-499p.png``). Drop the
file in, then add the entry here.

Slugs are auto-derived by ``slugify`` in ``app.ingest._common`` —
roughly lowercase + non-alphanum to ``-``. Run the curator once and it
will print any slug here that isn't present in the DB so you can
correct typos.
"""
from typing import TypedDict


class CarSpec(TypedDict, total=False):
    category: str  # "LMH" | "LMDh" | "LMP2" | "LMGT3"
    engine: str
    power_hp: int
    weight_kg: int
    year_introduced: int
    image_url: str


# Hypercar entries are governed by a 500 kW (~670 hp) maximum combined
# power and 1030 kg minimum weight. From 2026 the FIA stopped
# publishing per-round BoP figures (private to teams), so the per-car
# rows below all carry the regulation max — actual settings differ
# between cars and rounds but aren't disclosed.
_HYPERCAR_BOP = {"power_hp": 670, "weight_kg": 1030}

CAR_SPECS: dict[str, CarSpec] = {
    # ---- HYPERCAR (LMH + LMDh) ----
    "ferrari-499p": {
        "category": "LMH",
        "engine": "3.0 L twin-turbo V6 hybrid",
        "year_introduced": 2023,
        **_HYPERCAR_BOP,
    },
    "toyota-tr010-hybrid": {
        "category": "LMH",
        "engine": "3.5 L twin-turbo V6 hybrid",
        "year_introduced": 2021,
        **_HYPERCAR_BOP,
    },
    "cadillac-v-series-r": {
        "category": "LMDh",
        "engine": "5.5 L naturally aspirated V8 hybrid",
        "year_introduced": 2023,
        **_HYPERCAR_BOP,
    },
    "bmw-m-hybrid-v8": {
        "category": "LMDh",
        "engine": "4.0 L twin-turbo V8 hybrid",
        "year_introduced": 2024,
        **_HYPERCAR_BOP,
    },
    "alpine-a424": {
        "category": "LMDh",
        "engine": "3.4 L twin-turbo V6 hybrid",
        "year_introduced": 2024,
        **_HYPERCAR_BOP,
    },
    "peugeot-9x8": {
        "category": "LMH",
        "engine": "2.6 L twin-turbo V6 hybrid",
        "year_introduced": 2022,
        **_HYPERCAR_BOP,
    },
    "aston-martin-valkyrie": {
        "category": "LMH",
        "engine": "6.5 L naturally aspirated V12 (Cosworth)",
        "year_introduced": 2025,
        **_HYPERCAR_BOP,
    },
    # Genesis GMR-001 — 2026 debut, public spec details still scarce.
    "genesis-gmr-001": {
        "category": "LMDh",
        "year_introduced": 2026,
        **_HYPERCAR_BOP,
    },
    # ---- LMGT3 ----
    # All GT3 cars race under Group GT3 BoP — peak homologated power
    # sits in a 470–510 kW (≈ 630–685 hp) window per round, weight in a
    # 1300–1330 kg window. The numbers below are the 2025 base
    # homologation figures published by SRO / IMSA before round-by-round
    # adjustments. Use them as a baseline; per-round BoP overrides land
    # in app/data/bop.py.
    "ferrari-296-gt3-evo": {
        "category": "LMGT3",
        "engine": "3.0 L twin-turbo V6",
        "power_hp": 600,
        "weight_kg": 1325,
        "year_introduced": 2023,
    },
    "porsche-911-gt3-r-992-2": {
        "category": "LMGT3",
        "engine": "4.2 L naturally aspirated flat-6",
        "power_hp": 565,
        "weight_kg": 1290,
        "year_introduced": 2023,
    },
    "bmw-m4-gt3-evo": {
        "category": "LMGT3",
        "engine": "3.0 L twin-turbo inline-6",
        "power_hp": 590,
        "weight_kg": 1300,
        "year_introduced": 2025,
    },
    "mclaren-720s-gt3-evo-2": {
        "category": "LMGT3",
        "engine": "4.0 L twin-turbo V8",
        "power_hp": 580,
        "weight_kg": 1310,
    },
    "mercedes-amg-gt3-evo": {
        "category": "LMGT3",
        "engine": "6.3 L naturally aspirated V8",
        "power_hp": 550,
        "weight_kg": 1300,
    },
    "lexus-rc-f-gt3": {
        "category": "LMGT3",
        "engine": "5.4 L naturally aspirated V8",
        "power_hp": 530,
        "weight_kg": 1300,
    },
    "ford-mustang-gt3-evo": {
        "category": "LMGT3",
        "engine": "5.4 L naturally aspirated V8",
        "power_hp": 600,
        "weight_kg": 1300,
        "year_introduced": 2024,
    },
    "aston-martin-vantage-amr-gt3-evo": {
        "category": "LMGT3",
        "engine": "4.0 L twin-turbo V8",
        "power_hp": 550,
        "weight_kg": 1320,
        "year_introduced": 2024,
    },
    "chevrolet-corvette-z06-gt3-r": {
        "category": "LMGT3",
        "engine": "5.5 L naturally aspirated V8",
        "power_hp": 600,
        "weight_kg": 1320,
        "year_introduced": 2024,
    },
}

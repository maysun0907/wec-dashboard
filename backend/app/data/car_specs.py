"""Curated car-model specs.

Slug-keyed dict, applied to ``car_models`` rows by
``app.curate_car_models``. Idempotent — running the curator again only
overwrites the fields you list here.

Conservative defaults: category + engine config + year of introduction
are public and stable. ``power_hp`` and ``weight_kg`` are BoP-dependent
in Hypercar/GT3 — leave them ``None`` unless you've verified the exact
homologated figure for the season this dashboard tracks.

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


CAR_SPECS: dict[str, CarSpec] = {
    # ---- HYPERCAR (LMH + LMDh) ----
    "ferrari-499p": {
        "category": "LMH",
        "engine": "3.0 L twin-turbo V6 hybrid",
        "year_introduced": 2023,
    },
    "toyota-gr010-hybrid": {
        "category": "LMH",
        "engine": "3.5 L twin-turbo V6 hybrid",
        "year_introduced": 2021,
    },
    "porsche-963": {
        "category": "LMDh",
        "engine": "4.6 L twin-turbo V8 hybrid",
        "year_introduced": 2023,
    },
    "cadillac-v-series-r": {
        "category": "LMDh",
        "engine": "5.5 L naturally aspirated V8 hybrid",
        "year_introduced": 2023,
    },
    "bmw-m-hybrid-v8": {
        "category": "LMDh",
        "engine": "4.0 L twin-turbo V8 hybrid",
        "year_introduced": 2024,
    },
    "alpine-a424": {
        "category": "LMDh",
        "engine": "3.4 L twin-turbo V6 hybrid",
        "year_introduced": 2024,
    },
    "peugeot-9x8": {
        "category": "LMH",
        "engine": "2.6 L twin-turbo V6 hybrid",
        "year_introduced": 2022,
    },
    "aston-martin-valkyrie-amr-lmh": {
        "category": "LMH",
        "engine": "6.5 L naturally aspirated V12 (Cosworth)",
        "year_introduced": 2025,
    },
    # Genesis GMR-001 — 2026 debut, public spec details still scarce.
    "genesis-gmr-001": {
        "category": "LMDh",
        "year_introduced": 2026,
    },
    # ---- LMP2 ----
    "oreca-07": {
        "category": "LMP2",
        "engine": "4.2 L naturally aspirated V8 (Gibson GK428)",
        "year_introduced": 2017,
    },
    # ---- LMGT3 ----
    "ferrari-296-gt3": {
        "category": "LMGT3",
        "engine": "3.0 L twin-turbo V6",
        "year_introduced": 2023,
    },
    "porsche-911-gt3-r": {
        "category": "LMGT3",
        "engine": "4.2 L naturally aspirated flat-6",
        "year_introduced": 2023,
    },
    "bmw-m4-gt3-evo": {
        "category": "LMGT3",
        "engine": "3.0 L twin-turbo inline-6",
        "year_introduced": 2025,
    },
    "mclaren-720s-gt3-evo": {
        "category": "LMGT3",
        "engine": "4.0 L twin-turbo V8",
    },
    "mercedes-amg-gt3": {
        "category": "LMGT3",
        "engine": "6.3 L naturally aspirated V8",
    },
    "lexus-rc-f-gt3": {
        "category": "LMGT3",
        "engine": "5.4 L naturally aspirated V8",
    },
    "ford-mustang-gt3": {
        "category": "LMGT3",
        "engine": "5.4 L naturally aspirated V8",
        "year_introduced": 2024,
    },
    "lamborghini-huracan-gt3-evo2": {
        "category": "LMGT3",
        "engine": "5.2 L naturally aspirated V10",
    },
    "aston-martin-vantage-gt3": {
        "category": "LMGT3",
        "engine": "4.0 L twin-turbo V8",
        "year_introduced": 2024,
    },
    "corvette-z06-gt3-r": {
        "category": "LMGT3",
        "engine": "5.5 L naturally aspirated V8",
        "year_introduced": 2024,
    },
}

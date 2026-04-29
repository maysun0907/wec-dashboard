"""Apply BoP entries from ``app.data.bop`` to ``bop_adjustments``.

Idempotent. Run from ``backend/``:

    .venv/bin/python -m app.curate_bop

Resolves (round_number, car_model_slug) → (event_id, car_model_id) on
each call so the script tolerates round renumbering or model renames
between seasons (it just won't find the row and will warn).
"""
from __future__ import annotations

import structlog

from app import models
from app.data.bop import BOP
from app.db import SessionLocal
from app.logging import configure_logging

_FIELDS = (
    "min_weight_kg",
    "max_power_kw",
    "max_energy_per_stint_mj",
    "success_handicap_kg",
)


def main() -> None:
    configure_logging()
    log = structlog.get_logger(__name__)
    db = SessionLocal()
    inserted = updated = unchanged = 0
    missing: list[tuple[int, str]] = []
    try:
        for (round_num, slug), values in BOP.items():
            event = (
                db.query(models.Event)
                .filter(models.Event.round == round_num)
                .first()
            )
            cm = (
                db.query(models.CarModel)
                .filter(models.CarModel.slug == slug)
                .first()
            )
            if event is None or cm is None:
                missing.append((round_num, slug))
                continue

            adj = (
                db.query(models.BopAdjustment)
                .filter_by(event_id=event.id, car_model_id=cm.id)
                .first()
            )
            if adj is None:
                adj = models.BopAdjustment(
                    event_id=event.id, car_model_id=cm.id, **values
                )
                db.add(adj)
                inserted += 1
                continue

            changed: list[str] = []
            for field in _FIELDS:
                if field in values and getattr(adj, field) != values[field]:
                    setattr(adj, field, values[field])
                    changed.append(field)
            if changed:
                updated += 1
                log.info("bop_updated", round=round_num, slug=slug, fields=changed)
            else:
                unchanged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    log.info(
        "bop_curate_done",
        inserted=inserted,
        updated=updated,
        unchanged=unchanged,
        missing=len(missing),
        missing_keys=missing,
    )


if __name__ == "__main__":
    main()

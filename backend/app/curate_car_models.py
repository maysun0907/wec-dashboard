"""Apply curated specs from ``app.data.car_specs`` to the ``car_models``
table. Idempotent — re-running with no changes is a no-op.

Run from ``backend/``:

    .venv/bin/python -m app.curate_car_models

Prints a one-line summary per slug and a final tally. Slugs in the data
file that don't exist in the DB are reported as warnings (typo or model
not yet ingested).
"""
import structlog

from app import models
from app.data.car_specs import CAR_SPECS
from app.db import SessionLocal
from app.logging import configure_logging

_FIELDS = ("category", "engine", "power_hp", "weight_kg", "year_introduced", "image_url")


def main() -> None:
    configure_logging()
    log = structlog.get_logger(__name__)
    db = SessionLocal()
    updated = 0
    unchanged = 0
    missing: list[str] = []
    try:
        for slug, spec in CAR_SPECS.items():
            cm = db.query(models.CarModel).filter_by(slug=slug).first()
            if cm is None:
                missing.append(slug)
                continue
            changed_fields: list[str] = []
            for field in _FIELDS:
                if field in spec and getattr(cm, field) != spec[field]:
                    setattr(cm, field, spec[field])
                    changed_fields.append(field)
            if changed_fields:
                updated += 1
                log.info("car_spec_updated", slug=slug, fields=changed_fields)
            else:
                unchanged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    log.info(
        "car_spec_curate_done",
        updated=updated,
        unchanged=unchanged,
        missing=len(missing),
        missing_slugs=missing,
    )


if __name__ == "__main__":
    main()

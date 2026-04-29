"""Apply curated specs from ``app.data.car_specs`` to the ``car_models``
table. Idempotent — re-running with no changes is a no-op.

Run from ``backend/``:

    .venv/bin/python -m app.curate_car_models

Prints a one-line summary per slug and a final tally. Slugs in the data
file that don't exist in the DB are reported as warnings (typo or model
not yet ingested).
"""
from app import models
from app.data.car_specs import CAR_SPECS
from app.db import SessionLocal


_FIELDS = ("category", "engine", "power_hp", "weight_kg", "year_introduced", "image_url")


def main() -> None:
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
                print(f"  ~ {slug}: {', '.join(changed_fields)}")
            else:
                unchanged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(
        f"curated: {updated} updated, {unchanged} unchanged, "
        f"{len(missing)} missing"
    )
    if missing:
        print("missing slugs (not in DB — typo or model not ingested?):")
        for slug in missing:
            print(f"  - {slug}")


if __name__ == "__main__":
    main()

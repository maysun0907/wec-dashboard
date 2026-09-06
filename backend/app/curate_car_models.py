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


def _dedupe_duplicate_models(db, log) -> int:
    """A team like Proton Competition runs different manufacturers
    across classes (Porsche 963 in Hypercar, Ford Mustang in LMGT3).
    upsert_car_model keys by (name, manufacturer_id), so if a
    Wikipedia row ever attributes "Porsche 963" to "Ford" by mistake,
    we end up with two separate CarModel rows sharing the same name
    but different manufacturers — one of them wrong, both surviving.

    Detect those collisions and merge them: the canonical row is the
    one whose Manufacturer.name is a prefix of the model name
    ("Porsche" ⊂ "Porsche 963"); if no manufacturer matches the name
    prefix we keep the one with the most Cars referencing it. Cars
    get re-pointed; the losing CarModel is deleted.
    """
    from collections import defaultdict

    by_name: dict[str, list[models.CarModel]] = defaultdict(list)
    for cm in db.query(models.CarModel).all():
        by_name[cm.name].append(cm)

    merged = 0
    for name, group in by_name.items():
        if len(group) <= 1:
            continue

        # Choose the canonical model: prefer the one whose manufacturer
        # name is a prefix of the model name; fall back to the row with
        # the most Cars referencing it.
        def _name_match(cm: models.CarModel) -> int:
            mfr = cm.manufacturer.name if cm.manufacturer else ""
            return 1 if mfr and cm.name.lower().startswith(mfr.lower()) else 0

        def _car_count(cm: models.CarModel) -> int:
            return (
                db.query(models.Car)
                .filter(models.Car.car_model_id == cm.id)
                .count()
            )

        group.sort(key=lambda cm: (_name_match(cm), _car_count(cm)), reverse=True)
        canonical = group[0]
        losers = group[1:]
        for loser in losers:
            # Conflicting published adjustments must not be silently merged.
            # Preserve both models for review if the same event disagrees.
            adjustments = db.query(models.BopAdjustment).filter_by(car_model_id=loser.id).all()
            targets = {adj.event_id: adj for adj in db.query(models.BopAdjustment).filter_by(car_model_id=canonical.id)}
            fields = ("min_weight_kg", "max_power_kw", "max_energy_per_stint_mj", "success_handicap_kg")
            if any(adj.event_id in targets and any(
                getattr(adj, field) is not None and getattr(targets[adj.event_id], field) is not None
                and getattr(adj, field) != getattr(targets[adj.event_id], field)
                for field in fields
            ) for adj in adjustments):
                log.warning("car_model_merge_conflict", kept=canonical.id, other=loser.id)
                continue
            for adj in adjustments:
                target = targets.get(adj.event_id)
                if target is None:
                    adj.car_model_id = canonical.id
                else:
                    for field in fields:
                        if getattr(target, field) is None:
                            setattr(target, field, getattr(adj, field))
                    db.delete(adj)
            for field in _FIELDS:
                if getattr(canonical, field) is None:
                    setattr(canonical, field, getattr(loser, field))
            (
                db.query(models.Car)
                .filter(models.Car.car_model_id == loser.id)
                .update({models.Car.car_model_id: canonical.id})
            )
            log.info(
                "car_model_merged",
                name=name,
                kept_slug=canonical.slug,
                kept_mfr=canonical.manufacturer.name if canonical.manufacturer else None,
                dropped_slug=loser.slug,
                dropped_mfr=loser.manufacturer.name if loser.manufacturer else None,
            )
            db.flush()
            db.delete(loser)
            merged += 1
    return merged


def main() -> None:
    configure_logging()
    log = structlog.get_logger(__name__)
    db = SessionLocal()
    updated = 0
    unchanged = 0
    missing: list[str] = []
    try:
        merged = _dedupe_duplicate_models(db, log)
        if merged:
            log.info("car_model_dedupe_done", merged=merged)
            db.commit()
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

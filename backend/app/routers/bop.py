from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.db import get_db
from app.season import YearParam, resolve_season

router = APIRouter(prefix="/bop", tags=["bop"])


@router.get("", response_model=list[schemas.BopEventOut])
def list_bop(
    year: int | None = YearParam,
    db: Session = Depends(get_db),
) -> list[schemas.BopEventOut]:
    """BoP grouped by event, then car model. Empty list when no curation
    exists for the season — frontend renders an empty state."""
    season = resolve_season(db, year)
    if season is None:
        return []

    rows = (
        db.query(models.BopAdjustment, models.Event, models.CarModel)
        .join(models.Event, models.BopAdjustment.event_id == models.Event.id)
        .join(
            models.CarModel,
            models.BopAdjustment.car_model_id == models.CarModel.id,
        )
        .options(joinedload(models.CarModel.manufacturer))
        .filter(models.Event.season_id == season.id)
        .all()
    )

    grouped: dict[int, dict] = {}
    for adj, event, cm in rows:
        bucket = grouped.setdefault(
            event.id,
            {
                "event_id": event.id,
                "round": event.round,
                "event_name": event.name,
                "rows": [],
            },
        )
        bucket["rows"].append(
            schemas.BopRowOut(
                car_model_id=cm.id,
                car_model_slug=cm.slug,
                car_model_name=cm.name,
                manufacturer_logo_url=(
                    cm.manufacturer.logo_url if cm.manufacturer else None
                ),
                min_weight_kg=adj.min_weight_kg,
                max_power_kw=adj.max_power_kw,
                max_energy_per_stint_mj=adj.max_energy_per_stint_mj,
                success_handicap_kg=adj.success_handicap_kg,
            )
        )

    out = [
        schemas.BopEventOut(
            event_id=b["event_id"],
            round=b["round"],
            event_name=b["event_name"],
            rows=sorted(b["rows"], key=lambda r: r.car_model_name),
        )
        for b in grouped.values()
    ]
    out.sort(key=lambda e: e.round)
    return out

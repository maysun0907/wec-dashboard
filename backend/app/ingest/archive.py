"""Bounded archive correction checks, kept out of live-session collection."""
from datetime import datetime

from bs4 import BeautifulSoup
from sqlalchemy import delete, func

from app import models
from app.db import engine, SessionLocal
from app.ingest.snapshot import source_snapshot
from app.ingest.revisions import record_revision


def archive_year_for(years: list[int], now: datetime) -> int | None:
    years = sorted(set(years) - {now.year}, reverse=True)
    years = [year for year in years if year < now.year]
    if not years:
        return None
    # Revisit the preceding season daily during the appeal/off-season window.
    # Later, rotate all archives without making every cron scrape 14 seasons.
    if now.month <= 4 and now.year - 1 in years:
        return now.year - 1
    return years[now.date().toordinal() % len(years)]


@source_snapshot
def refresh_archive(year: int):
    from app.ingest.wikipedia import fetch_html, url_for_year, _ingest_standings
    from app.ingest.alkamel import enrich_race_results

    url = url_for_year(year)
    soup = BeautifulSoup(fetch_html(url), "lxml")
    with engine.connect() as connection:
        with connection.begin():
            with SessionLocal(bind=connection, join_transaction_mode="create_savepoint") as db:
                season = db.query(models.Season).filter_by(year=year).one()
                standings_models = (models.StandingDriver, models.StandingTeam, models.StandingManufacturer)
                def coverage():
                    return {(model.__tablename__, class_id): count
                            for model in standings_models
                            for class_id, count in db.query(model.race_class_id, func.count(model.id))
                            .filter(model.season_id == season.id).group_by(model.race_class_id).all()}
                before = coverage()
                for model in standings_models:
                    db.execute(delete(model).where(model.season_id == season.id))
                counts = _ingest_standings(soup, db, season.id,
                    {rc.name: rc.id for rc in db.query(models.RaceClass)}, year)
                after = coverage()
                if not after or any(after.get(key, 0) < count for key, count in before.items()):
                    raise ValueError(f"Archive standings coverage decreased: {year}")
                payload = {}
                for model in standings_models:
                    fields = [c.name for c in model.__table__.columns if c.name != "id"]
                    payload[model.__tablename__] = sorted(
                        [{f: getattr(row, f) for f in fields} for row in
                         db.query(model).filter(model.season_id == season.id)], key=str)
                record_revision(db, scope=f"archive-standings:{year}", source_url=url, payload=payload)
                db.info["require_official_timing"] = True
                race_rows = enrich_race_results(db, season.id, year)
                db.commit()
                return {**counts, "race_rows": race_rows}


def run_archive_check(now: datetime):
    with SessionLocal() as db:
        years = [year for (year,) in db.query(models.Season.year).all()]
    year = archive_year_for(years, now)
    return {"year": year, **(refresh_archive(year) if year is not None else {})}

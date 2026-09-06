"""Copy a local SQLite snapshot to disposable PostgreSQL and reconcile sources.

Requires a migrated, EMPTY localhost PostgreSQL database; never production.
Pass snapshot filename as the sole argument. DATABASE_URL selects test Postgres.
"""
import sys
from pathlib import Path

from sqlalchemy import create_engine, select, text

from app.db import Base, engine
from app.ingest.wikipedia import ingest, url_for_year


def main():
    if engine.url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Reconciliation requires disposable local PostgreSQL")
    snapshot = Path(sys.argv[1]).resolve(strict=True)
    source = create_engine(f"sqlite:///{snapshot}")
    with source.connect() as src, engine.begin() as dest:
        for table in Base.metadata.sorted_tables:
            if dest.execute(select(table).limit(1)).first():
                raise RuntimeError(f"Target must be empty: {table.name}")
            rows = src.execute(select(table)).mappings().all()
            for offset in range(0, len(rows), 500):
                dest.execute(table.insert(), [dict(row) for row in rows[offset:offset + 500]])
            if "id" in table.c:
                dest.execute(text("SELECT setval(pg_get_serial_sequence(:table, 'id'), "
                                  f"COALESCE((SELECT MAX(id) FROM {table.name}), 1), "
                                  f"EXISTS(SELECT 1 FROM {table.name}))"), {"table": table.name})
    source.dispose()
    print("LOCAL_POSTGRES_SNAPSHOT_READY", flush=True)
    print(ingest(year=2026, url=url_for_year(2026)), flush=True)
    from app.ingest.archive import refresh_archive
    print(refresh_archive(2025), flush=True)


if __name__ == "__main__":
    main()

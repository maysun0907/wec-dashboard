from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    def __repr__(self) -> str:
        cls = type(self).__name__
        pk_cols = [c.name for c in self.__table__.primary_key.columns]
        pk_str = ", ".join(
            f"{c}={getattr(self, c, None)!r}" for c in pk_cols
        )
        name = getattr(self, "name", None)
        if name is not None:
            return f"{cls}({pk_str}, name={name!r})"
        return f"{cls}({pk_str})"


def _normalize_db_url(url: str) -> str:
    # Railway and some hosts emit `postgres://` or `postgresql://`; SQLAlchemy
    # defaults to the psycopg2 driver for both. We installed psycopg (v3),
    # so rewrite the scheme to use that dialect explicitly.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


engine = create_engine(_normalize_db_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""Durable change history; final publications can still be amended on appeal."""
import hashlib
import json
from datetime import datetime, timezone

from app import models


def record_revision(db, *, scope: str, source_url: str, payload) -> bool:
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode()).hexdigest()
    latest = (db.query(models.SourceRevision).filter_by(scope=scope)
              .order_by(models.SourceRevision.id.desc()).first())
    if latest and latest.content_hash == digest:
        return False
    db.add(models.SourceRevision(
        scope=scope, source_url=source_url, content_hash=digest,
        payload_json=serialized, collected_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    return True

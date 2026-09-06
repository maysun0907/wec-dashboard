"""Deduplicate source requests within one refresh, never across live polls."""
from contextvars import ContextVar
from functools import wraps

documents: ContextVar[dict[str, str] | None] = ContextVar("timing_documents", default=None)


def source_snapshot(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        token = documents.set({})
        try:
            return function(*args, **kwargs)
        finally:
            documents.reset(token)
    return wrapped

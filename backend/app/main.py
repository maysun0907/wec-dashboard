from fastapi import FastAPI

from app.config import settings
from app.routers import health

app = FastAPI(title="WEC Dashboard API", version="0.1.0")

app.include_router(health.router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "wec-dashboard-api",
        "version": "0.1.0",
        "environment": settings.environment,
    }

"""Live dashboard backend.

Serves a single-page dashboard plus JSON endpoints that combine:
  * live pipeline stage counts from REI (via the configured client), and
  * cleanup-run progress from the local StateStore.

Run:  uvicorn pipeline_automation.dashboard.app:app --reload
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ..checkpoint import StateStore
from ..config import get_settings
from ..rei_client import build_client

app = FastAPI(title="Pipeline Status Cleanup — Dashboard")

_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/api/stats")
def stats() -> JSONResponse:
    settings = get_settings()
    client = build_client(settings)
    store = StateStore(settings.state_db)

    stage_counts = client.stage_counts()
    outcomes = store.outcome_counts()
    new_total = stage_counts.get("New", 0)
    # Cleanup progress is measured against the New backlog we set out to clear.
    backlog_baseline = new_total + outcomes.total
    pct = round(100 * outcomes.total / backlog_baseline, 1) if backlog_baseline else 0.0

    return JSONResponse(
        {
            "data_source": settings.data_source,
            "dry_run": settings.dry_run,
            "stage_counts": stage_counts,
            "outcomes": {
                "verified": outcomes.verified,
                "held": outcomes.held,
                "flagged": outcomes.flagged,
                "left_new": outcomes.left_new,
                "error": outcomes.error,
                "total": outcomes.total,
            },
            "progress": {
                "processed": outcomes.total,
                "remaining_new": new_total,
                "baseline": backlog_baseline,
                "pct": pct,
            },
        }
    )


@app.get("/api/recent")
def recent(limit: int = 50) -> JSONResponse:
    store = StateStore(get_settings().state_db)
    return JSONResponse({"items": store.recent(limit)})

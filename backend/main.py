"""promo-margin-planner — FastAPI thin read layer + static frontend."""
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles

from . import config
from .db import get_connection

app = FastAPI(title="promo-margin-planner", version="0.1.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/api/health")
def health():
    """Liveness + DB reachability check."""
    try:
        with get_connection() as cn, cn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            cur.fetchone()
        return {"status": "ok", "db": "ok"}
    except Exception as e:  # surface the reason instead of a bare 500
        return {"status": "ok", "db": "error", "detail": str(e)}


@app.get("/api/products")
def products(limit: int = Query(200, ge=1, le=10000)):
    """Return rows from the data-contract table. Baseline endpoint — grid/filters come later."""
    with get_connection() as cn, cn.cursor() as cur:
        cur.execute(f"SELECT * FROM {config.BASE_TABLE} LIMIT %s", (limit,))
        rows = cur.fetchall()
    months = {"month_m1": rows[0]["month_m1"], "month_m2": rows[0]["month_m2"]} if rows else {}
    return {"count": len(rows), "months": months, "rows": rows}


# Serve the static frontend at the root. Declared AFTER the API routes so /api/* wins.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

"""promo-margin-planner — FastAPI: thin read layer + shared plan (DB) + realtime (WebSocket)."""
import json
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from . import config
from .db import get_connection

app = FastAPI(title="promo-margin-planner", version="0.3.0")
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@contextmanager
def db():
    """Connection that always closes (avoids leaks on write-heavy paths)."""
    cn = get_connection()
    try:
        yield cn
    finally:
        cn.close()


def ensure_schema():
    with db() as cn, cn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS ctkm_plan_item (
            campaign VARCHAR(60) NOT NULL, code VARCHAR(40) NOT NULL,
            in_plan TINYINT NOT NULL DEFAULT 1, promo_json LONGTEXT NULL, notes_json LONGTEXT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, updated_by VARCHAR(80) NULL,
            PRIMARY KEY (campaign, code)) DEFAULT CHARSET=utf8mb4""")
        cur.execute("""CREATE TABLE IF NOT EXISTS ctkm_plan_version (
            id VARCHAR(40) NOT NULL PRIMARY KEY, campaign VARCHAR(60) NOT NULL,
            name VARCHAR(120) NOT NULL, created_by VARCHAR(80) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, data_json LONGTEXT NOT NULL,
            INDEX ix_camp (campaign)) DEFAULT CHARSET=utf8mb4""")
        cn.commit()


ensure_schema()


# ---------------- WebSocket connection manager (per campaign room) ----------------
class Manager:
    def __init__(self):
        self.rooms = {}  # campaign -> set[WebSocket]

    async def connect(self, campaign, ws):
        await ws.accept()
        self.rooms.setdefault(campaign, set()).add(ws)

    def disconnect(self, campaign, ws):
        self.rooms.get(campaign, set()).discard(ws)

    async def broadcast(self, campaign, msg, exclude=None):
        for ws in list(self.rooms.get(campaign, set())):
            if ws is exclude:
                continue
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(campaign, ws)


manager = Manager()


# ---------------- read endpoints (data contract) ----------------
@app.get("/api/health")
def health():
    try:
        with db() as cn, cn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            cur.fetchone()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "ok", "db": "error", "detail": str(e)}


@app.get("/api/products")
def products(limit: int = Query(200, ge=1, le=10000)):
    with db() as cn, cn.cursor() as cur:
        cur.execute(f"SELECT * FROM {config.BASE_TABLE} LIMIT %s", (limit,))
        rows = cur.fetchall()
    months = {"month_m1": rows[0]["month_m1"], "month_m2": rows[0]["month_m2"]} if rows else {}
    return {"count": len(rows), "months": months, "rows": rows}


@app.get("/api/skus")
def skus():
    """SKU-grain gift lookup (SKU + label + estimated cogs), Hàng-hóa only."""
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT sku, ic_desc, cogs FROM tb_ctkm_sku_cost")
        rows = cur.fetchall()
    return {"count": len(rows), "rows": rows}


# ---------------- shared plan (DB) ----------------
def _seed_if_empty(cur, campaign):
    cur.execute("SELECT COUNT(*) AS n FROM ctkm_plan_item WHERE campaign=%s", (campaign,))
    if cur.fetchone()["n"] == 0:
        cur.execute("""INSERT INTO ctkm_plan_item (campaign, code, in_plan)
                       SELECT %s, code, 1 FROM tb_ctkm_margin_base WHERE in_ctkm=1""", (campaign,))


def _row_to_item(r):
    return {"code": r["code"], "in_plan": r["in_plan"],
            "promo": json.loads(r["promo_json"]) if r["promo_json"] else None,
            "notes": json.loads(r["notes_json"]) if r["notes_json"] else None}


@app.get("/api/plan")
def get_plan(campaign: str):
    """Shared working state for a campaign. Lazy-seeds the 1096 CTKM codes on first use."""
    with db() as cn, cn.cursor() as cur:
        _seed_if_empty(cur, campaign)
        cn.commit()
        cur.execute("SELECT code, in_plan, promo_json, notes_json FROM ctkm_plan_item WHERE campaign=%s", (campaign,))
        rows = cur.fetchall()
    return {"campaign": campaign, "items": [_row_to_item(r) for r in rows]}


@app.get("/api/plan/item")
def get_plan_item(campaign: str, code: str):
    """Read ONE item straight from DB — the source of truth other clients re-read on a change signal."""
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT code, in_plan, promo_json, notes_json FROM ctkm_plan_item WHERE campaign=%s AND code=%s", (campaign, code))
        r = cur.fetchone()
    return {"item": _row_to_item(r) if r else None}


def _save_item(campaign, code, in_plan, promo, notes):
    with db() as cn, cn.cursor() as cur:
        cur.execute("""INSERT INTO ctkm_plan_item (campaign, code, in_plan, promo_json, notes_json)
            VALUES (%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE in_plan=VALUES(in_plan), promo_json=VALUES(promo_json), notes_json=VALUES(notes_json)""",
            (campaign, code, 1 if in_plan else 0,
             json.dumps(promo) if promo is not None else None,
             json.dumps(notes) if notes is not None else None))
        cn.commit()


# ---------------- versions (DB, shared) ----------------
@app.get("/api/versions")
def list_versions(campaign: str):
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT id, name, created_by, created_at FROM ctkm_plan_version WHERE campaign=%s ORDER BY created_at DESC", (campaign,))
        rows = cur.fetchall()
    return {"versions": rows}


@app.post("/api/versions")
async def save_version(payload: dict):
    campaign = payload["campaign"]
    name = (payload.get("name") or "").strip() or "Phiên bản"
    vid = "v" + str(int(time.time() * 1000))
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT code, in_plan, promo_json, notes_json FROM ctkm_plan_item WHERE campaign=%s", (campaign,))
        items = cur.fetchall()
        cur.execute("INSERT INTO ctkm_plan_version (id, campaign, name, data_json) VALUES (%s,%s,%s,%s)",
                    (vid, campaign, name, json.dumps(items, default=str)))
        cn.commit()
    await manager.broadcast(campaign, {"type": "versions"})
    return {"id": vid, "name": name}


@app.get("/api/versions/{vid}")
def get_version(vid: str):
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT data_json FROM ctkm_plan_version WHERE id=%s", (vid,))
        row = cur.fetchone()
    return {"items": json.loads(row["data_json"]) if row else []}


@app.post("/api/versions/{vid}/restore")
async def restore_version(vid: str):
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT campaign, data_json FROM ctkm_plan_version WHERE id=%s", (vid,))
        row = cur.fetchone()
        if not row:
            return {"ok": False}
        campaign = row["campaign"]
        items = json.loads(row["data_json"])
        cur.execute("DELETE FROM ctkm_plan_item WHERE campaign=%s", (campaign,))
        vals = [(campaign, it["code"], it.get("in_plan", 1), it.get("promo_json"), it.get("notes_json")) for it in items]
        if vals:
            cur.executemany("""INSERT INTO ctkm_plan_item (campaign, code, in_plan, promo_json, notes_json)
                               VALUES (%s,%s,%s,%s,%s)""", vals)   # batch 1 lệnh thay vì 1096 lượt
        cn.commit()
    await manager.broadcast(campaign, {"type": "reload"})
    return {"ok": True}


@app.delete("/api/versions/{vid}")
async def delete_version(vid: str):
    with db() as cn, cn.cursor() as cur:
        cur.execute("SELECT campaign FROM ctkm_plan_version WHERE id=%s", (vid,))
        row = cur.fetchone()
        cur.execute("DELETE FROM ctkm_plan_version WHERE id=%s", (vid,))
        cn.commit()
    if row:
        await manager.broadcast(row["campaign"], {"type": "versions"})
    return {"ok": True}


# ---------------- realtime channel ----------------
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, campaign: str = Query(...)):
    await manager.connect(campaign, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "item":
                # 1) GHI DB trước  2) chỉ báo tín hiệu 'mã X đổi' → các client khác tự ĐỌC từ DB
                _save_item(campaign, msg["code"], msg.get("in_plan", 1), msg.get("promo"), msg.get("notes"))
                await manager.broadcast(campaign, {"type": "changed", "code": msg["code"]}, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(campaign, websocket)
    except Exception:
        manager.disconnect(campaign, websocket)


# Serve the static frontend at the root. Declared AFTER the API routes so /api/* wins.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

# promo-margin-planner

Internal web tool for CTKM (promotional campaign) planning: planners enter **suggested promotion prices** per product and see **gross margin** update live, sourced from the 1C data warehouse.

- **promo** = CTKM (chương trình khuyến mãi / promotion)
- **margin** = gross margin (giá bán − giá vốn) computed live in the browser
- **planner** = interactive input tool (not a static report)

## What it does
- Reads system data (product, inventory, recent sales, COGS, list price) from MySQL table **`tb_ctkm_margin_base`**.
- Planners type promotion prices → gross margin `%GM = (price − cost) / price` recomputes instantly (client-side JS).
- **Refresh data** (monthly) re-pulls the table.

> The data contract `tb_ctkm_margin_base` is built by `build-ctkm-margin-base.py` in the sibling repo `1c-data-sync`. Rebuilding that table = the monthly refresh. This project is read-only against it (promotion input is not yet persisted — see roadmap).

## Stack
- Backend: FastAPI (Python) — thin read layer over MySQL.
- Frontend: static HTML/JS/CSS (no build step).

## Structure
```
backend/                 FastAPI app (main.py, db.py, config.py)
frontend/                index.html, app.js, style.css
Dockerfile               python:3.12-slim + uvicorn, serves API and frontend on :8000
docker-compose.yml       local / plain Docker host (publishes a host port)
docker-compose.prod.yml  Dokploy (Traefik labels, dokploy-network, no host port)
.env                     DB credentials + runtime vars (gitignored) — copy from .env.example
```

## Run (dev)
```bash
python -m venv .venv
.venv\Scripts\activate        # Windows  (source .venv/bin/activate on *nix)
pip install -r requirements.txt
copy .env.example .env         # then fill in real DB credentials
uvicorn backend.main:app --reload --port 8000
```
Open http://localhost:8000

## Run (Docker, local)
```bash
copy .env.example .env         # fill in DB_* (and APP_PORT if 8000 is taken)
docker compose up -d --build
```
Open http://localhost:8000 — `GET /api/health` reports `db: ok|error`.

## Deploy (Dokploy)
Same pattern as `b2b.kamito.vn`: Dokploy builds from the repo with `docker-compose.prod.yml`, and its
Traefik on the shared `dokploy-network` terminates TLS and routes the domain to the container.
No host port is published; the app only listens on `:8000` inside the network.

1. **Dokploy → Create Service → Compose**, source = this GitHub repo, branch `main`,
   **Compose Path** = `./docker-compose.prod.yml`.
2. **Environment** tab — paste the keys from `.env.example` with real values. Required:
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DOMAIN`. Optional: `BASE_TABLE`, `TZ`.
   Dokploy writes them to a `.env` next to the compose, which is what expands `${VAR}` in the YAML.
3. Point the DNS `A` record of `DOMAIN` at the Dokploy server, then **Deploy**.
   Let's Encrypt is issued by the existing `letsencrypt` certResolver on the server's Traefik.
4. Verify: `https://<DOMAIN>/api/health` → `{"status":"ok","db":"ok"}`. If `db` is `error`, the
   `detail` field carries the MySQL reason (host unreachable, bad credentials, firewall).

Notes
- The container is a **read-only client** of the 1C MySQL; nothing is persisted, so there is no volume
  and `docker compose down -v` loses nothing.
- If the MySQL server only allows specific client IPs, allow the Dokploy host's public IP.
- Docker `HEALTHCHECK` hits `/api/health` for liveness only (HTTP 200 even when the DB is down), so a DB
  outage does not put the container in a restart loop.
- Traefik router/service names are `promo-planner`; keep them unique per Dokploy server.

## Roadmap
- [x] Baseline: FastAPI + static frontend, `/api/products` reads `tb_ctkm_margin_base`
- [ ] Editable grid: month-labelled headers (from `month_m1`/`month_m2`), promo price inputs, live %GM
- [ ] Filters (bộ môn / channel), sellable-only view
- [ ] Persist promotion input + SSO/roles (portal integration)

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
backend/    FastAPI app (main.py, db.py, config.py)
frontend/   index.html, app.js, style.css
.env        DB credentials (gitignored) — copy from .env.example
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

## Roadmap
- [x] Baseline: FastAPI + static frontend, `/api/products` reads `tb_ctkm_margin_base`
- [ ] Editable grid: month-labelled headers (from `month_m1`/`month_m2`), promo price inputs, live %GM
- [ ] Filters (bộ môn / channel), sellable-only view
- [ ] Persist promotion input + SSO/roles (portal integration)

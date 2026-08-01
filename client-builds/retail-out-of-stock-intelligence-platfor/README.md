# Retail Out-of-Stock Intelligence Platform

**Every stockout, priced and root-caused, before you open your inbox.**

Ingests a daily POS + inventory feed, detects out-of-stock events, prices each one
in lost sales and lost gross profit, classifies it into one of seven root causes,
and renders a store dashboard with the top-3 cause mix and a ranked worklist.

Auto-mounted at `/retail-out-of-stock-intelligence-platfor` by the `client-builds`
loop in `src/app.js`.

---

## The four-step framework, one file each

| Step | Question it answers | Module |
|---|---|---|
| **Motivation** | What is this costing us? | `lib/costModel.js` |
| **Measurement** | Which items were actually unbuyable? | `lib/detect.js` |
| **Attribution** | Whose problem is it? | `lib/classifier.js` |
| **Action** | What do we do Monday morning? | per-category action in `lib/classifier.js` |

`lib/pipeline.js` runs all four as one pure function over rows — the same code
path used by the ingest route, by SIT, and by the Store Health AI integration,
so the math can never drift between them.

---

## Research basis

Grounded in **Gruen & Corsten, _Shelf-Confidence: A Practical Guide to Reducing
Out-Of-Stocks and Improving Product Availability in Retail_ (iUniverse, 2022)**
and the foundational **Gruen, Corsten & Bharadwaj (2002)** worldwide study for
the Grocery Manufacturers of America.

Findings implemented in code, not just cited:

| Finding | Where it lives |
|---|---|
| Worldwide OOS rate ~8.3%; retailers lose ~4% of sales | dashboard benchmark tiles |
| **70–75% of out-of-stocks are store-level** | `CATEGORY_LAYER` + `layerMix()`; the split meter |
| Stock is often in the back room while the facing is empty | `detect.js` fires on `shelf_empty` even when `on_hand > 0` |
| Five shopper responses to a stockout | `SHOPPER_RESPONSE` in `costModel.js` |
| Demand-based planograms, not packout-based | Shelf Space Allocation rule (R6) |
| "Technology alone is never the panacea" | deterministic rules, every verdict states its evidence |

**Why not ML?** The classifier is a deterministic rule engine on purpose. Rules
are auditable, explain themselves to a store manager in one sentence, and need
no training set. A category a manager cannot act on is worth nothing regardless
of the model that produced it.

### Gross vs. true loss

Gross lost sales overstates what the retailer loses — a shopper who substitutes
another item in the same store costs the retailer nothing. So each event carries
three figures:

- `lost_sales_usd` — gross, the headline a manager is held to
- `net_retailer_loss_usd` — gross × 40% (bought elsewhere + did not buy)
- `brand_loss_usd` — gross × 59% (what the item's manufacturer lost)
- `recoverable_usd` — gross × 15% (delayed purchases, if restocked fast)

---

## The seven root causes

| Category | Layer | Fires when |
|---|---|---|
| Product Data Accuracy | store | item master missing/invalid (price, case pack, identifier) |
| Planogram Compliance | **shelf** | `on_hand > 0` but the facing is empty |
| Order and Inventory Accuracy | store | on-hand hit zero despite a recent delivery |
| Replenishment and Allocation | upstream | PO open and unfilled |
| Demand Forecast Accuracy | upstream | actual velocity ≥ 1.5× forecast |
| Shelf Space Allocation | **shelf** | facing cannot hold one day of demand |
| Item Management | store | **fallback — guarantees 100% coverage** |

Rules are evaluated top-down, first match wins, most specific first. The engine
never returns `UNCLASSIFIED`: an unlabelled row is a row nobody owns.

---

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | `{status:'ok', service:'retail-oos', version, storage}` |
| `POST` | `/api/v1/ingest` | **JWT** | daily batch (JSON rows, `{csv:"..."}` or `text/csv`) |
| `GET` | `/api/v1/dashboard?store_id=` | public, tenant-scoped | OOS rate, lost $, root-cause mix |
| `GET` | `/api/v1/dashboard/demo` | — | read-only fixture preview, persists nothing |
| `GET` | `/api/v1/dashboard/stores` | public, tenant-scoped | store picker |
| `GET` | `/api/v1/events/:store_id` | public, tenant-scoped | ranked classified events |
| `GET` | `/api/v1/events/categories` | — | the seven-category enum |

**Auth.** Writes require a Bearer JWT verified against the existing
`JWT_SECRET` — this app issues no tokens and has no custom signer. It
deliberately does *not* import `src/middleware/auth.js`, which pulls the CRM's
Sequelize models and credit system in at require-time; a client build that
hard-fails on an unrelated model import takes itself off the air for no benefit.

**Tenancy.** `tenant_id` resolves JWT claim → query/body → `1` (demo). When a
JWT is present the claim *wins*, so a caller cannot read another tenant's
stockouts by editing a query string. Every read filters on `tenant_id`.

**Logging.** Row counts and summary figures only — never the uploaded payload.
The feed carries store economics, and a full-body log turns every crash dump
into a data leak.

---

## Runbook

```bash
# 1. SIT (zero external keys; green on Postgres or the memory fallback)
node client-builds/retail-out-of-stock-intelligence-platfor/sit.js

# 2. Mint a token (any valid RinglyPro JWT works)
TOKEN=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({tenant_id:1},process.env.JWT_SECRET,{expiresIn:'1h'}))")

# 3. Ingest a day
curl -s -X POST https://aiagent.ringlypro.com/retail-out-of-stock-intelligence-platfor/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rows":[{"store_id":"S001","sku":"SKU-0001","on_hand":0,"avg_velocity":10,"unit_price":4.00,"margin":0.30,"oos_days":1}]}'

# 4. Read the dashboard
curl -s "https://aiagent.ringlypro.com/retail-out-of-stock-intelligence-platfor/api/v1/dashboard?store_id=S001"
```

CSV works too — `-H "Content-Type: text/csv" --data-binary @feed.csv`. Headers are
lower-cased and spaces become underscores; numeric and boolean cells are coerced.

### Input columns

Required: `store_id`, `sku`, `on_hand`, `avg_velocity`, `unit_price`, `margin`.
Optional (each one sharpens attribution): `oos_days`, `forecast_velocity`,
`actual_velocity`, `shelf_empty`, `planogram_violation`, `shelf_capacity`,
`min_shelf_qty`, `po_open`, `po_filled`, `po_qty_outstanding`, `recent_delivery`,
`days_since_delivery`, `inventory_discrepancy`, `product_data_incomplete`,
`status`, `category`, `product_name`.

`avg_velocity` must be **trailing** velocity measured *before* the stockout.
Same-day sales during an outage read as zero, which teaches the forecast nobody
wants the item — the stockout then justifies itself next cycle.

---

## Schema

Three tables, all `tenant_id INTEGER NOT NULL` + index:
`..._batches` (ingest audit trail) · `..._inventory` (raw rows, retained so
attribution can be re-derived when better rules ship) · `..._oos_events` (the
product).

`migrations/001_init.sql` is the source of truth and is applied **on every boot**
— it is fully idempotent (`CREATE TABLE / INDEX IF NOT EXISTS`).

> **Do not replace this with `sequelize.sync()`.** `sync()` regenerates index
> names from the table + column list; these table names are long enough that the
> generated names truncate at Postgres's 63-character identifier limit and
> collide with the previous boot's indexes. `sync()` then throws
> `relation ... already exists` on every restart after the first, dropping the
> app into the in-memory fallback permanently and losing every ingested batch on
> each redeploy. SIT asserts the backend is `postgres` whenever `DATABASE_URL`
> is set, specifically so this cannot regress unnoticed.

**Storage fallback.** No `DATABASE_URL` or a failed handshake degrades to an
in-memory Map behind an identical interface, so `/health` and the dashboard stay
up. `/health` reports which backend is live — degraded mode is never silent.

---

## Deferred (explicitly out of this slice)

Chain/category rollups and week-over-week trends · ML demand forecasting and
censored-demand reconstruction · OCR planogram extraction · live WMS/POS
connectors (batch upload only) · supplier lead-time feeds · threshold alerting
and corrective-action sustainment tracking · store-manager roles beyond a single
JWT user.

Each classifier rule carries a `refine:` note naming the real feed that would
sharpen it, so the upgrade path is explicit rather than guessed at.

---

## Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres. Unset = in-memory fallback; app still works end to end. |
| `JWT_SECRET` | Verifies Bearer tokens on write endpoints. Unset = all writes 401. |

No other keys. Nothing to configure to run the demo.

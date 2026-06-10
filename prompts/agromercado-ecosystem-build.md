# AgroMercadoDigital — Ecosystem Build Prompt for /ringlypro-architect

> **How to use:** Run `/ringlypro-architect` and paste this entire file as the task.
> The architect should build the ecosystem **module-by-module in a continuous
> ANALYZE → DEVELOP → TEST → DEPLOY → REVIEW loop**, shipping each module to
> production (Render) before starting the next, and auto-fixing on failure.
> Build all 6 phases. Do not stop to ask questions — execute autonomously.

---

## 0. Mission & Authorship Context (read first — do not misattribute)

Build the backend + API + admin/data layer for **AgroMercadoDigital**, the national
digital marketplace for Venezuela's agricultural sector.

- **ISTC (Ingeniería y Servicios Tecnológicos Colón)** — Venezuelan software company.
  Conceptual + software developer. **Owns and registered the AgroMercado platform.**
  Contact: istc.ingenieriatecnologica@gmail.com · Ing. Carlos Alvarado 0414-759-7526 · Ing. Luisa Pirela 0424-713-2078
- **Digit2AI LLC** (USA) — partner supplying the **AI layer only**. Contact: mstagg@digit2ai.com · 223-294-9184
- **AgrollanoDigital** — the Grupo Agrollano-branded instance of the platform (white-label of AgroMercado).
- The alliance is **ISTC × Digit2AI** (never "AgroMercado × Digit2AI").

**Live references (mine for product truth — do not invent):**
- Production app (ISTC, Vercel): https://agromercado-vzla.vercel.app/
- Marketing/board teaser (GHL): https://digit2ai.com/agromercado
- Source spec: ISTC "Documento de Especificación & Arquitectura Técnica" v1.0.1 (Junio 2026), summarized inline below.

**Spanish-first, emoji-free.** All user-facing strings in español (proper tildes/ñ).

---

## 1. Stack Mapping (ISTC original → RinglyPro target)

The ISTC production app runs on **Vercel Edge + Supabase (PostgreSQL) + Tailwind + Google Apps Script + WhatsApp Cloud API**.
We are building the **RinglyPro-native backend twin** so Digit2AI's AI layer and the
multi-tenant CRM can operate it. Map as follows:

| ISTC original | RinglyPro target (build this) |
|---|---|
| Supabase Postgres | PostgreSQL on Render via Sequelize (`CRM_DATABASE_URL \|\| DATABASE_URL`) |
| Supabase Realtime (WebSocket) auctions | Socket.IO (or SSE fallback) on the Express app for live bids |
| Vercel Serverless / Edge functions | Express routers under `verticals/agromercado/` |
| Supabase Auth (JWT, HttpOnly) | Existing RinglyPro JWT middleware pattern + HttpOnly/Secure cookies |
| Google Apps Script reportería | Node cron jobs + REST report endpoints |
| WhatsApp Cloud API webhooks | Keep WhatsApp Cloud API; wire via env-keyed service module |
| BCV/parallel cron (Worker, 09:00 & 13:00) | Node scheduled poller writing to `am_fx_rates` |
| Tailwind SPA frontend | Self-contained dashboard under `public/agromercado/` (admin/ops); the public storefront stays on ISTC's Vercel app |

**Follow the existing `verticals/veritas/` convention exactly:** self-contained Express
Router, own Sequelize instance via `src/db.js`, tables auto-create on boot via
`sync({alter:false})`, canonical SQL migration committed, all tables multi-tenant
(`tenant_id`) with an `am_` table prefix. Mount at **`/agromercado`** in `src/app.js`.

**Multi-tenant rule (CRITICAL):** every table has `tenant_id`; every query filters by it.
Grupo Agrollano = one tenant; AgroMercado public = another. Same codebase, isolated data.

---

## 2. Modules to Build (6 phases — one production loop each)

### PHASE 1 — Core Auth & Roles (`/agromercado/api/v1/auth`)
Unified login for **Administradores, Productores (producer), Compradores (buyer)** in one
intelligent panel keyed by **Cédula de Identidad o RIF**.
- Backend evaluates role on the user record and returns the dashboard target (no separate panels).
- JWT stored in **HttpOnly + Secure** cookie. `VERITAS_JWT_SECRET`-style env: `AGROMERCADO_JWT_SECRET` (fallback `JWT_SECRET`).
- Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/verify` (KYC submit).
- Roles enum: `admin | producer | buyer`. `is_verified` boolean gates selling.

### PHASE 2 — Multicategory Product Directory (`/agromercado/api/v1/products`, `/categories`)
8 categories with an **EAV / JSONB metadata** pattern so each inventory type carries its own critical attributes:

| id | Categoría | Atributos críticos (metadata JSONB) | Conteo ref. |
|---|---|---|---|
| cat_01 | Maquinaria Agrícola | horas_uso, hp, traccion (4x4/4x2), marca, anio | 245 |
| cat_02 | Semovientes | raza (Brahman/Carora/F1), edad, estatus_sanitario (Cert. SADA) | 389 |
| cat_03 | Insumos Agrícolas | presentacion (sacos/toneladas), compuesto_activo (Urea 46%, NPK) | 512 |
| cat_04 | Medicina Veterinaria | registro_INSAI, lote, fecha_vencimiento, dosificacion_ml | 178 |
| cat_05 | Servicios del Agro | area_geografica, certificacion_profesional, tarifa_base | 134 |
| cat_06 | Semillas y Cultivos | tasa_germinacion, variedad_hibrido, resistencia_climatica | 267 |
| cat_07 | Equipos e Implementos | tipo, compatibilidad, estado | 198 |
| cat_08 | Herramientas | tipo, material, estado | 156 |

- Prices normalized in **USD** (`price_usd NUMERIC(12,2)`), rendered to **VES** dynamically (see Phase 4).
- **GIN index on `metadata` JSONB** for fast ad-hoc attribute queries (per ISTC optimization note).
- Endpoints: `GET /categories`, `GET /products?category_id=&state=&q=`, `GET /products/:id`, `POST /products` (producer+verified), `PATCH /products/:id`, `POST /products/:id/favorite`.
- `location_state` constrained to Venezuela's 23 states.

### PHASE 3 — Synchronous Live Auction Engine (`/agromercado/api/v1/subastas`)
Real-time concurrent bidding. Each bid = an **isolated ACID transaction** to prevent
concurrency collisions and equal-value over-bids at the same timestamp.
- Realtime transport: **Socket.IO** room per auction lot; broadcast `bid:placed`, `auction:closing`, `auction:closed`.
- **Minimum-bid algorithm (implement exactly, as a DB function / RPC or service util):**

  ```
  P_min = P_actual + Δ_base × (1 + ln(Count_pujas + 1))
  ```
  where `P_actual` = current bid, `Δ_base` = base increment per category
  (e.g. $50 USD for high-genetics semovientes), and the logarithmic factor scales
  urgency with bid volume on the lot.
- Auction fields: lote, categoría, cantidad_lotes, precio_inicial, fecha_hora, participantes_activos (live count), puja_actual, countdown.
- Endpoints: `GET /subastas`, `GET /subastas/:id`, `POST /subastas/:id/puja` (ACID, recompute P_min server-side, reject < P_min), `GET /subastas/reglamento`, admin: `POST /subastas`, `PATCH /subastas/:id/cerrar`.

### PHASE 4 — Macroeconomic / FX (BCV + Paralelo) Module (`/agromercado/api/v1/divisas`)
DB stores USD; renders VES equivalences live.
- **Scheduled poller** runs **twice daily (09:00 & 13:00, aligned to BCV)** extracting official BCV + reference parallel rates into `am_fx_rates`.
- Client/calculator polls parallel rate ~every 15 min.
- **Fallbacks:** BCV → last indexed value from cache; Parallel → Official + fixed percentage delta.
- Do NOT hardcode rates as facts — fetch live. (Reference snapshot only: official ≈ Bs.572.68, parallel ≈ Bs.802.07.)
- Endpoints: `GET /divisas/rates` (current official+parallel+timestamp), `GET /divisas/convert?usd=&to=VES`.

### PHASE 5 — Services Layer: KYC, Directory, Farm Map, Financing, Logistics
- **KYC verification** (`/verificacion`): submit Cédula/RIF + docs → admin review → flips `is_verified`. Endpoints: `POST /kyc`, `GET /kyc/:userId` (admin), `PATCH /kyc/:id` (approve/reject).
- **Professional directory** (`/directorio`): verified veterinarios, zootecnistas, inseminadores. `GET /directory?profession=&state=`, `POST /directory` (admin/verified).
- **Farm map** (`/mapa`): geo-located fincas. `GET /farms?state=`, `POST /farms` (producer).
- **Financiamiento** (`/financiamiento`) + **Logística/fletes** (`/logistica`): lead-capture + listing endpoints. Keep these as future-friendly stubs that persist requests.
- **WhatsApp Cloud API** notifications: bid alerts, auction status, KYC outcomes. Env: `AGROMERCADO_WHATSAPP_TOKEN`, `AGROMERCADO_WHATSAPP_PHONE_ID`. When unset, log-only (no send) — same disabled-by-default safety pattern as `EMAIL_AUTOSEND_DISABLED`.

### PHASE 6 — Digit2AI AI Layer (the differentiator) + Admin Dashboard
This is what Digit2AI adds on top of ISTC's marketplace. Build as MCP-style tool handlers + REST:
- **Intelligent listing/seller verification** (fraud reduction): score new listings/sellers; flag anomalies.
- **Real-time pricing & market trends**: aggregate `products` + closed `subastas` into per-category price indices. `GET /ai/market-trends?category_id=`.
- **Auction traceability**: immutable bid ledger per lot. `GET /ai/auction-trail/:auctionId`.
- **Continuous operational monitoring**: health + anomaly endpoint feeding the dashboard.
- **Admin/ops dashboard** at `public/agromercado/` (self-contained HTML/JS, full-bleed, Spanish, emoji-free): stat cards (listings, verified sellers, states, GMV), live auction monitor, KYC queue, FX widget, market-trend charts, fraud-flag review. Reuse the `#am-teaser` scoping + full-bleed pattern from `public/agromercado-teaser.html`.
- Optional voice: reuse the existing dedicated Lina ES agent pattern (see `reference_elevenlabs_agents` memory) — do NOT create a new agent unless asked.

---

## 3. Canonical Database Schema (PostgreSQL DDL — adapt to Sequelize models)

All tables: add `tenant_id INTEGER NOT NULL` + index. Prefix `am_`. Commit migration at
`verticals/agromercado/migrations/20260610_agromercado_tables.sql`.

```sql
CREATE TABLE am_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL,
  cedula_rif VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  role VARCHAR(15) CHECK (role IN ('admin','producer','buyer')) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cedula_rif)
);

CREATE TABLE am_products (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(20) NOT NULL,
  price_usd NUMERIC(12,2) NOT NULL,
  location_state VARCHAR(50) NOT NULL,
  vendor_id UUID REFERENCES am_users(id),
  condition VARCHAR(20),            -- nuevo/usado
  metadata JSONB,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_am_products_tenant ON am_products(tenant_id);
CREATE INDEX idx_am_products_metadata_gin ON am_products USING GIN (metadata);

CREATE TABLE am_auctions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(20) NOT NULL,
  lots INTEGER DEFAULT 1,
  start_price_usd NUMERIC(12,2) NOT NULL,
  current_bid_usd NUMERIC(12,2),
  base_increment_usd NUMERIC(12,2) NOT NULL DEFAULT 50,
  starts_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',  -- scheduled/live/closed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE am_bids (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  auction_id BIGINT REFERENCES am_auctions(id),
  bidder_id UUID REFERENCES am_users(id),
  amount_usd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_am_bids_auction ON am_bids(auction_id, created_at);

CREATE TABLE am_fx_rates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  bcv_ves NUMERIC(14,4) NOT NULL,
  parallel_ves NUMERIC(14,4),
  source VARCHAR(40),
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE am_kyc (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id UUID REFERENCES am_users(id),
  cedula_rif VARCHAR(20) NOT NULL,
  doc_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',  -- pending/approved/rejected
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE am_directory (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  profession VARCHAR(60) NOT NULL,     -- veterinario/zootecnista/inseminador
  state VARCHAR(50), certification VARCHAR(120),
  contact VARCHAR(120), is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE am_farms (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  owner_id UUID REFERENCES am_users(id),
  name VARCHAR(120), state VARCHAR(50),
  lat NUMERIC(9,6), lng NUMERIC(9,6),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE am_service_requests (   -- financiamiento + logistica leads
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL,          -- financiamiento/logistica
  requester_id UUID, payload JSONB,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Resilience & Field Performance (carry over ISTC's design intent)
- **Offline-first**: dashboard caches product catalog + daily FX via Service Worker (CacheStorage); queue writes in IndexedDB for deferred sync when signal returns.
- **Media**: validate uploads, compress to WebP, mobile-optimized resolutions.
- **Mobile-first**, ultra-low latency, robust to rural connectivity.

---

## 5. CI/CD & Deploy
- Build in the RinglyPro-CRM repo; deploy via push to `main` → Render auto-deploy (~90s).
- Health: `GET /agromercado/health`; debug: `GET /debug/agromercado-error`.
- Commit per phase with descriptive messages; verify live (curl) before next phase.

---

## 6. Environment Variables (document in CLAUDE.md when added)
- `AGROMERCADO_JWT_SECRET` — JWT signing for am_users cookies (fallback `JWT_SECRET`).
- `AGROMERCADO_WHATSAPP_TOKEN` / `AGROMERCADO_WHATSAPP_PHONE_ID` — WhatsApp Cloud API (unset = log-only).
- `AGROMERCADO_FX_SOURCE_URL` — optional override for BCV/parallel fetch.
- `AGROMERCADO_SEED_DEMO` — `1` seeds demo categories/products/auctions for one tenant; default unset = no seed.

---

## 7. Success Criteria (per-phase REVIEW gate — loop until PASS)
1. `/agromercado/health` returns 200; tables auto-created.
2. Auth: register/login/me/logout work for all 3 roles; cookie is HttpOnly+Secure; KYC flips `is_verified`.
3. Products: 8 categories list; JSONB metadata filterable via GIN; tenant isolation verified (no cross-tenant leakage).
4. Auctions: concurrent bids are ACID-safe; server recomputes `P_min` with the ln formula and rejects under-bids; Socket.IO broadcasts to the lot room.
5. FX: poller writes `am_fx_rates` twice daily; convert endpoint returns USD→VES with fallback when source down.
6. AI layer: market-trends + fraud-flag + auction-trail endpoints return; admin dashboard renders full-bleed Spanish, no emojis.
7. Every endpoint requires/filters `tenant_id`. No secrets in client. No invented stats — counts come from DB.

---

## 8. Build Order (the loop)
```
Phase 1 Auth  → deploy → verify → 
Phase 2 Products+Categories → deploy → verify →
Phase 3 Auctions+bids → deploy → verify →
Phase 4 FX/divisas → deploy → verify →
Phase 5 KYC/Directory/Map/Financing/Logistics+WhatsApp → deploy → verify →
Phase 6 AI layer + Admin dashboard → deploy → verify → DONE
```
On any failure: capture from `/debug/agromercado-error`, root-cause, fix, redeploy, re-verify. Do not stop to ask.
```
```

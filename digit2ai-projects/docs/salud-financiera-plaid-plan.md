# Salud Financiera: Bank of America via Plaid (read-only)

Status: PLAN, waiting for owner approval. No code has been written.
Date: 2026-10-26. Sources: plaid.com/docs, read the same day. Each claim cites its URL.

---

## 1. Research (Phase 1)

### 1.1 Plan and cost
- **The free Trial plan replaced Limited Production.**
  - It applies to teams created on or after 15/16 Apr 2026.
  - It allows **10 Production Items**.
  - An Item is one bank LOGIN, not one account. One BofA login with checking and a card is ONE Item.
  - https://plaid.com/docs/changelog/ · https://plaid.com/docs/quickstart/glossary/
- **Removing an Item does NOT give its slot back.** Every new link uses a slot permanently, so duplicate links count too.
  - https://plaid.com/docs/account/billing/ · https://plaid.com/docs/api/items/
- **Transactions is included in Trial.** https://plaid.com/docs/account/billing/
- **Recurring Transactions on Trial is UNCLEAR.**
  - The API reference calls it an add-on that "requires a product access request".
  - Trial pages say you cannot request other products.
  - **Check the Dashboard > Products page before relying on it.** https://plaid.com/docs/api/products/transactions/
- **How long Trial lasts: not stated in the docs.**
- **What becomes paid:**
  - After an upgrade, Transactions is billed per Item per month for as long as an access_token exists, even with no API calls.
  - `/transactions/refresh` is billed per call.
  - **We will not call `/transactions/refresh`.**
  - https://plaid.com/docs/account/billing/
- **Bank of America works on Trial without the OAuth paperwork** (display profile, security questionnaire). That paperwork is needed only at upgrade. https://plaid.com/docs/link/oauth/

### 1.2 Bank of America specifics
- **The old BofA API is retired.** The migration to the new BofA API ended 15 Oct 2026, and items that were not migrated are now ITEM_LOGIN_REQUIRED. A new link uses the new API. https://plaid.com/docs/link/oauth/
- **Consent lasts 12 MONTHS from link, or from the last update-mode renewal.** `/item/get` returns `consent_expiration_time`. https://plaid.com/docs/changelog/ · https://plaid.com/docs/api/items/
- **Warning webhook for US banks: `PENDING_DISCONNECT`, sent 7 days before.** The reason is `INSTITUTION_TOKEN_EXPIRATION`, with a `disconnect_time`.
  - **`PENDING_EXPIRATION` is UK/EU only and will not fire for BofA**, unlike what the brief assumed.
  - https://plaid.com/docs/api/items/
- **No 180-day inactivity expiry is documented.** A daily sync does not keep the link alive; only the 12-month consent matters.
- **Renewing consent uses Link update mode:**
  - Create a link token with the existing `access_token` and empty `products`.
  - The same access token and the same Item are kept, so **no new slot** is used.
  - The update-mode token expires in 30 minutes.
  - It can be run early, before any webhook arrives.
  - https://plaid.com/docs/link/update-mode/
- **redirect_uri:**
  - https, registered in the Dashboard, no query string or #.
  - **Not required on desktop web.** Recommended for mobile web.
  - https://plaid.com/docs/link/oauth/

### 1.3 /transactions/sync
- **Cursors:**
  - The first call has no cursor. Every later call sends `next_cursor`.
  - A cursor is valid for at least 1 year.
  - `count` can be up to 500.
  - https://plaid.com/docs/api/products/transactions/
- **Response:** `added`, `modified`, `removed`, `has_more`, `transactions_update_status`.
- **Paging rule:** fetch ALL pages before writing anything. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, restart from the first cursor. https://plaid.com/docs/transactions/sync-migration/
- **Pending to posted:**
  - The pending id arrives in `removed`.
  - The posted transaction arrives in `added` with `pending_transaction_id`.
  - Posting usually takes 1-5 business days, at most 14. Some pending transactions never post.
  - https://plaid.com/docs/transactions/transactions-data/
- **History:**
  - `days_requested` defaults to 90, max 730.
  - **It is set at the first Link and cannot be raised later.**
  - **Recurring detection wants at least 180 days.**
  - https://plaid.com/docs/api/link/
  - How many days BofA actually returns: not documented.
- **Freshness:** Plaid checks the bank **1 to 4 times a day**, so a purchase shows up hours later, not instantly. https://plaid.com/docs/transactions/

### 1.4 Webhooks
- **`SYNC_UPDATES_AVAILABLE`:**
  - It fires only AFTER the first `/transactions/sync` call.
  - It carries `initial_update_complete` and `historical_update_complete`.
  - https://plaid.com/docs/transactions/webhooks/
- **Others:**
  - `RECURRING_TRANSACTIONS_UPDATE`.
  - The ITEM webhooks: `ERROR` (ITEM_LOGIN_REQUIRED), `LOGIN_REPAIRED`, `PENDING_DISCONNECT`, `NEW_ACCOUNTS_AVAILABLE`, `USER_PERMISSION_REVOKED`.
  - https://plaid.com/docs/api/items/
- **Verification** (https://plaid.com/docs/api/webhooks/webhook-verification/):
  - The `Plaid-Verification` header is a JWT, alg **ES256** only.
  - Get the key with `/webhook_verification_key/get` (by `kid`).
  - Reject if `iat` is older than 5 min.
  - Take SHA-256 of the **raw body bytes**, compare it in constant time with `request_body_sha256`.
- **Delivery** (https://plaid.com/docs/api/webhooks/):
  - Answer 2xx within **10 s**.
  - Retries run for 24 h.
  - Expect duplicates and webhooks out of order.
  - Plaid sends from fixed IPs (listed in docs, "subject to change").

### 1.5 /transactions/recurring/get
- Needs Transactions already initialised on the Item. Call it after history has arrived.
- Fields:
  - `frequency`: WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, ANNUALLY, UNKNOWN.
  - `status`: MATURE (3+ hits, 2 for annual), EARLY_DETECTION, TOMBSTONED, UNKNOWN.
  - Also `is_active`, `average_amount`, `last_amount`, `predicted_next_date`, `personal_finance_category`.
- Can be called any time; also listen for `RECURRING_TRANSACTIONS_UPDATE`.
- Source: https://plaid.com/docs/api/products/transactions/
- **It is an add-on, so it may not be available on Trial (see 1.1).**

### 1.6 Personal Finance Categories v2
- Released Dec 2025 with two levels, `primary` and `detailed`.
- Request it with `options.personal_finance_category_version: "v2"`.
- Teams created after 3 Dec 2025 get v2 by default.
- Taxonomy: https://plaid.com/documents/pfc-taxonomy-all.csv · https://plaid.com/docs/transactions/pfc-migration/

### 1.7 Security / Link token
`/link/token/create` (https://plaid.com/docs/api/link/):
- `client_name` at most 30 characters.
- `language: 'es'`.
- `country_codes: ['US']`.
- `user.client_user_id`, which must not contain personal data.
- `products: ['transactions']`. **You are billed for every product listed.**
- `transactions.days_requested`.
- `webhook`.
- `/item/remove` ends billing and kills the token. https://plaid.com/docs/api/items/
- Node SDK: `plaid` on npm, latest 49.0.0 (from npm, not from Plaid docs).

### 1.8 Gotchas (where the docs differ from the brief)
1. **The BofA warning is `PENDING_DISCONNECT`, not `PENDING_EXPIRATION`.**
2. **There is no documented 180-day inactivity expiry.** The daily sync is a backup for missed webhooks, not a keep-alive. The real limit is a 12-month re-consent, done once a year in update mode.
3. **Trial counts bank LOGINS (Items), not accounts, and removing one does not free its slot.**
   - Test in Sandbox, never by re-linking BofA over and over.
   - Re-consent must use update mode, never a fresh link.
4. **Recurring Transactions may not be enabled on Trial.**
   - You need to check the Dashboard.
   - If it is not there, we use our own deterministic detector (section 3.6), labelled as ours.
5. **`days_requested` is set once.** Ask for **730** (needed for good recurring detection; it costs nothing extra).
6. **The webhook needs the raw body.**
   - `src/app.js` runs a global `express.json()` before `/projects`, so the webhook path must get `express.raw()` registered ABOVE it (the same pattern as `/planea/quote/stripe/webhook`).
7. **Cloudflare sits in front of aiagent.ringlypro.com.**
   - A bot or challenge rule could block Plaid's POSTs.
   - If deliveries fail, allow Plaid's IPs. The daily sync covers the gap meanwhile.
8. **Not real time.** Plaid refreshes 1-4 times a day. The paid `/transactions/refresh` is deliberately not used.
9. **Some pending transactions never post.** They come in `removed` and must be deleted from the app.

---

## 2. Current app (Phase 2, read from the code)

| Piece | What it is |
|---|---|
| Framework | Express sub-app `digit2ai-projects`, mounted at `/projects` from `src/app.js` (line ~3529). Global `express.json({limit:'500mb'})` runs before it (line 99). |
| Auth | Hub JWT (`authenticateToken`), then `ownerOnly` in `src/routes/saludFinanciera.js`: user id 97 + owner email, everyone else gets 404. |
| DB | Hub Postgres (Sequelize via `digit2ai-projects/src/models`). Tables `sf_*`, schema in `migrations/019_salud_financiera.sql`, applied idempotently on first use. |
| Movements | `sf_movimientos`: `fecha, concepto, tipo ingreso/egreso, monto>0, monto_real, categoria (CHECK list), origen plan/real, estado pendiente/cumplido, nota`. Plan rows = the owner's plan; real rows = what happened. |
| Categories | Fixed list: `ahorro, salario, ingreso_extra, inversion, corte, pago_lina, hija, gasto_semanal, gasto_personal, servicios, otro`. |
| Manual entry | "Agregar movimiento" modal → `POST /movimientos` (always `origen='real'`). Edit/delete/mark done → `PATCH/DELETE /movimientos/:id`. Lina writes the same way, logged in `sf_cambios` for undo. |
| Engine | `services/saludFinanciera/engine.js` builds the ledger, projection and health from these rows. Integer cents. |
| Secrets pattern | AES-256-GCM helpers already exist (`src/services/emailReconcile.js`, `tenantSecrets.js`). |
| Background jobs | `setInterval` pollers started in the Hub (`architectPipeline`, `inboxDigest`). |

**How imported and manual rows coexist, without duplicates:**
- Every imported row carries `plaid_transaction_id` (UNIQUE), so re-syncs only upsert.
- A real manual row is never duplicated: when an import matches one (same type, same amount, date within 3 days, not linked yet), it **links** to that row instead of inserting.
- A pending **plan** row that matches (same amount, date within 5 days) is marked `cumplido` with `monto_real` = the bank amount. This is logged in `sf_cambios`, so it can be undone.

---

## 3. Design (Phase 3)

### 3.1 Flow
```
BofA --> Plaid --(webhook SYNC_UPDATES_AVAILABLE, signed)--> /projects/api/salud-financiera/plaid/webhook
                                                              | verify JWT + body hash, store, 200 (<1s)
                                                              v
                                              background job: /transactions/sync (all pages)
                                                              | upsert by transaction_id, remove, pending->posted
                                                              v
                                                   sf_movimientos (fuente='plaid')  -> engine -> panel
Daily 06:00 ET job: same sync (backup) + /item/get (consent date) + recurring
```
**Nothing is ever written to the bank.** Only `transactions` is requested; no Auth, Transfer, Identity or Signal.

### 3.2 Screens
- **Connect Bank of America** button (Settings card on the Salud Financiera page): opens Plaid Link in Spanish. The server swaps `public_token` for `access_token`.
- **Accounts list** with a switch per account: "contar en mi salud financiera". See the decision in 3.9.
- **Status line:** last sync, next consent expiry date, transactions imported.
- **Reconnect banner** on login required, on `PENDING_DISCONNECT`, or 30 days before `consent_expiration_time`. It opens Link in update mode.
- **Disconnect** button: calls `/item/remove`, deletes the token, keeps the imported rows. It warns that on Trial the slot is not returned.
- **Subscription alerts card:** "Nueva suscripción: Netflix $15.49/mes" / "Cambió de monto: Spotify $11.99 → $12.99". Each alert opens the movement or can be dismissed. No email, no SMS.

### 3.3 Schema (new, all `tenant_id NOT NULL`, named indexes)
```sql
-- one row per bank login (Item)
CREATE TABLE sf_plaid_items (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL,
  item_id TEXT NOT NULL UNIQUE, institution_id TEXT, institution_name TEXT,
  access_token_enc TEXT NOT NULL,           -- AES-256-GCM, never selected by any read route
  cursor TEXT,                              -- /transactions/sync next_cursor
  estado TEXT NOT NULL DEFAULT 'activo',    -- activo | login_requerido | por_desconectar | desconectado
  consent_expira TIMESTAMPTZ, ultimo_sync TIMESTAMPTZ, ultimo_error TEXT,
  historial_completo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE sf_plaid_accounts (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL, item_id TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE, nombre TEXT, mask TEXT, tipo TEXT, subtipo TEXT,
  incluir BOOLEAN NOT NULL DEFAULT TRUE);
-- webhook inbox: store first, process later; dedupe on hash
CREATE TABLE sf_plaid_webhooks (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, item_id TEXT, tipo TEXT, codigo TEXT,
  cuerpo_sha256 TEXT NOT NULL UNIQUE, payload JSONB, procesado_at TIMESTAMPTZ, error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- recurring streams (Plaid's, or our own detector when Plaid's is not available)
CREATE TABLE sf_plaid_recurrentes (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL,
  stream_id TEXT NOT NULL UNIQUE, fuente TEXT NOT NULL,       -- plaid | detector
  direccion TEXT NOT NULL, descripcion TEXT, comercio TEXT, frecuencia TEXT, status TEXT,
  activo BOOLEAN, monto_promedio NUMERIC(12,2), monto_ultimo NUMERIC(12,2), proxima_fecha DATE,
  categoria TEXT, visto_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE sf_alertas (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL,
  tipo TEXT NOT NULL,                       -- nueva_suscripcion | cambio_monto | reconectar
  ref TEXT, texto TEXT NOT NULL, leida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- category overrides: merchant or PFC detailed -> our category (manual wins)
CREATE TABLE sf_categoria_reglas (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL,
  clave TEXT NOT NULL,                      -- 'merchant:netflix' | 'pfc:FOOD_AND_DRINK_RESTAURANT'
  categoria TEXT NOT NULL, UNIQUE (user_id, clave));
-- sf_movimientos gains:
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'manual'; -- manual|plaid
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS plaid_account_id TEXT;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS pendiente_banco BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS comercio TEXT;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS pfc TEXT;               -- detailed PFC v2
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS categoria_manual BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS sf_mov_plaid_tx_uq ON sf_movimientos (plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
```

### 3.4 Sync rules (deterministic, all in one module `services/saludFinanciera/plaidSync.js`)
- **Paging:** fetch every page into memory, then write everything in ONE DB transaction, then save `next_cursor` in that same transaction. On a mutation-during-pagination error, restart from the stored cursor.
- **Amount sign:** Plaid `amount > 0` = money out → `egreso`. `< 0` → `ingreso`. `monto` = absolute value. `concepto` = merchant_name or name.
- **added:**
  - Skip it if its account has `incluir = false`.
  - If `pending_transaction_id` matches an existing row, update that row in place (pending to posted, same row, no duplicate).
  - Else, if it matches an unlinked manual real row (same tipo, amount, date ±3 days), link to it.
  - Else insert a new row: `origen='real'`, `fuente='plaid'`, `pendiente_banco=pending`.
  - Then try the plan match: a plan pending row with the same tipo and amount, date ±5 days, becomes `cumplido`, logged and undoable.
- **modified:** update amount, date, name and pending. Keep the category if `categoria_manual = true`.
- **removed:** delete the row if it is a Plaid row that has not been posted.
- **Category:** a manual rule wins, then the PFC map (3.5), else `otro`. A category change in the edit modal sets `categoria_manual` and offers "aplicar a este comercio siempre", which writes a rule.

### 3.5 PFC v2 → Salud Financiera (starting map; editable as rules)
| PFC v2 | Ours |
|---|---|
| INCOME_* (salary, wages) | salario |
| other INCOME_*, TRANSFER_IN_* from outside | ingreso_extra |
| LOAN_PAYMENTS_CREDIT_CARD_PAYMENT | corte |
| RENT_AND_UTILITIES_* , subscriptions/telecom | servicios |
| FOOD_AND_DRINK_*, ENTERTAINMENT_*, GENERAL_MERCHANDISE_*, PERSONAL_CARE_*, TRAVEL_*, TRANSPORTATION_* | gasto_personal |
| TRANSFER_OUT_* to investment / savings | inversion / ahorro |
| anything else | otro |
Exact v2 detailed codes will be taken from https://plaid.com/documents/pfc-taxonomy-all.csv at build time, never guessed.

### 3.6 Subscriptions and recurring charges
- **If Recurring is enabled:**
  - Call `/transactions/recurring/get` once history is complete, on `RECURRING_TRANSACTIONS_UPDATE`, and daily.
  - A new `outflow` stream with status MATURE or EARLY_DETECTION and `is_active` → alert "nueva suscripción".
  - A `last_amount` different from the previous stored value → alert "cambió de monto".
- **If it is not enabled:**
  - Our own detector: same merchant, at least 3 charges about monthly (26-35 days apart), amount within 10%.
  - Stored as `fuente='detector'` and labelled "detectado por la app" in the UI.
- Alerts appear on a card in the panel and in the Neural Intelligence text. **Nothing is sent outside the app.**

### 3.7 Security
- The access token is encrypted with AES-256-GCM under `SALUD_FINANCIERA_PLAID_KEY`.
  - It is decrypted only inside `plaidClient.js` at call time.
  - It is never returned, logged or put in an error message.
  - No Lina/cerebro tool can reach it. The SIT greps that `cerebro.js`, `lina.js` and every route response never touch `access_token`.
- **Webhook checks:** ES256 JWT, cached JWK by `kid` (refetched on an unknown kid), `iat` ≤ 5 min, SHA-256 of the raw body compared in constant time. Anything else gets 400 and nothing is stored.
- **Webhook route:** public but useless without a valid Plaid signature. It answers 200 at once and processes in the background, deduped on the body hash.
- **Owner only:** all other Plaid routes sit behind the existing owner gate (404 for anyone else).
- **What can never happen:** no `/transfer`, `/auth`, `/identity`, `/processor` or payment call exists anywhere. The SIT greps for them.

### 3.8 Endpoints
Owner-only, under `/projects/api/salud-financiera/plaid/*`:
- `POST /link-token` creates a new-link token (`products:['transactions']`, `days_requested:730`, `language:'es'`, webhook URL).
- `POST /exchange {public_token}`: exchange, store the encrypted token, load accounts, first sync.
- `POST /update-token` creates an update-mode token for re-consent.
- `GET /estado`: items, accounts, last sync, consent expiry, alerts. Never a token.
- `PATCH /cuentas/:id {incluir}`.
- `POST /sync` runs a sync now (owner button).
- `DELETE /item/:id` calls `/item/remove` and deletes the token row.
- `GET|PATCH /alertas`.

Public: `POST /projects/api/salud-financiera/plaid/webhook`, Plaid signature required, with `express.raw` registered above the global JSON parser in `src/app.js`.

### 3.9 Decisions I need from you
1. **Which accounts count?**
   - Recommended: **checking only**. Your plan already pays the card as "Corte".
   - Importing the card too would count every purchase twice: once on the card, once as the corte payment.
   - The card can still be linked and viewed, just with `incluir = false`.
2. **Auto-mark plan rows as done?** Recommended: **yes**, when the bank shows the same amount within ±5 days, with undo in the log.
3. **Count pending bank transactions in the balance?** Recommended: **yes**, marked "pendiente", replaced when posted.
4. **History:** recommended **730 days** (the maximum, set once). Old imported rows before your plan's start can be hidden from the table.

### 3.10 Environment variables
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox` | `production`). Unset = the Connect button shows "no configurado".
- `PLAID_WEBHOOK_URL`: default `https://aiagent.ringlypro.com/projects/api/salud-financiera/plaid/webhook`.
- `PLAID_REDIRECT_URI`: optional, only if you will link from a phone browser. It must also be registered in the Plaid Dashboard.
- `SALUD_FINANCIERA_PLAID_KEY`: 32+ random characters. **Rotating it makes the stored token unreadable;** that is reported, and you would reconnect.
- `SALUD_FINANCIERA_PLAID_SYNC`: `on`/`off` for the daily job (production only by default).

### 3.11 Rollout
1. **Build against Sandbox.** The SIT uses a fake Plaid with zero keys, plus Sandbox `user_good` and `/sandbox/item/fire_webhook`.
2. **Tests:** dedupe (re-sync inserts nothing), pending to posted on the same row, removed pending deleted, a bad or old or tampered webhook rejected, ITEM_LOGIN_REQUIRED showing the banner, update-mode token, no token in any response, no forbidden product call.
3. **You do in the Plaid Dashboard:**
   - Confirm the Trial plan.
   - Check whether **Recurring Transactions** is listed under Products.
   - Get production keys.
   - Set the webhook to allow our URL; optionally register a redirect URI.
4. **You set the env vars on Render.** I switch `PLAID_ENV=production`. You connect BofA **once** (it uses 1 of 10 slots), I verify the import and subscriptions.
5. **Runbook** (reconnect, rotate keys, disconnect, sync stopped) goes into CLAUDE.md.

**Estimate:** about 3 working days of build plus SIT, then the live BofA check with you.

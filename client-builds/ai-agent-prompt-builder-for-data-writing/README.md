# AI Agent Prompt Builder for Data Writing

A form wizard that turns a structured agent definition — name, role, goal, data sources, instructions, constraints, output schema — into a valid JSON prompt payload, with a live preview that updates on every keystroke and a copy/download/save at the end. Six seeded templates (extract, validate, classify, enrich, summarize, format) load into the wizard as starting points, so the stated success metric — a complete agent exported as valid JSON in under ten minutes — is met by editing a template rather than starting from an empty form. It **assembles** payloads and deliberately does not execute them: there is no model SDK in this directory and SIT fails the build if one appears.

## Run

```bash
# SIT — 84 checks, zero external keys, green on Postgres or the in-memory fallback
node client-builds/ai-agent-prompt-builder-for-data-writing/sit.js

# Live (auto-mounted by src/app.js; no main-app edit)
open https://aiagent.ringlypro.com/ai-agent-prompt-builder-for-data-writing/
```

## Surface

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | public | `{status, service, version, storage}` — awaits the DB handshake so the backend it names is the one actually live |
| `GET /` | public | the wizard (`#json-preview`) |
| `GET /gallery` | public | the template gallery |
| `GET /api/v1/templates` | public | JSON array of the 6 seeded templates |
| `GET /api/v1/templates/:slug` | public | one template, wizard-shaped |
| `POST /api/v1/agents/generate` | public | pure assembly → `{agent, instructions, output_schema, system_prompt, …}` |
| `POST/GET/PUT/DELETE /api/v1/agents` | **JWT** | saved definitions, tenant-scoped |
| `GET /api/v1/i18n?lang=` | public | UI string dictionary (`en`; `es` stub falls back per key) |

## Things worth not undoing

- **The browser runs the server's own `lib/promptBuilder.js`.** `GET /promptBuilder.js` wraps that exact file in a CommonJS shim, so the live preview, the clipboard, the downloaded file and `POST /generate` cannot drift. Hand-porting it to the frontend reintroduces exactly the drift this avoids. Safe only because `promptBuilder.js` is pure with zero `require`s — keep it that way.
- **Schema comes from the idempotent SQL, not `sequelize.sync()`.** The table names are 47 and 50 characters; `sync()` generates index names from them that truncate at Postgres's 63-character identifier limit and collide with the previous boot's, throwing on every restart after the first and pinning the app in its in-memory fallback. The migrations use short explicit index names and `IF NOT EXISTS` throughout.
- **`tenant_id` is in the `WHERE` clause, never an assertion afterwards.** A cross-tenant id reads as 404, and a body-supplied `tenant_id` never overrides the JWT claim. SIT asserts both, plus cross-tenant read/update/delete.
- **Auth verifies against `JWT_SECRET`; it signs nothing.** `lib/auth.js` deliberately does not import `src/middleware/auth.js`, which pulls the CRM's models and credit system in at require-time — a client build that hard-fails on an unrelated import takes itself off the air for no benefit. Same pattern as `retail-out-of-stock-intelligence-platfor`.
- **Nothing user-authored is logged.** `logShape()` in `routes/agents.js` emits ids, counts and lengths only; instructions and schemas never reach stdout.
- **An invalid output schema is flagged, not swallowed.** It comes back under `output_schema._raw` with a `warnings[]` entry, so the preview can say the schema is broken instead of quietly exporting `{}`.
- **The gallery re-seeds on every boot via `ON CONFLICT DO UPDATE`,** keyed on the `UNIQUE (tenant_id, slug)` index — editing template copy and redeploying updates it in place rather than stacking duplicates. Seeded rows are owned by tenant 0 (the shared/system tenant); reads return tenant 0 plus the caller's, so user-authored templates slot in later with no migration.

## Storage

Postgres primary (`DATABASE_URL` / `CRM_DATABASE_URL`), degrading to in-memory Maps behind an identical interface if the URL is absent or the handshake fails. `/health` names which is live, so degraded mode is never silent. Copy and download never touch the database at all — the user's deliverable is the JSON in the preview pane.

Tables: `ai_agent_prompt_builder_for_data_writing_agents`, `ai_agent_prompt_builder_for_data_writing_templates`.

## Environment

No new variables. Reuses `DATABASE_URL` and `JWT_SECRET`.

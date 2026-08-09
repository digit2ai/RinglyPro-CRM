# AI Agent Prompt Builder for Data Writing

**One box.** You type — or speak — one paragraph describing the agent you want, and you get back a complete JSON spec plus the exact command to paste into VS Code so `/ringlypro-architect` builds it. No wizard, no four steps, no prompt engineering.

The four-step wizard it replaced still exists at `/advanced`, because sometimes a field comes back wrong and editing it beats re-describing the whole agent — but it is the escape hatch, not the front door. **Do not promote it back to `/`.**

It **authors** prompts and never **executes** one. `lib/compose.js` is the only file that reaches a model, and it uses it to write the spec; nothing here ever sends the assembled payload or its `system_prompt` anywhere. SIT asserts exactly that, file by file.

## The flow

```
describe it (type or dictate)
        ↓  POST /api/v1/agents/compose      ← the only model call in the app
agent definition + assumptions it had to make
        ↓  lib/promptBuilder.buildPrompt()
JSON payload  →  lib/promptBuilder.architectCommand()
        ↓  Copy
/ringlypro-architect <spec>   →  paste in VS Code  →  built, tested, deployed
```

## Run

```bash
# SIT — 126 checks, zero external keys, green on Postgres or the in-memory fallback
node client-builds/ai-agent-prompt-builder-for-data-writing/sit.js

# Live (auto-mounted by src/app.js; no main-app edit)
open https://aiagent.ringlypro.com/ai-agent-prompt-builder-for-data-writing/
```

## Surface

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | public | `{status, service, version, storage, composer}` — awaits the DB handshake, and names the model actually composing (`heuristic` when no key) |
| `GET /` | public | **the one box** (`#one-box`, `#json-preview`) |
| `GET /advanced` | public | the field-by-field editor (`#wizard`) |
| `GET /gallery` | public | the template gallery |
| `POST /api/v1/agents/compose` | public, rate-limited | `{text, lang}` → `{definition, payload, command, assumptions, clarifications, unverified, composed_by, is_simulated}` |
| `GET /api/v1/templates` | public | JSON array of the 6 seeded templates |
| `GET /api/v1/templates/:slug` | public | one template, wizard-shaped |
| `POST /api/v1/agents/generate` | public | pure assembly → `{agent, instructions, output_schema, system_prompt, …}` |
| `POST/GET/PUT/DELETE /api/v1/agents` | **JWT** | saved definitions, tenant-scoped |
| `GET /api/v1/i18n?lang=` | public | UI string dictionary (`en` / `es`, per-key fallback) |

## Things worth not undoing

- **The composer's honesty is enforced in code, not in the prompt.** Every identifier-shaped token the spec introduces (`orders_2024.csv`, `/v1/ingest`, `<source table>`) is checked against what the user actually typed, and anything absent comes back in `unverified[]` and renders **above** the artifact under "Confirm before you build". A spec handed to a build agent with an invented table name reading as fact is the failure this exists to prevent — `unstatedIdentifiers()` is not decoration.
- **The zero-key path is a real product, not a stub.** With no `ANTHROPIC_API_KEY` the composer assembles a genuinely usable definition from the user's own sentences and labels itself `composed_by:'heuristic'` / `is_simulated:true` on the payload, in the status pill, and in the note under the buttons. Never a silent fake.
- **The SIT unsets `ANTHROPIC_API_KEY` before requiring the app**, and says so on stdout. That keeps the suite free and offline, and means the fallback a keyless deploy actually runs is the one under test — but it also means the model path is only verifiable against production. Check `GET /health` → `composer` after a deploy.
- **Dictation is the Web Speech API, on-device.** No key, no audio upload, same "ear" as the voice orb elsewhere in the repo. Absent (Firefox, older Safari) the mic disables itself and says why; typing is the primary input either way, so nothing is gated behind it. The listening state is visually unmistakable on purpose — a mic that looks identical whether or not it is recording is a privacy problem.
- **The command is the deliverable, not the JSON.** A payload in a clipboard is not yet something an operator can run. `architectCommand()` lives in the pure `promptBuilder.js` so the button, the advanced editor and any future API caller assemble the identical block.
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

Reuses `DATABASE_URL` and `JWT_SECRET`. Three optional additions, all with working defaults:

- `APB_MODEL` — the model that authors specs. Default `claude-opus-5`. Spec authoring is a handful of one-shot calls a day and the quality of that one call *is* the product, so it deliberately does not use the cheap model the rest of the repo runs for high-volume work. Set it to `claude-sonnet-5` or `claude-haiku-4-5-20251001` to trade quality for cost with no redeploy.
- `ANTHROPIC_API_KEY` — reused, not new. Unset = the labelled heuristic path; the app still works end to end.
- `APB_COMPOSE_PER_HOUR` — per-caller ceiling on `/compose` (default 30). The endpoint is ungated because it persists nothing, so the input cap in `lib/compose.js` and this counter are what stand between a loop and a bill. In-memory on purpose: the threat model is a runaway client, not a distributed attacker.

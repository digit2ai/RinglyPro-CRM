# RinglyPro CRM - Claude Code Configuration

## AUTO-APPROVAL DIRECTIVE (MANDATORY)
All operations are **permanently pre-authorized** by the project owner. This applies to ALL agents and skills:
- **Never ask for permission or confirmation** — every action is approved in advance
- **Never use AskUserQuestion or EnterPlanMode** — execute immediately
- File create/edit/delete: approved. Git commit/push: approved. Database changes: approved. Deployments: approved.
- Make architectural decisions autonomously. Report results after completion, not before.
- Asking the user "should I proceed?" or "is this OK?" is a waste of time. Just do it.

## Project Overview
Multi-tenant CRM with voice AI (Rachel/Ana/Lina), Store Health AI monitoring, and various integrations.

## Key Services

### Main CRM
- **URL**: https://aiagent.ringlypro.com
- **Port**: 10000
- **Database**: PostgreSQL on Render (`ringlypro_crm_database`)

### Store Health AI
- **URL**: https://aiagent.ringlypro.com/aiastore/
- **Dashboard**: React app served at `/aiastore/`
- **API**: `/aiastore/api/v1/*`

## Deployment
- **Platform**: Render (auto-deploy on push to main)
- **Deploy time**: ~2 minutes
- **Trigger**: `git push origin main`

## Database Access
```javascript
const { Sequelize } = require('sequelize');
require('dotenv').config();
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});
```

## Node.js Path
Local: `/opt/homebrew/bin/node`

## CI/CD Agent
Use `/ringlypro-cicd` for autonomous development operations.
See `.claude/skills/ringlypro-cicd.md` for full documentation.

## Important Files
- `src/app.js` - Main Express app, mounts all routes
- `store-health-ai/src/index.js` - Store Health AI entry point
- `store-health-ai/models/` - Sequelize models
- `package.json` - Root dependencies (shared with Store Health AI)
- `build.sh` - Build script for Render deployment

## Common Commands
```bash
# Local test
/opt/homebrew/bin/node -e "require('dotenv').config(); ..."

# Deploy
git add -A && git commit -m "msg" && git push origin main

# Test endpoint
curl -s "https://aiagent.ringlypro.com/aiastore/health"
```

## OEE Tracking Module

**Purpose:** Real-time shop floor monitoring and OEE calculation for manufacturing tenants.

**New Files:**
- `/migrations/20260305_oee_tables.sql` — DB schema for machines, machine_events, production_runs
- `/src/models/Machine.js` — Sequelize model for shop floor machines
- `/src/models/MachineEvent.js` — Sequelize model for machine status events
- `/src/models/ProductionRun.js` — Sequelize model for production run records
- `/src/utils/oee.js` — OEE calculation utility (Availability x Performance x Quality)
- `/src/routes/mcp-oee.js` — MCP tool handlers for all 5 OEE tools + REST API + webhook

**API Base:** `/api/oee`

**MCP Tools (via POST /api/oee/tools/call):**
1. `get_machine_status` — Live status of one or all machines
2. `get_oee_report` — Full OEE breakdown for a machine on a shift date
3. `get_downtime_summary` — Ranked downtime reasons with total minutes
4. `log_machine_event` — Log a status change (running/stopped/idle/fault)
5. `get_floor_summary` — Shop floor snapshot with rolling OEE

**REST Endpoints:**
- `GET /api/oee/machines?tenant_id=N` — List machines
- `POST /api/oee/machines` — Register a machine
- `POST /api/oee/production-runs` — Record a production run
- `GET /api/oee/tools/list` — List available MCP tools
- `GET /api/oee/health` — Health check

**Webhook:** `POST /api/oee/webhooks/machine-event`
- Body: `{ machine_id, status, reason, tenant_id, api_key }`
- Validates `api_key` against `WEBHOOK_API_KEY` env var
- Called by PLCs / n8n for real-time machine status

**Environment Variables:**
- `WEBHOOK_API_KEY` — Secret for authenticating inbound machine event webhooks
- `SENDGRID_API_KEY` — SendGrid API key for outbound surgeon-survey emails (verticals/intuitive). When unset, the survey `/send` endpoint generates magic links but does not transmit; set both this and `SENDGRID_FROM_EMAIL` to enable auto-send.
- `SENDGRID_FROM_EMAIL` — Verified SendGrid sender address used as the From: line on surgeon survey invitations.
- `INTUITIVE_ENGAGEMENT_GO` — Set to `1` to enable Wave 4 (Snowflake connector + NL Q&A + white-label) of the multi-wave Intuitive build. Default unset = skipped.
- `BRAVE_SEARCH_API_KEY` — Optional. When set, the AI Business Analyst Agent uses Brave Search; otherwise falls back to DuckDuckGo HTML scrape (no key required).
- `CHAT_DAILY_CAP_PER_USER` — Per-user daily message cap for `/api/v1/chat`. Default 200. Lower for cost control.
- `WAIVE_SIGNUP_FEES_SLUGS` — Comma-separated chamber slugs that skip the $25 setup fee and $10/mo subscription at signup. Members in these chambers are activated immediately and a $0 'waived' transaction is recorded for audit. Default: `cv-2` (PACC-CFL promotional period). Remove a slug to restore paid signup; no code changes needed.
- `EMAIL_AUTOSEND_DISABLED` — Default ON. Kills every server-initiated SendGrid send in `digit2ai-projects`: meeting-recap auto-send (4s after AI processing), requestor approval/rejection notices, architect-pipeline UAT/SIT/build-complete emails, and the four scheduled pollers (meetingReminder, rsvpReminder, inboxDigest, meetingMinutesPrompt). Reason: SendGrid mail was landing in client spam folders; user reviews drafts in the dashboard and sends each through Apple Mail via the magic-link / mailto helper. Set `EMAIL_AUTOSEND_DISABLED=0` to restore the original behavior. **Does not gate user-clicked sends** (campaigns, contracts, meeting invites, manual minutes /send) — those still go through SendGrid until per-flow Apple-Mail UIs land.
- `ELEVENLABS_CONVAI_PARTNERSHIP_EN` — ElevenLabs Conversational AI agent ID for the English Partnership orb on `/champion-teaser.html`. The orb on the teaser page connects directly to this agent via the browser SDK. **No API key is sent to the browser** — agent IDs are public per ElevenLabs convai design; the API key stays server-side. When unset, the orb shows a friendly "voice mode unavailable" caption and the keyboard demo stays the active path. Sister var: `ELEVENLABS_CONVAI_PARTNERSHIP_ES` for the Spanish agent (same orb, switches based on the page's language toggle).
- `ELEVENLABS_CONVAI_PARTNERSHIP_ES` — Spanish-language convai agent ID. See `ELEVENLABS_CONVAI_PARTNERSHIP_EN` for the full setup recipe. Must be a separate dedicated agent (per the `ringlypro_elevenlabs_agents` reference memory: "Each product gets its own dedicated convai agent; never share agents across unrelated products").

## Tier 4 — Polish That Compounds (T4.1–T4.4)

- **T4.1 Mobile orb v2**: bottom-sheet drawer for the transcript on <=900px (tap header to toggle .peeked state), full-screen voice mode (body.orb-fullscreen hides every other element; status indicator + 52x200 red Stop + ghost Exit-fullscreen at bottom), Wake Lock API (`navigator.wakeLock.request('screen')`) on session start + auto-re-acquire on visibility return. Wake lock gracefully no-ops on Safari < 16.4.
- **T4.2 Portuguese (PT-BR) — REMOVED per user request**. Page is EN+ES only. Dead `.i18n-pt` span markers remain in DOM but are CSS-hidden (`{ display: none }`) — re-introduction would need only restoring the lang toggle button + JS branches. Backend `/partnership-orb-config` reverted to en/es only. `ELEVENLABS_CONVAI_PARTNERSHIP_PT` env var no longer read.
- **T4.3 Sample prompt cards**: 3 one-tap example projects (Dispatch Auto-Pilot, Churn Rescue Agent, Document AI for Regulated Workflows) between orb and social-proof. Each card carries EN / ES / PT versions; tap fills `#d-desc` in active language, smooth-scrolls to demo, focuses Run AI Triage (does not auto-run).
- **T4.4 Lighthouse pass**: ElevenLabs SDK now LAZY-LOADED via `window.__loadElevenLabsSdk()` on first orb-click intent — saves ~200KB of unused JS for visitors who never use voice. `import('https://esm.sh/@elevenlabs/client@1.9.0')` triggered inside activateOrb's promise chain, cached via `window.__ElevenLabsSdkPromise`. Preconnect hint for `esm.sh` primes the connection during idle. Critical font weights preloaded.

## Tier 3 — Sales/Ops Automation (T3.1–T3.4)

- **T3.1 Partner dashboard** at `/champion-dashboard.html` (HTML page). Migration `016_partner_sessions.sql`. Endpoints: `POST /partner-login` (magic link; always returns URL even if SendGrid down), `GET /partner-verify?token=` (sets HttpOnly cookie + redirects), `GET /partner-stats` (cookie-authed, joins `d2_projects` WHERE `partner_slug = me`), `POST /partner-logout`. Commission estimate placeholder = 10% of stated budget.
- **T3.2 Embed code generator** at `/champion-embed.html`. Pre-fills slug from partner session, builds iframe + direct-URL snippets with click-to-copy, live preview iframe. Architecture choice: iframe over `<script>` for mic sandbox + version-pinning. `allow="microphone; autoplay"` on the iframe.
- **T3.3 Funnel analytics**. Migration `017_funnel_events.sql`. Endpoints: `POST /funnel-event` (allowlist of 19 events, sendBeacon-friendly), `GET /funnel-summary?days=N` (BasicAuth, returns Sankey-shaped counts), `GET /ab-summary?days=N` (BasicAuth, per-variant conversion rates). Admin view at `/champion-funnel.html` with 1/7/30/90-day toggle, bar funnel, variant winner highlight, top-partners table. Client emits: `page_visible`, `orb_clicked`, `triage_started`, `triage_completed`, `submit_succeeded`, `hero_variant_shown`. Helper: `window.__emitFunnelEvent(event, metadata?)`.
- **T3.4 A/B headline framework**. `GET /hero-variant?session_id=` returns deterministic variant 0/1/2 via `md5(session_id) % 3` + EN+ES copy. Client applies on load and emits `hero_variant_shown`. Variant 0 = control (Joint Venture / Partnership), variant 1 = problem-led ("Stop guessing. Start shipping."), variant 2 = social proof ("Trusted by 21 platforms").
- **New env vars added**: `BASIC_AUTH_USER` + `BASIC_AUTH_PASS` for `/funnel-summary` + `/ab-summary` admin gating. If unset, those endpoints only allow localhost (dev). `SESSION_SALT` (also used by T2.3, T3.1) for ip_hash anonymization.

## Tier 2 — Robustness Wins (T2.1–T2.5)

- **T2.1 Auto-save + recovery**: localStorage key `d2ai_session_state` (30-min TTL, schema v1). Snapshots transcript, triage payload, form fields, language every 5s during a session. On page load, if state with >= 2 transcript lines OR a triage payload exists, the amber resume banner slides down from top with "Resume" / "Start fresh". Successful submit auto-clears. Exposes `window.__setLang`, `window.__renderResult`, `window.__clearSavedSession`, `window.__snapshotSession`.
- **T2.2 Email me / Download PDF**: two buttons in the result-panel CTA row. Email uses mailto with a formatted plain-text body (matches the project-wide Apple Mail pattern). PDF uses `window.print()` against a print stylesheet that hides all chrome — user saves as PDF from the print dialog. Sets `document.title` to `digit2ai-triage-<slug>-<YYYY-MM-DD>` so the default filename is meaningful.
- **T2.3 Abandoned-conversation capture**: migration `015_abandoned_conversations.sql` adds the `d2_abandoned_conversations` table. POST `/projects/api/v1/intake/abandoned-conversation` (rate-limited via shared triage bucket, ip_hash with `SESSION_SALT` env var — never raw IPs). Modal triggers from `endVoiceSession` when triage did NOT fire AND transcript has >= 2 lines. Bilingual EN/ES, Esc + backdrop + close-button dismiss, mobile-stacks actions under 480px.
- **T2.4 FAQ section**: 8 collapsible Q&As with native `<details>/<summary>`, bilingual inline, schema.org FAQPage JSON-LD regenerated on language toggle for Google rich-result snippets. Topics: Is this real AI / What if triage wrong / Pricing / Data NDA / Integrations / Speed / Languages-platforms / Non-technical describe.
- **T2.5 ROI calculator**: 3 sliders (team / hours per week / hourly cost) → hours wasted per year, $ wasted per year, payback weeks at $50K midpoint cost. Currency toggle USD / MXN / COP (display only, no conversion). Shareable URL: `?roi=team=10&hr=8&rate=85&cur=USD` — preserves partner attribution.
- **Env var added**: `SESSION_SALT` — secret string mixed into the ip_hash for `d2_abandoned_conversations`. Optional; defaults to `d2ai-default-salt`. Set this on prod for stronger anonymization.

## Trust Signals + Live Transcript (T1.2, T1.4)

- `GET /projects/api/v1/intake/partnership-trust-signals?lang=en|es` — returns the social-proof stats (21 platforms, 22 verticals, 99.9% SLA, $300B TAM) + the partner badge list shown on the social-proof block. Numbers sourced from `company_digit2ai.md` memory — never invent. Updating just the endpoint refreshes the page without redeploy.
- `POST /projects/api/v1/intake/email-transcript` — user-clicked send (bypasses `EMAIL_AUTOSEND_DISABLED`). Body: `{ email, transcript: [{role, text, ts}], language, partner_slug? }`. Renders a branded HTML email + plain-text fallback via SendGrid. Rate-limited via the shared triage bucket. Requires `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`.
- Frontend: orb-transcript panel (`#orb-transcript`) shows live user + agent messages color-coded (cyan = user, violet = agent). Listens to the convai SDK's `onMessage` callback. Copy / Clear / Email buttons. Slides in to the right of the orb on desktop, drops below on mobile. Persists visible after orb returns to idle so the prospect can copy/email after the call.

## Partner Attribution + UTM Tracking (T1.1)

- Migration: `digit2ai-projects/migrations/014_partner_attribution.sql` (LIVE)
- Adds 7 nullable columns to `d2_projects`: `partner_slug`, `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`, `referrer_url`
- Indexes: `idx_d2_projects_partner_slug` (partial), `idx_d2_projects_utm_source` (partial)
- Frontend (`/champion-teaser.html`) parses `?partner=<slug>` (+ alias `?ref=<slug>`, `?p=<slug>`) and the standard 5 UTM params from `window.location.search` on load. Persists to `localStorage['d2ai_partner_attribution']` for 30 days so attribution survives reloads/language toggles. Renders a "Referred by: <Pretty Name>" badge above the hero h1 when present.
- Submission path (`acceptAndSubmit` → POST `/projects/api/v1/intake/public/request`) attaches all attribution fields to the payload via `window.attachPartnerAttribution(payload)`. Server (`intake.js`) persists them on the `d2_projects` row + echoes `partner_slug`/`utm_source`/`utm_campaign` back in the success response so Partners can verify their code wired correctly.
- Slug sanitization: alphanumeric + dash/underscore/dot/space only, capped at 120 chars. UTM params capped at 255. Both client + server enforce.
- Test URL: `https://aiagent.ringlypro.com/champion-teaser.html?partner=manuel-stagg&utm_source=linkedin&utm_campaign=launch-2026`

## Partnership Orb — ElevenLabs Convai Setup Recipe

The animated voice-interactive orb on `/champion-teaser.html` is powered by ElevenLabs Conversational AI. To enable it in production, create two dedicated convai agents (one EN, one ES) and wire their IDs into the env vars above.

**Per-agent setup (do once for EN, once for ES):**

1. Log into the ElevenLabs dashboard → **Conversational AI** → **Agents** → **Create New Agent**
2. Name: `Digit2AI Partnership Brain (EN)` / `(ES)` — keep these distinct from Rachel / Ana / Lina
3. **Voice**: pick a premium multilingual or language-specific voice — for EN, something warm and confident (e.g. "Adam" or a custom voice); for ES, a fluent LATAM voice with proper neutral accent
4. **System prompt**: paste the full teaser content as context (the 6 sections, 60-agent roster, 4 deliverables, 5-step flow, doctor-vs-thermometer framing, all script replies). Add structured intake instructions: detect when prospect is describing a project vs asking general questions; in intake mode, gather industry/problem/current-state/timeline/budget hints; ask at most 4 clarifying questions; when ready, call the `run_partnership_triage` client tool with `{ description, conversation_summary, name?, email?, company?, country? }`
5. **Client tools** → add a tool named `run_partnership_triage` with parameters matching the payload shape the orb sends to `/api/v1/intake/voice-trigger-triage`. The orb's controller registers a JS handler under the same name; the SDK bridges the agent's tool call to the browser-side handler, which POSTs to the backend and returns the verdict
6. **First-message greeting**: "Hi, I'm the Digit2AI Partnership brain. Tell me about your project — or ask me anything about what we do." (Spanish equivalent for the ES agent)
7. Save → copy the **Agent ID** from the agent detail page
8. On Render, set `ELEVENLABS_CONVAI_PARTNERSHIP_EN` (or `_ES`) to that agent ID and redeploy
9. Reload `/champion-teaser.html` → click the orb → mic permission prompt → orb enters listening state → speak

**Fallback behavior:** if either agent ID is unset, the SDK fails to load, or the user denies mic permission, the orb shows a friendly fallback message and the keyboard demo (textarea + Run AI Triage button) below the hero remains the working path. Voice is an enhancement, not a requirement.

**Cost model:** ~$0.15-$0.40 per 3-5 minute prospect demo (covers STT + LLM + TTS bundled by convai). At 50 demos/month per Partner, ~$10-22/month. Pennies per closed deal.

## Phase A — Public Source Refresh Schedule (Intuitive)

Six public-source connectors back the Hospital Intake bulletproof citation chain:

| Source | Refresh cadence | Script | URL |
|---|---|---|---|
| CMS Hospital Compare | monthly (1st Sunday) | (already wired in services/cms-hospital-compare.js) | https://data.cms.gov |
| CMS HCRIS | quarterly (Mar/Jun/Sep/Dec, 1st Sunday) | `verticals/intuitive/scripts/ingest-hcris.js` | https://www.cms.gov/Research-Statistics-Data-and-Systems/Files-for-Order/CostReports |
| CMS Open Payments | annually (July 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-open-payments.js` | https://www.cms.gov/openpayments/data/dataset-downloads |
| CMS MPUP (Physician Volume) | annually (April 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-physician-volume.js` | https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners |
| CMS Medicare Inpatient Hospitals (hospital × MS-DRG) | annually (Sep, after MS-DRG year close) | `verticals/intuitive/scripts/ingest-medicare-inpatient-drg.js` | https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals |
| Florida AHCA | quarterly (1st Sunday of Jan/Apr/Jul/Oct for prior quarter) | `verticals/intuitive/scripts/ingest-florida-ahca.js --quarter=YYYY-QX` | https://ahca.myflorida.com/ahca-database-download-form |
| NPI Registry (NPPES) | live API per Hospital Intake call (24h cache) | (no script — connector caches inline) | https://npiregistry.cms.hhs.gov |
| ProPublica Form 990 | live API per Hospital Intake call (24h cache) | (no script — connector caches inline) | https://projects.propublica.org/nonprofits |

Run scripts manually for the initial population:
```bash
# Download bulk files manually first (CMS download URLs vary by year), then:
node verticals/intuitive/scripts/ingest-hcris.js --file=/path/to/hosp10_2024.csv
node verticals/intuitive/scripts/ingest-open-payments.js --file=/path/to/OP_DTL_GNRL_PG2024.csv
node verticals/intuitive/scripts/ingest-physician-volume.js --file=/path/to/MUP_PHY_R24_P2024_NPI_HCPCS.csv
node verticals/intuitive/scripts/ingest-florida-ahca.js --file=/path/to/florida_hospitals_2024.csv
```

TODO: wire actual Render cron jobs once first quarterly refresh window approaches.

## Veritas — AI Deepfake Detection & Takedown

**Purpose:** Digit2AI vertical (modeled on revelum.ai) that detects and removes deepfakes/impersonations at scale — brand, executive, and likeness protection. Mounted at `/veritas`.

**Location:** `verticals/veritas/` (self-contained Express Router, own Sequelize instance via `src/db.js` using `CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration at `verticals/veritas/migrations/20260605_veritas_tables.sql`. All tables multi-tenant (`tenant_id`), `df_` prefix: tenants, monitors, assets, detections, takedowns, usage.

**Live:** dashboard `/veritas/` · landing `/public/veritas-landing.html` (bilingual EN/ES) · health `/veritas/health` · debug `/debug/veritas-error`.

**Detection engine:** `src/services/detection.js` is provider-agnostic. Phase 0 = deterministic stub (zero keys). Swap to a real provider via `VERITAS_DETECTION_PROVIDER` (`hive`|`reality_defender`|`sensity`) + that provider's key — the `detect()` contract is unchanged.

**REST API (`/veritas/api/v1/*`):**
- `GET/POST /monitors`, `PATCH /monitors/:id` (pause/resume), `POST /monitors/:id/scan` (runs ad-library pipeline)
- `GET /detections`, `GET /detections/summary` (dashboard stat cards)
- `GET/POST /takedowns`, `PATCH /takedowns/:id` (status flow), `GET /takedowns/:id/letter` (DMCA/impersonation/trademark draft + mailto magic link)
- `POST /scan` (on-demand single-asset "Who should we check?")
- `POST /webhooks/candidate` (external scanners / n8n push media for analysis; api_key auth)

**Ad scanning:** `src/services/adscan.js` — monitor → fetchCandidates → detect → persist. Candidate fetch is STUBBED (synthetic) until `META_AD_LIBRARY_TOKEN` is set, then swaps to the real Meta Ad Library API with no pipeline change.

**Environment Variables:**
- `VERITAS_DETECTION_PROVIDER` — `hive`|`reality_defender`|`sensity` (default `stub`). Selects the deepfake-detection backend behind `services/detection.js`.
- `HIVE_API_KEY` / `REALITY_DEFENDER_API_KEY` — provider key for live detection (Phase 1).
- `META_AD_LIBRARY_TOKEN` — Meta Graph token enabling real ad scanning in `services/adscan.js` (Phase 2). Unset = synthetic stub candidates.
- `VERITAS_WEBHOOK_API_KEY` — secret validated on `POST /veritas/api/v1/webhooks/candidate`. When unset, auth is skipped (dev/demo).
- `VERITAS_JWT_SECRET` — secret for signing the console login JWT (cookie `veritas_token`). Falls back to `JWT_SECRET` then a default. SET THIS on prod so tokens can't be forged.
- `VERITAS_DEFAULT_PASSWORD` — shared password seeded for the 4 console operator accounts (mstagg@, lala@, abelardo@, eduardo@ digit2ai.com). Default `defensoresdelapatria@7`. Accounts live in `df_users`; login at `/veritas/login`, gate redirects unauthed users. Cookie is SameSite=None;Secure (works direct + best-effort in iframe; third-party-cookie blockers may require direct access).
- `VERITAS_SEED_DEMO` — set to `1` to populate the demo tenant with sample Defensores detections/monitors/takedowns on boot. Default (unset) = NO seeding, and never re-seeds on restart (keeps the tenant clean for real scans).
- `VERITAS_SEARCH_API_KEY` + `VERITAS_SEARCH_CX` — Google Custom Search API key + Search Engine ID. Powers the one-click "¡Veritas, por favor escanea ya!" button (`POST /veritas/api/v1/scan/now`): web image search for the candidate → Reality Defender on each result. When unset, the button returns a "configure search" message (no fake results). Free tier 100 queries/day.
- `VERITAS_SCAN_QUERY` — the search term the scan button uses. Default `Abelardo de la Espriella`.
- `VERITAS_SCAN_MAX` — max images analyzed per scan click (default 10). Caps provider-credit usage; repeat clicks dedupe on URL.
- `ELEVENLABS_CONVAI_VERITAS_EN` / `_ES` — convai "protection analyst" agent IDs (Phase 2; dedicated agents per the ringlypro_elevenlabs_agents rule).

Full build status + remaining external dependencies (provider keys, AWS Rekognition for likeness, legal-reviewed templates) are tracked in `verticals/veritas/ECOSYSTEM.md`.

**Data Flow:**
PLC / Sensor → n8n → POST /api/oee/webhooks/machine-event → machine_events table
MCP Tool Call → POST /api/oee/tools/call → OEE route handler → PostgreSQL → response

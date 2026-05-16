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

## Phase A — Public Source Refresh Schedule (Intuitive)

Six public-source connectors back the Hospital Intake bulletproof citation chain:

| Source | Refresh cadence | Script | URL |
|---|---|---|---|
| CMS Hospital Compare | monthly (1st Sunday) | (already wired in services/cms-hospital-compare.js) | https://data.cms.gov |
| CMS HCRIS | quarterly (Mar/Jun/Sep/Dec, 1st Sunday) | `verticals/intuitive/scripts/ingest-hcris.js` | https://www.cms.gov/Research-Statistics-Data-and-Systems/Files-for-Order/CostReports |
| CMS Open Payments | annually (July 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-open-payments.js` | https://www.cms.gov/openpayments/data/dataset-downloads |
| CMS MPUP (Physician Volume) | annually (April 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-physician-volume.js` | https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners |
| Florida AHCA | quarterly | `verticals/intuitive/scripts/ingest-florida-ahca.js` | https://ahca.myflorida.com |
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

**Data Flow:**
PLC / Sensor → n8n → POST /api/oee/webhooks/machine-event → machine_events table
MCP Tool Call → POST /api/oee/tools/call → OEE route handler → PostgreSQL → response

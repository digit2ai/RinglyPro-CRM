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

**Data Flow:**
PLC / Sensor → n8n → POST /api/oee/webhooks/machine-event → machine_events table
MCP Tool Call → POST /api/oee/tools/call → OEE route handler → PostgreSQL → response

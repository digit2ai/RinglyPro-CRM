# RinglyPro CRM - Claude Code Configuration

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

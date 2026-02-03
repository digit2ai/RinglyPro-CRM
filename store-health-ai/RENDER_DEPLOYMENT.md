# Render Deployment Guide

Deploy Store Health AI to **aiagent.ringlypro.com/aiastore**

## Prerequisites

1. Render account with access to `aiagent.ringlypro.com` domain
2. GitHub repository with this code

## Deployment Steps

### 1. Create Environment Variable Group

In Render Dashboard, create an environment variable group named `store-health-ai-secrets` with:

```
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id

# Application Settings
APP_URL=https://aiagent.ringlypro.com/aiastore
DEFAULT_TIMEZONE=America/New_York
LOG_LEVEL=info

# Alert Channels
ENABLE_SMS_ALERTS=true
ENABLE_PUSH_ALERTS=true
ENABLE_EMAIL_ALERTS=true

# Escalation Settings
GREEN_CALL_ENABLED=false
SLA_HOURS_SALES=24
SLA_HOURS_LABOR=24
SLA_HOURS_INVENTORY=72

# Predictive Risk Thresholds
PREDICTION_YELLOW_THRESHOLD=65
PREDICTION_RED_THRESHOLD=80
```

### 2. Deploy from render.yaml

1. Go to Render Dashboard
2. Click "New" → "Blueprint"
3. Connect your GitHub repository
4. Select the `store-health-ai` directory
5. Render will detect `render.yaml` and create:
   - `store-health-ai-api` (Backend API)
   - `store-health-ai-dashboard` (Frontend)
   - `store-health-ai-db` (PostgreSQL Database)

### 3. Configure Custom Domain

After deployment:

1. Go to `store-health-ai-api` service settings
2. Add custom domain: `aiagent.ringlypro.com`
3. Set base path: `/aiastore`

4. Go to `store-health-ai-dashboard` service settings
5. Add custom domain: `aiagent.ringlypro.com`
6. Set base path: `/aiastore`

### 4. Run Database Migrations

The backend will automatically run migrations on startup via:
```bash
npm run db:migrate && npm start
```

If you need to seed data:
```bash
# In Render Shell for store-health-ai-api
npm run db:seed
```

### 5. Verify Deployment

- Backend API: https://aiagent.ringlypro.com/aiastore/api/v1/health
- Dashboard: https://aiagent.ringlypro.com/aiastore/
- API Docs: https://aiagent.ringlypro.com/aiastore/api/v1/docs

## ElevenLabs Tools Configuration

After deployment, configure the 4 tools with these URLs:

1. **getDashboardOverview**: `https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/overview`
2. **getCriticalStores**: `https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/critical-stores`
3. **getStoreDetails**: `https://aiagent.ringlypro.com/aiastore/api/v1/stores/{store_code}`
4. **getActiveAlerts**: `https://aiagent.ringlypro.com/aiastore/api/v1/alerts/active`

## Monitoring

- View logs in Render Dashboard
- Check health endpoint: `/api/v1/health`
- Monitor database connections
- Review ElevenLabs call logs

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` environment variable
- Check database service status
- Review migration logs

### API not responding
- Check service logs
- Verify PORT is set to 10000
- Ensure all environment variables are set

### Dashboard not loading
- Verify build completed successfully
- Check `VITE_API_URL` is set correctly
- Review static file deployment

## Rollback

If deployment fails:
1. Go to service settings
2. Click "Manual Deploy"
3. Select previous successful commit
4. Deploy

## Cost Estimate

- Backend API (Starter): $7/month
- Frontend (Static): Free
- PostgreSQL (Starter): $7/month
**Total: ~$14/month**

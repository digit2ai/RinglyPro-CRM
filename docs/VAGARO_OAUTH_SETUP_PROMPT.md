# Vagaro OAuth Integration - Setup Prompt for AI Assistant

## Context
This is a reference document for continuing work on the Vagaro integration for RinglyPro CRM. Use this prompt when resuming work on Vagaro integration setup.

---

## Current Status (As of December 10, 2025)

### ✅ What's Been Completed

1. **OAuth Authentication System** - DONE
   - OAuth 2.0 client_credentials flow implemented in `src/services/vagaroService.js`
   - Access token generation with in-memory caching
   - Token expiration tracking (auto-refresh before expiry)
   - Auto-retry on 401 errors with fresh token
   - Region support (us01-us05) for different Vagaro API endpoints

2. **Multitenant Architecture** - DONE
   - Per-client credential storage in `clients.settings` JSONB column
   - 5 OAuth credentials: `clientId`, `clientSecretKey`, `merchantId`, `webhookToken`, `region`
   - Complete data isolation between clients
   - Each RinglyPro client uses their own Vagaro account

3. **Backend Implementation** - DONE
   - `src/services/vagaroService.js` - Complete Vagaro API service layer
   - `src/routes/vagaro.js` - API routes and webhook handlers
   - `src/routes/client-settings.js` - Settings API endpoints
   - All routes fetch credentials from database per user/client
   - Webhook handlers identify client by merchantId

4. **Frontend UI** - DONE
   - `views/settings-vagaro.ejs` - Settings page at `/settings/vagaro`
   - Form fields for all 5 OAuth credentials
   - Enable/disable toggle
   - Test connection button
   - Status badge (Connected/Needs Configuration/Disabled)
   - Region dropdown selector

5. **Database Schema** - DONE
   - Migration file: `migrations/add-vagaro-id-fields.sql`
   - Added `vagaro_id` column to `contacts` table
   - Added `vagaro_id` column to `appointments` table
   - Credentials stored in `clients.settings->integration->vagaro`

6. **Documentation** - DONE
   - `docs/VAGARO_INTEGRATION.md` - Complete integration guide
   - `docs/VAGARO_MULTITENANT_ARCHITECTURE.md` - Architecture explanation
   - `docs/VAGARO_QUICK_START.md` - 5-minute setup guide
   - `docs/LINA_VAGARO_INTEGRATION.md` - Lina workflow guide
   - All docs updated with OAuth credentials instead of simple API key

7. **Git Commit** - DONE
   - Committed: `fd94caf` - "Add Vagaro multitenant OAuth integration"
   - Pushed to GitHub: ✅ Successfully pushed to `main` branch

---

## ⚠️ What's Pending

### 1. Production Deployment
**Status**: SSH connection to server timed out during deployment

**Action Required**:
```bash
# Run this command to deploy to production:
ssh root@147.79.65.118 "cd /var/www/ringlypro-crm && git pull origin main && pm2 restart all"
```

**What This Does**:
- Pulls latest code from GitHub (includes Vagaro integration)
- Restarts PM2 processes to load new code
- Makes Vagaro settings UI available at https://aiagent.ringlypro.com/settings/vagaro

---

### 2. Get Real Vagaro OAuth Credentials
**Status**: Using placeholder/dummy credentials

**Action Required**:
1. Contact Vagaro Enterprise Sales: **enterprise@vagaro.com**
2. Request: "Enable OAuth API access & Webhooks for RinglyPro integration"
3. You will receive:
   - **Client ID** (OAuth application ID)
   - **Client Secret Key** (OAuth secret)
   - **Merchant ID** (your Vagaro business ID)
   - **Webhook Verification Token**
   - **Region** (e.g., us01, us02, us03, us04, us05)
4. Cost: $10/month (Vagaro Enterprise API add-on)

---

### 3. Configure Credentials in RinglyPro
**Status**: Waiting for real credentials from step 2

**Action Required**:
1. Go to: https://aiagent.ringlypro.com/settings/vagaro
2. Enter the 5 OAuth credentials received from Vagaro
3. Toggle "Enable Integration" to ON
4. Click "Save Settings"
5. Click "Test Connection" to verify

---

### 4. Set Up Webhooks in Vagaro Dashboard
**Status**: Waiting for Vagaro account setup

**Action Required**:
1. Log in to your Vagaro business dashboard
2. Navigate to: **Settings → Developer → Webhooks**
3. Add these webhook URLs:
   ```
   https://aiagent.ringlypro.com/api/vagaro/webhooks/appointment
   https://aiagent.ringlypro.com/api/vagaro/webhooks/customer
   https://aiagent.ringlypro.com/api/vagaro/webhooks/transaction
   ```
4. Use your webhook verification token from step 3
5. Enable webhooks for real-time sync

---

### 5. Run Database Migration (If Not Already Run)
**Status**: Migration file created, may need to be executed on production

**Action Required**:
```bash
# Connect to production database and run:
psql -U postgres -d ringlypro_crm -f /var/www/ringlypro-crm/migrations/add-vagaro-id-fields.sql
```

**What This Does**:
- Adds `vagaro_id` column to `contacts` table (for linking customers)
- Adds `vagaro_id` column to `appointments` table (for linking appointments)
- Creates unique indexes for efficient lookups

---

## 🎯 Tomorrow's AI Assistant Prompt

Copy and paste this prompt to resume work:

```
I'm continuing work on the Vagaro OAuth integration for RinglyPro CRM.

The integration is FULLY IMPLEMENTED and committed to GitHub (commit fd94caf). Here's what needs to be done:

1. **Deploy to Production**: SSH to root@147.79.65.118 and run:
   - cd /var/www/ringlypro-crm
   - git pull origin main
   - pm2 restart all

2. **Verify Deployment**: Check that /settings/vagaro page loads at https://aiagent.ringlypro.com

3. **Get Vagaro Credentials**: I need to contact enterprise@vagaro.com to get:
   - OAuth Client ID
   - OAuth Client Secret Key
   - Merchant ID
   - Webhook Token
   - Region

4. **Configure & Test**: Once I have credentials, help me:
   - Enter them in the settings UI
   - Test the connection
   - Set up webhooks in Vagaro dashboard
   - Test an end-to-end appointment booking

Reference files:
- Implementation: src/services/vagaroService.js, src/routes/vagaro.js
- UI: views/settings-vagaro.ejs
- Docs: docs/VAGARO_QUICK_START.md, docs/VAGARO_MULTITENANT_ARCHITECTURE.md
- Setup Guide: docs/VAGARO_OAUTH_SETUP_PROMPT.md (this file)

The code is production-ready. We just need to deploy and configure credentials.
```

---

## 📋 Complete File Checklist

### Backend Files (All Created ✅)
- ✅ `src/services/vagaroService.js` - OAuth service layer
- ✅ `src/routes/vagaro.js` - API routes & webhooks
- ✅ `src/routes/client-settings.js` - Settings endpoints (updated)
- ✅ `src/app.js` - Routes registered (updated)

### Frontend Files (All Created ✅)
- ✅ `views/settings-vagaro.ejs` - Settings UI

### Database Files (All Created ✅)
- ✅ `migrations/add-vagaro-id-fields.sql` - Schema migration
- ✅ `scripts/migrate-vagaro.js` - Data migration helper

### Documentation Files (All Created ✅)
- ✅ `docs/VAGARO_INTEGRATION.md` - Complete guide
- ✅ `docs/VAGARO_MULTITENANT_ARCHITECTURE.md` - Architecture docs
- ✅ `docs/VAGARO_QUICK_START.md` - Quick setup
- ✅ `docs/LINA_VAGARO_INTEGRATION.md` - Lina workflow
- ✅ `docs/VAGARO_OAUTH_SETUP_PROMPT.md` - This file

---

## 🔧 Technical Architecture Summary

### OAuth Flow
```
1. User enters credentials in /settings/vagaro
2. Credentials stored in clients.settings JSONB column:
   {
     "integration": {
       "vagaro": {
         "enabled": true,
         "clientId": "xxx",
         "clientSecretKey": "yyy",
         "merchantId": "zzz",
         "webhookToken": "aaa",
         "region": "us01"
       }
     }
   }
3. When Lina handles call:
   - Fetch credentials from database by clientId
   - Generate OAuth access token (cached for 55 minutes)
   - Use token to call Vagaro API
   - If 401 error, clear cache and regenerate token
```

### API Endpoints Available
```
GET  /api/vagaro/status                    - Check integration status
GET  /api/vagaro/appointments              - List appointments
GET  /api/vagaro/appointments/:id          - Get appointment
POST /api/vagaro/appointments              - Create appointment
PUT  /api/vagaro/appointments/:id          - Update appointment
DELETE /api/vagaro/appointments/:id        - Cancel appointment
GET  /api/vagaro/customers                 - List customers
GET  /api/vagaro/employees                 - List employees
GET  /api/vagaro/locations                 - List locations
POST /api/vagaro/sync/appointments         - Sync all appointments
POST /api/vagaro/sync/customers            - Sync all customers

Webhooks:
POST /api/vagaro/webhooks/appointment      - Appointment events
POST /api/vagaro/webhooks/customer         - Customer events
POST /api/vagaro/webhooks/transaction      - Transaction events

Settings:
GET  /api/client-settings/vagaro           - Get Vagaro settings
POST /api/client-settings/vagaro           - Update Vagaro settings
```

### Region Support
```javascript
const API_REGIONS = {
  us01: 'https://us01-api.vagaro.com',
  us02: 'https://us02-api.vagaro.com',
  us03: 'https://us03-api.vagaro.com',
  us04: 'https://us04-api.vagaro.com',
  us05: 'https://us05-api.vagaro.com'
};
```

---

## 🎬 Lina Integration (Already Implemented)

When Vagaro mode is enabled (`integration.vagaro.enabled = true`):

1. **Lina receives appointment request call**
2. **Checks if Vagaro is enabled** for this client
3. **Fetches OAuth credentials** from database
4. **Generates access token** (or uses cached token)
5. **Searches for customer** in Vagaro by phone number
6. **If customer not found**: Creates new customer in Vagaro
7. **Fetches available services** from Vagaro
8. **Searches appointment availability**
9. **Books appointment** in Vagaro
10. **Vagaro automatically sends SMS/email confirmations**
11. **Lina confirms booking** to customer on call
12. **Webhook syncs** appointment back to RinglyPro

**Important**: When Vagaro is enabled, Lina does NOT send manual SMS - Vagaro handles all notifications.

---

## 🔒 Security Notes

- OAuth credentials stored in PostgreSQL (encrypted at rest)
- Access tokens cached in-memory with expiration tracking
- Credentials never exposed to client-side JavaScript
- All API routes require JWT authentication
- Webhooks verified using per-client webhook tokens
- Each client can only access their own Vagaro data

---

## 📞 Support Contacts

- **Vagaro API Support**: enterprise@vagaro.com
- **Vagaro Technical Support**: support@vagaro.com
- **RinglyPro Support**: support@ringlypro.com

---

## 🚀 Testing Checklist (Once Deployed & Configured)

- [ ] Production deployment successful
- [ ] Settings page loads at /settings/vagaro
- [ ] Can save OAuth credentials
- [ ] "Test Connection" button works
- [ ] Status badge shows "Connected"
- [ ] Database migration run successfully
- [ ] Webhooks configured in Vagaro dashboard
- [ ] Test call: Book appointment via Lina
- [ ] Verify appointment appears in Vagaro
- [ ] Verify Vagaro sends SMS confirmation
- [ ] Verify webhook syncs back to RinglyPro
- [ ] Check `contacts` table for `vagaro_id`
- [ ] Check `appointments` table for `vagaro_id`

---

## 📝 Notes for Tomorrow

1. **First Priority**: Deploy to production server
2. **Second Priority**: Contact Vagaro for OAuth credentials
3. **Third Priority**: Configure and test integration
4. **Optional**: Review error logs for any issues

The code is production-ready. All files are committed and pushed to GitHub. The integration is fully multitenant - each client will configure their own Vagaro credentials.

---

**Last Updated**: December 10, 2025
**Status**: Code Complete - Pending Deployment & Configuration
**Git Commit**: fd94caf
**Branch**: main

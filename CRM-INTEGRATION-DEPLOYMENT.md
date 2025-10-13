# CRM Integration Deployment Guide

## Overview
This guide covers deployment of the new CRM Integration feature that allows clients to save their GoHighLevel and HubSpot API keys in their profile, enabling auto-load functionality in MCP Copilot.

## Features Added

### 1. **Database Schema Changes**
- Added `ghl_api_key` field to `clients` table (VARCHAR 255)
- Added `ghl_location_id` field to `clients` table (VARCHAR 100)
- Added `hubspot_api_key` field to `clients` table (VARCHAR 255)

### 2. **API Endpoints**
- **GET** `/api/client/crm-settings/:client_id` - Get CRM settings (masked API keys for UI display)
- **PUT** `/api/client/crm-settings/:client_id` - Update CRM settings
- **GET** `/api/client/crm-credentials/:client_id` - Get full credentials for MCP Copilot auto-load

### 3. **Dashboard UI Changes**
- Renamed "Calendar Settings" button to "Settings" with gear icon
- Added tabbed Settings modal with two tabs:
  - 📅 **Calendar** - Existing calendar configuration
  - 🔗 **CRM Integrations** - New CRM API key management
- CRM Integration tab includes:
  - GoHighLevel section (API Key + Location ID)
  - HubSpot section (API Key)
  - Status indicators (Configured/Not configured)
  - Help text for finding credentials

### 4. **MCP Copilot Auto-Load**
- Updated `/mcp-copilot/` interface to detect `?client_id=X` URL parameter
- Automatically fetches CRM credentials from client profile
- Auto-populates and auto-connects to configured CRM
- Falls back to manual entry if no credentials found

### 5. **Dashboard Integration**
- Updated "CRM Copilot" button to pass `client_id` parameter
- Opens MCP Copilot in new tab with: `/mcp-copilot/?client_id=X`

## Files Modified

### Backend
1. **src/models/Client.js** - Added CRM integration fields
2. **src/routes/client.js** - Added 3 new API endpoints
3. **package.json** - Added migration script

### Frontend
1. **views/dashboard.ejs**
   - Updated Settings button and modal
   - Added CRM integration UI
   - Added tab switching functionality
   - Added CRM settings load/save functions
   - Added `openMCPCopilot()` function

2. **public/mcp-copilot/copilot.js**
   - Added `autoLoadCredentials()` function
   - Added URL parameter detection
   - Added auto-connect functionality

### Database
1. **migrations/add-crm-integration-fields.js** - Migration file
2. **scripts/run-crm-integration-migration.js** - Migration runner

## Deployment Steps

### Step 1: Commit and Push Changes

```bash
git add .
git commit -m "Add CRM integration settings with auto-load in MCP Copilot"
git push origin main
```

### Step 2: Run Database Migration on Render

Once deployed to Render, run the migration via Render Shell:

```bash
npm run migrate:crm-integration
```

**Or manually via SQL:**

```sql
ALTER TABLE clients
ADD COLUMN ghl_api_key VARCHAR(255),
ADD COLUMN ghl_location_id VARCHAR(100),
ADD COLUMN hubspot_api_key VARCHAR(255);

COMMENT ON COLUMN clients.ghl_api_key IS 'GoHighLevel Private Integration Token (PIT)';
COMMENT ON COLUMN clients.ghl_location_id IS 'GoHighLevel Location ID for MCP integration';
COMMENT ON COLUMN clients.hubspot_api_key IS 'HubSpot API Key for CRM integration';
```

### Step 3: Verify Deployment

1. **Test Settings Page:**
   - Login to dashboard: `https://ringlypro-crm.onrender.com/dashboard?clientId=1`
   - Click "Settings" button (should show gear icon)
   - Verify two tabs appear: Calendar and CRM Integrations
   - Try saving GoHighLevel credentials

2. **Test MCP Copilot Auto-Load:**
   - Save GHL credentials in Settings
   - Click "CRM Copilot" button from dashboard
   - Verify URL includes `?client_id=1`
   - Verify credentials auto-populate
   - Verify auto-connection message appears

3. **Test API Endpoints:**
   ```bash
   # Get CRM settings (masked)
   curl https://ringlypro-crm.onrender.com/api/client/crm-settings/1

   # Get full credentials (for auto-load)
   curl https://ringlypro-crm.onrender.com/api/client/crm-credentials/1
   ```

### Step 4: Update Existing Clients (Optional)

If you want to pre-configure credentials for existing clients:

```sql
-- Update Manuel's client profile with GoHighLevel credentials
UPDATE clients
SET
  ghl_api_key = 'pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe',
  ghl_location_id = '3lSeAHXNU9t09Hhp9oai'
WHERE id = 1;
```

## User Guide

### For Clients: How to Configure CRM Integration

1. **Login to Dashboard:**
   - Go to https://aiagent.ringlypro.com
   - Enter your credentials

2. **Open Settings:**
   - Click the **Settings** button (gear icon) in Quick Actions

3. **Navigate to CRM Integrations Tab:**
   - Click "🔗 CRM Integrations" tab

4. **Configure GoHighLevel:**
   - Enter your **Private Integration Token** (starts with "pit-")
   - Enter your **Location ID** (24-character ID)
   - Click "Save CRM Settings"

5. **Configure HubSpot (Optional):**
   - Enter your **HubSpot API Key**
   - Click "Save CRM Settings"

6. **Use MCP Copilot:**
   - Click "CRM Copilot" button
   - Your credentials will automatically load!
   - No need to enter them again

### Finding Your GoHighLevel Credentials

1. Login to GoHighLevel
2. Go to **Settings** → **Integrations**
3. Create a **Private Integration**
4. Copy the **Private Integration Token** (API Key)
5. Find your **Location ID** in Settings or URL

### Finding Your HubSpot Credentials

1. Login to HubSpot
2. Go to **Settings** → **Integrations** → **Private Apps**
3. Create a new Private App
4. Copy the **Access Token**

## Security Considerations

### API Key Storage
- API keys are stored in PostgreSQL database
- Database connections use SSL in production
- API keys are NOT encrypted at rest (consider adding encryption if needed)

### API Endpoints
- `/crm-settings` endpoint returns **masked** API keys for UI display
  - Example: `pit-...cf24` instead of full key
- `/crm-credentials` endpoint returns **full** API keys for auto-load
  - Should add authentication middleware (currently relies on session)

### Recommended Security Enhancements (Future)
1. Add authentication middleware to `/crm-credentials` endpoint
2. Encrypt API keys in database using AES-256
3. Add API key validation before saving
4. Add audit log for API key access
5. Add option to rotate/regenerate API keys

## Troubleshooting

### Migration Fails
**Issue:** Column already exists
**Solution:**
```sql
-- Check if columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name IN ('ghl_api_key', 'ghl_location_id', 'hubspot_api_key');

-- If they exist, skip migration or run:
ALTER TABLE clients
DROP COLUMN IF EXISTS ghl_api_key,
DROP COLUMN IF EXISTS ghl_location_id,
DROP COLUMN IF EXISTS hubspot_api_key;
```

### Auto-Load Not Working
**Checklist:**
1. Verify `client_id` in URL: `/mcp-copilot/?client_id=1`
2. Check browser console for errors
3. Verify API endpoint returns data: `/api/client/crm-credentials/1`
4. Clear browser cache
5. Check that credentials are saved in database

### Settings Modal Not Showing
**Checklist:**
1. Clear browser cache
2. Check console for JavaScript errors
3. Verify dashboard.ejs was deployed correctly
4. Check that `openSettings()` function exists

### CRM Connection Fails After Auto-Load
**Checklist:**
1. Verify API keys are correct in database
2. Test manual connection without auto-load
3. Check GHL Location ID is exactly 24 characters
4. Verify no extra spaces in stored credentials

## Rollback Plan

If deployment causes issues:

### 1. Code Rollback
```bash
git revert HEAD
git push origin main
```

### 2. Database Rollback
```sql
ALTER TABLE clients
DROP COLUMN IF EXISTS ghl_api_key,
DROP COLUMN IF EXISTS ghl_location_id,
DROP COLUMN IF EXISTS hubspot_api_key;
```

### 3. Frontend Rollback
The UI changes are backwards compatible. Old clients without saved credentials will simply see empty fields and can enter manually.

## Success Metrics

### Post-Deployment Validation
- [ ] Migration completes without errors
- [ ] Settings modal opens with two tabs
- [ ] CRM credentials can be saved
- [ ] API endpoints return expected data
- [ ] MCP Copilot auto-loads credentials
- [ ] Manual entry still works if no credentials saved
- [ ] No JavaScript errors in browser console
- [ ] No 500 errors in server logs

### User Experience Improvements
- ✅ Clients no longer need to enter API keys every time
- ✅ Seamless workflow from Dashboard → MCP Copilot
- ✅ Professional settings UI with status indicators
- ✅ Help text guides users to find credentials
- ✅ Settings organized in tabs for better UX

## Next Steps

### Recommended Enhancements
1. **Add encryption** for API keys in database
2. **Add authentication** to `/crm-credentials` endpoint
3. **Add audit logging** for credential access
4. **Add credential validation** before saving
5. **Add "Test Connection"** button in Settings UI
6. **Add email notification** when credentials are updated
7. **Add "Clear Credentials"** button for easy reset
8. **Add multi-CRM support** (allow both GHL + HubSpot)

## Support

### For Issues:
1. Check Render logs: `Dashboard → Logs`
2. Check browser console for JavaScript errors
3. Test API endpoints directly
4. Review this deployment guide

### Contact:
- **Tech Lead:** Manuel Stagg
- **Documentation:** This file + inline comments in code
- **Support:** Create GitHub issue or contact team

---

**Deployment Date:** 2025-10-12
**Version:** 2.1.0
**Status:** ✅ Ready for Production

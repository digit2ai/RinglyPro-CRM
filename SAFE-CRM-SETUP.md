# Safe CRM Integration Setup Guide

Follow these steps **in order** to safely enable CRM integration without breaking login.

## Current Status
✅ Login is working
⏳ CRM fields temporarily disabled
📋 Migration ready to run

---

## Step 1: Run Database Migration

### Option A: Via Render Shell (Recommended)

1. Go to Render Dashboard: https://dashboard.render.com
2. Select your PostgreSQL database (not the web service)
3. Click "Connect" → Copy the connection command
4. Open your terminal and paste the command
5. Once connected, run this SQL:

```sql
-- Safe migration - can run multiple times
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'ghl_api_key'
    ) THEN
        ALTER TABLE clients ADD COLUMN ghl_api_key VARCHAR(255);
        RAISE NOTICE 'Added ghl_api_key column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'ghl_location_id'
    ) THEN
        ALTER TABLE clients ADD COLUMN ghl_location_id VARCHAR(20);
        RAISE NOTICE 'Added ghl_location_id column';
    END IF;
END $$;
```

6. Verify columns exist:
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name IN ('ghl_api_key', 'ghl_location_id');
```

Expected output:
```
   column_name    | data_type | character_maximum_length
------------------+-----------+-------------------------
 ghl_api_key      | varchar   | 255
 ghl_location_id  | varchar   | 20
```

### Option B: Via Web Service Shell

1. Go to Render Dashboard
2. Select your web service: `ringlypro-crm`
3. Click "Shell" tab
4. Run:
```bash
npm run migrate:crm-integration
```

---

## Step 2: Verify Migration Success

Check the CRM settings endpoint returns empty values (not errors):

```bash
curl https://ringlypro-crm.onrender.com/api/client/crm-settings/15
```

Expected response:
```json
{
  "success": true,
  "settings": {
    "ghl_api_key": null,
    "ghl_api_key_set": false,
    "ghl_location_id": null
  }
}
```

✅ If you see this, migration worked!
❌ If you see errors, migration failed - do NOT proceed

---

## Step 3: Enable CRM Fields in Code

Only do this AFTER Step 2 succeeds!

Edit `src/models/Client.js` and uncomment lines 84-93:

**Change FROM:**
```javascript
// TEMP DISABLED: Uncomment after running migration
// ghl_api_key: {
//     type: DataTypes.STRING(255),
//     allowNull: true,
//     comment: 'GoHighLevel Private Integration Token (PIT)'
// },
// ghl_location_id: {
//     type: DataTypes.STRING(20),
//     allowNull: true,
//     comment: 'GoHighLevel Location ID for MCP integration (20 characters)'
// },
```

**Change TO:**
```javascript
ghl_api_key: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'GoHighLevel Private Integration Token (PIT)'
},
ghl_location_id: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'GoHighLevel Location ID for MCP integration (20 characters)'
},
```

---

## Step 4: Commit and Deploy

```bash
git add src/models/Client.js
git commit -m "Enable CRM fields after migration"
git push origin main
```

Wait 2-3 minutes for Render to deploy.

---

## Step 5: Test Everything

### Test 1: Login Still Works ✅
1. Go to https://aiagent.ringlypro.com
2. Login with your credentials
3. Dashboard should load normally

### Test 2: Settings Page ✅
1. Click "Settings" button (gear icon)
2. Should see two tabs: Calendar and CRM Integrations
3. Click "CRM Integrations" tab
4. Should see GoHighLevel form with:
   - API Key field (password input)
   - Location ID field (text input)
   - Save button

### Test 3: Save Credentials ✅
1. In Settings → CRM Integrations
2. Enter your credentials:
   - API Key: `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
   - Location ID: `3lSeAHXNU9t09Hhp9oai`
3. Click "Save CRM Settings"
4. Should see success message

### Test 4: MCP Copilot Auto-Load ✅
1. Click "CRM Copilot" button from dashboard
2. Should see "Auto-connecting to GoHighLevel..." message
3. Status should change to "Connected to GoHighLevel"
4. No manual input required!

---

## Troubleshooting

### Issue: Login breaks after enabling fields
**Solution:** The migration didn't complete. Rollback:
```javascript
// Comment out the fields again in Client.js
// Run migration again
// Verify with Step 2 before uncommenting
```

### Issue: "Column does not exist" error
**Solution:** Migration didn't run successfully
```sql
-- Check if columns exist:
\d clients

-- If missing, run migration again
```

### Issue: Settings page shows "Not configured" after saving
**Solution:** Check the API response:
```bash
curl https://ringlypro-crm.onrender.com/api/client/crm-settings/15
```

---

## Summary Checklist

- [ ] Step 1: Run migration via Render PostgreSQL
- [ ] Step 2: Verify columns exist and API returns success
- [ ] Step 3: Uncomment fields in Client.js
- [ ] Step 4: Commit and deploy
- [ ] Step 5: Test login works
- [ ] Step 6: Test Settings page
- [ ] Step 7: Test saving credentials
- [ ] Step 8: Test MCP Copilot auto-load

---

## Need Help?

If anything breaks:
1. Check Render logs for errors
2. Verify migration with Step 2 query
3. If needed, comment out fields again and redeploy

**Current files:**
- Migration SQL: `migrations/add-crm-fields.sql`
- Migration Script: `scripts/run-crm-integration-migration.js`
- Model: `src/models/Client.js` (lines 84-93)

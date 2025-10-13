# URGENT LOGIN FIX

## Problem
Login is failing because the database doesn't have the new CRM columns yet (`ghl_api_key`, `ghl_location_id`).

## Solution
Run the migration immediately on Render:

```bash
npm run migrate:crm-integration
```

## How to Run Migration on Render

1. Go to Render Dashboard: https://dashboard.render.com
2. Select your service: `ringlypro-crm`
3. Click "Shell" tab
4. Run the command:
   ```bash
   npm run migrate:crm-integration
   ```

## Expected Output
```
🔄 Adding GoHighLevel integration fields to clients table...
✅ Added ghl_api_key column
✅ Added ghl_location_id column
✅ GoHighLevel integration fields migration completed successfully
```

## After Migration
- Login will work immediately
- Settings page will show CRM Integrations tab
- MCP Copilot will be able to auto-load credentials

## Alternative: Run Migration via SQL

If npm command doesn't work, run this SQL directly in Render PostgreSQL:

```sql
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS ghl_api_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS ghl_location_id VARCHAR(20);

COMMENT ON COLUMN clients.ghl_api_key IS 'GoHighLevel Private Integration Token (PIT)';
COMMENT ON COLUMN clients.ghl_location_id IS 'GoHighLevel Location ID for MCP integration (20 characters)';
```

## To Access PostgreSQL on Render

1. Go to Render Dashboard
2. Select your PostgreSQL database
3. Click "Connect" → Copy the PSQL Command
4. Run in terminal or use Render's Web Shell
5. Paste the SQL commands above

---

**THIS IS THE ONLY FIX NEEDED - The code is already deployed and handles missing columns gracefully, but the database NEEDS these columns to exist.**

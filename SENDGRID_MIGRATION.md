# SendGrid Multi-Tenant Migration Guide

## 🚨 Important: Database Columns Required

The Email Marketing system now requires **SendGrid configuration columns** in the `clients` table. These columns are created automatically when the app starts, but you can also run the migration manually.

---

## ✅ Automatic Migration (Recommended)

The SendGrid columns are **automatically created** when you deploy or restart the app:

1. **Deploy to Render.com:**
   ```bash
   git push origin main
   ```

2. **App starts and runs auto-migration:**
   ```
   🔄 Checking SendGrid columns...
   📊 Creating SendGrid columns...
      ✓ Created column: sendgrid_api_key
      ✓ Created column: sendgrid_from_email
      ✓ Created column: sendgrid_from_name
      ✓ Created column: sendgrid_reply_to
   ✅ SendGrid columns created successfully
   📧 Email Marketing is now ready for multi-tenant use!
   ```

3. **Done!** The columns are now available.

---

## 🔧 Manual Migration (If Needed)

If automatic migration doesn't work, you can run it manually:

### Option 1: Via npm command (Local Development)
```bash
npm run migrate:sendgrid
```

### Option 2: Via Render Shell (Production)
1. Go to Render.com dashboard
2. Open your service
3. Click **"Shell"** tab
4. Run:
   ```bash
   node scripts/migrate-sendgrid-columns.js
   ```

### Option 3: Direct SQL (Database Console)
1. Connect to your PostgreSQL database
2. Run the SQL from `db/add_sendgrid_settings.sql`:
   ```sql
   ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_api_key VARCHAR(255);
   ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_email VARCHAR(255);
   ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_name VARCHAR(255);
   ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_reply_to VARCHAR(255);
   ```

---

## 📋 Verify Migration

Check if columns exist:

```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name LIKE 'sendgrid%'
ORDER BY column_name;
```

You should see:
```
 column_name         | data_type         | character_maximum_length
---------------------+-------------------+-------------------------
 sendgrid_api_key    | character varying | 255
 sendgrid_from_email | character varying | 255
 sendgrid_from_name  | character varying | 255
 sendgrid_reply_to   | character varying | 255
```

---

## 🎯 Configure SendGrid for Each Client

After migration, each client must configure their own SendGrid settings:

### Step 1: Get SendGrid API Key
1. Go to https://app.sendgrid.com/settings/api_keys
2. Click "Create API Key"
3. Name: "RinglyPro CRM"
4. Permissions: **Full Access** or **Mail Send**
5. Copy the API key (starts with `SG.`)

### Step 2: Authenticate Domain
1. Go to https://app.sendgrid.com/settings/sender_auth/domains
2. Add your domain (e.g., `yourbusiness.com`)
3. Add DNS records (SPF, DKIM, DMARC)
4. Wait for verification (24-48 hours)

### Step 3: Configure in RinglyPro
1. Login to RinglyPro CRM
2. Go to **Settings** → **CRM Integrations**
3. Scroll to **SendGrid Email Marketing**
4. Fill in:
   - **SendGrid API Key**: `SG.xxxxxxxxxxxxx`
   - **From Email Address**: `notify@yourbusiness.com` (must be authenticated)
   - **From Name**: `Your Business Name`
   - **Reply-To Email**: `info@yourbusiness.com` (optional)
5. Click **Save CRM Settings**

### Step 4: Test Email Sending
1. Click **📧 Email Marketing** in MCP Copilot
2. Compose a test email
3. Send to yourself
4. Verify email arrives from your domain

---

## 🔍 Troubleshooting

### Error: "SendGrid not configured for client X"
**Solution:** Client hasn't configured SendGrid yet. Go to CRM Settings and add SendGrid credentials.

### Error: "SendGrid API Key must start with SG."
**Solution:** Invalid API key format. Get a new API key from SendGrid dashboard.

### Error: "SendGrid From Email not configured"
**Solution:** From Email is required when API key is provided. Add a verified email address.

### Error: "column sendgrid_api_key does not exist"
**Solution:** Migration hasn't run.
- **Auto:** Restart the app (it will run automatically)
- **Manual:** Run `npm run migrate:sendgrid`
- **SQL:** Run the SQL migration directly in database

### Emails not being delivered
**Possible causes:**
1. **Domain not authenticated:** Check SendGrid → Sender Authentication
2. **Email not verified:** From Email must be verified in SendGrid
3. **Invalid API key:** Check API key is correct and has Mail Send permissions
4. **Sandbox mode:** Make sure you're not in preview/sandbox mode

### "List-Unsubscribe" header warnings
**Solution:** These are for marketing compliance. To fix:
1. Create an Unsubscribe Group in SendGrid
2. Add the group ID to your environment (optional)
3. Or ignore - the system works fine without it

---

## 📊 What Changed

### Before (Global Configuration)
- Single SendGrid account for all clients
- Environment variables: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- All emails sent from same address
- Shared sender reputation

### After (Multi-Tenant)
- Each client has their own SendGrid account
- Settings stored in database per client
- Emails sent from client's authenticated domain
- Separate sender reputation per client
- Better deliverability and compliance

---

## 🚀 Benefits

**For Clients:**
- ✅ Use their own SendGrid account
- ✅ Send from their own domain
- ✅ Control their sender reputation
- ✅ See analytics in their SendGrid dashboard
- ✅ Billing goes directly to them

**For RinglyPro:**
- ✅ No shared API key security risk
- ✅ Client isolation
- ✅ Easier compliance
- ✅ Better scalability
- ✅ No rate limit conflicts

---

## 📝 Migration Checklist

- [ ] Deploy latest code to Render.com
- [ ] Verify auto-migration ran successfully (check logs)
- [ ] Each client configures SendGrid in CRM Settings
- [ ] Each client authenticates their domain in SendGrid
- [ ] Test email sending from Email Marketing tool
- [ ] Verify emails arrive from correct domain
- [ ] Monitor SendGrid webhooks for delivery events

---

## 🆘 Need Help?

**Check Server Logs:**
```bash
# Render.com Dashboard → Logs
# Look for:
✅ SendGrid columns created successfully
📧 Email Marketing is now ready for multi-tenant use!
```

**Test Configuration:**
```bash
# Check if columns exist
curl https://ringlypro-crm.onrender.com/health | grep sendgrid

# Should return:
"sendgrid": "configured" or "not configured"
```

**Contact Support:**
- Check logs for specific error messages
- Verify DATABASE_URL is set correctly
- Ensure app has database write permissions

---

## 📚 Related Documentation

- [EMAIL_MARKETING_SETUP.md](EMAIL_MARKETING_SETUP.md) - Complete SendGrid setup guide
- [db/add_sendgrid_settings.sql](db/add_sendgrid_settings.sql) - SQL migration file
- [scripts/auto-migrate-sendgrid.js](scripts/auto-migrate-sendgrid.js) - Auto-migration script
- [src/services/sendgrid.js](src/services/sendgrid.js) - Multi-tenant email service

---

**Questions?** The columns are created automatically on app startup. Just deploy and configure! 🎉

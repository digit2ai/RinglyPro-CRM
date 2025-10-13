# CRM Integration - Testing Checklist

## Status: ✅ Migration Complete - Ready to Test!

---

## Quick Tests

### Test 1: Login ✅
**URL:** https://aiagent.ringlypro.com

**Steps:**
1. Go to login page
2. Enter your credentials
3. Click Login

**Expected:** Dashboard loads successfully

---

### Test 2: Settings Page
**Steps:**
1. From dashboard, click **Settings** button (gear icon in Quick Actions)
2. Modal should open with two tabs:
   - 📅 Calendar
   - 🔗 CRM Integrations

**Expected:** Settings modal opens, both tabs visible

---

### Test 3: CRM Integrations Tab
**Steps:**
1. Click **🔗 CRM Integrations** tab
2. Should see GoHighLevel section with:
   - Private Integration Token (API Key) - password field
   - Location ID - text field
   - Help text explaining how to find credentials
   - Save CRM Settings button

**Expected:** Form displays correctly

---

### Test 4: Save GoHighLevel Credentials
**Your Credentials:**
- **API Key:** `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
- **Location ID:** `3lSeAHXNU9t09Hhp9oai` (20 characters)

**Steps:**
1. In CRM Integrations tab, enter your credentials above
2. Click **Save CRM Settings**
3. Wait for success message

**Expected:**
- Success alert: "GoHighLevel integration settings saved successfully!"
- Status indicator changes to "Configured" (green)

---

### Test 5: Verify Credentials Saved
**API Test:**
```bash
curl https://ringlypro-crm.onrender.com/api/client/crm-settings/15
```

**Expected Response:**
```json
{
  "success": true,
  "settings": {
    "ghl_api_key": "pit-...cf24",
    "ghl_api_key_set": true,
    "ghl_location_id": "3lSeAHXNU9t09Hhp9oai"
  }
}
```

---

### Test 6: MCP Copilot Auto-Load 🎉
**Steps:**
1. From dashboard, click **CRM Copilot** button
2. New tab opens with MCP Copilot interface
3. Watch the connection panel on the left

**Expected:**
1. "Loading..." appears briefly
2. "🔄 Auto-connecting to GoHighLevel..." message in chat
3. Status changes to "Connected to GoHighLevel" (green background)
4. "✅ Successfully connected to GoHighLevel!" in chat
5. **NO manual input required!**

---

### Test 7: Test MCP Copilot Functionality
**Steps:**
1. In the chat input at bottom, type: `search contact Manuel`
2. Press Enter or click Send

**Expected:**
- Should return contact search results from your GoHighLevel account
- Should see contact names, emails, and phone numbers

**Try these commands:**
- `search contact [name]`
- `find all contacts`
- `Add contact named John Doe with email john@example.com`

---

## Troubleshooting

### Issue: Login doesn't work
**Check:**
```bash
curl https://ringlypro-crm.onrender.com/api/client/list
```
Should return list of clients.

**If fails:** Render might still be deploying. Wait 1-2 minutes.

---

### Issue: Settings tab doesn't show CRM section
**Check:** Browser cache - do hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

---

### Issue: MCP Copilot doesn't auto-connect
**Check:**
1. Did you save credentials in Settings first?
2. Check browser console (F12) for errors
3. Verify URL has `?client_id=15` parameter

**Manual test:**
```bash
curl https://ringlypro-crm.onrender.com/api/client/crm-credentials/15
```
Should show your credentials.

---

### Issue: "Not configured" after saving
**Check:** Database connection

```sql
SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = 15;
```

Should show your saved credentials.

---

## Complete Feature List

### ✅ Implemented
- [x] Database migration (ghl_api_key, ghl_location_id columns)
- [x] Settings page with tabbed interface
- [x] CRM Integrations tab in Settings
- [x] GoHighLevel credentials form
- [x] Save/retrieve credentials from database
- [x] API key masking for security (pit-...cf24)
- [x] MCP Copilot URL with client_id parameter
- [x] Auto-load credentials from client profile
- [x] Auto-connect to GoHighLevel
- [x] Status indicators (configured/not configured)
- [x] Location ID validation (20 characters)

### 📋 Usage Flow
1. Client logs in to dashboard (once)
2. Opens Settings → CRM Integrations (once)
3. Enters GoHighLevel credentials (once)
4. Saves settings (once)
5. Opens MCP Copilot → Auto-connects! (every time, no input needed!)

---

## Success Criteria

All tests passing means:
✅ Login works without breaking
✅ Database has CRM columns
✅ Settings page shows CRM tab
✅ Credentials can be saved
✅ Credentials are retrieved correctly
✅ MCP Copilot auto-loads credentials
✅ MCP Copilot auto-connects to GHL
✅ No manual credential entry needed

---

## Your Credentials (Quick Reference)

**GoHighLevel:**
- API Key: `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
- Location ID: `3lSeAHXNU9t09Hhp9oai`

**Where to use:**
- Dashboard → Settings → CRM Integrations tab
- Save once, auto-loads forever!

---

**Ready to test!** Start with Test 1 and work through the checklist. Let me know if anything doesn't work as expected.

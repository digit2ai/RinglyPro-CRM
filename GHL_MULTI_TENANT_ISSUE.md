# GHL Multi-Tenant Issue - All Contacts Going to One Account

## The Problem

**Report**: Every user using the CRM AI Agent is creating contacts in only ONE GoHighLevel account (yours), instead of each client's own GHL account.

This indicates that either:
1. All clients are sharing the same GHL API credentials (hardcoded or copied)
2. Clients haven't configured their own GHL credentials
3. There's a bug in how credentials are loaded per client

---

## How It Should Work

### Correct Multi-Tenant Flow:

```
User A logs in → clientId = 12 → Load GHL credentials for client 12 → Create contact in User A's GHL
User B logs in → clientId = 15 → Load GHL credentials for client 15 → Create contact in User B's GHL
User C logs in → clientId = 18 → Load GHL credentials for client 18 → Create contact in User C's GHL
```

### Current Architecture (Already Implemented):

1. **Dashboard Settings Page** (`/dashboard`)
   - Each client can configure their own GHL credentials
   - Saved to `clients.ghl_api_key` and `clients.ghl_location_id`
   - Per-client storage in database

2. **Frontend Credential Loading** (`copilot.js`)
   - Fetches credentials via: `GET /api/client/crm-credentials/:client_id`
   - Stores in `window.ghlCredentials`
   - Uses for MCP connection

3. **Backend Connection** (`src/routes/mcp.js`)
   - Receives `apiKey`, `locationId`, `clientId` from frontend
   - Creates session with these credentials
   - Each session uses the credentials it was given

4. **MCP Operations**
   - Uses the `proxy` object stored in session
   - Proxy was initialized with the client-specific credentials

---

## Diagnostic Steps

### Step 1: Check if Clients Have Configured Their GHL Credentials

Visit this endpoint in your browser (after deploying):
```
https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

This will show:
- Which clients have GHL credentials configured
- Which clients are NOT configured
- **Whether multiple clients are sharing the same GHL credentials** (CRITICAL!)

Example output:
```json
{
  "success": true,
  "summary": {
    "total": 5,
    "configured": 2,
    "notConfigured": 3
  },
  "clients": [
    {
      "id": 12,
      "business_name": "Acme Corp",
      "owner_email": "user@acme.com",
      "api_key_preview": "pit-xxxx1234567890...",
      "ghl_location_id": "abc123",
      "status": "configured"
    },
    {
      "id": 15,
      "business_name": "TechStart",
      "owner_email": "admin@techstart.com",
      "api_key_preview": null,
      "ghl_location_id": null,
      "status": "not_configured"
    }
  ],
  "duplicates": {
    "found": true,
    "count": 1,
    "details": [
      {
        "api_key_prefix": "pit-xxxx1234567890",
        "ghl_location_id": "abc123",
        "client_count": 3,
        "client_ids": "12, 15, 18",
        "business_names": "Acme Corp, TechStart, Widget Co"
      }
    ]
  }
}
```

**⚠️ If duplicates.found = true**: Multiple clients are using the SAME GHL credentials!

### Step 2: Check What Credentials a Specific Client Loads

For a specific client (e.g., client 15):
```
https://aiagent.ringlypro.com/api/client/crm-credentials/15
```

This shows what credentials the copilot will load for that client.

### Step 3: Check Browser Console Logs

When a client opens the CRM AI Agent, check browser console for:
```
📡 Fetching from: https://aiagent.ringlypro.com/api/client/crm-credentials/15
✅ CRM credentials loaded: {gohighlevel: {api_key: "pit-...", location_id: "abc123", configured: true}}
💾 Stored credentials: {apiKey: "pit-...", locationId: "abc123"}
🔗 GoHighLevel configured, auto-connecting...
📤 Sending connection request with clientId: 15
```

If you see the SAME `api_key` and `location_id` for different clients → That's the problem!

### Step 4: Check Render Logs During Connection

When a client connects, check Render logs for:
```
🔍 DEBUG - API Key received: pit-xxxx1234567890...7890
🔍 DEBUG - Location ID received: abc123
🔍 DEBUG - Client ID received: 15
✅ GoHighLevel connected, session: ghl_1730743567890
✅ Client ID stored in session: 15
```

---

## Possible Root Causes

### Cause 1: Clients Haven't Configured Their GHL Credentials

**Symptoms**:
- `/api/client/debug/ghl-credentials` shows most clients as `not_configured`
- Only YOUR client has credentials configured
- Other users see "Not configured" error when opening copilot

**Why This Happens**:
- Each client needs to configure their OWN GHL credentials in Settings
- They may not know they need to do this
- No onboarding flow to guide them

**Solution**:
- Add onboarding instructions
- Email clients asking them to configure GHL in Settings
- Add a setup wizard or required configuration step

### Cause 2: Multiple Clients Are Sharing Your GHL Credentials

**Symptoms**:
- `/api/client/debug/ghl-credentials` shows `duplicates.found = true`
- Multiple clients have the SAME `api_key_preview` and `location_id`
- All contacts go to your GHL account

**Why This Happens**:
- Someone manually copied your credentials to other client records
- Database migration or seed script populated all clients with same credentials
- Admin panel allowed setting credentials for multiple clients at once

**Solution**:
```sql
-- Clear all GHL credentials EXCEPT yours
UPDATE clients
SET ghl_api_key = NULL,
    ghl_location_id = NULL
WHERE id != YOUR_CLIENT_ID  -- Replace with your actual client ID
  AND ghl_api_key IS NOT NULL;
```

Then notify each client to configure their own credentials.

### Cause 3: Frontend Loading Wrong Client's Credentials

**Symptoms**:
- Browser console shows wrong `clientId` being fetched
- URL has `client_id=15` but fetching credentials for different client
- Credentials mismatch between URL and API call

**Why This Happens**:
- Bug in `currentClientId` extraction from URL
- Session/cookie storing wrong client ID
- Race condition in credential loading

**Check**:
Look at [public/mcp-copilot/copilot.js:116](public/mcp-copilot/copilot.js#L116) and [public/mcp-copilot/copilot.js:211](public/mcp-copilot/copilot.js#L211):
```javascript
// Line 116: Extract from URL
const urlParams = new URLSearchParams(window.location.search);
const clientId = urlParams.get('client_id');

// Line 211: Use for API call
const url = `${window.location.origin}/api/client/crm-credentials/${clientId}`;
```

Verify in browser console that `clientId` matches the URL parameter.

### Cause 4: Backend Using Wrong Session Credentials

**Symptoms**:
- Different clients connect successfully
- But all MCP operations use same GHL account
- Render logs show sessions with different clientIds but same results

**Why This Happens**:
- Session credentials not being used correctly
- Proxy object shared between sessions
- Race condition in session storage

**Check**:
Look at [src/routes/mcp.js:1117-1125](src/routes/mcp.js#L1117-L1125):
```javascript
const proxy = new GoHighLevelMCPProxy(apiKey, locationId);
const sessionId = `ghl_${Date.now()}`;

sessions.set(sessionId, {
  type: 'gohighlevel',
  proxy,
  clientId: parseInt(clientId),
  createdAt: new Date()
});
```

Each session should have its OWN proxy with its OWN credentials.

---

## Fix Implementation

### If Cause 1 (Not Configured):

1. **Add onboarding flow** to require GHL configuration
2. **Email all clients** with setup instructions
3. **Add validation** to copilot that prevents use without configuration

### If Cause 2 (Duplicate Credentials):

1. **Run diagnostic endpoint** to identify affected clients
2. **Clear duplicate credentials**:
```sql
-- First, identify YOUR client ID
SELECT id, business_name, owner_email
FROM clients
WHERE owner_email = 'your_email@example.com';

-- Then clear all others
UPDATE clients
SET ghl_api_key = NULL, ghl_location_id = NULL
WHERE id != YOUR_CLIENT_ID
  AND ghl_api_key = (
    SELECT ghl_api_key FROM clients WHERE id = YOUR_CLIENT_ID
  );
```

3. **Notify affected clients** to configure their own credentials

### If Cause 3 or 4 (Bug in Code):

Will need to debug based on diagnostic results. Check:
- Browser console logs
- Render backend logs
- Session storage contents
- API request/response payloads

---

## Testing After Fix

### Test 1: Multiple Clients, Different GHL Accounts

1. Configure Client A with GHL Account A credentials
2. Configure Client B with GHL Account B credentials
3. Log in as Client A → Create contact → Verify appears in GHL Account A
4. Log in as Client B → Create contact → Verify appears in GHL Account B
5. Check GHL Account A → Should NOT have Client B's contact
6. Check GHL Account B → Should NOT have Client A's contact

### Test 2: Verify Diagnostic Endpoint

After all clients configure their credentials:
```bash
curl https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

Should show:
- `duplicates.found = false`
- All clients with `status = "configured"`
- Each client with unique `api_key_preview`

---

## Next Steps

1. **Deploy this update** (includes diagnostic endpoint)
2. **Run diagnostic**: Visit `/api/client/debug/ghl-credentials`
3. **Identify root cause** based on diagnostic results
4. **Apply appropriate fix** from above
5. **Test with multiple clients**
6. **Document process** for onboarding new clients

---

## Diagnostic Endpoint Details

**Endpoint**: `GET /api/client/debug/ghl-credentials`

**Returns**:
- List of all clients with their GHL configuration status
- Summary counts (configured vs not configured)
- Detection of duplicate credentials (multiple clients sharing same GHL account)

**Added in**: [src/routes/client.js:29-97](src/routes/client.js#L29-L97)

**Usage**:
```bash
# Via browser
https://aiagent.ringlypro.com/api/client/debug/ghl-credentials

# Via curl
curl https://aiagent.ringlypro.com/api/client/debug/ghl-credentials

# With pretty printing
curl https://aiagent.ringlypro.com/api/client/debug/ghl-credentials | jq
```

---

## Related Files

- **Frontend credential loading**: [public/mcp-copilot/copilot.js:208-257](public/mcp-copilot/copilot.js#L208-L257)
- **Backend credential API**: [src/routes/client.js:622-682](src/routes/client.js#L622-L682)
- **Backend credential saving**: [src/routes/client.js:507-599](src/routes/client.js#L507-L599)
- **MCP connection**: [src/routes/mcp.js:1090-1143](src/routes/mcp.js#L1090-L1143)
- **Dashboard settings form**: [views/dashboard.ejs](views/dashboard.ejs) (search for "ghl_api_key")

---

## Summary

The system is **designed correctly** for multi-tenant operation. Each client should have their own GHL credentials stored in the database, and the copilot loads the correct credentials per client.

The issue is likely that:
1. Other clients haven't configured their credentials yet, OR
2. Multiple clients are sharing your credentials (copied in database)

**Use the diagnostic endpoint to identify which scenario applies**, then follow the appropriate fix.

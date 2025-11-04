# Quick Fix: GHL Multi-Tenant Issue

## Problem
All users are creating contacts in YOUR GoHighLevel account instead of their own.

## Quick Diagnosis (After Deployment)

### Step 1: Check Diagnostic Endpoint

Visit (or curl):
```
https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

This will immediately tell you:
- How many clients have GHL configured
- **Whether multiple clients are sharing the same credentials** ⚠️

---

## Expected Results & Fixes

### Scenario A: Only YOU Have Credentials Configured

**Diagnostic Output**:
```json
{
  "summary": {
    "total": 5,
    "configured": 1,
    "notConfigured": 4
  },
  "duplicates": {
    "found": false
  }
}
```

**What This Means**: Other users haven't set up their GHL credentials yet.

**Fix**: Each client needs to configure their own GHL credentials:
1. Log into dashboard
2. Go to Settings tab
3. Enter their GHL API Key (PIT token) and Location ID
4. Save

**Action**: Email all users with setup instructions.

---

### Scenario B: Multiple Clients Sharing Your Credentials ⚠️

**Diagnostic Output**:
```json
{
  "summary": {
    "configured": 4,
    "notConfigured": 1
  },
  "duplicates": {
    "found": true,
    "count": 1,
    "details": [
      {
        "client_count": 3,
        "client_ids": "12, 15, 18",
        "business_names": "Your Business, User A, User B"
      }
    ]
  }
}
```

**What This Means**: Multiple clients have the SAME GHL credentials (yours!). All contacts go to your GHL account.

**Fix**: Clear duplicate credentials from database.

#### Step 1: Find Your Client ID
```sql
SELECT id, business_name, owner_email
FROM clients
WHERE owner_email = 'your_email@example.com';
```
Note your client ID (e.g., 12).

#### Step 2: Clear Duplicate Credentials
```sql
-- Replace 12 with YOUR actual client ID
UPDATE clients
SET ghl_api_key = NULL,
    ghl_location_id = NULL
WHERE id != 12  -- Keep YOUR credentials
  AND ghl_api_key IS NOT NULL;
```

#### Step 3: Verify
Visit diagnostic endpoint again - should show only YOU as configured.

#### Step 4: Notify Users
Email affected clients to configure their OWN GHL credentials in Settings.

---

### Scenario C: Each Client Has Different Credentials ✅

**Diagnostic Output**:
```json
{
  "summary": {
    "configured": 4,
    "notConfigured": 1
  },
  "duplicates": {
    "found": false
  }
}
```

**What This Means**: System is configured correctly!

**If contacts still go to one account**, check:

1. **Browser Console** when client opens copilot:
   - Should show their unique credentials loading
   - Verify `api_key` and `location_id` are different per client

2. **Render Logs** during connection:
   - Each client should connect with different API key
   - Check `DEBUG - API Key received` logs

3. **Test with Known Different Accounts**:
   - Have two clients with different GHL accounts create contacts
   - Verify contacts appear in correct GHL accounts

---

## After Fixing

### Test Multi-Tenant Isolation

1. **Configure Test Clients**:
   - Client A → GHL Account A credentials
   - Client B → GHL Account B credentials

2. **Create Contacts**:
   - Log in as Client A → Create contact "Test A"
   - Log in as Client B → Create contact "Test B"

3. **Verify Isolation**:
   - GHL Account A should have ONLY "Test A"
   - GHL Account B should have ONLY "Test B"
   - No cross-contamination

### Monitor Diagnostic Endpoint

Periodically check:
```
https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

Should always show:
- `duplicates.found = false`
- Each configured client with unique credentials

---

## Deployment

Changes are ready to deploy. Once deployed:

1. Visit diagnostic endpoint
2. Identify which scenario applies (A, B, or C)
3. Follow the appropriate fix
4. Test with multiple clients
5. Monitor for cross-contamination

---

## Summary

| Issue | Symptom | Fix |
|-------|---------|-----|
| Users not configured | `configured: 1`, `duplicates: false` | Email users to configure GHL in Settings |
| Sharing credentials | `duplicates.found: true` | Clear duplicate credentials via SQL |
| System working | `duplicates: false`, multiple configured | Test to confirm isolation |

**Key Diagnostic Tool**: `/api/client/debug/ghl-credentials`

**Most Likely Issue**: Either users haven't configured their GHL (Scenario A) OR somehow multiple clients got your credentials copied to their records (Scenario B).

The diagnostic endpoint will immediately reveal which scenario applies.

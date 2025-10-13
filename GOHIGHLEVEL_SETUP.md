# GoHighLevel MCP Integration Setup

## API Permissions Required

The GoHighLevel API key needs the following permissions to work with RinglyPro CRM:

### Required Scopes

1. **contacts.readonly** - Read contacts
   - ✅ Currently working (list/search contacts works)

2. **contacts.write** - Create/update contacts
   - ❌ Currently returning 403 Forbidden
   - **Required for**: Creating new contacts, updating contact details
   - **Error seen**: `"The token does not have access to..."`

3. **conversations.readonly** - Read conversations/messages
   - Needed for SMS history

4. **conversations.write** - Send SMS/messages
   - **Required for**: Sending SMS messages
   - Used by `sendSMS()` function

5. **calendars.readonly** - Read calendars/appointments
   - ✅ Currently working (list calendars works)

6. **opportunities.readonly** - Read opportunities/pipelines
   - ✅ Currently working (show opportunities/pipelines works)

7. **opportunities.write** - Create/update opportunities
   - **Required for**: Adding opportunities to pipeline

## How to Fix 403 Errors

If you see errors like:
```
"success": false,
"status": 403,
"message": "The token does not have access to..."
```

### Solution:

1. Go to GoHighLevel Settings → API Keys
2. Find your API key
3. Click "Edit Scopes"
4. Enable these scopes:
   - ✅ contacts.write
   - ✅ conversations.write
   - ✅ opportunities.write
5. Save changes
6. Update your `.env` file with the new API key (if it changed)
7. Restart the application

## Testing Permissions

After updating permissions, test each function:

```bash
# Test contact creation
create contact TestUser phone 8136414177 email test@example.com

# Test SMS sending
send sms to 8136414177 saying Hello, this is a test!

# Test opportunity creation
add opportunity for test@example.com to Sales Pipeline stage Lead with value $1000
```

## Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| List contacts | ✅ Working | Can retrieve 20+ contacts |
| Search contacts | ✅ Working | Search by name, email, phone |
| Create contacts | ❌ 403 Error | Needs contacts.write scope |
| Send SMS | ❌ Not tested | Needs conversations.write scope |
| List calendars | ✅ Working | Shows 3 calendars |
| List opportunities | ✅ Working | Shows 6 opportunities |
| List pipelines | ✅ Working | Shows 4 pipelines |

## API Key Location

The API key is configured in:
- Environment variable: `GOHIGHLEVEL_API_KEY`
- Database: `crm_settings` table, `gohighlevel_api_key` field

## MCP vs REST API

RinglyPro uses both:
1. **MCP Protocol** (primary) - For standardized operations
2. **REST API** (fallback) - When MCP doesn't support an operation

Both require the same permissions/scopes.

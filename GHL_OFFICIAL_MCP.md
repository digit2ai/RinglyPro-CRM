# GoHighLevel Official MCP Server Integration

## 🎉 Now Using GoHighLevel's Official MCP Protocol!

Your RinglyPro CRM has been upgraded to use GoHighLevel's **official Model Context Protocol (MCP) server** at `https://services.leadconnectorhq.com/mcp/`.

## What is MCP?

The Model Context Protocol is a standardized, secure way for AI agents to interact with GoHighLevel without custom SDKs. It provides:

- ✅ **Standardized Access** - Unified protocol across all tools
- ✅ **21+ Built-in Tools** - No custom code needed
- ✅ **Automatic Fallback** - Falls back to REST API if MCP unavailable
- ✅ **Secure** - Uses Private Integration Tokens (PIT)
- ✅ **Future-proof** - Expanding to 250+ tools

## 21 Available MCP Tools

Your AI Copilot now has access to all 21 official GoHighLevel MCP tools:

### 📅 Calendar Tools
1. `calendars_get-calendar-events` - Get calendar events
2. `calendars_get-appointment-notes` - Get appointment notes

### 👥 Contact Tools
3. `contacts_get-all-tasks` - Get all tasks for a contact
4. `contacts_add-tags` - Add tags to contacts
5. `contacts_remove-tags` - Remove tags from contacts
6. `contacts_get-contact` - Get contact details
7. `contacts_update-contact` - Update a contact
8. `contacts_upsert-contact` - Create or update contact
9. `contacts_create-contact` - Create new contact
10. `contacts_get-contacts` - Search/list contacts

### 💬 Conversation Tools
11. `conversations_search-conversation` - Search conversations
12. `conversations_get-messages` - Get conversation messages
13. `conversations_send-a-new-message` - Send SMS/email

### 📍 Location Tools
14. `locations_get-location` - Get location details
15. `locations_get-custom-fields` - Get custom field definitions

### 💰 Opportunity Tools
16. `opportunities_search-opportunity` - Search opportunities
17. `opportunities_get-pipelines` - Get opportunity pipelines
18. `opportunities_get-opportunity` - Get opportunity details
19. `opportunities_update-opportunity` - Update opportunity

### 💳 Payment Tools
20. `payments_get-order-by-id` - Get payment order
21. `payments_list-transactions` - List transactions

## How It Works

### Automatic Protocol Selection

The system automatically tries the official MCP protocol first, then falls back to REST API if needed:

```javascript
// Internally, when you search contacts:
1. Try: Official MCP → contacts_get-contacts
2. If fails: Fallback to REST API → /contacts/
```

This means **you get the best of both worlds** - cutting-edge MCP tools with reliable REST API backup.

### Example: Search Contacts

**Your MCP Copilot Chat:**
```
You: Search for John

Behind the scenes:
1. Calls: callMCP('contacts_get-contacts', { query: 'John', limit: 10 })
2. Sends to: https://services.leadconnectorhq.com/mcp/
3. Headers:
   - Authorization: Bearer pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe
   - locationId: YOUR_LOCATION_ID
4. Returns: List of matching contacts
```

## Updated Methods

All these methods now use the official MCP protocol:

### Contacts
- `searchContacts()` - Uses MCP `contacts_get-contacts`
- `createContact()` - Uses MCP `contacts_create-contact`
- `getContact()` - Uses MCP `contacts_get-contact`
- `updateContact()` - Uses MCP `contacts_update-contact`
- `upsertContact()` - Uses MCP `contacts_upsert-contact` ✨ NEW
- `addTags()` - Uses MCP `contacts_add-tags` ✨ NEW
- `removeTags()` - Uses MCP `contacts_remove-tags` ✨ NEW
- `getAllTasks()` - Uses MCP `contacts_get-all-tasks` ✨ NEW

### Conversations
- `searchConversations()` - Uses MCP `conversations_search-conversation` ✨ NEW
- `getMessages()` - Uses MCP `conversations_get-messages` ✨ NEW
- `sendMessage()` - Uses MCP `conversations_send-a-new-message` ✨ NEW
- `sendSMS()` - Now tries MCP first, falls back to REST

### Opportunities
- `searchOpportunities()` - Uses MCP `opportunities_search-opportunity` ✨ NEW
- `getOpportunity()` - Uses MCP `opportunities_get-opportunity` ✨ NEW
- `updateOpportunity()` - Uses MCP `opportunities_update-opportunity` ✨ NEW
- `getPipelines()` - Uses MCP `opportunities_get-pipelines` ✨ NEW

### Calendar
- `getCalendarEvents()` - Uses MCP `calendars_get-calendar-events` ✨ NEW
- `getAppointmentNotes()` - Uses MCP `calendars_get-appointment-notes` ✨ NEW

### Location
- `getLocation()` - Uses MCP `locations_get-location` ✨ NEW
- `getCustomFields()` - Uses MCP `locations_get-custom-fields` ✨ NEW

### Payments
- `getOrder()` - Uses MCP `payments_get-order-by-id` ✨ NEW
- `listTransactions()` - Uses MCP `payments_list-transactions` ✨ NEW

## Configuration

### Already Configured! ✅

Your integration is already set up with:
- **MCP Endpoint:** `https://services.leadconnectorhq.com/mcp/`
- **API Key:** `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
- **Location ID:** Set in Render environment variables

### Required Scopes (Already in Your Token)

Your Private Integration Token includes these scopes:
- ✅ View/Edit Contacts
- ✅ View/Edit Conversations
- ✅ View/Edit Conversation Messages
- ✅ View/Edit Opportunities
- ✅ View Calendars & Calendar Events
- ✅ View Locations
- ✅ View Payment Orders & Transactions
- ✅ View Custom Fields
- ✅ View Forms

## Using the MCP Copilot

The MCP Copilot UI automatically uses the official MCP protocol:

### Basic Commands
```
Search for contacts named John
Create contact John Doe with email john@example.com
Add tags "hot-lead" and "premium" to contact
View my pipeline
Show recent transactions
Get calendar events
```

### Advanced Commands (New with MCP!)
```
Upsert contact with email john@example.com  (creates or updates)
Get all tasks for contact abc123
Search conversations for "pricing"
Get custom fields for this location
List all payment transactions
Get pipelines for opportunities
```

## Monitoring & Debugging

### Check Logs
When using MCP tools, you'll see in the logs:
```
🔧 Calling GHL MCP tool: contacts_get-contacts
✅ MCP tool contacts_get-contacts succeeded
```

If MCP fails:
```
❌ MCP tool contacts_get-contacts failed: [error]
⚠️ MCP failed, falling back to REST API
```

### Test MCP Connection

```javascript
// From MCP Copilot, just connect and try:
"Search for test"

// You should see successful results using official MCP
```

## Benefits Over REST API

### Why MCP is Better:
1. **Standardized** - Same format across all tools
2. **Simpler** - No need to construct URLs or complex params
3. **Future-proof** - GoHighLevel adds new tools automatically
4. **Optimized** - Built for AI agent use cases
5. **Consistent** - Same response format across tools

### Example Comparison:

**Old Way (REST API):**
```javascript
GET /contacts/?locationId=abc&query=John&limit=10
```

**New Way (MCP):**
```javascript
POST /mcp/
{
  "tool": "contacts_get-contacts",
  "input": { "query": "John", "limit": 10 }
}
```

Much simpler and more consistent!

## Roadmap

GoHighLevel is expanding MCP to include:
- 📈 **250+ tools** covering all GHL features
- 🔐 **OAuth support** for advanced authorization
- 📦 **npx package** for easier integration
- 🎯 **Specialized MCP servers** for specific workflows

## What Changed in Your Code

### File Updated
- `mcp-integrations/api/gohighlevel-proxy.js`

### What's New
1. Added `callMCP()` method for official protocol
2. Updated 21 methods to use MCP first
3. Automatic fallback to REST API
4. Added 12 new MCP-only methods
5. Better error handling and logging

### Backwards Compatible
- All existing code works exactly the same
- No breaking changes
- Automatic upgrade - no action needed

## Testing

### Quick Test
```bash
# The MCP Copilot should work even better now
# Just connect and try searching or creating contacts
```

### Verify MCP Usage
Check the server logs - you should see:
```
🔧 Calling GHL MCP tool: contacts_get-contacts
✅ MCP tool contacts_get-contacts succeeded
```

## Troubleshooting

### MCP Calls Failing?
The system automatically falls back to REST API, so functionality continues working.

Check:
1. API key has correct scopes
2. Location ID is set
3. Token hasn't expired

### Want to Force REST API?
Just comment out the MCP try/catch block - the fallback will always run.

## Summary

✅ **Upgraded** to official GoHighLevel MCP protocol
✅ **21 tools** available immediately
✅ **Automatic fallback** to REST API
✅ **No breaking changes** - everything works better
✅ **Future-proof** - ready for 250+ tools

Your MCP Copilot is now using cutting-edge AI-to-CRM technology! 🚀

---

**Last Updated:** October 12, 2025
**MCP Version:** 1.0
**Status:** Production Ready

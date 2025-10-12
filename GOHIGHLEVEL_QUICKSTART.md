# GoHighLevel Integration - Quick Start Guide

## What You Have Now

Your RinglyPro CRM now has a complete GoHighLevel MCP integration that allows your AI assistant to interact with your GHL CRM automatically!

## Next Steps to Get Started

### 1. Find Your GoHighLevel Location ID

You need to add your Location ID to complete the setup. Here's how:

1. Log into your GoHighLevel account
2. Go to **Settings** → **Company**
3. Look for your **Location ID** (it's usually a long alphanumeric string)
4. Copy this ID

### 2. Configure Environment Variables on Render

1. Go to your Render dashboard: https://dashboard.render.com/
2. Find your **RinglyPro-CRM** service
3. Click on it, then go to **Environment**
4. Add these two environment variables:
   ```
   GHL_PRIVATE_API_KEY=pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe
   GHL_LOCATION_ID=YOUR_LOCATION_ID_HERE
   ```
5. Click **Save Changes** - this will trigger an automatic redeploy

### 3. Wait for Deployment (2-3 minutes)

Your app will automatically redeploy with the new configuration. You can watch the deployment logs in Render.

### 4. Test the Integration

Once deployed, test the health endpoint:

```bash
curl https://ringlypro-crm.onrender.com/api/ghl/health
```

You should see:
```json
{
  "success": true,
  "service": "GoHighLevel MCP Integration",
  "version": "1.0.0",
  "timestamp": "2025-01-15T..."
}
```

### 5. Test Creating a Contact

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/ghl/contacts/create \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Contact",
    "phone": "+18135559999",
    "email": "test@example.com"
  }'
```

**Note:** Authentication is handled via environment variables, so you don't need to pass API keys in the request headers when testing from your backend.

### 6. Use the AI Welcome Action

This is the coolest feature - it creates a contact, sends them a welcome SMS, and logs a note all in one call:

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/ghl/ai/welcome-contact \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+18135559123",
    "email": "john@example.com",
    "welcomeMessage": "Hi John! Welcome to our service. Looking forward to working with you!"
  }'
```

## Example Use Cases for Your AI Assistant

### Scenario 1: "Add a new lead and send them a message"
**User says:** "Add John Doe with phone 813-555-9123 and send him an intro SMS"

**Your AI calls:**
```
POST /api/ghl/ai/welcome-contact
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+18135559123",
  "welcomeMessage": "Hi John! Thanks for reaching out..."
}
```

### Scenario 2: "Log this conversation and create a follow-up"
**User says:** "Log that I spoke with John about pricing, follow up next week"

**Your AI calls:**
```
POST /api/ghl/ai/log-conversation
{
  "contactId": "contact_abc123",
  "conversationSummary": "Discussed pricing options. Customer interested in premium package.",
  "followUpTask": "Call back to discuss pricing",
  "dueDate": "2025-01-27T10:00:00Z"
}
```

### Scenario 3: "Send a message to a contact"
**User says:** "Send John a text saying the quote is ready"

**Your AI calls:**
```
POST /api/ghl/conversations/messages/sms
{
  "contactId": "contact_abc123",
  "message": "Hi John! Your quote is ready. Let me know when you'd like to review it."
}
```

## Available Endpoints

All endpoints are at: `https://ringlypro-crm.onrender.com/api/ghl/`

### Core Functions
- `POST /contacts/create` - Create new contact
- `GET /contacts/:id` - Get contact details
- `POST /contacts/search` - Search contacts
- `PUT /contacts/:id` - Update contact
- `POST /conversations/messages/sms` - Send SMS
- `POST /conversations/messages/email` - Send email
- `GET /conversations/:contactId/messages` - Get messages
- `POST /contacts/:contactId/notes` - Create note
- `POST /contacts/:contactId/tasks` - Create task
- `POST /appointments/create` - Create appointment
- `POST /opportunities/create` - Create opportunity
- `GET /calendars` - Get calendars
- `GET /opportunities/pipelines` - Get pipelines

### AI Composite Actions
- `POST /ai/welcome-contact` - Create contact + Send SMS + Log note
- `POST /ai/log-conversation` - Log note + Create follow-up task

## Documentation

- **Full API Reference:** See `GOHIGHLEVEL_INTEGRATION.md`
- **Test Script:** Run `node test-ghl-integration.js` (after adding your Location ID to `.env`)

## Troubleshooting

### "Endpoint not found" error
- Wait 2-3 minutes for Render to complete deployment
- Check that environment variables are set in Render dashboard

### "GoHighLevel API key is required" error
- Make sure you've added `GHL_PRIVATE_API_KEY` and `GHL_LOCATION_ID` to Render environment variables
- Save changes and wait for redeploy

### "Failed to create contact" error
- Verify your Location ID is correct
- Check that your GoHighLevel private integration is active
- Ensure your API key has not expired

## Security Notes

- Your API key is stored securely in Render environment variables
- Never expose your API key in client-side code
- The integration handles authentication automatically using env vars

## What's Next?

1. Add your Location ID to Render environment variables
2. Wait for deployment
3. Test the integration
4. Start using it with your AI assistant!

For detailed documentation on all endpoints, see [GOHIGHLEVEL_INTEGRATION.md](./GOHIGHLEVEL_INTEGRATION.md)

---

**Need Help?**
- Check the full documentation: `GOHIGHLEVEL_INTEGRATION.md`
- Run the test suite: `node test-ghl-integration.js`
- Review GoHighLevel API docs: https://highlevel.stoplight.io/

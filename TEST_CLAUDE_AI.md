# Claude AI Integration - Testing Guide

## Status: ✅ FULLY DEPLOYED

### Completed Steps:
1. ✅ Environment variables added to Render
   - ANTHROPIC_API_KEY configured
   - ENABLE_CLAUDE_AI=true
2. ✅ Database API key fixed (ghl_api_key updated)
3. ✅ Code deployed to production (commit 50d209c)

---

## Available Commands (17 Capabilities)

### Contact Management
1. **Search contacts**: "find john" / "search for sarah@example.com"
2. **Create contacts**: "create a contact named Mike with phone 555-1234"
3. **Update contacts**: "update sarah's phone to 555-9999"
4. **Delete contacts**: "delete john's contact"

### Communication
5. **Send SMS**: "text alina 'Meeting at 2pm tomorrow'"
6. **Send Email**: "email john with subject 'Follow up' and message 'Let's connect'"

### Tag Management
7. **Add tags**: "add vip and hot-lead tags to sarah"
8. **Remove tags**: "remove cold-lead tag from mike"
ran the bulk outbo
### Opportunities & Pipelines
9. **View pipelines**: "show me all pipelines" / "what pipelines do we have?"
10. **Create opportunity**: "create a $5000 deal for john in sales pipeline"
11. **View opportunities**: "show all opportunities" / "list deals"

### CRM Information
12. **View calendars**: "show calendars" / "what calendars are available?"
13. **Get location**: "show location info"
14. **Get custom fields**: "what custom fields do we have?"

---

## Test Scenarios

### Test 1: Update Contact
```
User: "update sarah's email to sarah.new@example.com"
Expected: AI asks for confirmation → User confirms → Contact updated
```

### Test 2: Create Opportunity
```
User: "create a deal for john worth $3000 in the sales pipeline"
Expected: AI confirms details → User confirms → Opportunity created
```

### Test 3: Send SMS
```
User: "text alina saying 'Your appointment is confirmed'"
Expected: AI shows message preview → User confirms → SMS sent
```

### Test 4: Add Tags
```
User: "add vip and hot-lead tags to mike"
Expected: AI confirms tags → User confirms → Tags added
```

### Test 5: View Pipelines
```
User: "show me all pipelines"
Expected: AI lists all pipelines with stages
```

---

## Testing the Chatbot

### Option 1: Via MCP Copilot UI
1. Go to: https://ringlypro-crm.onrender.com/tools/mcp-copilot
2. Select your client from dropdown
3. Start typing natural language commands

### Option 2: Via API
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "show me all pipelines",
    "clientId": 15,
    "sessionId": "test-session-123"
  }'
```

---

## Expected Behavior

### Confirmation Flow
For all actions (except search/view), the AI will:
1. Understand your request
2. Find the contact if needed
3. Ask for confirmation with details
4. Wait for "yes" / "confirm" / "do it"
5. Execute the action
6. Show success message

### Error Handling
- If contact not found: "❌ No contact found matching 'xyz'"
- If pipeline not found: "❌ Pipeline 'xyz' not found. Available pipelines: ..."
- If action fails: Clear error message with suggestion

---

## Cost Monitoring

- **Per conversation**: $0.02-0.04
- **Current usage**: Monitor in Anthropic console
- **Monthly estimate**: ~$15-25 for 1,000 conversations
- **With caching**: ~$10-15/month

---

## Troubleshooting

### If AI doesn't respond:
1. Check Render logs: `https://dashboard.render.com/`
2. Verify environment variables are set
3. Check ENABLE_CLAUDE_AI=true

### If "Invalid JWT" error:
Database API key is correct now (pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe)

### If actions don't execute:
1. Check that user said "yes" / "confirm" to confirmation prompt
2. Verify GHL API key has correct permissions
3. Check Render logs for detailed error messages

---

## Quick Verification

Test these 3 commands to verify everything works:

1. **Search**: "find sarah"
2. **View Pipelines**: "show all pipelines"
3. **Update**: "update sarah's phone to 555-9999" → confirm with "yes"

If all 3 work, the integration is fully functional! 🎉

---

## Next Features (Future Enhancements)

- Create appointments/bookings
- Update opportunities
- View appointments
- Search by custom fields
- Bulk operations
- Advanced filtering

---

Generated: 2025-10-27
Deployment: Production Ready ✅

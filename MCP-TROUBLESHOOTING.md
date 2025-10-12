# 🔧 MCP Integration Troubleshooting Guide

## ✅ Fixed Issues (Latest Update)

### Issue: 500 Error on `/api/mcp/copilot/chat`
**Status**: ✅ FIXED (Commit: 06818b0)

**What was wrong**:
- Incorrect relative paths for MCP module imports
- Missing input validation
- Poor error logging

**What was fixed**:
- ✅ Corrected module import paths using absolute paths
- ✅ Added comprehensive input validation
- ✅ Added detailed error logging for all endpoints
- ✅ Improved error messages for better debugging

---

## 🧪 Testing Your Deployment

### 1. Check if MCP Routes Loaded
Look for this in your Render logs:
```
✅ MCP integration routes loaded successfully
🤖 MCP AI Copilot routes mounted at /api/mcp
```

If you see:
```
⚠️ MCP integration routes not available
```
Then check that all MCP files exist in your deployment.

### 2. Test Health Endpoint
```bash
curl https://your-service.onrender.com/api/mcp/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "MCP Integration",
  "activeSessions": 0,
  "timestamp": "2025-10-12T..."
}
```

### 3. Test Connection Endpoint
```bash
curl -X POST https://your-service.onrender.com/api/mcp/hubspot/connect \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "your-test-token"}'
```

Expected response (success):
```json
{
  "success": true,
  "sessionId": "hs_1697...",
  "message": "HubSpot connected successfully"
}
```

Expected response (error):
```json
{
  "success": false,
  "error": "Access token is required"
}
```

### 4. Test Chat Endpoint
First connect, then:
```bash
curl -X POST https://your-service.onrender.com/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "message": "Hello"
  }'
```

---

## 🐛 Common Issues & Solutions

### Issue: "Invalid or expired session"
**Symptom**: 401 error when trying to chat

**Cause**: No active CRM connection

**Solution**: Connect to HubSpot or GoHighLevel first through the UI

**Check logs for**:
```
❌ Invalid session: hs_...
```

---

### Issue: "Missing sessionId or message"
**Symptom**: 400 error on chat endpoint

**Cause**: Request body missing required fields

**Solution**: Ensure you're sending both `sessionId` and `message` in the request body

**Check logs for**:
```
❌ Missing sessionId or message
```

---

### Issue: "Access token is required"
**Symptom**: 400 error when connecting to HubSpot

**Cause**: Missing or empty access token in request

**Solution**: Provide a valid HubSpot access token

**Check logs for**:
```
❌ Missing HubSpot access token
```

---

### Issue: "API Key and Location ID are required"
**Symptom**: 400 error when connecting to GoHighLevel

**Cause**: Missing GoHighLevel credentials

**Solution**: Provide both API key and Location ID

**Check logs for**:
```
❌ Missing GoHighLevel credentials
```

---

### Issue: MCP modules not found
**Symptom**: Error loading MCP routes on startup

**Cause**: `mcp-integrations/` directory missing from deployment

**Solution**:
1. Verify files exist locally:
   ```bash
   ls -la mcp-integrations/api/
   ```
2. Ensure they're committed to git
3. Redeploy on Render

---

### Issue: Web UI not loading
**Symptom**: 404 on `/mcp-copilot/`

**Cause**: Static files not being served

**Solution**:
1. Check `public/mcp-copilot/` directory exists
2. Verify `app.js` has static file middleware:
   ```javascript
   app.use(express.static(path.join(__dirname, '../public')));
   ```
3. Try accessing: `/mcp-copilot/index.html` directly

---

## 📊 Monitoring & Logs

### What to Look For in Logs

**Successful startup:**
```
✅ MCP integration routes loaded successfully
🤖 MCP AI Copilot routes mounted at /api/mcp
```

**Successful connection:**
```
🔗 HubSpot connection request received
✅ HubSpot connected, session: hs_1697...
```

**Successful chat:**
```
📩 MCP Chat request received: { sessionId: 'hs_...', message: 'Hello' }
🤖 Processing message for session: hs_...
✅ MCP Chat response ready
```

**Errors to watch for:**
```
❌ Invalid session: hs_...
❌ Missing sessionId or message
❌ HubSpot connection error: [error details]
❌ MCP Chat error: [error details]
```

---

## 🔍 Debugging Steps

### Step 1: Verify Deployment
```bash
# Check health
curl https://your-service.onrender.com/api/mcp/health

# Should return: {"status":"ok",...}
```

### Step 2: Check Logs in Render
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. Look for MCP-related messages

### Step 3: Test Connection Flow
1. Open UI: `/mcp-copilot/`
2. Open browser console (F12)
3. Select CRM and enter credentials
4. Click Connect
5. Watch for errors in console

### Step 4: Test Chat Flow
1. After connecting, type a message
2. Click Send
3. Watch network tab in browser (F12 → Network)
4. Check request/response for `/api/mcp/copilot/chat`

---

## 🆘 Still Having Issues?

### Collect This Information:

1. **Error message** (from browser console or logs)
2. **Request URL** (from Network tab)
3. **Request payload** (from Network tab)
4. **Response status** (200, 400, 401, 500, etc.)
5. **Server logs** (from Render)

### Check These Files Exist:

```bash
src/routes/mcp.js
mcp-integrations/api/hubspot-proxy.js
mcp-integrations/api/gohighlevel-proxy.js
mcp-integrations/webhooks/webhook-manager.js
mcp-integrations/workflows/workflow-engine.js
public/mcp-copilot/index.html
public/mcp-copilot/copilot.js
public/mcp-copilot/styles.css
```

### Verify Environment Variables:

These are optional but if set, should be valid:
- `HUBSPOT_ACCESS_TOKEN`
- `GHL_API_KEY`
- `GHL_LOCATION_ID`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`

---

## 📝 Recent Changes Log

### 2025-10-12 - v1.1 (Commit: 06818b0)
- ✅ Fixed module import paths
- ✅ Added input validation
- ✅ Improved error logging
- ✅ Fixed 500 errors on chat endpoint

### 2025-10-12 - v1.0 (Commit: ce0eb16)
- ✅ Initial MCP integration
- ✅ Added routes to Express app
- ✅ Web UI deployed

---

## ✅ Quick Health Check

Run this to verify everything is working:

```bash
# 1. Health check
curl https://your-service.onrender.com/api/mcp/health

# 2. Test invalid chat (should return 401)
curl -X POST https://your-service.onrender.com/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "invalid", "message": "test"}'

# 3. Test missing params (should return 400)
curl -X POST https://your-service.onrender.com/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{}'
```

All three should return proper error responses (not HTML error pages).

---

## 🎯 Expected Behavior

### When Everything Works:

1. **Health check** returns 200 OK
2. **Connect endpoint** creates a session and returns session ID
3. **Chat endpoint** returns AI response with suggestions
4. **Web UI** loads without 404s
5. **Logs show** emoji-decorated status messages

### Normal Workflow:

```
User opens /mcp-copilot/
    ↓
User selects CRM and enters credentials
    ↓
POST /api/mcp/hubspot/connect
    ↓
Server creates session and returns sessionId
    ↓
User types message
    ↓
POST /api/mcp/copilot/chat with sessionId
    ↓
Server processes message and returns response
    ↓
UI displays response and suggestions
```

---

**Last Updated**: 2025-10-12
**Current Version**: v1.1
**Latest Commit**: 06818b0

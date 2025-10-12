# 🚀 Render Deployment Guide for RinglyPro MCP Integration

## ✅ Code Successfully Pushed to GitHub!

Your MCP integration has been committed and pushed to:
**Repository**: https://github.com/digit2ai/RinglyPro-CRM.git
**Branch**: main
**Commit**: 6ee1b6f

---

## 📋 Deploy to Render - Step by Step

### Step 1: Go to Render Dashboard
Visit: https://dashboard.render.com

### Step 2: Create New Web Service
1. Click **"New +"** button (top right)
2. Select **"Web Service"**

### Step 3: Connect Your Repository
1. Click **"Connect a repository"**
2. If first time, authorize Render to access GitHub
3. Find and select: **digit2ai/RinglyPro-CRM**
4. Click **"Connect"**

### Step 4: Configure Service
Render should auto-detect your `render.yaml` configuration, but verify these settings:

**Basic Settings:**
- **Name**: `ringlypro-mcp-api` (or your preferred name)
- **Region**: Oregon (US West)
- **Branch**: `main`
- **Runtime**: Node
- **Build Command**: `cd mcp-integrations && npm install`
- **Start Command**: `cd mcp-integrations && npm start`

### Step 5: Add Environment Variables
Click **"Environment"** tab and add these variables:

#### Required (Choose at least one CRM):

**For HubSpot:**
```
HUBSPOT_ACCESS_TOKEN=pat-na1-your-actual-hubspot-token-here
```

**For GoHighLevel:**
```
GHL_API_KEY=your-actual-ghl-api-key-here
GHL_LOCATION_ID=your-actual-location-id-here
```

#### Optional (for enhanced features):

**For AI-powered chat:**
```
ANTHROPIC_API_KEY=sk-ant-your-claude-api-key
```

**For voice features:**
```
OPENAI_API_KEY=sk-your-openai-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key-here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

**Other settings (already configured):**
```
NODE_ENV=production
PORT=3001
MCP_PORT=3001
```

### Step 6: Deploy
1. Click **"Create Web Service"**
2. Wait 2-3 minutes for deployment
3. Watch the build logs for any errors

---

## 🎯 After Deployment

### Your URLs will be:

**Main API**: `https://ringlypro-mcp-api.onrender.com`

**Health Check**: `https://ringlypro-mcp-api.onrender.com/api/mcp/health`

**Web Interface**: `https://ringlypro-mcp-api.onrender.com/mcp-copilot/`

### Test Your Deployment:

```bash
# Health check
curl https://ringlypro-mcp-api.onrender.com/api/mcp/health

# Expected response:
# {"status":"ok","activeSessions":0,"timestamp":"2025-..."}
```

---

## 🔐 Getting Your API Credentials

### HubSpot Access Token:
1. Go to https://app.hubspot.com
2. Click Settings (gear icon) → Integrations → Private Apps
3. Create a new Private App
4. Give it scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`
5. Copy the Access Token

### GoHighLevel API Key:
1. Go to https://app.gohighlevel.com
2. Settings → Integrations → API Keys
3. Create new API Key
4. Copy API Key and Location ID

### Claude API Key (Optional):
1. Go to https://console.anthropic.com
2. Account → API Keys
3. Create new key
4. Copy the key

---

## 🔧 Troubleshooting

### Build Failed?
- Check build logs in Render dashboard
- Verify `package.json` is present
- Ensure Node.js version is 18+

### Service Won't Start?
- Check you added at least one CRM credential (HubSpot OR GoHighLevel)
- Verify environment variables are set correctly
- Check application logs for errors

### API Returns 401 Errors?
- Verify your API tokens are correct
- Check token hasn't expired
- Ensure token has proper permissions

### Can't Access UI?
- Make sure service is deployed successfully
- Check URL: `https://your-service-name.onrender.com/mcp-copilot/`
- Verify static files are being served

---

## 📊 Monitor Your Service

### In Render Dashboard:
- **Logs**: View real-time application logs
- **Metrics**: Monitor CPU, memory usage
- **Events**: Track deployments and restarts
- **Environment**: Update environment variables

### Health Check Endpoint:
Render automatically pings: `/api/mcp/health`
- If it returns 200 OK, service is healthy
- If it fails, Render will restart the service

---

## 🔄 Update Your Deployment

When you make changes:

```bash
# Make your changes, then:
git add .
git commit -m "Your update message"
git push origin main
```

Render will automatically detect the push and redeploy!

---

## 🎉 You're Live!

Once deployed:

1. **Test the API**: Visit your health check URL
2. **Use the UI**: Open `/mcp-copilot/` in your browser
3. **Connect your CRM**: Enter credentials in the web interface
4. **Start chatting**: Use the AI Copilot!

---

## 📱 Next Steps

- Test all API endpoints
- Configure webhooks in HubSpot/GoHighLevel
- Set up custom workflows
- Integrate with your existing apps
- Monitor usage and performance

---

## 🆘 Need Help?

- Check logs in Render dashboard
- Review documentation: `MCP-INTEGRATION-COMPLETE.md`
- Test locally first: `cd mcp-integrations && npm start`
- Verify API credentials are correct

---

## 🎊 Congratulations!

Your RinglyPro MCP Integration is now live and ready to use!

**Service URL**: https://ringlypro-mcp-api.onrender.com
**Repository**: https://github.com/digit2ai/RinglyPro-CRM
**Documentation**: See `MCP-INTEGRATION-COMPLETE.md`

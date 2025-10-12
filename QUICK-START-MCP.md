# RinglyPro MCP Integration - Quick Start Guide

## ✅ Installation Complete!

Your RinglyPro MCP integration has been successfully installed and tested.

## 🚀 Start Using It Now

### Option 1: Quick Start (Recommended)

```bash
cd mcp-integrations
./start-local.sh
```

Then open: http://localhost:3001/mcp-copilot/

### Option 2: Manual Start

```bash
cd mcp-integrations
npm start
```

## 🔑 Configure Your API Keys

Before using the integration, edit your credentials:

```bash
nano mcp-integrations/.env
```

Add your API keys:
```env
# For HubSpot users:
HUBSPOT_ACCESS_TOKEN=pat-na1-your-actual-token-here

# For GoHighLevel users:
GHL_API_KEY=your-actual-api-key-here
GHL_LOCATION_ID=your-location-id-here

# Optional - For enhanced AI:
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional - For voice features:
OPENAI_API_KEY=sk-your-openai-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key-here
```

## 📱 Using the Web Interface

1. Start the server (see above)
2. Open http://localhost:3001/mcp-copilot/
3. Select your CRM (HubSpot or GoHighLevel)
4. Enter your credentials
5. Start chatting with the AI Copilot!

Example queries:
- "Search for contacts with email containing @gmail.com"
- "Create a new contact"
- "Show me all my deals"

## 🔗 API Endpoints

### Health Check
```bash
curl http://localhost:3001/api/mcp/health
```

### Connect to HubSpot
```bash
curl -X POST http://localhost:3001/api/mcp/hubspot/connect \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "YOUR_TOKEN"}'
```

### Connect to GoHighLevel
```bash
curl -X POST http://localhost:3001/api/mcp/gohighlevel/connect \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_KEY", "locationId": "YOUR_LOCATION_ID"}'
```

### Chat with AI Copilot
```bash
curl -X POST http://localhost:3001/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "message": "search contacts"
  }'
```

## 🖥️ Claude Desktop Integration

Want to use RinglyPro directly from Claude Desktop?

1. Find your Claude config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this configuration:
```json
{
  "mcpServers": {
    "ringlypro": {
      "command": "node",
      "args": ["/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/mcp-integrations/claude-server.js"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "your-token-here",
        "GHL_API_KEY": "your-key-here",
        "GHL_LOCATION_ID": "your-location-here"
      }
    }
  }
}
```

3. Restart Claude Desktop
4. You'll see RinglyPro tools available in Claude!

## 📦 Deploy to Production (Render)

### Step 1: Commit Your Code
```bash
git add .
git commit -m "Add MCP AI Copilot integration"
git push origin main
```

### Step 2: Deploy to Render

Your `render.yaml` is already configured. Just:

1. Go to https://dashboard.render.com
2. Create a new Web Service
3. Connect your GitHub repo
4. Render will auto-detect `render.yaml`
5. Add environment variables in Render dashboard
6. Click "Create Web Service"

Your MCP API will be live at: `https://ringlypro-mcp-api.onrender.com`

## 📚 What You Can Do

### HubSpot Features
- ✅ Search and manage contacts
- ✅ Create and update deals
- ✅ Add tasks and notes
- ✅ Schedule appointments
- ✅ Track activities

### GoHighLevel Features
- ✅ Contact management
- ✅ Opportunity tracking
- ✅ Send SMS and emails
- ✅ Calendar integration
- ✅ Workflow automation

### AI Copilot Features
- ✅ Natural language CRM queries
- ✅ Intelligent contact search
- ✅ Automated task creation
- ✅ Quick actions and shortcuts
- ✅ Context-aware suggestions

### Advanced Features
- ✅ Webhook processing for real-time events
- ✅ Custom workflow automation
- ✅ Voice integration (TTS/STT)
- ✅ Multi-CRM session management

## 🛠️ Troubleshooting

### "Port already in use"
```bash
# Change port in .env
echo "MCP_PORT=3002" >> mcp-integrations/.env
```

### "Module not found"
```bash
cd mcp-integrations
rm -rf node_modules package-lock.json
npm install
```

### "Invalid credentials"
- Verify your API tokens in `.env`
- Check token permissions in HubSpot/GHL
- Ensure tokens haven't expired

### UI not loading
```bash
# Check if files exist
ls -la public/mcp-copilot/
# Should show: index.html, copilot.js, styles.css
```

## 📖 Documentation

- **Full Documentation**: [MCP-INTEGRATION-COMPLETE.md](./MCP-INTEGRATION-COMPLETE.md)
- **MCP README**: [mcp-integrations/README-MCP.md](./mcp-integrations/README-MCP.md)
- **API Reference**: See endpoints in server.js

## 🎯 Next Steps

1. ✅ Configure your API credentials
2. ✅ Start the server
3. ✅ Test the web interface
4. ✅ Try the API endpoints
5. ✅ Set up Claude Desktop integration
6. ✅ Deploy to production

## 💡 Pro Tips

- Use the web UI for testing and development
- Use the API for integrations with other apps
- Use Claude Desktop for AI-powered CRM interactions
- Check logs for debugging: `cd mcp-integrations && npm start`
- Monitor webhook activity in real-time

## 🆘 Need Help?

1. Check the full documentation: `MCP-INTEGRATION-COMPLETE.md`
2. Review the logs when running `npm start`
3. Test individual components separately
4. Verify API credentials are correct

## 🎉 You're Ready!

Your RinglyPro MCP integration is fully set up and ready to use. Start exploring the AI Copilot capabilities and enhance your CRM workflow!

---

**Quick Commands:**

```bash
# Start server
cd mcp-integrations && npm start

# Run tests
./test-mcp.sh

# Check status
curl http://localhost:3001/api/mcp/health

# View logs
cd mcp-integrations && npm start

# Deploy
git push origin main
```

Happy coding! 🚀

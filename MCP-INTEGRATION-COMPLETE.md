# RinglyPro MCP Integration - Setup Complete! ✅

## What Was Created

Your RinglyPro application now has a complete MCP (Model Context Protocol) integration system with AI Copilot capabilities for HubSpot and GoHighLevel CRMs.

### Directory Structure

```
mcp-integrations/
├── api/
│   ├── hubspot-proxy.js          # HubSpot API wrapper
│   ├── gohighlevel-proxy.js      # GoHighLevel API wrapper
│   └── claude-integration.js     # Claude AI & MCP server
├── voice/
│   ├── voice-handler.js          # Voice session management
│   ├── tts-service.js            # Text-to-Speech (ElevenLabs)
│   └── stt-service.js            # Speech-to-Text (OpenAI Whisper)
├── webhooks/
│   ├── webhook-manager.js        # Webhook orchestration
│   ├── hubspot-webhooks.js       # HubSpot webhook handlers
│   └── ghl-webhooks.js           # GoHighLevel webhook handlers
├── workflows/
│   ├── workflow-engine.js        # Custom workflow automation
│   └── workflow-templates.json   # Pre-built workflow templates
├── server.js                     # Main Express API server
├── claude-server.js              # MCP server for Claude Desktop
├── package.json                  # Dependencies
├── .env.example                  # Environment template
├── .env                          # Your environment config
└── README-MCP.md                 # Documentation

public/mcp-copilot/
├── index.html                    # AI Copilot web interface
├── copilot.js                    # Frontend JavaScript
└── styles.css                    # UI styles
```

## Features Included

✅ **AI Copilot Interface**
   - Chat-based CRM interaction
   - Natural language queries
   - Contact search and management
   - Deal/opportunity tracking

✅ **HubSpot Integration**
   - Contact CRUD operations
   - Deal management
   - Task creation
   - Notes and activity tracking
   - Appointment scheduling

✅ **GoHighLevel Integration**
   - Contact management
   - Opportunity tracking
   - SMS and Email sending
   - Calendar and appointments
   - Workflow automation

✅ **Voice Integration** (Optional)
   - Text-to-Speech via ElevenLabs
   - Speech-to-Text via OpenAI Whisper
   - Voice session management
   - Real-time transcription

✅ **Webhook System**
   - Real-time event processing
   - HubSpot webhook handlers
   - GoHighLevel webhook handlers
   - Custom event routing

✅ **Workflow Engine**
   - Custom workflow creation
   - Multi-step automation
   - Error handling
   - Execution history

✅ **Claude Desktop Integration**
   - MCP server for Claude
   - Tool-based interactions
   - Seamless CRM access from Claude

## Next Steps

### 1. Configure Your Credentials

Edit `mcp-integrations/.env` and add your API keys:

```bash
# For HubSpot
HUBSPOT_ACCESS_TOKEN=your-hubspot-token

# For GoHighLevel
GHL_API_KEY=your-ghl-api-key
GHL_LOCATION_ID=your-location-id

# Optional: For enhanced AI features
ANTHROPIC_API_KEY=your-claude-api-key

# Optional: For voice features
OPENAI_API_KEY=your-openai-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### 2. Start the Server Locally

```bash
cd mcp-integrations
npm start
```

The server will run on http://localhost:3001

### 3. Test the UI

Open http://localhost:3001/mcp-copilot/ in your browser:
- Select your CRM (HubSpot or GoHighLevel)
- Enter your credentials
- Start chatting with the AI Copilot

### 4. Test API Endpoints

```bash
# Health check
curl http://localhost:3001/api/mcp/health

# Connect to HubSpot
curl -X POST http://localhost:3001/api/mcp/hubspot/connect \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "your-token"}'

# Chat with AI Copilot
curl -X POST http://localhost:3001/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "your-session-id", "message": "search contacts"}'
```

## Deploy to Render

### Option 1: Auto-Deploy via render.yaml

1. Commit and push your changes:
```bash
git add .
git commit -m "Add MCP AI Copilot integration"
git push origin main
```

2. Go to [Render Dashboard](https://dashboard.render.com)
3. Render will detect `render.yaml` and create the service
4. Add environment variables in Render dashboard

### Option 2: Manual Deploy

1. Create a new Web Service in Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `cd mcp-integrations && npm install`
   - **Start Command**: `cd mcp-integrations && npm start`
   - **Environment Variables**: Add all keys from `.env`

Your MCP API will be live at: `https://ringlypro-mcp-api.onrender.com`

## Claude Desktop Integration

To use this with Claude Desktop, add to your Claude config:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ringlypro": {
      "command": "node",
      "args": ["/path/to/RinglyPro-CRM/mcp-integrations/claude-server.js"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "your-token",
        "GHL_API_KEY": "your-key",
        "GHL_LOCATION_ID": "your-location"
      }
    }
  }
}
```

Restart Claude Desktop and you'll see RinglyPro tools available!

## API Documentation

### Authentication Endpoints

- `POST /api/mcp/hubspot/connect` - Connect to HubSpot
- `POST /api/mcp/gohighlevel/connect` - Connect to GoHighLevel

### CRM Operations

- `POST /api/mcp/:crm/search-contacts` - Search contacts
- `POST /api/mcp/:crm/create-contact` - Create new contact
- `POST /api/mcp/:crm/get-deals` - Get deals/opportunities

### AI Copilot

- `POST /api/mcp/copilot/chat` - Chat with AI assistant

### Webhooks

- `POST /api/mcp/webhooks/:source` - Receive webhooks from CRMs

### Workflows

- `GET /api/mcp/workflows` - List all workflows
- `POST /api/mcp/workflows` - Create new workflow
- `POST /api/mcp/workflows/:id/execute` - Execute workflow

### Health & Status

- `GET /api/mcp/health` - Server health check

## Architecture

```
┌─────────────────┐
│   Web UI        │ ← User interacts via browser
└────────┬────────┘
         │
┌────────▼────────┐
│  Express API    │ ← REST API server (port 3001)
│   (server.js)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐   ┌─▼────┐
│HS API│   │GHL API│ ← CRM Proxy Layer
└───┬──┘   └─┬────┘
    │        │
┌───▼────────▼───┐
│  Webhook Mgr   │ ← Event processing
└────────┬───────┘
         │
┌────────▼───────┐
│ Workflow Engine│ ← Automation
└────────────────┘
```

## Troubleshooting

### Dependencies Not Installing
```bash
cd mcp-integrations
rm -rf node_modules package-lock.json
npm install
```

### Port Already in Use
Edit `.env` and change `MCP_PORT=3001` to another port

### API Connection Errors
- Verify your API tokens are correct
- Check that tokens have proper permissions
- Ensure your IP is whitelisted (if required)

### Claude Desktop Not Connecting
- Check the path to `claude-server.js` is correct
- Verify environment variables are set
- Restart Claude Desktop completely

## Security Notes

⚠️ **Important Security Reminders:**

1. Never commit `.env` file with real credentials
2. Use environment variables on Render for production
3. Rotate API keys regularly
4. Use HTTPS in production
5. Implement rate limiting for public endpoints
6. Validate and sanitize all webhook inputs

## Support

For issues or questions:
1. Check the logs: `cd mcp-integrations && npm start`
2. Review the README: `mcp-integrations/README-MCP.md`
3. Test individual components separately
4. Check CRM API status pages

## What's Next?

You can now:
- ✨ Enhance the AI prompts in `claude-integration.js`
- 🎨 Customize the UI in `public/mcp-copilot/`
- 🔧 Add more workflow templates
- 📊 Integrate with analytics
- 🔔 Add more webhook handlers
- 🎙️ Implement voice features
- 📱 Create a mobile-friendly interface

---

**Congratulations!** Your RinglyPro MCP integration is ready to use! 🎉

Built with:
- Node.js + Express
- Claude AI (Anthropic)
- Model Context Protocol (MCP)
- HubSpot & GoHighLevel APIs
- ElevenLabs (TTS) + OpenAI Whisper (STT)

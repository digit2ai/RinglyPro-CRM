# RinglyPro MCP Integration

AI Copilot for HubSpot and GoHighLevel CRMs with voice, webhooks, and workflows.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in credentials

3. Start server:
```bash
npm start
```

4. Open UI at http://localhost:3001/mcp-copilot/

## Features

- 🤖 AI Copilot for HubSpot & GoHighLevel
- 🎙️ Voice integration (TTS/STT)
- 🔔 Real-time webhooks
- ⚙️ Custom workflow automation
- 🖥️ Claude Desktop integration

## API Endpoints

- `POST /api/mcp/hubspot/connect`
- `POST /api/mcp/gohighlevel/connect`
- `POST /api/mcp/copilot/chat`
- `POST /api/mcp/webhooks/:source`
- `GET/POST /api/mcp/workflows`

## Deploy to Render

```bash
git push origin main
```

Render will auto-deploy using render.yaml config.

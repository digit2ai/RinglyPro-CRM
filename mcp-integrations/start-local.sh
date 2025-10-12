#!/bin/bash

echo "🚀 Starting RinglyPro MCP Integration Server..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your API credentials."
    echo ""
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "✅ Starting server on port ${MCP_PORT:-3001}..."
echo ""
echo "🌐 Web UI: http://localhost:${MCP_PORT:-3001}/mcp-copilot/"
echo "📊 Health: http://localhost:${MCP_PORT:-3001}/api/mcp/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start

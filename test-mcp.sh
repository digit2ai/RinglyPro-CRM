#!/bin/bash
echo "🧪 Testing MCP Integration Setup..."
echo ""

# Test 1: Check files exist
echo "1️⃣ Checking core files..."
FILES=(
  "mcp-integrations/server.js"
  "mcp-integrations/package.json"
  "mcp-integrations/.env"
  "public/mcp-copilot/index.html"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file"
  else
    echo "   ❌ $file - MISSING!"
  fi
done

# Test 2: Check node modules
echo ""
echo "2️⃣ Checking dependencies..."
if [ -d "mcp-integrations/node_modules" ]; then
  echo "   ✅ node_modules installed"
else
  echo "   ❌ node_modules missing - run: cd mcp-integrations && npm install"
fi

# Test 3: Syntax check
echo ""
echo "3️⃣ Checking JavaScript syntax..."
cd mcp-integrations
node -c server.js && echo "   ✅ server.js syntax OK" || echo "   ❌ server.js has errors"
node -c api/hubspot-proxy.js && echo "   ✅ hubspot-proxy.js syntax OK" || echo "   ❌ hubspot-proxy.js has errors"
node -c api/gohighlevel-proxy.js && echo "   ✅ gohighlevel-proxy.js syntax OK" || echo "   ❌ gohighlevel-proxy.js has errors"
cd ..

echo ""
echo "✨ Test complete!"

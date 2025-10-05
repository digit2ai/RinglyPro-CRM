#!/bin/bash

echo "🧪 Testing Production Bilingual Voice Bot"
echo "=========================================="
echo ""

# Test incoming call
echo "📞 Testing incoming call endpoint..."
curl -s -X POST "https://aiagent.ringlypro.com/voice/rachel/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=TEST$(date +%s)" \
  -d "From=+11234567890" \
  -d "To=+18886103810" \
  -d "CallStatus=ringing"

echo ""
echo ""
echo "✅ If you see TwiML above with <Gather> and language options, it's working!"
echo ""

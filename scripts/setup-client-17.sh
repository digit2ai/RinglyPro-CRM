#!/bin/bash
# =====================================================
# RinglyPro: Client 17 ElevenLabs Setup Script
# =====================================================
# This script helps set up a custom ElevenLabs agent for Client 17
#
# Prerequisites:
# 1. Client 17 exists in the database
# 2. You have created an ElevenLabs agent and have the agent ID
# 3. You have configured the 4 tools in ElevenLabs (see docs/ELEVENLABS_TOOL_SCHEMAS.md)
# =====================================================

CLIENT_ID=17
AGENT_ID="${1:-}"

echo "========================================"
echo "RinglyPro ElevenLabs Setup - Client $CLIENT_ID"
echo "========================================"

if [ -z "$AGENT_ID" ]; then
    echo ""
    echo "Usage: ./setup-client-17.sh <elevenlabs_agent_id>"
    echo ""
    echo "Example: ./setup-client-17.sh agent_abc123xyz"
    echo ""
    echo "Before running this script:"
    echo "1. Create a new agent at https://elevenlabs.io/conversational-ai"
    echo "2. Configure these 4 tools (all POST to https://aiagent.ringlypro.com/api/elevenlabs/tools):"
    echo "   - get_business_info"
    echo "   - check_availability"
    echo "   - book_appointment"
    echo "   - send_sms"
    echo "3. Copy the agent ID from the agent settings"
    echo ""
    echo "Tool schemas are documented in: docs/ELEVENLABS_TOOL_SCHEMAS.md"
    exit 1
fi

echo ""
echo "Setting up Client $CLIENT_ID with ElevenLabs agent: $AGENT_ID"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable not set"
    echo "Run: export DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    exit 1
fi

# Step 1: Verify client exists
echo "Step 1: Verifying client exists..."
CLIENT_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT business_name FROM clients WHERE id = $CLIENT_ID;" 2>/dev/null | tr -d ' ')

if [ -z "$CLIENT_EXISTS" ]; then
    echo "Error: Client $CLIENT_ID not found in database"
    exit 1
fi
echo "✓ Found client: $CLIENT_EXISTS"

# Step 2: Enable rachel_enabled
echo ""
echo "Step 2: Enabling voice booking..."
psql "$DATABASE_URL" -c "UPDATE clients SET rachel_enabled = true WHERE id = $CLIENT_ID;"
echo "✓ rachel_enabled = true"

# Step 3: Store ElevenLabs agent ID
echo ""
echo "Step 3: Storing ElevenLabs agent ID..."
psql "$DATABASE_URL" -c "UPDATE clients SET elevenlabs_agent_id = '$AGENT_ID' WHERE id = $CLIENT_ID;"
echo "✓ elevenlabs_agent_id = $AGENT_ID"

# Step 4: Verify setup
echo ""
echo "Step 4: Verifying setup..."
psql "$DATABASE_URL" -c "
SELECT
    id as client_id,
    business_name,
    ringlypro_number,
    rachel_enabled,
    elevenlabs_agent_id
FROM clients
WHERE id = $CLIENT_ID;
"

# Step 5: Show integration status
echo ""
echo "Step 5: Integration status..."
echo ""
echo "GHL Integration:"
psql "$DATABASE_URL" -c "SELECT client_id, is_active FROM ghl_integrations WHERE client_id = $CLIENT_ID;" 2>/dev/null || echo "  Not configured"

echo ""
echo "Google Calendar:"
psql "$DATABASE_URL" -c "SELECT client_id, is_active FROM google_calendar_integrations WHERE client_id = $CLIENT_ID;" 2>/dev/null || echo "  Not configured"

echo ""
echo "Zoho CRM:"
psql "$DATABASE_URL" -c "SELECT settings->'integration'->'zoho'->>'enabled' as zoho_enabled FROM clients WHERE id = $CLIENT_ID;" 2>/dev/null || echo "  Not configured"

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Configure Twilio webhook to point to /voice/rachel/"
echo "   Voice URL: https://aiagent.ringlypro.com/voice/rachel/"
echo ""
echo "2. Test the setup by making a call or using the API:"
echo "   curl -X POST https://aiagent.ringlypro.com/api/elevenlabs/tools \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"tool_name\":\"get_business_info\",\"parameters\":{\"client_id\":\"$CLIENT_ID\"}}'"
echo ""

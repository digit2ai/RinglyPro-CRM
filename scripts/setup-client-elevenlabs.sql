-- =====================================================
-- RinglyPro: ElevenLabs Agent Setup Script
-- =====================================================
-- Run this after creating a custom ElevenLabs agent
-- Replace [CLIENT_ID] and [AGENT_ID] with actual values
-- =====================================================

-- Example for Client 17:
-- UPDATE clients SET elevenlabs_agent_id = 'your_agent_id_here' WHERE id = 17;

-- Generic template:
-- UPDATE clients SET elevenlabs_agent_id = '[AGENT_ID]' WHERE id = [CLIENT_ID];

-- =====================================================
-- STEP 1: Verify client exists and current settings
-- =====================================================
SELECT
    id,
    business_name,
    ringlypro_number,
    rachel_enabled,
    elevenlabs_agent_id,
    timezone,
    business_hours_start,
    business_hours_end
FROM clients
WHERE id = 17;  -- Change to your client ID

-- =====================================================
-- STEP 2: Enable voice booking (if not already enabled)
-- =====================================================
UPDATE clients
SET rachel_enabled = true
WHERE id = 17;  -- Change to your client ID

-- =====================================================
-- STEP 3: Store custom ElevenLabs agent ID
-- =====================================================
-- After creating your agent at https://elevenlabs.io/conversational-ai
-- Copy the agent ID from the agent settings page
--
-- UPDATE clients
-- SET elevenlabs_agent_id = 'your_elevenlabs_agent_id_here'
-- WHERE id = 17;  -- Change to your client ID

-- =====================================================
-- STEP 4: Verify the update
-- =====================================================
SELECT
    id,
    business_name,
    rachel_enabled,
    elevenlabs_agent_id
FROM clients
WHERE id = 17;  -- Change to your client ID

-- =====================================================
-- STEP 5: Check integration status
-- =====================================================
-- GHL Integration
SELECT
    client_id,
    ghl_location_id,
    is_active,
    created_at
FROM ghl_integrations
WHERE client_id = 17;  -- Change to your client ID

-- Google Calendar Integration
SELECT
    client_id,
    google_email,
    calendar_id,
    is_active
FROM google_calendar_integrations
WHERE client_id = 17;  -- Change to your client ID

-- Zoho Integration (stored in settings JSONB)
SELECT
    id,
    settings->'integration'->'zoho'->>'enabled' as zoho_enabled,
    settings->'integration'->'zoho'->>'createEvents' as zoho_create_events
FROM clients
WHERE id = 17;  -- Change to your client ID

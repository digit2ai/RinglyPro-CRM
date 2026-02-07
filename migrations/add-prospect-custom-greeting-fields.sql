-- Migration: Add region, prospect_type, and custom greeting fields to business_directory
-- Purpose: Enable per-prospect custom voice greetings for outbound calls
-- Date: 2026-02-07

-- Add region column (state/geographic area)
ALTER TABLE business_directory
ADD COLUMN IF NOT EXISTS region VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN business_directory.region IS 'State or geographic region (e.g., "Florida", "Texas", "Southeast")';

-- Add prospect_type column (lead classification)
ALTER TABLE business_directory
ADD COLUMN IF NOT EXISTS prospect_type VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN business_directory.prospect_type IS 'Lead classification: cold_lead, warm_lead, hot_lead, referral, callback, dnc';

-- Add custom_greeting column (personalized voicemail script)
ALTER TABLE business_directory
ADD COLUMN IF NOT EXISTS custom_greeting TEXT DEFAULT NULL;

COMMENT ON COLUMN business_directory.custom_greeting IS 'Personalized voicemail message for this prospect. Supports {business_name} placeholder.';

-- Add custom_greeting_audio_url column (pre-generated ElevenLabs audio)
ALTER TABLE business_directory
ADD COLUMN IF NOT EXISTS custom_greeting_audio_url TEXT DEFAULT NULL;

COMMENT ON COLUMN business_directory.custom_greeting_audio_url IS 'URL to ElevenLabs-generated audio file for this prospect custom greeting';

-- Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS business_directory_region_idx
ON business_directory(region);

CREATE INDEX IF NOT EXISTS business_directory_prospect_type_idx
ON business_directory(prospect_type);

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'business_directory'
  AND column_name IN ('region', 'prospect_type', 'custom_greeting', 'custom_greeting_audio_url')
ORDER BY column_name;

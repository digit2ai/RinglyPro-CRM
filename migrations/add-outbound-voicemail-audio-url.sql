-- Add outbound_voicemail_audio_url column to clients table
-- This stores the ElevenLabs-generated audio URL for custom voicemail messages

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS outbound_voicemail_audio_url TEXT;

COMMENT ON COLUMN clients.outbound_voicemail_audio_url IS 'URL to ElevenLabs-generated audio file for custom outbound voicemail message (Lina voice)';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name = 'outbound_voicemail_audio_url';

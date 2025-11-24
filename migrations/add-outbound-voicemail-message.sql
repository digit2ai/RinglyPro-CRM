-- Add outbound_voicemail_message field to clients table
-- This allows each client to customize their outbound calling voicemail message

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS outbound_voicemail_message TEXT DEFAULT NULL;

COMMENT ON COLUMN clients.outbound_voicemail_message IS 'Custom voicemail message for outbound calls. If null, uses default RinglyPro message.';

-- Example usage:
-- UPDATE clients SET outbound_voicemail_message = 'Hi, this is John from ABC Plumbing...' WHERE id = 1;

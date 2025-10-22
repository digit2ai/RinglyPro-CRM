-- Add SendGrid Email Marketing Settings to Clients Table
-- Migration: Add SendGrid configuration columns for multi-tenant email support

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_api_key VARCHAR(255);
COMMENT ON COLUMN clients.sendgrid_api_key IS 'SendGrid API Key for email sending (encrypted)';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_email VARCHAR(255);
COMMENT ON COLUMN clients.sendgrid_from_email IS 'Verified sender email address in SendGrid';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_name VARCHAR(255);
COMMENT ON COLUMN clients.sendgrid_from_name IS 'Sender name that appears in emails';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_reply_to VARCHAR(255);
COMMENT ON COLUMN clients.sendgrid_reply_to IS 'Reply-to email address (optional)';

-- Verify columns were added
SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name LIKE 'sendgrid%'
ORDER BY column_name;

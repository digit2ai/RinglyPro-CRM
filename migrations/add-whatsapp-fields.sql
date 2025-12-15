-- =====================================================
-- WhatsApp Integration Migration
-- File: migrations/add-whatsapp-fields.sql
-- Purpose: Add WhatsApp Business fields to support bilingual AI assistant
-- =====================================================

-- =====================================================
-- 1. Add WhatsApp fields to clients table
-- =====================================================

-- Add WhatsApp Business number for each client
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS whatsapp_business_number VARCHAR(20);

-- Add WhatsApp display name (shown to customers)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS whatsapp_display_name VARCHAR(255);

-- Add WhatsApp verification status
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN clients.whatsapp_business_number IS 'WhatsApp Business phone number for this client';
COMMENT ON COLUMN clients.whatsapp_display_name IS 'Business name displayed in WhatsApp';
COMMENT ON COLUMN clients.whatsapp_verified IS 'Whether Meta Business verification is complete';

-- =====================================================
-- 2. Add WhatsApp fields to messages table
-- =====================================================

-- Add message type to distinguish SMS from WhatsApp
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'sms';

-- Add media URL for WhatsApp media messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Add media type (image, video, document, audio)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);

-- Add conversation ID for WhatsApp thread tracking
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100);

-- Add lead ID reference for lead tracking
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS lead_id INTEGER;

COMMENT ON COLUMN messages.message_type IS 'Type of message: sms, whatsapp, email';
COMMENT ON COLUMN messages.media_url IS 'URL of media attachment (WhatsApp images, videos, etc.)';
COMMENT ON COLUMN messages.media_type IS 'MIME type of media attachment';
COMMENT ON COLUMN messages.conversation_id IS 'WhatsApp conversation thread ID';
COMMENT ON COLUMN messages.lead_id IS 'Reference to leads table for lead tracking';

-- Create index for message type queries
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- =====================================================
-- 3. Create WhatsApp sessions table (24-hour window tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  customer_phone VARCHAR(30) NOT NULL,
  session_start TIMESTAMP NOT NULL DEFAULT NOW(),
  session_expires TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint for upsert operations
  CONSTRAINT whatsapp_sessions_client_phone_unique UNIQUE (client_id, customer_phone)
);

-- Create indexes for session queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_client ON whatsapp_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(customer_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active ON whatsapp_sessions(is_active, session_expires);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires ON whatsapp_sessions(session_expires);

COMMENT ON TABLE whatsapp_sessions IS 'Tracks 24-hour free messaging windows for WhatsApp conversations';
COMMENT ON COLUMN whatsapp_sessions.session_start IS 'When customer first messaged (starts 24hr window)';
COMMENT ON COLUMN whatsapp_sessions.session_expires IS 'When 24-hour window expires (session_start + 24 hours)';
COMMENT ON COLUMN whatsapp_sessions.is_active IS 'Whether session is still active';
COMMENT ON COLUMN whatsapp_sessions.message_count IS 'Total messages in this session';

-- =====================================================
-- 4. Add lead_source field to contacts table
-- =====================================================

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_source VARCHAR(50);

COMMENT ON COLUMN contacts.lead_source IS 'Source of the lead: whatsapp, sms, voice, web, etc.';

CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON contacts(lead_source);

-- =====================================================
-- 5. Create WhatsApp templates table (for pre-approved messages)
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  category VARCHAR(50) NOT NULL, -- UTILITY, MARKETING, AUTHENTICATION
  content_sid VARCHAR(100), -- Twilio Content SID
  template_text TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_client ON whatsapp_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_language ON whatsapp_templates(language);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);

COMMENT ON TABLE whatsapp_templates IS 'Pre-approved WhatsApp message templates';
COMMENT ON COLUMN whatsapp_templates.category IS 'Template category: UTILITY (appointment reminders), MARKETING (promotions), AUTHENTICATION (OTP)';
COMMENT ON COLUMN whatsapp_templates.content_sid IS 'Twilio Content Template SID';
COMMENT ON COLUMN whatsapp_templates.variables IS 'JSON array of variable names used in template';

-- =====================================================
-- 6. Insert default Spanish/English templates
-- =====================================================

-- Appointment Reminder (Spanish)
INSERT INTO whatsapp_templates (client_id, name, language, category, template_text, variables, status)
VALUES (
  NULL, -- Global template
  'appointment_reminder_es',
  'es',
  'UTILITY',
  E'¡Hola {{1}}! 👋\n\nTe recordamos tu cita:\n📅 Fecha: {{2}}\n🕐 Hora: {{3}}\n📍 Servicio: {{4}}\n\nPara confirmar, responde SÍ\nPara reprogramar, responde CAMBIAR\n\nGracias,\n{{5}}',
  '["customer_name", "date", "time", "service", "business_name"]',
  'pending'
) ON CONFLICT DO NOTHING;

-- Appointment Reminder (English)
INSERT INTO whatsapp_templates (client_id, name, language, category, template_text, variables, status)
VALUES (
  NULL,
  'appointment_reminder_en',
  'en',
  'UTILITY',
  E'Hi {{1}}! 👋\n\nThis is a reminder for your appointment:\n📅 Date: {{2}}\n🕐 Time: {{3}}\n📍 Service: {{4}}\n\nReply YES to confirm\nReply CHANGE to reschedule\n\nThanks,\n{{5}}',
  '["customer_name", "date", "time", "service", "business_name"]',
  'pending'
) ON CONFLICT DO NOTHING;

-- Welcome Message (Spanish)
INSERT INTO whatsapp_templates (client_id, name, language, category, template_text, variables, status)
VALUES (
  NULL,
  'welcome_lead_es',
  'es',
  'MARKETING',
  E'¡Hola! 👋\n\nGracias por contactar a {{1}}.\n\n¿En qué podemos ayudarte hoy?\n\n1️⃣ Agendar una cita\n2️⃣ Información de servicios\n3️⃣ Hablar con un agente\n\nResponde con el número de tu opción.',
  '["business_name"]',
  'pending'
) ON CONFLICT DO NOTHING;

-- Welcome Message (English)
INSERT INTO whatsapp_templates (client_id, name, language, category, template_text, variables, status)
VALUES (
  NULL,
  'welcome_lead_en',
  'en',
  'MARKETING',
  E'Hello! 👋\n\nThanks for contacting {{1}}.\n\nHow can we help you today?\n\n1️⃣ Schedule an appointment\n2️⃣ Service information\n3️⃣ Speak with an agent\n\nReply with the number of your choice.',
  '["business_name"]',
  'pending'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. Function to auto-expire sessions
-- =====================================================

CREATE OR REPLACE FUNCTION expire_whatsapp_sessions()
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_sessions
  SET is_active = FALSE, updated_at = NOW()
  WHERE is_active = TRUE
    AND session_expires < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_whatsapp_sessions IS 'Marks expired WhatsApp sessions as inactive';

-- =====================================================
-- Success message
-- =====================================================

SELECT 'WhatsApp integration fields added successfully!' as message;
SELECT 'Tables created: whatsapp_sessions, whatsapp_templates' as tables;
SELECT 'Columns added to: clients, messages, contacts' as columns;

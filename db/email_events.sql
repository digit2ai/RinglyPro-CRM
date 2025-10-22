-- Email Events Table for SendGrid Webhook Integration
-- Stores all email events (delivered, opened, clicked, bounced, etc.)

CREATE TABLE IF NOT EXISTS email_events (
  sg_event_id   TEXT PRIMARY KEY,
  message_id    TEXT,
  template_id   TEXT,
  event         TEXT NOT NULL,
  email         TEXT NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  category      TEXT,
  contact_id    INTEGER,
  payload       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS ix_email_events_event ON email_events(event);
CREATE INDEX IF NOT EXISTS ix_email_events_created ON email_events(created_at);
CREATE INDEX IF NOT EXISTS ix_email_events_email ON email_events(email);
CREATE INDEX IF NOT EXISTS ix_email_events_template ON email_events(template_id);
CREATE INDEX IF NOT EXISTS ix_email_events_category ON email_events(category);

-- Comments
COMMENT ON TABLE email_events IS 'Stores SendGrid webhook events for email tracking and analytics';
COMMENT ON COLUMN email_events.sg_event_id IS 'SendGrid unique event ID';
COMMENT ON COLUMN email_events.message_id IS 'SendGrid message ID';
COMMENT ON COLUMN email_events.template_id IS 'SendGrid dynamic template ID';
COMMENT ON COLUMN email_events.event IS 'Event type: delivered, opened, clicked, bounced, etc.';
COMMENT ON COLUMN email_events.email IS 'Recipient email address';
COMMENT ON COLUMN email_events.timestamp IS 'When the event occurred';
COMMENT ON COLUMN email_events.category IS 'Category: transactional, marketing, chamber_outreach, etc.';
COMMENT ON COLUMN email_events.contact_id IS 'Link to contacts table if applicable';
COMMENT ON COLUMN email_events.payload IS 'Full JSON payload from SendGrid';

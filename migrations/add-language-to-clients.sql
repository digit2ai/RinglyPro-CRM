-- Add per-client dashboard language preference.
-- Standalone (voice_ai / lead-collector) clients have no chamber row, so the
-- chambers.primary_language mechanism does not reach them. This column lets the
-- client carry its own UI language ('en' | 'es'). Default 'en' preserves existing
-- behavior for the 16 current clients.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN clients.language IS 'Dashboard/UI language for this client: en | es. Read by the Lead Collector + client dashboards.';

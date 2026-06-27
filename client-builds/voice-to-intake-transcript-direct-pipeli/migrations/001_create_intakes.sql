-- Voice-to-Intake Transcript Direct Pipeline — intakes table
-- Multi-tenant: every row carries tenant_id, with an index on it.
-- Sequelize sync({alter:false}) creates this on boot; this file is the
-- canonical schema of record for manual/Render provisioning.

CREATE TABLE IF NOT EXISTS voice_to_intake_transcript_direct_pipeli_intakes (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER     NOT NULL,
  transcript     TEXT        NOT NULL,
  lang           VARCHAR(8)  NOT NULL DEFAULT 'en',
  submitter_id   VARCHAR(255),
  triage_bypass  BOOLEAN     NOT NULL DEFAULT TRUE,
  forward_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_to_intake_transcript_direct_pipeli_intakes_tenant
  ON voice_to_intake_transcript_direct_pipeli_intakes (tenant_id);

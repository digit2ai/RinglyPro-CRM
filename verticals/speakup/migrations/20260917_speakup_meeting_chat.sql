-- SpeakUp — the conversation about a meeting (replaces the checklist on /speakup/meetings).
-- The house prefix is su_, so the table is su_meeting_chat rather than speakup_meeting_chat.
-- meeting_id is a su_recordings.id. Created on boot by sequelize.sync; this file is the
-- from-scratch source of truth and must stay in step with the model in src/models.js.
CREATE TABLE IF NOT EXISTS su_meeting_chat (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER      NOT NULL,
  meeting_id     INTEGER      NOT NULL,
  user_id        INTEGER,
  role           VARCHAR(12)  NOT NULL,
  kind           VARCHAR(12)  DEFAULT 'text',
  content        TEXT         NOT NULL DEFAULT '',
  attachment_url VARCHAR(200),
  factory_ref    VARCHAR(120),
  composed_by    VARCHAR(60),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_meeting_chat_tenant_idx  ON su_meeting_chat (tenant_id);
CREATE INDEX IF NOT EXISTS su_meeting_chat_meeting_idx ON su_meeting_chat (tenant_id, meeting_id, id);

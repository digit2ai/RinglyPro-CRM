-- =====================================================================
-- AI Action Inbox — canonical DDL
--
-- Upgrades the Projects Hub Unified Inbox (public/projects-emails.html +
-- /api/projects-bridge/email-*) into an action inbox that answers
-- "what do I need to do?".
--
-- These tables live in the MAIN CRM database (CRM_DATABASE_URL), the same
-- one that already holds email_accounts / email_followup_flags AND the
-- Projects Hub d2_* tables — so an email can be linked to a d2_task or a
-- d2_calendar_event with no cross-database hop.
--
-- Applied idempotently on boot by src/services/emailIntelligence.js
-- (ensureTables). This file is the canonical record; run it by hand to
-- provision a fresh database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- One row per classified message. UNIQUE(client_id, account_id, message_id)
-- is what makes "Triage with AI" idempotent: a second run finds the row and
-- skips it unless the content hash moved or a reanalysis was asked for.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_classifications (
  id                 SERIAL PRIMARY KEY,
  client_id          INTEGER NOT NULL,
  account_id         INTEGER NOT NULL,
  message_id         VARCHAR(255) NOT NULL,
  thread_key         VARCHAR(255),
  content_hash       VARCHAR(64) NOT NULL,

  from_address       VARCHAR(320),
  from_name          VARCHAR(255),
  subject            TEXT,
  received_at        TIMESTAMPTZ,

  action_required    BOOLEAN NOT NULL DEFAULT false,
  status             VARCHAR(40) NOT NULL DEFAULT 'needs_review',
  priority           VARCHAR(10) NOT NULL DEFAULT 'none',
  category           VARCHAR(40),
  project            VARCHAR(60),
  sender_importance  VARCHAR(40),
  summary            TEXT,
  reason             TEXT,
  recommended_action TEXT,
  reply_required     BOOLEAN NOT NULL DEFAULT false,
  suggested_reply    TEXT,
  deadline           TIMESTAMPTZ,
  confidence         NUMERIC(4,3) NOT NULL DEFAULT 0,

  -- provenance: 'model' | 'heuristic' | 'manual'
  classified_by      VARCHAR(20) NOT NULL DEFAULT 'model',
  model              VARCHAR(80),
  is_simulated       BOOLEAN NOT NULL DEFAULT false,
  manual_override    BOOLEAN NOT NULL DEFAULT false,
  injection_flagged  BOOLEAN NOT NULL DEFAULT false,

  classified_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT email_classifications_uniq UNIQUE (client_id, account_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_cls_client_status   ON email_classifications (client_id, status);
CREATE INDEX IF NOT EXISTS idx_email_cls_client_priority ON email_classifications (client_id, priority);
CREATE INDEX IF NOT EXISTS idx_email_cls_client_received ON email_classifications (client_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_cls_client_project  ON email_classifications (client_id, project);
CREATE INDEX IF NOT EXISTS idx_email_cls_hash            ON email_classifications (client_id, content_hash);

-- ---------------------------------------------------------------------
-- Audit trail. Every classification and every human correction lands here.
-- Deliberately stores the CLASSIFICATION, never the email body.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_classification_audit (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  account_id  INTEGER,
  message_id  VARCHAR(255),
  action      VARCHAR(40) NOT NULL,
  actor       VARCHAR(20) NOT NULL DEFAULT 'ai',
  before_json JSONB,
  after_json  JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_audit_client ON email_classification_audit (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_audit_msg    ON email_classification_audit (client_id, account_id, message_id);

-- ---------------------------------------------------------------------
-- Deterministic rules born from manual corrections. A correction on one
-- email teaches the next email from the same sender/domain, WITHOUT a
-- model call — which is what "manual corrections become deterministic
-- rules" means. Applied before the model, and the model can never
-- overrule a rule.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_project_rules (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  match_type  VARCHAR(20) NOT NULL,   -- 'sender' | 'domain' | 'subject_keyword'
  match_value VARCHAR(320) NOT NULL,
  project     VARCHAR(60),
  priority    VARCHAR(10),
  status      VARCHAR(40),
  hit_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_project_rules_uniq UNIQUE (client_id, match_type, match_value)
);

CREATE INDEX IF NOT EXISTS idx_email_rules_client ON email_project_rules (client_id, match_type);

-- ---------------------------------------------------------------------
-- Duplicate prevention for everything an email can spawn. One link per
-- (message, link_type) — so "Create To-Do" twice returns the first task
-- instead of making a second one.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_action_links (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  link_type  VARCHAR(20) NOT NULL,   -- 'task' | 'calendar_event' | 'project' | 'contact' | 'draft'
  target_id  INTEGER,
  target_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_action_links_uniq UNIQUE (client_id, account_id, message_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_email_links_client ON email_action_links (client_id, link_type);

-- ---------------------------------------------------------------------
-- Background triage jobs. The inbox sits behind Cloudflare (~100s 524
-- ceiling) so a full-inbox reanalysis CANNOT be a synchronous request —
-- it is queued here and polled.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_triage_jobs (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued|running|done|failed
  scope       VARCHAR(20) NOT NULL DEFAULT 'unclassified', -- unclassified|selected|all
  total       INTEGER NOT NULL DEFAULT 0,
  processed   INTEGER NOT NULL DEFAULT 0,
  succeeded   INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  errors      JSONB NOT NULL DEFAULT '[]'::jsonb,
  error       TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_client ON email_triage_jobs (client_id, created_at DESC);

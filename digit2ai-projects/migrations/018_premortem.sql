-- Migration 018 — Claude Premortem agent (department: Premortem)
-- Adversarial risk analysis (Gary Klein prospective hindsight) that travels
-- with every project feasibility. A feasibility without a premortem is
-- incomplete. Verdicts are stored with timestamp + agent version so they can
-- be audited against actual project outcomes later (longitudinal accuracy).
--
-- Idempotent — mirrors the ADD COLUMN IF NOT EXISTS block in src/index.js.

ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_brief      TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_structured JSONB;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_verdict    VARCHAR(30);   -- PROCEED | PROCEED_WITH_MITIGATIONS | RESHAPE | DECLINE | PENDING
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_at         TIMESTAMPTZ;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_model      VARCHAR(80);   -- e.g. "claude-sonnet-4-6 (claude-premortem@1.0.0)"
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_version    INTEGER DEFAULT 0;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS premortem_flagged    BOOLEAN DEFAULT false;  -- true when verdict = RESHAPE/DECLINE (Manny notified)

-- Fast lookup of projects awaiting Manny's attention before any commitment.
CREATE INDEX IF NOT EXISTS idx_d2_projects_premortem_flagged
  ON d2_projects (premortem_flagged) WHERE premortem_flagged = true;

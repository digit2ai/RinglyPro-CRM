-- CoachTrack — canonical schema (ct_ prefix, multi-tenant).
-- Tables also auto-create on boot via Sequelize sync({alter:false}); this file
-- is the reference / manual-apply migration.

CREATE TABLE IF NOT EXISTS ct_users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) DEFAULT 'owner',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ct_sessions (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  coach_name    VARCHAR(80) DEFAULT 'Lala',
  session_date  DATE DEFAULT CURRENT_DATE,
  subject       VARCHAR(255),
  summary       TEXT,
  status        VARCHAR(30) DEFAULT 'in_progress',  -- in_progress|finalized
  duration_min  INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ct_sessions_tenant ON ct_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ct_sessions_status ON ct_sessions(status);

CREATE TABLE IF NOT EXISTS ct_transcripts (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL,
  turn_index  INTEGER DEFAULT 0,
  role        VARCHAR(20) DEFAULT 'me',    -- me|coach
  text        TEXT NOT NULL,
  source      VARCHAR(20) DEFAULT 'typed', -- voice|typed
  ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ct_transcripts_session ON ct_transcripts(session_id);

CREATE TABLE IF NOT EXISTS ct_action_items (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  session_id   INTEGER NOT NULL,
  text         TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'open', -- open|in_progress|done|overdue
  due_date     DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ct_items_tenant ON ct_action_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ct_items_session ON ct_action_items(session_id);
CREATE INDEX IF NOT EXISTS idx_ct_items_status ON ct_action_items(status);

CREATE TABLE IF NOT EXISTS ct_guidance (
  id             SERIAL PRIMARY KEY,
  action_item_id INTEGER NOT NULL,
  question       TEXT NOT NULL,
  ai_response    TEXT,
  ts             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ct_guidance_item ON ct_guidance(action_item_id);

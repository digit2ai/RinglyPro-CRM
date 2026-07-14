-- Executive English Coaching — canonical schema (Digit2AI vertical).
-- Multi-tenant (tenant_id), ec_ prefix. Tables auto-create on boot via
-- Sequelize sync({alter:false}); this file is the source-of-truth migration.

CREATE TABLE IF NOT EXISTS ec_users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  org           VARCHAR(80) DEFAULT 'digit2ai',
  role          VARCHAR(40) DEFAULT 'coach',   -- owner|coach
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ec_students (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL DEFAULT 1,
  coach_id        INTEGER NOT NULL,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  role_title      VARCHAR(255),
  target_level    VARCHAR(20) DEFAULT 'C1',
  native_language VARCHAR(10) DEFAULT 'es',
  goals           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ec_students_tenant ON ec_students (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ec_students_coach ON ec_students (coach_id);

CREATE TABLE IF NOT EXISTS ec_sessions (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  student_id    INTEGER NOT NULL,
  coach_name    VARCHAR(80) DEFAULT 'Coach',
  session_date  DATE DEFAULT NOW(),
  scenario      VARCHAR(160),
  subject       VARCHAR(255),
  summary       TEXT,
  status        VARCHAR(20) DEFAULT 'in_progress', -- in_progress|finalized
  duration_min  INTEGER,
  student_words INTEGER DEFAULT 0,
  coach_words   INTEGER DEFAULT 0,
  speaking_pct  INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ec_sessions_tenant ON ec_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ec_sessions_student ON ec_sessions (student_id);
CREATE INDEX IF NOT EXISTS idx_ec_sessions_status ON ec_sessions (status);

CREATE TABLE IF NOT EXISTS ec_transcripts (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL,
  turn_index  INTEGER DEFAULT 0,
  role        VARCHAR(20) DEFAULT 'student', -- student|coach
  text        TEXT NOT NULL,
  source      VARCHAR(20) DEFAULT 'typed',   -- voice|typed
  ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ec_transcripts_session ON ec_transcripts (session_id);

CREATE TABLE IF NOT EXISTS ec_reports (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL DEFAULT 1,
  session_id       INTEGER NOT NULL,
  student_id       INTEGER NOT NULL,
  fortalezas       TEXT,   -- JSON array
  aspectos_mejorar TEXT,   -- JSON array
  expresiones      TEXT,   -- JSON array
  vocabulario      TEXT,   -- JSON array
  ejercicio        TEXT,
  correcciones     TEXT,   -- JSON array of {error, correccion}
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ec_reports_session ON ec_reports (session_id);
CREATE INDEX IF NOT EXISTS idx_ec_reports_student ON ec_reports (student_id);

CREATE TABLE IF NOT EXISTS ec_assignments (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  student_id   INTEGER NOT NULL,
  session_id   INTEGER,
  kind         VARCHAR(20) DEFAULT 'ejercicio', -- audio|articulo|podcast|expresion|vocabulario|ejercicio
  title        VARCHAR(200) NOT NULL,
  detail       TEXT,
  status       VARCHAR(20) DEFAULT 'open',      -- open|done
  due_date     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ec_assignments_tenant ON ec_assignments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ec_assignments_student ON ec_assignments (student_id);
CREATE INDEX IF NOT EXISTS idx_ec_assignments_status ON ec_assignments (status);

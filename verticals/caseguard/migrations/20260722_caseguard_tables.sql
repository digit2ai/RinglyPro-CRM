-- CaseGuard — canonical schema (auto-created on boot via sync({alter:false}); this
-- file is the source of truth). Multi-tenant (tenant_id = user id), cg_ prefix.
-- Administrative-review / regulatory-escalation case manager.

CREATE TABLE IF NOT EXISTS cg_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) DEFAULT 'owner',
  lang VARCHAR(12) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cg_cases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  title VARCHAR(255) NOT NULL,
  subject_org VARCHAR(255),
  summary TEXT,
  objective TEXT,
  status VARCHAR(32) DEFAULT 'open',
  priority VARCHAR(32) DEFAULT 'high',
  opened_at DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_cases_tenant ON cg_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cg_cases_status ON cg_cases(status);

CREATE TABLE IF NOT EXISTS cg_timeline (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  event_date DATE,
  event_time VARCHAR(64),
  title VARCHAR(255) NOT NULL,
  detail TEXT,
  location VARCHAR(255),
  category VARCHAR(32) DEFAULT 'clinical',
  provider_id INTEGER,
  evidence_ids JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_timeline_case ON cg_timeline(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_timeline_date ON cg_timeline(event_date);

CREATE TABLE IF NOT EXISTS cg_evidence (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  label VARCHAR(255) NOT NULL,
  kind VARCHAR(32) DEFAULT 'document',
  source VARCHAR(255),
  evidence_date DATE,
  content TEXT,
  file_path VARCHAR(512),
  mime VARCHAR(128),
  provider_id INTEGER,
  tags JSONB DEFAULT '[]',
  analyzed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_evidence_case ON cg_evidence(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_evidence_kind ON cg_evidence(kind);

CREATE TABLE IF NOT EXISTS cg_providers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(128),
  facility VARCHAR(255),
  license_no VARCHAR(128),
  board VARCHAR(128),
  npi VARCHAR(64),
  contact VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_providers_case ON cg_providers(tenant_id, case_id);

CREATE TABLE IF NOT EXISTS cg_communications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  comm_date DATE,
  direction VARCHAR(16) DEFAULT 'outbound',
  channel VARCHAR(32),
  counterparty VARCHAR(255),
  subject VARCHAR(255),
  summary TEXT,
  outcome VARCHAR(255),
  evidence_ids JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_comms_case ON cg_communications(tenant_id, case_id);

CREATE TABLE IF NOT EXISTS cg_contradictions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  statement_a TEXT,
  statement_b TEXT,
  evidence_ids JSONB DEFAULT '[]',
  severity VARCHAR(16) DEFAULT 'medium',
  status VARCHAR(16) DEFAULT 'open',
  detected_by VARCHAR(16) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_contra_case ON cg_contradictions(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_contra_sev ON cg_contradictions(severity);

CREATE TABLE IF NOT EXISTS cg_policies (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER,
  authority VARCHAR(128),
  category VARCHAR(32),
  citation VARCHAR(512),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  source_url VARCHAR(512),
  relevance TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_policies_case ON cg_policies(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_policies_auth ON cg_policies(authority);
CREATE INDEX IF NOT EXISTS idx_cg_policies_cat ON cg_policies(category);

CREATE TABLE IF NOT EXISTS cg_comparisons (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  topic VARCHAR(255) NOT NULL,
  care_received TEXT,
  expected_standard TEXT,
  policy_id INTEGER,
  gap TEXT,
  severity VARCHAR(16) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_comp_case ON cg_comparisons(tenant_id, case_id);

CREATE TABLE IF NOT EXISTS cg_questions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  directed_to VARCHAR(128),
  status VARCHAR(16) DEFAULT 'open',
  answer TEXT,
  priority VARCHAR(16) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_q_case ON cg_questions(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_q_status ON cg_questions(status);

CREATE TABLE IF NOT EXISTS cg_escalations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  target VARCHAR(255) NOT NULL,
  target_contact VARCHAR(255),
  method VARCHAR(32),
  status VARCHAR(24) DEFAULT 'planned',
  sent_date DATE,
  response_date DATE,
  reference_no VARCHAR(255),
  response_summary TEXT,
  next_action TEXT,
  next_action_date DATE,
  correspondence_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_esc_case ON cg_escalations(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_esc_status ON cg_escalations(status);

CREATE TABLE IF NOT EXISTS cg_correspondence (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  kind VARCHAR(32) DEFAULT 'complaint',
  target VARCHAR(255),
  subject VARCHAR(255),
  body TEXT,
  tone VARCHAR(24) DEFAULT 'formal',
  status VARCHAR(16) DEFAULT 'draft',
  model VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_corr_case ON cg_correspondence(tenant_id, case_id);

CREATE TABLE IF NOT EXISTS cg_analyses (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  case_id INTEGER NOT NULL,
  evidence_id INTEGER,
  kind VARCHAR(32) DEFAULT 'document',
  summary TEXT,
  facts JSONB DEFAULT '[]',
  flags JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  model VARCHAR(64),
  is_simulated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_an_case ON cg_analyses(tenant_id, case_id);
CREATE INDEX IF NOT EXISTS idx_cg_an_ev ON cg_analyses(evidence_id);

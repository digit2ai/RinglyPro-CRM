-- Torna Idioma Analytics Schema
-- KPI snapshots, economic impact tracking

CREATE TABLE IF NOT EXISTS ti_kpi_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  period VARCHAR(10) DEFAULT 'daily',
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ti_economic_impact (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_students_enrolled INTEGER DEFAULT 0,
  total_certified INTEGER DEFAULT 0,
  total_bpo_placed INTEGER DEFAULT 0,
  avg_salary_increase_pct NUMERIC(5,2),
  total_salary_increase_php NUMERIC(15,2) DEFAULT 0,
  estimated_tax_revenue_php NUMERIC(15,2) DEFAULT 0,
  partner_count INTEGER DEFAULT 0,
  school_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  supporter_count INTEGER DEFAULT 0,
  total_donations_php NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MCP tool call audit log
CREATE TABLE IF NOT EXISTS ti_mcp_tool_log (
  id SERIAL PRIMARY KEY,
  tool_name VARCHAR(100) NOT NULL,
  user_id INTEGER,
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_kpi_date ON ti_kpi_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_ti_economic_period ON ti_economic_impact(period_start);
CREATE INDEX IF NOT EXISTS idx_ti_mcp_log_tool ON ti_mcp_tool_log(tool_name);

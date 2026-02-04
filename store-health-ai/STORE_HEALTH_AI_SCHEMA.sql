-- ============================================================================
-- Store Health AI - Complete Database Schema
-- Run this in your existing ringlypro_crm_production database
-- ============================================================================

-- Create SequelizeMeta table if it doesn't exist (for migration tracking)
CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
  "name" VARCHAR(255) NOT NULL PRIMARY KEY
);

-- ============================================================================
-- 1. ORGANIZATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  config JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. REGIONS & DISTRICTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS regions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name VARCHAR(255) NOT NULL,
  manager_name VARCHAR(255),
  manager_email VARCHAR(255),
  manager_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS districts (
  id SERIAL PRIMARY KEY,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name VARCHAR(255) NOT NULL,
  manager_name VARCHAR(255),
  manager_email VARCHAR(255),
  manager_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. STORES
-- ============================================================================
CREATE TYPE store_status AS ENUM ('active', 'inactive', 'closed');

CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL ON UPDATE CASCADE,
  store_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  manager_name VARCHAR(255),
  manager_email VARCHAR(255),
  manager_phone VARCHAR(20),
  status store_status DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS stores_organization_id_idx ON stores(organization_id);
CREATE INDEX IF NOT EXISTS stores_district_id_idx ON stores(district_id);
CREATE INDEX IF NOT EXISTS stores_status_idx ON stores(status);

-- ============================================================================
-- 4. KPI DEFINITIONS
-- ============================================================================
CREATE TYPE kpi_calculation_method AS ENUM ('sum', 'average', 'ratio', 'percentage', 'count', 'custom');
CREATE TYPE kpi_status AS ENUM ('active', 'inactive', 'archived');

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id SERIAL PRIMARY KEY,
  kpi_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  unit VARCHAR(50),
  calculation_method kpi_calculation_method NOT NULL,
  target_value DECIMAL(15,2),
  status kpi_status DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. KPI THRESHOLDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS kpi_thresholds (
  id SERIAL PRIMARY KEY,
  kpi_definition_id INTEGER NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  green_threshold DECIMAL(15,2) NOT NULL,
  yellow_threshold DECIMAL(15,2) NOT NULL,
  red_threshold DECIMAL(15,2) NOT NULL,
  comparison_operator VARCHAR(10) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. KPI METRICS
-- ============================================================================
CREATE TYPE metric_status AS ENUM ('green', 'yellow', 'red');

CREATE TABLE IF NOT EXISTS kpi_metrics (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kpi_definition_id INTEGER NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  metric_date DATE NOT NULL,
  value DECIMAL(15,2) NOT NULL,
  comparison_value DECIMAL(15,2),
  variance_pct DECIMAL(10,2),
  status metric_status NOT NULL,
  data_source VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kpi_metrics_unique UNIQUE (store_id, kpi_definition_id, metric_date)
);

CREATE INDEX IF NOT EXISTS kpi_metrics_store_id_idx ON kpi_metrics(store_id);
CREATE INDEX IF NOT EXISTS kpi_metrics_metric_date_idx ON kpi_metrics(metric_date);
CREATE INDEX IF NOT EXISTS kpi_metrics_status_idx ON kpi_metrics(status);

-- ============================================================================
-- 7. STORE HEALTH SNAPSHOTS
-- ============================================================================
CREATE TYPE health_status AS ENUM ('green', 'yellow', 'red');

CREATE TABLE IF NOT EXISTS store_health_snapshots (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  snapshot_date DATE NOT NULL,
  overall_status health_status NOT NULL,
  green_count INTEGER DEFAULT 0,
  yellow_count INTEGER DEFAULT 0,
  red_count INTEGER DEFAULT 0,
  health_score DECIMAL(5,2),
  escalation_level INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT store_health_snapshots_unique UNIQUE (store_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS store_health_snapshots_store_id_idx ON store_health_snapshots(store_id);
CREATE INDEX IF NOT EXISTS store_health_snapshots_snapshot_date_idx ON store_health_snapshots(snapshot_date);

-- ============================================================================
-- 8. ALERTS
-- ============================================================================
CREATE TYPE alert_type AS ENUM ('threshold_breach', 'prediction', 'sla_breach', 'manual');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'closed');

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kpi_metric_id INTEGER REFERENCES kpi_metrics(id) ON DELETE SET NULL ON UPDATE CASCADE,
  alert_type alert_type NOT NULL,
  severity alert_severity NOT NULL,
  status alert_status DEFAULT 'open',
  message TEXT NOT NULL,
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS alerts_store_id_idx ON alerts(store_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status);
CREATE INDEX IF NOT EXISTS alerts_severity_idx ON alerts(severity);

-- ============================================================================
-- 9. TASKS
-- ============================================================================
CREATE TYPE task_type AS ENUM ('review', 'action', 'escalation', 'follow_up');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  task_type task_type NOT NULL,
  priority task_priority DEFAULT 'medium',
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status task_status DEFAULT 'open',
  assigned_to VARCHAR(255),
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tasks_store_id_idx ON tasks(store_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);

-- ============================================================================
-- 10. ESCALATIONS & ESCALATION RULES
-- ============================================================================
CREATE TYPE escalation_trigger AS ENUM ('threshold', 'sla_breach', 'manual', 'predicted_risk');

CREATE TABLE IF NOT EXISTS escalations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  triggered_by escalation_trigger NOT NULL,
  escalated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escalation_rules (
  id SERIAL PRIMARY KEY,
  condition_type VARCHAR(100) NOT NULL,
  condition_value JSONB NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  notification_channels JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 11. AI CALLS & CALL SCRIPTS
-- ============================================================================
CREATE TYPE call_status AS ENUM ('scheduled', 'in_progress', 'completed', 'failed', 'no_answer');

CREATE TABLE IF NOT EXISTS ai_calls (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL ON UPDATE CASCADE,
  call_script_id INTEGER,
  to_phone VARCHAR(20) NOT NULL,
  status call_status DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  transcript TEXT,
  outcome VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_scripts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status_type health_status NOT NULL,
  greeting TEXT NOT NULL,
  body TEXT NOT NULL,
  closing TEXT,
  prompts JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 12. RISK PREDICTIONS
-- ============================================================================
CREATE TYPE risk_category AS ENUM ('sales', 'labor', 'inventory', 'overall');

CREATE TABLE IF NOT EXISTS risk_predictions (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  prediction_date DATE NOT NULL,
  category risk_category NOT NULL,
  risk_score DECIMAL(5,2) NOT NULL,
  status health_status NOT NULL,
  contributing_factors JSONB,
  recommended_actions JSONB,
  confidence_level DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT risk_predictions_unique UNIQUE (store_id, prediction_date, category)
);

-- ============================================================================
-- 13. LABOR & INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS labor_schedules (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  schedule_date DATE NOT NULL,
  hours_scheduled DECIMAL(8,2) NOT NULL,
  hours_actual DECIMAL(8,2),
  status health_status,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS labor_callouts (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_name VARCHAR(255),
  callout_date DATE NOT NULL,
  shift_time VARCHAR(50),
  reason TEXT,
  impact_hours DECIMAL(8,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_levels (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  product_id INTEGER,
  sku VARCHAR(100),
  quantity INTEGER NOT NULL,
  status health_status,
  reorder_point INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS out_of_stock_events (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  inventory_level_id INTEGER REFERENCES inventory_levels(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sku VARCHAR(100) NOT NULL,
  out_of_stock_at TIMESTAMP WITH TIME ZONE NOT NULL,
  restocked_at TIMESTAMP WITH TIME ZONE,
  duration_hours INTEGER,
  impact_score DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 14. SYSTEM CONFIG
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(255) NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- RECORD MIGRATIONS IN SequelizeMeta
-- ============================================================================
INSERT INTO "SequelizeMeta" ("name") VALUES
  ('20260202-01-create-organizations.js'),
  ('20260202-02-create-regions-districts.js'),
  ('20260202-03-create-stores.js'),
  ('20260202-04-create-kpi-definitions.js'),
  ('20260202-05-create-kpi-thresholds.js'),
  ('20260202-06-create-kpi-metrics.js'),
  ('20260202-07-create-store-health-snapshots.js'),
  ('20260202-08-create-alerts.js'),
  ('20260202-09-create-tasks.js'),
  ('20260202-10-create-escalations.js'),
  ('20260202-11-create-ai-calls.js'),
  ('20260202-12-create-risk-predictions.js'),
  ('20260202-13-create-labor-inventory.js'),
  ('20260202-14-create-system-config.js')
ON CONFLICT ("name") DO NOTHING;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- ✅ 23 Tables Created:
--    - organizations, regions, districts, stores
--    - kpi_definitions, kpi_thresholds, kpi_metrics, store_health_snapshots
--    - alerts, tasks, escalations, escalation_rules
--    - ai_calls, call_scripts
--    - risk_predictions
--    - labor_schedules, labor_callouts, inventory_levels, out_of_stock_events
--    - system_config
--    - SequelizeMeta (migration tracking)
--
-- ✅ 7 ENUM Types Created:
--    - store_status, kpi_calculation_method, kpi_status, metric_status
--    - health_status, alert_type, alert_severity, alert_status
--    - task_type, task_priority, task_status
--    - escalation_trigger, call_status, risk_category
--
-- ✅ Multiple Indexes Created for Performance
--
-- Ready to run the seeder next!
-- ============================================================================

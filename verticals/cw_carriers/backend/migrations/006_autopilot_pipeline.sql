-- CW Carriers — Autopilot Pipeline Engine
-- Automated broker workflow: contract -> rate -> match -> outreach -> confirm -> track -> bill

-- Pipeline Runs — tracks each load through 8 autopilot stages
CREATE TABLE IF NOT EXISTS cw_pipeline_runs (
  id                    SERIAL PRIMARY KEY,
  tenant_id             VARCHAR(64) NOT NULL DEFAULT 'cw_carriers',
  load_id               INTEGER,
  load_ref              VARCHAR(64),
  mode                  VARCHAR(16) NOT NULL DEFAULT 'autopilot' CHECK (mode IN ('autopilot','manual')),
  status                VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed','failed','cancelled')),
  current_stage         VARCHAR(30) NOT NULL DEFAULT 'contract_received',
  started_by            VARCHAR(128),
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  paused_at             TIMESTAMPTZ,
  pause_reason          TEXT,
  -- Stage timestamps
  ts_contract_received  TIMESTAMPTZ,
  ts_rate_analysis      TIMESTAMPTZ,
  ts_carrier_match      TIMESTAMPTZ,
  ts_load_match         TIMESTAMPTZ,
  ts_carrier_outreach   TIMESTAMPTZ,
  ts_rate_confirmation  TIMESTAMPTZ,
  ts_transit_tracking   TIMESTAMPTZ,
  ts_delivery_billing   TIMESTAMPTZ,
  -- Stage JSONB results
  result_contract_received  JSONB DEFAULT '{}',
  result_rate_analysis      JSONB DEFAULT '{}',
  result_carrier_match      JSONB DEFAULT '{}',
  result_load_match         JSONB DEFAULT '{}',
  result_carrier_outreach   JSONB DEFAULT '{}',
  result_rate_confirmation  JSONB DEFAULT '{}',
  result_transit_tracking   JSONB DEFAULT '{}',
  result_delivery_billing   JSONB DEFAULT '{}',
  -- Config overrides for this run
  config_overrides      JSONB DEFAULT '{}',
  -- Error tracking
  error_log             JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_pipeline_runs_tenant ON cw_pipeline_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cw_pipeline_runs_status ON cw_pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_cw_pipeline_runs_load ON cw_pipeline_runs(load_id);
CREATE INDEX IF NOT EXISTS idx_cw_pipeline_runs_stage ON cw_pipeline_runs(current_stage);

-- Autopilot Config — global and per-tenant rules
CREATE TABLE IF NOT EXISTS cw_autopilot_config (
  id                    SERIAL PRIMARY KEY,
  tenant_id             VARCHAR(64) NOT NULL DEFAULT 'cw_carriers' UNIQUE,
  enabled               BOOLEAN DEFAULT true,
  default_mode          VARCHAR(16) DEFAULT 'autopilot',
  -- Per-stage auto_advance toggles
  stage_rules           JSONB DEFAULT '{
    "contract_received": { "auto_advance": true },
    "rate_analysis": { "auto_advance": true, "pause_if_above_market_pct": 20, "pause_if_no_history": true },
    "carrier_match": { "auto_advance": true, "min_carriers_above_threshold": 3, "min_carrier_score": 40 },
    "load_match": { "auto_advance": true, "auto_accept_savings_pct": 10 },
    "carrier_outreach": { "auto_advance": true, "use_rachel_voice": false, "max_outreach_attempts": 5 },
    "rate_confirmation": { "auto_advance": true, "pause_if_margin_below_pct": 10 },
    "transit_tracking": { "auto_advance": true, "check_call_interval_hours": 4 },
    "delivery_billing": { "auto_advance": true, "auto_invoice": true }
  }',
  -- Margin thresholds
  min_margin_pct        NUMERIC(5,2) DEFAULT 10.00,
  target_margin_pct     NUMERIC(5,2) DEFAULT 15.00,
  max_auto_book_amount  NUMERIC(12,2) DEFAULT 25000.00,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline Events — immutable event log
CREATE TABLE IF NOT EXISTS cw_pipeline_events (
  id                    SERIAL PRIMARY KEY,
  tenant_id             VARCHAR(64) NOT NULL DEFAULT 'cw_carriers',
  pipeline_run_id       INTEGER NOT NULL REFERENCES cw_pipeline_runs(id) ON DELETE CASCADE,
  event_type            VARCHAR(30) NOT NULL CHECK (event_type IN ('stage_started','stage_completed','stage_failed','paused','resumed','override','error','mode_switch','cancelled')),
  stage                 VARCHAR(30),
  details               JSONB DEFAULT '{}',
  triggered_by          VARCHAR(128) DEFAULT 'system',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_pipeline_events_run ON cw_pipeline_events(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_cw_pipeline_events_type ON cw_pipeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cw_pipeline_events_tenant ON cw_pipeline_events(tenant_id);

-- Seed default config if not exists
INSERT INTO cw_autopilot_config (tenant_id) VALUES ('cw_carriers') ON CONFLICT (tenant_id) DO NOTHING;

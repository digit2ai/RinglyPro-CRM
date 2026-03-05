-- OEE (Overall Equipment Effectiveness) Tracking Module
-- Migration: 2026-03-05
-- Tables: machines, machine_events, production_runs

-- Machines registered on the shop floor
CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  line VARCHAR(50),
  expected_cycle_time_sec FLOAT NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw machine status events (heartbeat stream)
CREATE TABLE IF NOT EXISTS machine_events (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','stopped','idle','fault')),
  reason VARCHAR(150),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production run records (per shift or batch)
CREATE TABLE IF NOT EXISTS production_runs (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  shift_start TIMESTAMPTZ NOT NULL,
  shift_end TIMESTAMPTZ,
  planned_production_time_min FLOAT NOT NULL,
  total_parts INTEGER DEFAULT 0,
  good_parts INTEGER DEFAULT 0,
  actual_cycle_time_sec FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_tenant_id ON machines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_machine_events_machine_id ON machine_events(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_events_recorded_at ON machine_events(recorded_at);
CREATE INDEX IF NOT EXISTS idx_production_runs_machine_id ON production_runs(machine_id);

-- PINAXIS Logistics Suite — Token Estimates & Contracts
-- Migration 002

CREATE TABLE IF NOT EXISTS logistics_token_estimates (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  client_name     VARCHAR(255),
  model           VARCHAR(50),
  markup          DECIMAL(5,2),
  scenarios       JSONB,
  monthly_cost    DECIMAL(12,2),
  monthly_billed  DECIMAL(12,2),
  monthly_margin  DECIMAL(12,2),
  labor_savings   DECIMAL(12,2),
  roi_ratio       DECIMAL(8,2),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_contracts (
  id                    SERIAL PRIMARY KEY,
  tenant_id             INTEGER NOT NULL,
  client_name           VARCHAR(255),
  effective_date        DATE,
  client_address        TEXT,
  implementation_fee    DECIMAL(12,2),
  monthly_retainer      DECIMAL(12,2),
  token_markup          DECIMAL(5,2),
  initial_term_months   INTEGER,
  onboarding_hours      INTEGER,
  impl_timeline_weeks   INTEGER,
  jurisdiction          VARCHAR(100) DEFAULT 'Florida',
  linked_estimate_id    INTEGER REFERENCES logistics_token_estimates(id),
  docx_path             VARCHAR(500),
  pdf_path              VARCHAR(500),
  status                VARCHAR(50) DEFAULT 'draft',
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimates_tenant ON logistics_token_estimates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON logistics_contracts(tenant_id);

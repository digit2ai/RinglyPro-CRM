-- RinglyPro Neural Intelligence Layer - Migration
-- Date: 2026-03-10

CREATE TABLE IF NOT EXISTS neural_insights (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  impact VARCHAR(20) NOT NULL DEFAULT 'medium',
  impact_estimate TEXT,
  recommended_action TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  analysis_date DATE NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_neural_insights_client_id ON neural_insights(client_id);
CREATE INDEX IF NOT EXISTS idx_neural_insights_category ON neural_insights(category);
CREATE INDEX IF NOT EXISTS idx_neural_insights_impact ON neural_insights(impact);
CREATE INDEX IF NOT EXISTS idx_neural_insights_status ON neural_insights(status);
CREATE INDEX IF NOT EXISTS idx_neural_insights_analysis_date ON neural_insights(analysis_date);

-- Unique constraint for upsert (one insight per client+category+date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_neural_insights_upsert
  ON neural_insights(client_id, category, analysis_date);

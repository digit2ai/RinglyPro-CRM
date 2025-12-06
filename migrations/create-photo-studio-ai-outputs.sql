-- =====================================================
-- Photo Studio AI Outputs Table
-- Purpose: Store AI-generated content (menu, flyer, social) via MCP
-- =====================================================

CREATE TABLE IF NOT EXISTS photo_studio_ai_outputs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES photo_studio_orders(id) ON DELETE CASCADE,

  -- AI Generation Info
  mode VARCHAR(50) NOT NULL CHECK (mode IN ('menu', 'flyer', 'social', 'generic')),
  request_context JSONB,
  model_name VARCHAR(100),

  -- AI Output
  output_json JSONB,
  raw_text TEXT,

  -- Metadata
  created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_outputs_order_id ON photo_studio_ai_outputs(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_mode ON photo_studio_ai_outputs(mode);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_created_at ON photo_studio_ai_outputs(created_at DESC);

-- Comments
COMMENT ON TABLE photo_studio_ai_outputs IS 'AI-generated marketing content (OpenAI/Claude via MCP) for Photo Studio orders';
COMMENT ON COLUMN photo_studio_ai_outputs.mode IS 'Type of content generated: menu, flyer, social, or generic';
COMMENT ON COLUMN photo_studio_ai_outputs.request_context IS 'Snapshot of brief/order data used for AI generation';
COMMENT ON COLUMN photo_studio_ai_outputs.output_json IS 'Structured AI output (menu sections, flyer copy, social captions, etc.)';
COMMENT ON COLUMN photo_studio_ai_outputs.raw_text IS 'Full AI text response for reference';

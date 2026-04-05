-- Torna Idioma Learner Platform v2 — Step 6: Profesora Isabel AI Tutor
-- Per-learner AI memory + full conversation log.
-- Isolation: ti_v2_* prefix.

-- Per-learner persistent memory (one row per learner)
CREATE TABLE IF NOT EXISTS ti_v2_ai_memory (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL UNIQUE REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  context_summary TEXT,                         -- rolling text summary of learner's background
  last_5_sessions JSONB DEFAULT '[]'::jsonb,    -- array of session summaries
  vocabulary_struggles JSONB DEFAULT '[]'::jsonb,  -- words the learner keeps missing
  preferred_topics JSONB DEFAULT '[]'::jsonb,   -- topics learner engages with most
  total_messages INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_ai_memory_learner ON ti_v2_ai_memory(learner_id);

-- Full conversation log (rolling history)
CREATE TABLE IF NOT EXISTS ti_v2_isabel_conversations (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,                    -- user | assistant | system
  content TEXT NOT NULL,
  model_used VARCHAR(50),                       -- claude-opus-4-6 | gpt-4o | mock
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_isabel_conv_learner ON ti_v2_isabel_conversations(learner_id, created_at DESC);

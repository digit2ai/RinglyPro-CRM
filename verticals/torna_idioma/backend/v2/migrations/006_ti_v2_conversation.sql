-- Torna Idioma Learner Platform v2 — Step 7: Real-Time Voice Conversation
-- Persisted transcripts for every voice exchange with Profesora Isabel.
-- Isolation: ti_v2_* prefix.

CREATE TABLE IF NOT EXISTS ti_v2_conversation_logs (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,                -- groups turns into a single voice session
  turn_number INTEGER NOT NULL DEFAULT 0,  -- 0, 1, 2, ... within a session
  role VARCHAR(20) NOT NULL,               -- user | assistant
  transcript TEXT NOT NULL,
  audio_url TEXT,                          -- optional S3/CDN pointer to the audio clip
  duration_ms INTEGER,                     -- length of audio in ms (user side)
  stt_model VARCHAR(50),                   -- whisper-1 | etc.
  tts_model VARCHAR(50),                   -- eleven_multilingual_v2 | etc.
  tts_voice_id VARCHAR(64),
  latency_ms INTEGER,                      -- end-to-end turn latency
  tokens_used INTEGER DEFAULT 0,           -- LLM tokens for this turn
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_conv_logs_learner ON ti_v2_conversation_logs(learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ti_v2_conv_logs_session ON ti_v2_conversation_logs(session_id, turn_number);

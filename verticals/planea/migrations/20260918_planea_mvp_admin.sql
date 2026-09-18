-- PLANEA MVP: módulo administrativo, conocimiento de Maya, métricas.
-- Canónico. El código (admin.cjs / kb.cjs) crea lo mismo en el primer uso, de forma idempotente.

CREATE TABLE IF NOT EXISTS planea_kb_docs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  mime TEXT NOT NULL,
  filename TEXT,
  size_bytes INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  extracted_text TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_kb_name_version ON planea_kb_docs (tenant_id, lower(name), version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_kb_one_active ON planea_kb_docs (tenant_id, lower(name)) WHERE active;
CREATE INDEX IF NOT EXISTS idx_planea_kb_tenant ON planea_kb_docs (tenant_id, active);

-- Un evento por usuario, tipo y día (visit | score_view). Sin cifras ni contenido.
CREATE TABLE IF NOT EXISTS planea_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_events_once_a_day ON planea_events (tenant_id, user_id, event, day);

-- NPS: una respuesta por persona.
CREATE TABLE IF NOT EXISTS planea_nps (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_nps_once ON planea_nps (tenant_id, user_id);

-- Administradores: por ID de cuenta, nunca por correo. Se conceden con scripts/planea-admins.cjs.
CREATE TABLE IF NOT EXISTS planea_admins (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_admins_user ON planea_admins (tenant_id, user_id);

-- Cotizaciones con enlace mágico (/planea/quote/:token). El token se guarda como SHA-256.
CREATE TABLE IF NOT EXISTS planea_quotes (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, token_hash TEXT NOT NULL, title TEXT NOT NULL,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb, content JSONB NOT NULL DEFAULT '{}'::jsonb,
  hours NUMERIC(8,2) NOT NULL, rate_cents INTEGER NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','approved','paid','discuss')),
  approved_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, stripe_session_id TEXT, stripe_payment_intent TEXT,
  discuss_comment TEXT, discuss_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_quotes_token ON planea_quotes (token_hash);
CREATE INDEX IF NOT EXISTS idx_planea_quotes_tenant ON planea_quotes (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS planea_quote_events (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, quote_id INTEGER NOT NULL,
  event TEXT NOT NULL, detail JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planea_quote_events_quote ON planea_quote_events (tenant_id, quote_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_quote_events_stripe ON planea_quote_events ((detail->>'stripe_event')) WHERE event = 'paid';

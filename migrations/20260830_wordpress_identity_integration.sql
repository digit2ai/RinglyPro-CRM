-- =============================================================
-- WordPress como proveedor de identidad (SOR) para las camaras.
--
-- EL ESQUEMA DEL BRIEF SE ADAPTO A ESTE REPOSITORIO, NO AL REVES.
--
-- El brief pedia ALTER TABLE users ... y un indice sobre (tenant_id, wp_user_id).
-- En esta base de datos eso habria fallado y, peor, habria acertado en la tabla
-- equivocada:
--   * `users` (70 filas) son las cuentas del CRM RinglyPro. No tiene tenant_id
--     ni chamber_id: no es multi-tenant y no es quien inicia sesion en una camara.
--   * `members` (87 filas) SI es el usuario de camara, con chamber_id.
-- Por tanto: tenant_id -> chamber_id, users -> members. El resto del contrato
-- (nombres de cabecera, claims, codigos de estado) queda intacto, porque del
-- otro lado hay un plugin de WordPress que no podemos romper.
-- =============================================================

CREATE TABLE IF NOT EXISTS cv_tenant_integrations (
  id                     SERIAL PRIMARY KEY,
  chamber_id             INTEGER NOT NULL,
  tenant_slug            VARCHAR(64) NOT NULL,
  provider               VARCHAR(32) NOT NULL DEFAULT 'wordpress',
  sso_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Deliberadamente presente y en FALSE: el login con relevo de contrasena se
  -- evaluo y se descarto (rompe 2FA, esquiva el endurecimiento de wp-login y
  -- mete credenciales en claro en la memoria de la plataforma). La columna
  -- existe para que la decision quede escrita, no para implementarla.
  direct_login_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  auto_provision         BOOLEAN NOT NULL DEFAULT TRUE,
  wp_base_url            TEXT,
  wp_issuer              TEXT,
  wp_logout_url          TEXT,
  shared_secret_enc      TEXT NOT NULL,
  shared_secret_prev_enc TEXT,
  secret_rotated_at      TIMESTAMPTZ,
  jwt_algorithm          VARCHAR(16) NOT NULL DEFAULT 'HS256',
  max_token_ttl_sec      INTEGER NOT NULL DEFAULT 120,
  clock_tolerance_sec    INTEGER NOT NULL DEFAULT 60,
  session_ttl_minutes    INTEGER NOT NULL DEFAULT 480,
  allowed_redirects      JSONB NOT NULL DEFAULT '["/"]'::jsonb,
  role_map               JSONB NOT NULL DEFAULT '{"administrator":"chamber_admin","editor":"chamber_staff","cv_empresario":"empresario","subscriber":"member"}'::jsonb,
  default_role           VARCHAR(32) NOT NULL DEFAULT 'member',
  last_sso_at            TIMESTAMPTZ,
  last_webhook_at        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cv_tenant_integrations_tenant_provider
  ON cv_tenant_integrations (chamber_id, provider);
CREATE INDEX IF NOT EXISTS ix_cv_tenant_integrations_slug
  ON cv_tenant_integrations (tenant_slug);

-- El usuario de camara es `members`. sub (wp_user_id) es la clave de union
-- permanente: el SSO actual empareja por EMAIL, y un cambio de correo en
-- WordPress crea un miembro nuevo en vez de reconocer al mismo.
ALTER TABLE members ADD COLUMN IF NOT EXISTS wp_user_id        BIGINT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS identity_provider VARCHAR(32);
ALTER TABLE members ADD COLUMN IF NOT EXISTS wp_user_login     VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS wp_roles          JSONB;
ALTER TABLE members ADD COLUMN IF NOT EXISTS wp_synced_at      TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS ux_members_chamber_wp_user
  ON members (chamber_id, wp_user_id) WHERE wp_user_id IS NOT NULL;

-- REPLAY EN BASE DE DATOS, NO EN MEMORIA.
-- El guard actual es un Map de proceso. En Render corren varias instancias, asi
-- que un token reenviado que caiga en otra instancia HOY se acepta. El indice
-- primario sobre jti convierte el segundo uso en un error de clave duplicada,
-- que es la unica forma de que sea cierto para todas las instancias.
CREATE TABLE IF NOT EXISTS cv_sso_used_tokens (
  jti        VARCHAR(64) PRIMARY KEY,
  chamber_id INTEGER NOT NULL,
  wp_user_id BIGINT,
  used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cv_sso_used_tokens_expiry ON cv_sso_used_tokens (expires_at);

CREATE TABLE IF NOT EXISTS cv_webhook_deliveries (
  id          SERIAL PRIMARY KEY,
  chamber_id  INTEGER NOT NULL,
  delivery_id VARCHAR(64) NOT NULL,
  event       VARCHAR(48) NOT NULL,
  wp_user_id  BIGINT,
  status_code INTEGER,
  action      VARCHAR(16),
  error       TEXT,
  payload     JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cv_webhook_deliveries_tenant_delivery
  ON cv_webhook_deliveries (chamber_id, delivery_id);
CREATE INDEX IF NOT EXISTS ix_cv_webhook_deliveries_user
  ON cv_webhook_deliveries (chamber_id, wp_user_id);

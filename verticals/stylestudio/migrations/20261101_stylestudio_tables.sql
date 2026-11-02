-- Manuel's Style Studio — canonical schema. Runs on every boot under an
-- advisory lock (src/db.js), so every statement MUST stay idempotent.
-- tenant_id = the owner's CRM users.id. Wardrobe inventory and generated images
-- live in separate tables on purpose (the spec asks for it, and deleting every
-- render must never touch a garment).

CREATE TABLE IF NOT EXISTS sty_items (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  category      VARCHAR(16) NOT NULL CHECK (category IN ('shirt','pants','shoes')),
  name          VARCHAR(120) NOT NULL,
  brand         VARCHAR(80),
  garment_type  VARCHAR(80),
  color_name    VARCHAR(80),
  color_hex     VARCHAR(7) NOT NULL DEFAULT '#dddddd',
  color2_hex    VARCHAR(7),
  pattern       VARCHAR(16) NOT NULL DEFAULT 'solid',
  notes         TEXT,
  favorite      BOOLEAN NOT NULL DEFAULT FALSE,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  is_slot       BOOLEAN NOT NULL DEFAULT FALSE,
  sort          INTEGER NOT NULL DEFAULT 0,
  seed_key      VARCHAR(40),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sty_items_tenant_cat_idx ON sty_items (tenant_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS sty_items_seed_uq ON sty_items (tenant_id, seed_key) WHERE seed_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS sty_photos (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  item_id     INTEGER REFERENCES sty_items(id) ON DELETE CASCADE,
  kind        VARCHAR(12) NOT NULL CHECK (kind IN ('garment','model')),
  data        BYTEA NOT NULL,
  thumb       BYTEA,
  texture     BYTEA,
  mime        VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
  width       INTEGER,
  height      INTEGER,
  sha         VARCHAR(64) NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  full_body   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sty_photos_tenant_item_idx ON sty_photos (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS sty_photos_tenant_kind_idx ON sty_photos (tenant_id, kind);

CREATE TABLE IF NOT EXISTS sty_outfits (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  shirt_id    INTEGER NOT NULL REFERENCES sty_items(id) ON DELETE CASCADE,
  pants_id    INTEGER NOT NULL REFERENCES sty_items(id) ON DELETE CASCADE,
  shoe_id     INTEGER NOT NULL REFERENCES sty_items(id) ON DELETE CASCADE,
  favorite    BOOLEAN NOT NULL DEFAULT FALSE,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  notes       TEXT,
  ai_note     TEXT,
  ai_note_key VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sty_outfits_combo_uq UNIQUE (tenant_id, shirt_id, pants_id, shoe_id)
);
CREATE INDEX IF NOT EXISTS sty_outfits_tenant_idx ON sty_outfits (tenant_id);

CREATE TABLE IF NOT EXISTS sty_wear (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL,
  outfit_id  INTEGER NOT NULL REFERENCES sty_outfits(id) ON DELETE CASCADE,
  worn_on    DATE NOT NULL,
  occasion   VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sty_wear_tenant_date_idx ON sty_wear (tenant_id, worn_on);

CREATE TABLE IF NOT EXISTS sty_plan (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL,
  plan_date  DATE NOT NULL,
  outfit_id  INTEGER NOT NULL REFERENCES sty_outfits(id) ON DELETE CASCADE,
  occasion   VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sty_plan_day_uq UNIQUE (tenant_id, plan_date)
);

CREATE TABLE IF NOT EXISTS sty_renders (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  outfit_id    INTEGER NOT NULL REFERENCES sty_outfits(id) ON DELETE CASCADE,
  cache_key    VARCHAR(64) NOT NULL,
  provider     VARCHAR(32) NOT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  step         VARCHAR(32),
  provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  image        BYTEA,
  mime         VARCHAR(40),
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sty_renders_tenant_outfit_idx ON sty_renders (tenant_id, outfit_id);
CREATE INDEX IF NOT EXISTS sty_renders_status_idx ON sty_renders (status);
CREATE INDEX IF NOT EXISTS sty_renders_key_idx ON sty_renders (tenant_id, cache_key);

CREATE TABLE IF NOT EXISTS sty_settings (
  tenant_id        INTEGER PRIMARY KEY,
  consent_at       TIMESTAMPTZ,
  consent_provider VARCHAR(40),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

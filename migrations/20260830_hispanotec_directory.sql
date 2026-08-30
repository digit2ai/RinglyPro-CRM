-- =============================================================
-- Motor de Directorio Inteligente HISPANOTEC  (HISP-101 .. HISP-112)
--
-- Instancia cv-105 UNICAMENTE. Cada tabla lleva chamber_id NOT NULL y todas
-- las consultas filtran por el. El Acuerdo Marco HISPANOTEC-DIGIT2AI reserva
-- estos elementos a la capa funcional diferenciada de su Instancia: no son
-- funcionalidades genericas de la plataforma (HISP-108).
--
-- Prefijo hd_ = Hispanotec Directory.
-- =============================================================

-- HISP-101/102/103 -- la ficha
CREATE TABLE IF NOT EXISTS hd_entries (
  id                SERIAL PRIMARY KEY,
  chamber_id        INTEGER NOT NULL,
  nombre            VARCHAR(300) NOT NULL,
  naturaleza        VARCHAR(20)  NOT NULL DEFAULT 'persona_fisica',
  tipologia         VARCHAR(20)  NOT NULL DEFAULT 'Prospecto',
  pais              VARCHAR(80),
  especialidad      VARCHAR(200),
  experiencia       VARCHAR(120),
  localizacion      VARCHAR(200),
  email             VARCHAR(200),
  telefono          VARCHAR(60),
  web               VARCHAR(300),
  sector            VARCHAR(120),
  tamano            VARCHAR(80),
  lineas_actuacion  JSONB DEFAULT '[]'::jsonb,
  -- pendiente_validacion | validada. Toda ficha creada o enriquecida por IA
  -- NACE pendiente. Nada se publica sin un validador humano (HISP-102).
  estado_ficha      VARCHAR(30) NOT NULL DEFAULT 'pendiente_validacion',
  origen            VARCHAR(30) NOT NULL DEFAULT 'manual', -- manual|csv|fuente_publica|ia
  -- Art. 14 RGPD: todo perfil de fuente publica registra su base legal y
  -- dispara la notificacion de transparencia (max 1 mes).
  base_legal        VARCHAR(200),
  fuente_publica    VARCHAR(400),
  art14_due_at      TIMESTAMPTZ,
  art14_notified_at TIMESTAMPTZ,
  validado_por      INTEGER,
  validado_en       TIMESTAMPTZ,
  creado_por        INTEGER,
  dedupe_key        VARCHAR(400),
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_entries_chamber      ON hd_entries(chamber_id);
CREATE INDEX IF NOT EXISTS idx_hd_entries_tipologia    ON hd_entries(chamber_id, tipologia);
CREATE INDEX IF NOT EXISTS idx_hd_entries_naturaleza   ON hd_entries(chamber_id, naturaleza);
CREATE INDEX IF NOT EXISTS idx_hd_entries_estado       ON hd_entries(chamber_id, estado_ficha);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_entries_dedupe ON hd_entries(chamber_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- HISP-102 -- procedencia campo a campo. El validador acepta/edita/rechaza
-- CADA campo por separado, nunca en bloque.
CREATE TABLE IF NOT EXISTS hd_entry_fields (
  id            SERIAL PRIMARY KEY,
  chamber_id    INTEGER NOT NULL,
  entry_id      INTEGER NOT NULL,
  campo         VARCHAR(80)  NOT NULL,
  valor         TEXT,
  origen        VARCHAR(20)  NOT NULL DEFAULT 'ia',        -- ia | humano
  fuente        VARCHAR(400),
  estado        VARCHAR(20)  NOT NULL DEFAULT 'propuesto', -- propuesto|aceptado|rechazado
  decidido_por  INTEGER,
  decidido_en   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_fields_entry ON hd_entry_fields(chamber_id, entry_id);

-- HISP-104 -- fundaciones. presupuesto real y proxy NUNCA se mezclan sin aviso.
CREATE TABLE IF NOT EXISTS hd_foundations (
  id                 SERIAL PRIMARY KEY,
  chamber_id         INTEGER NOT NULL,
  entry_id           INTEGER NOT NULL,
  presupuesto_eur    BIGINT,          -- solo si es publico y verificable
  presupuesto_fuente VARCHAR(400),
  presupuesto_ejercicio VARCHAR(10),
  -- Cuando no hay presupuesto publico: indicador proxy, SIEMPRE etiquetado
  -- como estimacion junto a la cifra, no en una nota al pie.
  proxy_valor        BIGINT,
  proxy_tipo         VARCHAR(60),     -- dotacion_fundacional|gasto_actividad_social|num_proyectos
  proxy_fuente       VARCHAR(400),
  proxy_ejercicio    VARCHAR(10),
  afinidad_tags      JSONB DEFAULT '[]'::jsonb,
  revisado_en        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_found_chamber ON hd_foundations(chamber_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_found_entry ON hd_foundations(chamber_id, entry_id);

-- HISP-107 -- trazabilidad. Conjunto CERRADO de estados, sin ediciones anonimas.
CREATE TABLE IF NOT EXISTS hd_interactions (
  id            SERIAL PRIMARY KEY,
  chamber_id    INTEGER NOT NULL,
  entry_id      INTEGER NOT NULL,
  project_id    INTEGER,
  estado        VARCHAR(20) NOT NULL, -- contactado|en_negociacion|formalizado|descartado|en_pausa
  resultado     TEXT,
  actor_id      INTEGER NOT NULL,     -- NOT NULL: no hay ediciones anonimas
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_inter_entry ON hd_interactions(chamber_id, entry_id);

-- HISP-110 -- permiso previo (opt-in real) como estandar unico.
CREATE TABLE IF NOT EXISTS hd_consent (
  id              SERIAL PRIMARY KEY,
  chamber_id      INTEGER NOT NULL,
  entry_id        INTEGER NOT NULL,
  nivel           SMALLINT NOT NULL DEFAULT 1,   -- 1|2|3 (ante duda, 1)
  estado          VARCHAR(24) NOT NULL DEFAULT 'no_solicitado',
  canal           VARCHAR(40),
  solicitado_en   TIMESTAMPTZ,
  concedido_en    TIMESTAMPTZ,
  opuesto_en      TIMESTAMPTZ,
  evidencia       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_consent_entry ON hd_consent(chamber_id, entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_consent_one ON hd_consent(chamber_id, entry_id);

-- HISP-106 -- matching propositivo. Se registra lo seguido y lo descartado
-- para poder recalibrar.
CREATE TABLE IF NOT EXISTS hd_matches (
  id            SERIAL PRIMARY KEY,
  chamber_id    INTEGER NOT NULL,
  project_id    INTEGER NOT NULL,
  entry_id      INTEGER NOT NULL,
  score         NUMERIC(5,2) NOT NULL,
  motivos       JSONB DEFAULT '[]'::jsonb,
  decision      VARCHAR(20) DEFAULT 'propuesto', -- propuesto|aceptado|descartado
  decidido_por  INTEGER,
  decidido_en   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_matches_proj ON hd_matches(chamber_id, project_id);

-- HISP-105 -- busquedas frecuentes
CREATE TABLE IF NOT EXISTS hd_saved_searches (
  id          SERIAL PRIMARY KEY,
  chamber_id  INTEGER NOT NULL,
  member_id   INTEGER NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  filtros     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_saved_member ON hd_saved_searches(chamber_id, member_id);

-- HISP-109 -- registro de accesos a datos sensibles (presupuestos, contacto
-- directo) y de toda accion relevante. Auditable.
CREATE TABLE IF NOT EXISTS hd_audit (
  id          SERIAL PRIMARY KEY,
  chamber_id  INTEGER NOT NULL,
  actor_id    INTEGER,
  rol         VARCHAR(30),
  accion      VARCHAR(60) NOT NULL,
  objetivo    VARCHAR(120),
  detalle     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_audit_chamber ON hd_audit(chamber_id, created_at DESC);

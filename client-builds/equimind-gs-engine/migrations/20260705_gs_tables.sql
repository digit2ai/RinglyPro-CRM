-- =====================================================
-- EquiMind 3DGS Engine — canonical schema (EQUIMIND-3DGS-001, Phase 1).
-- All tables tenant-scoped (tenant_id = EquiMind account id, ecpf_users.id).
-- The gs_ prefix isolates this module. Applied automatically on boot via
-- Sequelize sync({alter:false}); this file is the source of truth + audit.
-- Rollback: 20260705_gs_tables_rollback.sql
-- =====================================================

-- Capture sessions: a client's capture attempt (video walkthrough or photo burst).
CREATE TABLE IF NOT EXISTS gs_sessions (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,               -- ecpf_users.id (EquiMind account)
  kind          VARCHAR(24) NOT NULL DEFAULT 'course_walk', -- course_walk | conformation | scene
  source_type   VARCHAR(16) NOT NULL DEFAULT 'video',       -- video | photos
  status        VARCHAR(20) NOT NULL DEFAULT 'created',      -- created | uploading | ready | processing | done | failed
  title         VARCHAR(180),
  horse_id      BIGINT,                          -- optional link to ecpf_caballos
  frame_count   INTEGER NOT NULL DEFAULT 0,
  source_bytes  BIGINT NOT NULL DEFAULT 0,
  source_seconds NUMERIC(8,2) NOT NULL DEFAULT 0,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs_sessions_tenant ON gs_sessions(tenant_id);

-- Processing jobs: one per session dispatch to a ProcessingProvider.
CREATE TABLE IF NOT EXISTS gs_jobs (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  session_id    BIGINT NOT NULL,
  provider      VARCHAR(24) NOT NULL DEFAULT 'mock',   -- mock | luma | postshot | self_hosted
  status        VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | refunded
  attempts      INTEGER NOT NULL DEFAULT 0,
  credits_charged NUMERIC(10,2) NOT NULL DEFAULT 0,
  credits_refunded NUMERIC(10,2) NOT NULL DEFAULT 0,
  error         TEXT,
  external_id   VARCHAR(120),                    -- provider job handle
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs_jobs_tenant ON gs_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gs_jobs_status ON gs_jobs(status);
CREATE INDEX IF NOT EXISTS idx_gs_jobs_session ON gs_jobs(session_id);

-- Scenes: the playable output of a completed job (canonical .ply + streamed .spz).
CREATE TABLE IF NOT EXISTS gs_scenes (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  session_id    BIGINT NOT NULL,
  job_id        BIGINT,
  kind          VARCHAR(24) NOT NULL DEFAULT 'course_walk',
  title         VARCHAR(180),
  status        VARCHAR(20) NOT NULL DEFAULT 'ready',    -- ready | archived
  splat_count   BIGINT NOT NULL DEFAULT 0,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  share_token   VARCHAR(40),                     -- read-only public magic link
  waypoints     JSONB,                           -- course-walk annotations
  is_simulated  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = mock/placeholder asset (no real GPU splat)
  last_viewed_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs_scenes_tenant ON gs_scenes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gs_scenes_session ON gs_scenes(session_id);

-- Assets: files produced for a scene (ply, spz, thumbnail), stored in S3 or disk.
CREATE TABLE IF NOT EXISTS gs_assets (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  scene_id      BIGINT NOT NULL,
  role          VARCHAR(16) NOT NULL,            -- ply | spz | thumbnail | source
  storage       VARCHAR(10) NOT NULL DEFAULT 'disk', -- s3 | disk
  bucket        VARCHAR(120),
  object_key    TEXT NOT NULL,
  content_type  VARCHAR(80),
  bytes         BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs_assets_tenant ON gs_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gs_assets_scene ON gs_assets(scene_id);

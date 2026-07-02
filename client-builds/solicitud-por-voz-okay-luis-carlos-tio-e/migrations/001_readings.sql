-- =====================================================
-- rPPG readings — one row per completed measurement, multi-tenant.
-- Only the computed BPM integer + metadata are stored. No raw video,
-- no biometric signal, no PII (name/email/phone).
-- The model also sync()s this table on boot (alter:false); this file is
-- the canonical schema of record.
-- =====================================================

CREATE TABLE IF NOT EXISTS solicitud_por_voz_okay_luis_carlos_tio_e_readings (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  bpm         INTEGER NOT NULL,
  confidence  NUMERIC(4,3),
  duration_s  INTEGER,
  source      VARCHAR(16) NOT NULL DEFAULT 'rppg',  -- rppg | simulated
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitud_por_voz_okay_luis_carlos_tio_e_readings_tenant
  ON solicitud_por_voz_okay_luis_carlos_tio_e_readings (tenant_id);

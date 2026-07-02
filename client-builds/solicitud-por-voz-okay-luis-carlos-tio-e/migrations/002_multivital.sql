-- =====================================================
-- v2 multi-vital — additive columns on the existing readings table.
-- Idempotent (ADD COLUMN IF NOT EXISTS); the model also applies these on boot
-- via ensureColumns(). Only computed metrics + metadata; no raw signal, no PII.
-- =====================================================

ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS respiratory_bpm INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS hrv_sdnn_ms NUMERIC(7,2);
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS hrv_rmssd_ms NUMERIC(7,2);
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS stress_index INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS sqi INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS is_validation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS reference_bpm INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS metrics JSONB;

CREATE INDEX IF NOT EXISTS idx_solicitud_por_voz_okay_luis_carlos_tio_e_readings_metrics
  ON solicitud_por_voz_okay_luis_carlos_tio_e_readings USING GIN (metrics);

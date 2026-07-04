-- =====================================================
-- v3 — add experimental (calibration-gated) BP + SpO2 columns. Stress REMOVED
-- from the product; the legacy stress_index column (if present) is left in place
-- but is no longer written or read. Additive + idempotent; the model also applies
-- these on boot via ensureColumns(). Only computed metrics; no raw signal, no PII.
-- =====================================================

ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS bp_systolic INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS bp_diastolic INTEGER;
ALTER TABLE solicitud_por_voz_okay_luis_carlos_tio_e_readings ADD COLUMN IF NOT EXISTS spo2 INTEGER;

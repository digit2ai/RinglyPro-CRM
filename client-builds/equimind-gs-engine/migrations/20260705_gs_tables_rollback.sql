-- =====================================================
-- Rollback for 20260705_gs_tables.sql (EQUIMIND-3DGS-001).
-- Drops ONLY the gs_ module tables. Does NOT touch billing/credit tables
-- (ecpf_users / ecpf_credit_tx are never modified by this module — GS usage is
-- recorded via the existing addCredits/debitOne API, not new columns).
-- Order respects FK-free design (no hard FKs; app-level tenant scoping).
-- =====================================================

DROP TABLE IF EXISTS gs_assets;
DROP TABLE IF EXISTS gs_scenes;
DROP TABLE IF EXISTS gs_jobs;
DROP TABLE IF EXISTS gs_sessions;

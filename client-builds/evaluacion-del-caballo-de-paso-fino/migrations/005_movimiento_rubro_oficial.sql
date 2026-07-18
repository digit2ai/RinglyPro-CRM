-- =====================================================
-- Evaluación del Caballo de Paso Fino — métricas del rubro oficial FEDEQUINAS.
--
-- Agrega a ecpf_metricas_movimiento las columnas de las líneas del rubro oficial
-- (Cap. XI, Art. 3 del reglamento, ver REGLAMENTO_FEDEQUINAS.md) que ahora mide
-- el motor a partir de la pose del tronco/cabeza y de la deriva de tempo:
--   suavidad (la línea de mayor peso), compensación, quietud de anca,
--   posición de cabeza (reunión) y sostenimiento.
-- Idempotente (ADD COLUMN IF NOT EXISTS). Sequelize sync({alter:false}) NO agrega
-- columnas a tablas existentes, por eso este ALTER es necesario en Postgres.
-- =====================================================

ALTER TABLE ecpf_metricas_movimiento ADD COLUMN IF NOT EXISTS suavidad        DOUBLE PRECISION;
ALTER TABLE ecpf_metricas_movimiento ADD COLUMN IF NOT EXISTS compensacion    DOUBLE PRECISION;
ALTER TABLE ecpf_metricas_movimiento ADD COLUMN IF NOT EXISTS quietud_anca    DOUBLE PRECISION;
ALTER TABLE ecpf_metricas_movimiento ADD COLUMN IF NOT EXISTS posicion_cabeza DOUBLE PRECISION;
ALTER TABLE ecpf_metricas_movimiento ADD COLUMN IF NOT EXISTS sostenimiento   DOUBLE PRECISION;

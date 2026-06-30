-- =====================================================
-- Evaluación del Caballo de Paso Fino — Neural Intelligence layer.
--
-- Replica el patrón de RinglyPro Neural (neural_insights): hallazgos accionables
-- con código tipo OBD, severidad y recomendación, que vigilan cada sesión
-- juzgada y cada categoría. Tabla prefijada `ecpf_`, multi-tenant. IF NOT EXISTS.
-- Sequelize sync({alter:false}) también la crea en boot; este archivo es la DDL
-- canónica y auditable.
-- =====================================================

CREATE TABLE IF NOT EXISTS ecpf_neural_findings (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    sesion_id BIGINT,
    inscripcion_id BIGINT,
    categoria_id BIGINT,
    code VARCHAR(40) NOT NULL,
    category VARCHAR(30),
    scope VARCHAR(20),
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    evidence JSONB DEFAULT '{}'::jsonb,
    impact VARCHAR(20) DEFAULT 'info',
    impact_estimate TEXT,
    recommended_action TEXT,
    workflow VARCHAR(40),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecpf_findings_tenant    ON ecpf_neural_findings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_findings_sesion    ON ecpf_neural_findings (sesion_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_findings_categoria ON ecpf_neural_findings (categoria_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_findings_impact    ON ecpf_neural_findings (impact);
CREATE INDEX IF NOT EXISTS idx_ecpf_findings_status    ON ecpf_neural_findings (status);

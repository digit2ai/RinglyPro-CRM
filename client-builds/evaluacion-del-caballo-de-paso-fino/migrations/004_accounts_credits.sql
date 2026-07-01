-- =====================================================
-- Evaluación del Caballo de Paso Fino — cuentas + créditos (sistema PROPIO).
--
-- Sistema de usuarios SEPARADO del CRM de RinglyPro: cuentas exclusivas de esta
-- app, con saldo de créditos y libro contable. 1 crédito = 1 análisis (video o
-- sonido). Recarga vía Stripe (misma cuenta Stripe de Digit2AI). Prefijo `ecpf_`,
-- IF NOT EXISTS. Las contraseñas se guardan como hash bcrypt, nunca en claro.
-- =====================================================

CREATE TABLE IF NOT EXISTS ecpf_users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(120) NOT NULL,
    nombre VARCHAR(150),
    credits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecpf_users_email ON ecpf_users (lower(email));

-- Libro contable de créditos: compras (+), débitos por análisis (-), bonos (+).
CREATE TABLE IF NOT EXISTS ecpf_credit_tx (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES ecpf_users(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,                -- purchase | debit | bonus | refund
    credits INTEGER NOT NULL,                 -- con signo (+/-)
    dollars NUMERIC(8,2),                     -- monto pagado (solo compras)
    stripe_payment_intent_id VARCHAR(80),     -- para idempotencia del webhook
    analysis_type VARCHAR(20),                -- video | audio | null
    sesion_id BIGINT,                         -- sesión juzgada (solo débitos)
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecpf_credit_tx_user   ON ecpf_credit_tx (user_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecpf_credit_tx_pi ON ecpf_credit_tx (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

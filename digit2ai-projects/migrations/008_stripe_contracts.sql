-- Migration 008 - Stripe wire-up for contracts (Phase 2)
-- Adds the Stripe identifiers needed to drive: deposit collection,
-- payment-method storage, and monthly subscription creation when a
-- contract is signed via /contracts/sign.html.

ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(120);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(120);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_deposit_session_id VARCHAR(180);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_deposit_payment_intent_id VARCHAR(180);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(180);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(180);
ALTER TABLE d2_project_contracts ADD COLUMN IF NOT EXISTS subscription_active_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_d2_contracts_stripe_customer ON d2_project_contracts(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_d2_contracts_stripe_session ON d2_project_contracts(stripe_deposit_session_id);
CREATE INDEX IF NOT EXISTS idx_d2_contracts_stripe_sub ON d2_project_contracts(stripe_subscription_id);

-- =====================================================
-- RinglyPro Token System Migration
-- Created: 2025-10-23
-- Purpose: Add token-based billing for all services
-- =====================================================

-- =====================================================
-- STEP 1: Add Token Fields to Users Table
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens_balance INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS tokens_used_this_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_package VARCHAR(50) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS tokens_rollover INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_token_reset DATE DEFAULT CURRENT_DATE;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_tokens ON users(tokens_balance);
CREATE INDEX IF NOT EXISTS idx_users_billing_cycle ON users(billing_cycle_start);

COMMENT ON COLUMN users.tokens_balance IS 'Current token balance';
COMMENT ON COLUMN users.tokens_used_this_month IS 'Tokens used in current billing cycle';
COMMENT ON COLUMN users.token_package IS 'free, starter, growth, professional, enterprise';
COMMENT ON COLUMN users.tokens_rollover IS 'Unused tokens from previous month';
COMMENT ON COLUMN users.billing_cycle_start IS 'Start date of current billing cycle';
COMMENT ON COLUMN users.last_token_reset IS 'Last time tokens were reset';

-- =====================================================
-- STEP 2: Create Token Transactions Table
-- =====================================================

CREATE TABLE IF NOT EXISTS token_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transaction details
  service_type VARCHAR(100) NOT NULL,
  tokens_used INTEGER NOT NULL,
  tokens_balance_after INTEGER NOT NULL,

  -- Service metadata (flexible JSONB for any service data)
  metadata JSONB DEFAULT '{}',

  -- Related records (optional foreign keys)
  call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_token_trans_user ON token_transactions(user_id);
CREATE INDEX idx_token_trans_service ON token_transactions(service_type);
CREATE INDEX idx_token_trans_created ON token_transactions(created_at DESC);
CREATE INDEX idx_token_trans_user_created ON token_transactions(user_id, created_at DESC);

COMMENT ON TABLE token_transactions IS 'Every token usage logged here for transparency and auditing';
COMMENT ON COLUMN token_transactions.service_type IS 'business_collector_100, outbound_campaign_100, ai_chat_message, etc.';
COMMENT ON COLUMN token_transactions.metadata IS 'Service-specific data: {category: "lawyers", geography: "Tampa", results: 100}';

-- =====================================================
-- STEP 3: Create Token Purchases Table
-- =====================================================

CREATE TABLE IF NOT EXISTS token_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Purchase details
  package_name VARCHAR(50) NOT NULL,
  tokens_purchased INTEGER NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,

  -- Payment tracking
  stripe_payment_id VARCHAR(255) UNIQUE,
  payment_status VARCHAR(50) DEFAULT 'completed',

  -- Timestamps
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for queries and reporting
CREATE INDEX idx_token_purchases_user ON token_purchases(user_id);
CREATE INDEX idx_token_purchases_date ON token_purchases(purchased_at DESC);
CREATE INDEX idx_token_purchases_stripe ON token_purchases(stripe_payment_id);
CREATE INDEX idx_token_purchases_status ON token_purchases(payment_status);

COMMENT ON TABLE token_purchases IS 'Track all token package purchases via Stripe';
COMMENT ON COLUMN token_purchases.package_name IS 'free, starter, growth, professional, enterprise';
COMMENT ON COLUMN token_purchases.payment_status IS 'pending, completed, failed, refunded';

-- =====================================================
-- STEP 4: Create Token Usage Analytics View
-- =====================================================

CREATE OR REPLACE VIEW token_usage_summary AS
SELECT
  u.id AS user_id,
  u.email,
  u.business_name,
  u.tokens_balance,
  u.tokens_used_this_month,
  u.token_package,
  u.billing_cycle_start,

  -- Usage breakdown by service
  COUNT(CASE WHEN tt.service_type LIKE 'business_collector%' THEN 1 END) AS business_collector_uses,
  COALESCE(SUM(CASE WHEN tt.service_type LIKE 'business_collector%' THEN tt.tokens_used END), 0) AS business_collector_tokens,

  COUNT(CASE WHEN tt.service_type LIKE 'outbound%' THEN 1 END) AS outbound_uses,
  COALESCE(SUM(CASE WHEN tt.service_type LIKE 'outbound%' THEN tt.tokens_used END), 0) AS outbound_tokens,

  COUNT(CASE WHEN tt.service_type LIKE 'ai_chat%' THEN 1 END) AS ai_chat_uses,
  COALESCE(SUM(CASE WHEN tt.service_type LIKE 'ai_chat%' THEN tt.tokens_used END), 0) AS ai_chat_tokens,

  -- Total purchases
  COALESCE(SUM(tp.tokens_purchased), 0) AS total_tokens_purchased,
  COALESCE(SUM(tp.amount_paid), 0) AS total_amount_paid,

  -- Last activity
  MAX(tt.created_at) AS last_token_usage

FROM users u
LEFT JOIN token_transactions tt ON u.id = tt.user_id
  AND tt.created_at >= u.billing_cycle_start
LEFT JOIN token_purchases tp ON u.id = tp.user_id
  AND tp.purchased_at >= u.billing_cycle_start

GROUP BY u.id, u.email, u.business_name, u.tokens_balance,
         u.tokens_used_this_month, u.token_package, u.billing_cycle_start;

COMMENT ON VIEW token_usage_summary IS 'Comprehensive token usage analytics per user';

-- =====================================================
-- STEP 5: Create Function for Monthly Token Reset
-- =====================================================

CREATE OR REPLACE FUNCTION reset_monthly_tokens()
RETURNS TABLE(user_id INTEGER, old_balance INTEGER, new_balance INTEGER, package VARCHAR) AS $$
DECLARE
  user_record RECORD;
  monthly_allocation INTEGER;
  rollover_amount INTEGER;
  max_rollover INTEGER;
BEGIN
  -- Loop through users who need reset
  FOR user_record IN
    SELECT id, tokens_balance, token_package, billing_cycle_start
    FROM users
    WHERE billing_cycle_start <= CURRENT_DATE - INTERVAL '1 month'
  LOOP
    -- Determine monthly allocation based on package
    CASE user_record.token_package
      WHEN 'free' THEN
        monthly_allocation := 100;
        max_rollover := 0;
      WHEN 'starter' THEN
        monthly_allocation := 500;
        max_rollover := 1000;
      WHEN 'growth' THEN
        monthly_allocation := 2000;
        max_rollover := 5000;
      WHEN 'professional' THEN
        monthly_allocation := 7500;
        max_rollover := 999999; -- Unlimited
      ELSE
        monthly_allocation := 100;
        max_rollover := 0;
    END CASE;

    -- Calculate rollover
    rollover_amount := LEAST(user_record.tokens_balance, max_rollover);

    -- Reset tokens
    UPDATE users
    SET
      tokens_balance = monthly_allocation + rollover_amount,
      tokens_used_this_month = 0,
      tokens_rollover = rollover_amount,
      billing_cycle_start = CURRENT_DATE,
      last_token_reset = CURRENT_DATE,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = user_record.id;

    -- Return results
    user_id := user_record.id;
    old_balance := user_record.tokens_balance;
    new_balance := monthly_allocation + rollover_amount;
    package := user_record.token_package;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_tokens() IS 'Resets token balances monthly, respecting package limits and rollover rules';

-- =====================================================
-- STEP 6: Seed Existing Users with Tokens
-- =====================================================

-- Give all existing users 100 free tokens to start
UPDATE users
SET
  tokens_balance = 100,
  tokens_used_this_month = 0,
  token_package = 'free',
  tokens_rollover = 0,
  billing_cycle_start = CURRENT_DATE,
  last_token_reset = CURRENT_DATE
WHERE tokens_balance IS NULL;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify users table updated
SELECT COUNT(*) AS users_with_tokens FROM users WHERE tokens_balance IS NOT NULL;

-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('token_transactions', 'token_purchases');

-- Verify indexes created
SELECT indexname FROM pg_indexes
WHERE tablename IN ('users', 'token_transactions', 'token_purchases')
AND indexname LIKE 'idx_%token%';

-- Show sample token usage summary
SELECT * FROM token_usage_summary LIMIT 5;

-- =====================================================
-- ROLLBACK PLAN (if needed)
-- =====================================================

/*
-- To rollback this migration:

-- Drop tables
DROP TABLE IF EXISTS token_purchases CASCADE;
DROP TABLE IF NOT EXISTS token_transactions CASCADE;

-- Drop view
DROP VIEW IF EXISTS token_usage_summary;

-- Drop function
DROP FUNCTION IF EXISTS reset_monthly_tokens();

-- Remove columns from users (CAUTION: drops data!)
ALTER TABLE users
  DROP COLUMN IF EXISTS tokens_balance,
  DROP COLUMN IF EXISTS tokens_used_this_month,
  DROP COLUMN IF EXISTS token_package,
  DROP COLUMN IF EXISTS tokens_rollover,
  DROP COLUMN IF EXISTS billing_cycle_start,
  DROP COLUMN IF EXISTS last_token_reset;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_tokens;
DROP INDEX IF EXISTS idx_users_billing_cycle;
*/

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

SELECT 'Token system migration completed successfully!' AS status;

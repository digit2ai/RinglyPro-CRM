-- =====================================================
-- RINGLYPRO CRM - VIRAL REFERRAL SYSTEM
-- =====================================================
-- Created: November 3, 2025
-- Purpose: Enable viral growth through token-based referrals
--
-- Features:
-- - Unique referral codes per user
-- - Track referral signups and conversions
-- - Automatic token rewards
-- - Tiered referral program (Bronze/Silver/Gold)
-- - Analytics and leaderboards
-- =====================================================

-- =====================================================
-- 1. ADD REFERRAL COLUMNS TO USERS TABLE
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS referral_tier VARCHAR(20) DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_referrals INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_earnings DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS referral_tokens_earned INTEGER DEFAULT 0;

-- Create index for faster referral code lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

-- =====================================================
-- 2. REFERRALS TABLE - Track all referral relationships
-- =====================================================

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,

  -- Referrer information
  referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_code VARCHAR(20) NOT NULL,

  -- Referred user information
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_email VARCHAR(255) NOT NULL,
  referred_name VARCHAR(255),

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending',
  -- pending: User signed up, hasn't purchased
  -- converted: User made first purchase
  -- active: User is active (30+ days)
  -- churned: User inactive for 90+ days

  -- Conversion tracking
  converted_at TIMESTAMP,
  first_purchase_amount DECIMAL(10,2),
  first_purchase_package VARCHAR(50),

  -- Timestamps
  signed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  signup_ip VARCHAR(45),
  signup_source VARCHAR(100), -- 'referral_link', 'shared_content', 'email_invite'
  metadata JSONB DEFAULT '{}',

  CONSTRAINT unique_referral UNIQUE(referrer_user_id, referred_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referrer_code);

-- =====================================================
-- 3. REFERRAL REWARDS TABLE - Track token/cash rewards
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_rewards (
  id SERIAL PRIMARY KEY,

  -- Reward recipient
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_id INTEGER NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,

  -- Reward details
  reward_type VARCHAR(50) NOT NULL,
  -- 'signup_bonus': Tokens for referee signup (200 tokens)
  -- 'conversion_bonus': Tokens when referee purchases (1000 tokens)
  -- 'commission': Cash/token commission (Silver/Gold tier)
  -- 'milestone_bonus': Special rewards (10 referrals, 25 referrals, etc.)
  -- 'recurring_bonus': Monthly recurring tokens (Silver tier)

  reward_amount INTEGER NOT NULL, -- Tokens or cents (for cash)
  reward_currency VARCHAR(10) DEFAULT 'tokens', -- 'tokens' or 'usd'

  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending: Reward earned, not yet credited
  -- credited: Reward added to account
  -- failed: Credit attempt failed
  -- reversed: Reward reversed (fraud, chargeback)

  -- Processing
  credited_at TIMESTAMP,
  transaction_id INTEGER REFERENCES token_transactions(id),

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',

  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral ON referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_type ON referral_rewards(reward_type);

-- =====================================================
-- 4. REFERRAL TIERS TABLE - Define tier benefits
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_tiers (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(50) UNIQUE NOT NULL,
  min_referrals INTEGER NOT NULL,
  max_referrals INTEGER, -- NULL for unlimited

  -- Rewards
  signup_bonus_tokens INTEGER NOT NULL,
  conversion_bonus_tokens INTEGER NOT NULL,
  recurring_monthly_tokens INTEGER DEFAULT 0,
  commission_percentage DECIMAL(5,2) DEFAULT 0.00,
  commission_type VARCHAR(20) DEFAULT 'tokens', -- 'tokens' or 'cash'

  -- Benefits
  benefits JSONB DEFAULT '{}',
  -- Example: {"unlimited_tokens": false, "priority_support": false, "custom_branding": false}

  -- Display
  badge_icon VARCHAR(50),
  badge_color VARCHAR(20),
  display_order INTEGER DEFAULT 0,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tiers
INSERT INTO referral_tiers (tier_name, min_referrals, max_referrals, signup_bonus_tokens, conversion_bonus_tokens, recurring_monthly_tokens, commission_percentage, commission_type, badge_icon, badge_color, display_order, benefits) VALUES
  ('bronze', 0, 4, 200, 1000, 0, 0.00, 'tokens', '🥉', '#CD7F32', 1, '{"unlimited_tokens": false, "priority_support": false}'),
  ('silver', 5, 24, 300, 1500, 200, 5.00, 'tokens', '🥈', '#C0C0C0', 2, '{"unlimited_tokens": false, "priority_support": true, "custom_branding": true, "analytics_dashboard": true}'),
  ('gold', 25, NULL, 500, 2000, 500, 15.00, 'cash', '🥇', '#FFD700', 3, '{"unlimited_tokens": true, "priority_support": true, "custom_branding": true, "analytics_dashboard": true, "dedicated_account_manager": true, "cobranded_materials": true}')
ON CONFLICT (tier_name) DO NOTHING;

-- =====================================================
-- 5. REFERRAL CAMPAIGNS TABLE - Track promotional campaigns
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name VARCHAR(255) NOT NULL,
  campaign_code VARCHAR(50) UNIQUE,

  -- Campaign period
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,

  -- Bonus rewards
  bonus_signup_tokens INTEGER DEFAULT 0,
  bonus_conversion_tokens INTEGER DEFAULT 0,

  -- Target goals
  target_referrals INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Tracking
  total_signups INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,

  -- Metadata
  description TEXT,
  terms TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example campaign
INSERT INTO referral_campaigns (campaign_name, campaign_code, start_date, end_date, bonus_signup_tokens, bonus_conversion_tokens, target_referrals, description) VALUES
  ('Launch Promo', 'LAUNCH2025', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', 100, 500, 10000, 'Launch promotion: Extra tokens for early adopters!')
ON CONFLICT (campaign_code) DO NOTHING;

-- =====================================================
-- 6. REFERRAL ANALYTICS VIEW
-- =====================================================

CREATE OR REPLACE VIEW referral_analytics AS
SELECT
  u.id AS user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.referral_code,
  u.referral_tier,
  u.total_referrals,
  u.successful_referrals,
  u.referral_tokens_earned,
  u.referral_earnings,

  -- Count stats
  COUNT(DISTINCT r.id) AS total_referred_users,
  COUNT(DISTINCT CASE WHEN r.status = 'converted' THEN r.id END) AS converted_referrals,
  COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) AS active_referrals,
  COUNT(DISTINCT CASE WHEN r.status = 'churned' THEN r.id END) AS churned_referrals,

  -- Revenue stats
  COALESCE(SUM(r.first_purchase_amount), 0) AS total_referral_revenue,
  COALESCE(AVG(r.first_purchase_amount), 0) AS avg_referral_value,

  -- Reward stats
  COALESCE(SUM(CASE WHEN rr.reward_currency = 'tokens' AND rr.status = 'credited' THEN rr.reward_amount ELSE 0 END), 0) AS total_token_rewards,
  COALESCE(SUM(CASE WHEN rr.reward_currency = 'usd' AND rr.status = 'credited' THEN rr.reward_amount/100.0 ELSE 0 END), 0) AS total_cash_rewards,

  -- Conversion rate
  CASE
    WHEN COUNT(DISTINCT r.id) > 0
    THEN ROUND((COUNT(DISTINCT CASE WHEN r.status = 'converted' THEN r.id END)::NUMERIC / COUNT(DISTINCT r.id)::NUMERIC) * 100, 2)
    ELSE 0
  END AS conversion_rate,

  -- Dates
  MIN(r.signed_up_at) AS first_referral_date,
  MAX(r.signed_up_at) AS last_referral_date,

  -- Tier info
  rt.tier_name,
  rt.signup_bonus_tokens,
  rt.conversion_bonus_tokens,
  rt.commission_percentage

FROM users u
LEFT JOIN referrals r ON u.id = r.referrer_user_id
LEFT JOIN referral_rewards rr ON u.id = rr.user_id
LEFT JOIN referral_tiers rt ON u.referral_tier = rt.tier_name
GROUP BY u.id, u.email, u.first_name, u.last_name, u.referral_code, u.referral_tier,
         u.total_referrals, u.successful_referrals, u.referral_tokens_earned, u.referral_earnings,
         rt.tier_name, rt.signup_bonus_tokens, rt.conversion_bonus_tokens, rt.commission_percentage;

-- =====================================================
-- 7. LEADERBOARD VIEW - Top referrers
-- =====================================================

CREATE OR REPLACE VIEW referral_leaderboard AS
SELECT
  u.id AS user_id,
  u.first_name || ' ' || u.last_name AS full_name,
  u.business_name,
  u.referral_code,
  u.referral_tier,
  u.total_referrals,
  u.successful_referrals,
  u.referral_tokens_earned,
  u.referral_earnings,

  -- Rank
  RANK() OVER (ORDER BY u.successful_referrals DESC, u.total_referrals DESC) AS leaderboard_rank,

  -- Tier badge
  rt.badge_icon AS tier_badge,
  rt.badge_color AS tier_color

FROM users u
LEFT JOIN referral_tiers rt ON u.referral_tier = rt.tier_name
WHERE u.total_referrals > 0
ORDER BY u.successful_referrals DESC, u.total_referrals DESC
LIMIT 100;

-- =====================================================
-- 8. FUNCTIONS - Generate unique referral codes
-- =====================================================

CREATE OR REPLACE FUNCTION generate_referral_code(user_id_input INTEGER)
RETURNS VARCHAR(20) AS $$
DECLARE
  new_code VARCHAR(20);
  code_exists BOOLEAN;
  attempt_count INTEGER := 0;
  max_attempts INTEGER := 10;
BEGIN
  LOOP
    -- Generate code: USERID-RANDOM (e.g., 123-XY9K)
    new_code := user_id_input || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CURRENT_TIMESTAMP::TEXT) FROM 1 FOR 4));

    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = new_code) INTO code_exists;

    EXIT WHEN NOT code_exists;

    attempt_count := attempt_count + 1;
    IF attempt_count >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique referral code after % attempts', max_attempts;
    END IF;
  END LOOP;

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. FUNCTIONS - Update referral tier based on count
-- =====================================================

CREATE OR REPLACE FUNCTION update_referral_tier(user_id_input INTEGER)
RETURNS VARCHAR(20) AS $$
DECLARE
  current_successful_referrals INTEGER;
  new_tier VARCHAR(20);
BEGIN
  -- Get current successful referrals count
  SELECT successful_referrals INTO current_successful_referrals
  FROM users WHERE id = user_id_input;

  -- Determine tier based on count
  IF current_successful_referrals >= 25 THEN
    new_tier := 'gold';
  ELSIF current_successful_referrals >= 5 THEN
    new_tier := 'silver';
  ELSE
    new_tier := 'bronze';
  END IF;

  -- Update user's tier
  UPDATE users
  SET referral_tier = new_tier
  WHERE id = user_id_input;

  RETURN new_tier;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. TRIGGER - Auto-generate referral code on user creation
-- =====================================================

CREATE OR REPLACE FUNCTION auto_generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_generate_referral_code ON users;
CREATE TRIGGER trigger_auto_generate_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_referral_code();

-- =====================================================
-- 11. TRIGGER - Update referral counts
-- =====================================================

CREATE OR REPLACE FUNCTION update_referral_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment total referrals
    UPDATE users
    SET total_referrals = total_referrals + 1
    WHERE id = NEW.referrer_user_id;

  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'converted' THEN
    -- Increment successful referrals and update tier
    UPDATE users
    SET successful_referrals = successful_referrals + 1
    WHERE id = NEW.referrer_user_id;

    -- Update referral tier
    PERFORM update_referral_tier(NEW.referrer_user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_referral_counts ON referrals;
CREATE TRIGGER trigger_update_referral_counts
  AFTER INSERT OR UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_counts();

-- =====================================================
-- 12. BACKFILL - Generate referral codes for existing users
-- =====================================================

DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM users WHERE referral_code IS NULL
  LOOP
    UPDATE users
    SET referral_code = generate_referral_code(user_record.id)
    WHERE id = user_record.id;
  END LOOP;
END $$;

-- =====================================================
-- 13. INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_referrals_created_at ON referrals(signed_up_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_converted_at ON referrals(converted_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_created_at ON referral_rewards(created_at DESC);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check that all users have referral codes
-- SELECT COUNT(*) AS users_without_codes FROM users WHERE referral_code IS NULL;
-- Should return 0

-- View referral tiers
-- SELECT * FROM referral_tiers ORDER BY display_order;

-- Sample referral analytics
-- SELECT * FROM referral_analytics LIMIT 5;

-- Sample leaderboard
-- SELECT * FROM referral_leaderboard LIMIT 10;

-- =====================================================
-- ROLLBACK SCRIPT (Use if needed)
-- =====================================================

/*
-- Drop triggers
DROP TRIGGER IF EXISTS trigger_auto_generate_referral_code ON users;
DROP TRIGGER IF EXISTS trigger_update_referral_counts ON referrals;

-- Drop functions
DROP FUNCTION IF EXISTS auto_generate_referral_code();
DROP FUNCTION IF EXISTS update_referral_counts();
DROP FUNCTION IF EXISTS generate_referral_code(INTEGER);
DROP FUNCTION IF EXISTS update_referral_tier(INTEGER);

-- Drop views
DROP VIEW IF EXISTS referral_analytics;
DROP VIEW IF EXISTS referral_leaderboard;

-- Drop tables
DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS referral_campaigns CASCADE;
DROP TABLE IF EXISTS referral_tiers CASCADE;

-- Remove columns from users
ALTER TABLE users
  DROP COLUMN IF EXISTS referral_code,
  DROP COLUMN IF EXISTS referred_by_code,
  DROP COLUMN IF EXISTS referred_by_user_id,
  DROP COLUMN IF EXISTS referral_tier,
  DROP COLUMN IF EXISTS total_referrals,
  DROP COLUMN IF EXISTS successful_referrals,
  DROP COLUMN IF EXISTS referral_earnings,
  DROP COLUMN IF EXISTS referral_tokens_earned;
*/

-- =====================================================
-- END OF MIGRATION
-- =====================================================

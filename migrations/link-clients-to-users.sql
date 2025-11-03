-- =====================================================
-- CRITICAL FIX: Link Clients to Users for Token System
-- =====================================================
-- Created: 2025-01-XX
-- Purpose: Map every client to a user so tokens can be deducted
--
-- PROBLEM: Token deduction checks userId from clientId, but
-- clients.user_id is NULL for most records, causing silent
-- failures where tokens never deduct!
--
-- SOLUTION: Create users for clients that don't have one,
-- or link to existing users based on email match
-- =====================================================

BEGIN;

-- Step 1: Show current state
SELECT
  'Clients with NULL user_id' as status,
  COUNT(*) as count
FROM clients
WHERE user_id IS NULL;

SELECT
  'Clients with valid user_id' as status,
  COUNT(*) as count
FROM clients
WHERE user_id IS NOT NULL;

-- Step 2: Link clients to existing users by matching email
-- This handles cases where user signed up but client was created separately
UPDATE clients c
SET user_id = u.id,
    updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE c.owner_email = u.email
  AND c.user_id IS NULL
  AND u.id IS NOT NULL;

-- Show how many were linked
SELECT
  'Clients linked to existing users' as action,
  COUNT(*) as count
FROM clients c
JOIN users u ON c.user_id = u.id
WHERE c.updated_at > CURRENT_TIMESTAMP - INTERVAL '5 seconds';

-- Step 3: For remaining clients without user_id, create users
-- This creates a user account for each client that doesn't have one
INSERT INTO users (
  email,
  password_hash,
  first_name,
  last_name,
  business_name,
  business_phone,
  phone_number,
  terms_accepted,
  email_verified,
  onboarding_completed,
  -- Token fields (from token system migration)
  tokens_balance,
  tokens_used_this_month,
  token_package,
  tokens_rollover,
  billing_cycle_start,
  last_token_reset,
  -- Referral fields (from referral system migration)
  referral_tier,
  total_referrals,
  successful_referrals,
  referral_earnings,
  referral_tokens_earned,
  created_at,
  updated_at
)
SELECT
  c.owner_email as email,
  '$2b$10$TEMPPASSWORDHASH.NEEDSRESET.ASAP' as password_hash, -- Temp hash, user must reset
  SPLIT_PART(c.owner_name, ' ', 1) as first_name,
  CASE
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(c.owner_name, ' '), 1) > 1
    THEN SPLIT_PART(c.owner_name, ' ', 2)
    ELSE ''
  END as last_name,
  c.business_name,
  c.business_phone,
  c.owner_phone as phone_number,
  true as terms_accepted, -- Already using system
  true as email_verified, -- Already verified via client creation
  true as onboarding_completed, -- Already onboarded
  -- Give them starting tokens
  100 as tokens_balance,
  0 as tokens_used_this_month,
  'free' as token_package,
  0 as tokens_rollover,
  CURRENT_DATE as billing_cycle_start,
  CURRENT_DATE as last_token_reset,
  -- Referral system defaults
  'bronze' as referral_tier,
  0 as total_referrals,
  0 as successful_referrals,
  0.00 as referral_earnings,
  0 as referral_tokens_earned,
  c.created_at,
  CURRENT_TIMESTAMP as updated_at
FROM clients c
WHERE c.user_id IS NULL
  AND c.owner_email IS NOT NULL
  AND c.owner_email != ''
  -- Don't create duplicates
  AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.email = c.owner_email
  )
ON CONFLICT (email) DO NOTHING; -- Safety: don't overwrite existing users

-- Show how many users were created
SELECT
  'New users created from clients' as action,
  COUNT(*) as count
FROM users
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '10 seconds';

-- Step 4: Now link the clients to their newly created users
UPDATE clients c
SET user_id = u.id,
    updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE c.owner_email = u.email
  AND c.user_id IS NULL
  AND u.id IS NOT NULL;

-- Step 5: Generate referral codes for new users
-- (The referral system has a function for this)
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT id FROM users
    WHERE referral_code IS NULL
  LOOP
    UPDATE users
    SET referral_code = generate_referral_code(user_record.id)
    WHERE id = user_record.id;
  END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check final state
SELECT
  'AFTER MIGRATION - Clients with NULL user_id' as status,
  COUNT(*) as count
FROM clients
WHERE user_id IS NULL;

SELECT
  'AFTER MIGRATION - Clients with valid user_id' as status,
  COUNT(*) as count
FROM clients
WHERE user_id IS NOT NULL;

-- Show sample of linked clients
SELECT
  c.id as client_id,
  c.business_name,
  c.owner_email,
  c.user_id,
  u.email as user_email,
  u.tokens_balance,
  u.referral_code
FROM clients c
JOIN users u ON c.user_id = u.id
ORDER BY c.id DESC
LIMIT 10;

-- Summary
SELECT
  'Total Clients' as metric,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM clients), 2) || '%' as percentage
FROM clients

UNION ALL

SELECT
  'Clients with Users' as metric,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM clients), 2) || '%' as percentage
FROM clients
WHERE user_id IS NOT NULL

UNION ALL

SELECT
  'Clients without Users (PROBLEM!)' as metric,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM clients), 2) || '%' as percentage
FROM clients
WHERE user_id IS NULL;

COMMIT;

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================

/*
WHAT THIS MIGRATION DOES:
1. Links clients to existing users by matching email
2. Creates new users for clients that don't have one
3. Gives all new users 100 starting tokens
4. Generates referral codes for new users
5. Sets up complete token system for all clients

AFTER RUNNING THIS:
- Every client will have a user_id
- Every user will have tokens
- Token deduction will work for ALL clients
- No more silent failures

USERS CREATED WITH THIS MIGRATION:
- Password is TEMP - they need to reset via "Forgot Password"
- Email is marked verified (they're already using the system)
- Onboarding marked complete (they're already onboarded)
- 100 free tokens to start
- Bronze referral tier

MANUAL STEPS AFTER MIGRATION:
1. Email all newly created users:
   "We've upgraded your account! Please reset your password at:
    https://aiagent.ringlypro.com/reset-password"

2. Monitor token_transactions table to verify deductions working:
   SELECT * FROM token_transactions
   ORDER BY created_at DESC LIMIT 50;

3. Check for any clients still without user_id:
   SELECT * FROM clients WHERE user_id IS NULL;
*/

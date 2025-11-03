-- =====================================================
-- DIAGNOSTIC: Why Tokens Aren't Deducting
-- =====================================================
-- Run this to see the ROOT CAUSE of the token issue
-- =====================================================

-- 1. Check client-to-user mapping
SELECT
  'CLIENT-USER MAPPING' as section,
  '' as detail,
  '' as count;

SELECT
  '  Clients WITHOUT user_id (BROKEN!)' as section,
  '  These clients CANNOT deduct tokens' as detail,
  COUNT(*)::text as count
FROM clients
WHERE user_id IS NULL;

SELECT
  '  Clients WITH user_id (Working)' as section,
  '  These clients CAN deduct tokens' as detail,
  COUNT(*)::text as count
FROM clients
WHERE user_id IS NOT NULL;

-- 2. Show YOUR specific client
SELECT
  'YOUR ACCOUNT' as section,
  '' as detail,
  '' as count;

SELECT
  '  Your Client Record' as section,
  c.id::text || ' - ' || c.business_name as detail,
  CASE
    WHEN c.user_id IS NULL THEN '❌ NO user_id (BROKEN!)'
    ELSE '✅ Has user_id: ' || c.user_id::text
  END as count
FROM clients c
ORDER BY c.id DESC
LIMIT 1;

-- 3. Show token deduction attempts
SELECT
  'TOKEN TRANSACTION LOG' as section,
  '' as detail,
  '' as count;

SELECT
  '  Total token transactions' as section,
  '  (Should have records if working)' as detail,
  COUNT(*)::text as count
FROM token_transactions;

SELECT
  '  Transactions in last 24 hours' as section,
  '  (Your recent activity)' as detail,
  COUNT(*)::text as count
FROM token_transactions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- 4. Show users with tokens
SELECT
  'USER TOKEN BALANCES' as section,
  '' as detail,
  '' as count;

SELECT
  '  Users with tokens' as section,
  '' as detail,
  COUNT(*)::text as count
FROM users
WHERE tokens_balance > 0;

-- 5. THE SMOKING GUN - Show the broken link
SELECT
  'ROOT CAUSE ANALYSIS' as section,
  '' as detail,
  '' as count;

SELECT
  '  When you use a service:' as section,
  '  1. Frontend sends clientId to API' as detail,
  '' as count

UNION ALL

SELECT
  '' as section,
  '  2. API tries: SELECT user_id FROM clients WHERE id = clientId' as detail,
  '' as count

UNION ALL

SELECT
  '' as section,
  '  3. Gets back: user_id = NULL' as detail,
  '' as count

UNION ALL

SELECT
  '' as section,
  '  4. Code checks: if (userId) { deductTokens() }' as detail,
  '' as count

UNION ALL

SELECT
  '' as section,
  '  5. userId is NULL, so deduction SKIPS silently' as detail,
  '' as count

UNION ALL

SELECT
  '' as section,
  '  6. Service runs without charging tokens!' as detail,
  '' as count;

-- 6. Detailed view of YOUR account
SELECT
  'YOUR ACCOUNT DETAILS' as section,
  '' as key,
  '' as value;

SELECT
  '  Client Info' as section,
  'client_id' as key,
  c.id::text as value
FROM clients c
ORDER BY c.id DESC
LIMIT 1

UNION ALL

SELECT
  '' as section,
  'business_name' as key,
  c.business_name as value
FROM clients c
ORDER BY c.id DESC
LIMIT 1

UNION ALL

SELECT
  '' as section,
  'owner_email' as key,
  c.owner_email as value
FROM clients c
ORDER BY c.id DESC
LIMIT 1

UNION ALL

SELECT
  '' as section,
  'user_id' as key,
  COALESCE(c.user_id::text, '❌ NULL - THIS IS THE PROBLEM!') as value
FROM clients c
ORDER BY c.id DESC
LIMIT 1;

-- 7. Check if a user exists for your email
SELECT
  '  User Account Check' as section,
  'user_exists' as key,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM users u
      JOIN clients c ON u.email = c.owner_email
      ORDER BY c.id DESC
      LIMIT 1
    ) THEN '✅ Yes, user exists'
    ELSE '❌ No, user needs to be created'
  END as value;

-- 8. THE FIX NEEDED
SELECT
  'SOLUTION' as section,
  '' as key,
  '' as value;

SELECT
  '  To fix this issue:' as section,
  'Step 1' as key,
  'Run: migrations/link-clients-to-users.sql' as value

UNION ALL

SELECT
  '' as section,
  'Step 2' as key,
  'This will create users for all clients' as value

UNION ALL

SELECT
  '' as section,
  'Step 3' as key,
  'Every client will get a user_id' as value

UNION ALL

SELECT
  '' as section,
  'Step 4' as key,
  'Tokens will start deducting properly' as value

UNION ALL

SELECT
  '' as section,
  'Expected Result' as key,
  'All clients.user_id will be NOT NULL' as value;

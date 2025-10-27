-- Check prospects ready to be called for client 15

-- 1. Count by status
SELECT
  call_status,
  COUNT(*) as count
FROM business_directory
WHERE client_id = 15
GROUP BY call_status
ORDER BY count DESC;

-- 2. Check TO_BE_CALLED prospects
SELECT
  id,
  business_name,
  phone_number,
  category,
  location,
  call_status,
  created_at
FROM business_directory
WHERE client_id = 15
  AND call_status = 'TO_BE_CALLED'
ORDER BY created_at ASC
LIMIT 10;

-- 3. Check total prospects for client 15
SELECT
  COUNT(*) as total_prospects
FROM business_directory
WHERE client_id = 15;

-- 4. Check recently called (today)
SELECT
  id,
  business_name,
  phone_number,
  call_status,
  call_result,
  last_called_at
FROM business_directory
WHERE client_id = 15
  AND call_status = 'CALLED'
  AND DATE(last_called_at) = CURRENT_DATE
ORDER BY last_called_at DESC
LIMIT 10;

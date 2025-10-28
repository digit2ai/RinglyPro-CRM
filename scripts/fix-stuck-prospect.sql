-- Fix Stuck Prospect: +18135536872
-- This prospect was called 23 times but database was never updated
-- because all calls returned "busy" status

-- Update the stuck prospect
UPDATE business_directory
SET call_status = 'CALLED',
    call_result = 'busy',
    call_attempts = 23,
    last_called_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE phone_number LIKE '%8135536872%';

-- Verify the update
SELECT
    id,
    business_name,
    phone_number,
    call_status,
    call_result,
    call_attempts,
    last_called_at
FROM business_directory
WHERE phone_number LIKE '%8135536872%';

-- Optional: Find other potentially stuck prospects (called multiple times but still TO_BE_CALLED)
-- This shouldn't happen after the fix, but check for existing issues
SELECT
    business_name,
    phone_number,
    call_status,
    call_attempts,
    last_called_at
FROM business_directory
WHERE call_status = 'TO_BE_CALLED'
  AND call_attempts > 0
ORDER BY call_attempts DESC;

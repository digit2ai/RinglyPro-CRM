-- EMERGENCY: Block problematic number +14243242113 that was called 49 times
-- Run this immediately: psql $DATABASE_URL < scripts/emergency-block-bad-number.sql

BEGIN;

-- Mark the problematic number as BAD_NUMBER
UPDATE business_directory
SET call_status = 'BAD_NUMBER',
    call_notes = 'EMERGENCY BLOCK: Called 49 times on 2025-10-29 due to webhook failure. NEVER CALL AGAIN.',
    updated_at = CURRENT_TIMESTAMP
WHERE phone_number IN (
  '+14243242113',
  '14243242113',
  '4243242113',
  '+4243242113'
);

-- Create trigger to prevent accidentally calling BAD_NUMBER entries
CREATE OR REPLACE FUNCTION prevent_bad_number_calls()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.call_status = 'TO_BE_CALLED' AND OLD.call_status = 'BAD_NUMBER' THEN
    RAISE EXCEPTION 'Cannot change BAD_NUMBER status back to TO_BE_CALLED. This number is permanently blocked.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_bad_numbers ON business_directory;
CREATE TRIGGER protect_bad_numbers
BEFORE UPDATE ON business_directory
FOR EACH ROW
EXECUTE FUNCTION prevent_bad_number_calls();

-- Show result
SELECT id, business_name, phone_number, call_status, call_attempts, call_notes
FROM business_directory
WHERE phone_number ILIKE '%424324211%';

COMMIT;

SELECT '✅ EMERGENCY FIX APPLIED: +14243242113 is now permanently blocked' AS status;

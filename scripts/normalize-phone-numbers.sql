-- Normalize Phone Numbers to E.164 Format
-- This migration converts all existing phone numbers to consistent E.164 format (+1XXXXXXXXXX)
-- Run this in Render PostgreSQL console or via psql

-- Preview what will change (run this first to verify):
SELECT
  id,
  business_name,
  phone_number AS current_phone,
  CASE
    -- Already E.164 format with +1 (11 digits) - no change needed
    WHEN phone_number ~ '^\+1\d{10}$' THEN phone_number

    -- E.164 format with + but only 10 digits (add 1 after +)
    WHEN phone_number ~ '^\+\d{10}$' THEN '+1' || substring(phone_number from 2)

    -- 11 digits without + (add +)
    WHEN phone_number ~ '^\d{11}$' THEN '+' || phone_number

    -- 10 digits without + (add +1)
    WHEN phone_number ~ '^\d{10}$' THEN '+1' || phone_number

    -- Contains non-digits - clean and normalize
    WHEN phone_number ~ '\D' THEN
      CASE
        WHEN length(regexp_replace(phone_number, '\D', '', 'g')) = 11 THEN
          '+' || regexp_replace(phone_number, '\D', '', 'g')
        WHEN length(regexp_replace(phone_number, '\D', '', 'g')) = 10 THEN
          '+1' || regexp_replace(phone_number, '\D', '', 'g')
        ELSE phone_number -- Keep as-is if invalid
      END

    -- Default: keep as-is
    ELSE phone_number
  END AS normalized_phone,
  call_status
FROM business_directory
WHERE phone_number IS NOT NULL
ORDER BY id
LIMIT 20;

-- Actual migration (run this after verifying preview looks correct):
UPDATE business_directory
SET phone_number = CASE
  -- Already E.164 format with +1 (11 digits) - no change needed
  WHEN phone_number ~ '^\+1\d{10}$' THEN phone_number

  -- E.164 format with + but only 10 digits (add 1 after +)
  WHEN phone_number ~ '^\+\d{10}$' THEN '+1' || substring(phone_number from 2)

  -- 11 digits without + (add +)
  WHEN phone_number ~ '^\d{11}$' THEN '+' || phone_number

  -- 10 digits without + (add +1)
  WHEN phone_number ~ '^\d{10}$' THEN '+1' || phone_number

  -- Contains non-digits - clean and normalize
  WHEN phone_number ~ '\D' THEN
    CASE
      WHEN length(regexp_replace(phone_number, '\D', '', 'g')) = 11 THEN
        '+' || regexp_replace(phone_number, '\D', '', 'g')
      WHEN length(regexp_replace(phone_number, '\D', '', 'g')) = 10 THEN
        '+1' || regexp_replace(phone_number, '\D', '', 'g')
      ELSE phone_number -- Keep as-is if invalid
    END

  -- Default: keep as-is
  ELSE phone_number
END,
updated_at = CURRENT_TIMESTAMP
WHERE phone_number IS NOT NULL;

-- Verify results:
SELECT
  COUNT(*) FILTER (WHERE phone_number ~ '^\+1\d{10}$') as correct_format,
  COUNT(*) FILTER (WHERE phone_number ~ '^\+\d{10}$') as needs_1_prefix,
  COUNT(*) FILTER (WHERE phone_number ~ '^\d{11}$') as needs_plus,
  COUNT(*) FILTER (WHERE phone_number ~ '^\d{10}$') as needs_plus_and_1,
  COUNT(*) FILTER (WHERE phone_number ~ '\D') as has_formatting,
  COUNT(*) FILTER (WHERE phone_number IS NULL) as null_phones,
  COUNT(*) as total
FROM business_directory;

-- Show summary of changes:
SELECT 'Phone number normalization completed!' as status;
SELECT COUNT(*) as total_prospects FROM business_directory;
SELECT COUNT(*) FILTER (WHERE phone_number ~ '^\+1\d{10}$') as normalized_phones FROM business_directory;
SELECT COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND phone_number !~ '^\+1\d{10}$') as invalid_phones FROM business_directory;

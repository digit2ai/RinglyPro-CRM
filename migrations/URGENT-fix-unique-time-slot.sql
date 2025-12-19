-- =====================================================
-- URGENT FIX: unique_time_slot constraint is GLOBAL not per-client
-- This prevents ANY client from booking the same time slot as another client
-- RUN THIS IMMEDIATELY ON PRODUCTION DATABASE
-- =====================================================

-- Step 1: Drop the broken global constraint
DROP INDEX IF EXISTS unique_time_slot;

-- Step 2: Drop if it's a constraint instead of an index
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_time_slot;

-- Step 3: Drop any other problematic constraints
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_scheduled_slot;
DROP INDEX IF EXISTS unique_scheduled_slot;

-- Step 4: Create the CORRECT per-client constraint
-- This allows each client to have their own appointments at the same times
CREATE UNIQUE INDEX IF NOT EXISTS unique_time_slot_per_client
ON appointments (client_id, appointment_date, appointment_time)
WHERE status NOT IN ('cancelled', 'completed');

-- Verify the fix
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'appointments'
AND indexname LIKE '%unique%';

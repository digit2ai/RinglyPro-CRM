-- =====================================================
-- Add DEMO package to photo_studio_orders
-- Purpose: Update CHECK constraint to allow 'demo' package type
-- =====================================================

-- Drop the old constraint
ALTER TABLE photo_studio_orders
  DROP CONSTRAINT IF EXISTS photo_studio_orders_package_type_check;

-- Add the new constraint with 'demo' included
ALTER TABLE photo_studio_orders
  ADD CONSTRAINT photo_studio_orders_package_type_check
  CHECK (package_type IN ('demo', 'starter', 'pro', 'elite'));

-- Verify the constraint was added
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'photo_studio_orders'::regclass
  AND conname = 'photo_studio_orders_package_type_check';

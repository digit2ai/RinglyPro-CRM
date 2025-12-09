-- Migration: Add 'custom' package type for cart-based pricing
-- Date: 2024-12-09
-- Purpose: Allow photo_studio_orders to support dynamic cart-based orders

-- First, check if the constraint exists and drop it if needed
-- Then recreate with the new 'custom' option

-- Drop the existing constraint (if it exists)
DO $$
BEGIN
    -- Try to drop the constraint
    ALTER TABLE photo_studio_orders DROP CONSTRAINT IF EXISTS photo_studio_orders_package_type_check;
EXCEPTION
    WHEN others THEN
        -- Constraint doesn't exist, that's fine
        NULL;
END $$;

-- Add new constraint that includes 'custom' package type
ALTER TABLE photo_studio_orders
ADD CONSTRAINT photo_studio_orders_package_type_check
CHECK (package_type IN ('demo', 'starter', 'pro', 'elite', 'custom'));

-- Add pricing_model column if it doesn't exist (to track package vs cart orders)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photo_studio_orders'
        AND column_name = 'pricing_model'
    ) THEN
        ALTER TABLE photo_studio_orders
        ADD COLUMN pricing_model VARCHAR(20) DEFAULT 'package';
    END IF;
END $$;

-- Update existing orders to have pricing_model = 'package'
UPDATE photo_studio_orders
SET pricing_model = 'package'
WHERE pricing_model IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN photo_studio_orders.pricing_model IS 'Pricing model used: package (fixed packages) or cart (dynamic volume pricing)';
COMMENT ON COLUMN photo_studio_orders.package_type IS 'Package type: demo, starter, pro, elite, or custom (for cart orders)';

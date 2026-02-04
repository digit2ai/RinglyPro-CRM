-- Fix Schema Mismatch for Store Health AI
-- Run this in your ringlypro_crm_production database
-- This adds missing columns that the Sequelize models expect

-- 1. Rename 'zip' to 'zip_code' in stores table
ALTER TABLE stores RENAME COLUMN zip TO zip_code;

-- 2. Add 'phone' column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- 3. Add 'region_id' column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Create index for region_id
CREATE INDEX IF NOT EXISTS stores_region_id_idx ON stores(region_id);

-- 5. Update existing stores to have region_id based on their district's region
UPDATE stores s
SET region_id = d.region_id
FROM districts d
WHERE s.district_id = d.id
AND s.region_id IS NULL;

-- Verify the fix
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'stores'
ORDER BY ordinal_position;
# Deploy trigger Wed Feb  4 14:49:59 EST 2026

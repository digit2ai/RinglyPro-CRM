-- Migration: Add temp_photo_ids column to pixlypro_orders
-- Description: Stores the temp photo IDs associated with each order for proper photo-order linking
-- Date: 2025-12-11

-- Add temp_photo_ids column to store JSON array of temp photo IDs
ALTER TABLE pixlypro_orders
ADD COLUMN IF NOT EXISTS temp_photo_ids TEXT;

-- Comment explaining the column purpose
COMMENT ON COLUMN pixlypro_orders.temp_photo_ids IS 'JSON array of temp photo IDs uploaded before checkout';

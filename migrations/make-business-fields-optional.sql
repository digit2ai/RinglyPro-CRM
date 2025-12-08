-- =====================================================
-- Make business_name and business_type optional in ordergopro_clients
-- These are now collected during storefront creation instead of signup
-- =====================================================

-- Make business_name nullable
ALTER TABLE ordergopro_clients
ALTER COLUMN business_name DROP NOT NULL;

-- Make business_type nullable (already nullable but ensure it)
ALTER TABLE ordergopro_clients
ALTER COLUMN business_type DROP NOT NULL;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ business_name and business_type are now optional fields';
END $$;

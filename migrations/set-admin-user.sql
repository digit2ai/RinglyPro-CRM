-- Set admin flag for both CRM admin and Photo Studio admin
-- This allows access to their respective admin dashboards

-- CRM Admin (info@digit2ai.com) - manages RinglyPro CRM
UPDATE users
SET is_admin = true
WHERE email = 'info@digit2ai.com';

-- Photo Studio Admin (mstagg@digit2ai.com) - manages Photo Studio orders
UPDATE users
SET is_admin = true
WHERE email = 'mstagg@digit2ai.com';

-- Photo Studio Admin (pixlypro@digit2ai.com) - manages Photo Studio orders
UPDATE users
SET is_admin = true
WHERE email = 'pixlypro@digit2ai.com';

-- Verify the updates
SELECT id, email, first_name, last_name, is_admin
FROM users
WHERE email IN ('info@digit2ai.com', 'mstagg@digit2ai.com', 'pixlypro@digit2ai.com')
ORDER BY email;

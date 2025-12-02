-- Set admin flag for mstagg@digit2ai.com
-- This allows access to the admin dashboard

UPDATE users
SET is_admin = true
WHERE email = 'mstagg@digit2ai.com';

-- Verify the update
SELECT id, email, first_name, last_name, is_admin
FROM users
WHERE email = 'mstagg@digit2ai.com';

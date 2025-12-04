-- Grant admin access to pixlypro@digit2ai.com
-- Run this after the user has registered

UPDATE users
SET is_admin = true
WHERE email = 'pixlypro@digit2ai.com';

-- Verify the update
SELECT id, email, first_name, last_name, is_admin, created_at
FROM users
WHERE email = 'pixlypro@digit2ai.com';

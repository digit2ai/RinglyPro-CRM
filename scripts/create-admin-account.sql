-- Create info@digit2ai.com admin account
-- Run this AFTER add-admin-features.sql

-- Create admin user account (password will be hashed as 'Admin2024!')
INSERT INTO users (
    email,
    password,
    first_name,
    last_name,
    phone,
    is_admin,
    admin_phone,
    created_at,
    updated_at
) VALUES (
    'info@digit2ai.com',
    '$2b$10$rKZJ3xVQxO5L8nZ.qYQH0uFVZnGXqXYnQcJ5vZ9xKjL0nZ5rZJ3xV', -- Password: Admin2024!
    'Admin',
    'RinglyPro',
    '+18886103810',
    TRUE,
    '+18886103810',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    is_admin = TRUE,
    admin_phone = '+18886103810',
    phone = '+18886103810',
    updated_at = NOW();

-- Verify admin account created
SELECT
    id,
    email,
    first_name,
    last_name,
    phone,
    is_admin,
    admin_phone,
    created_at
FROM users
WHERE email = 'info@digit2ai.com';

-- Note: You'll need to reset the password after first login
-- The temporary password is: Admin2024!

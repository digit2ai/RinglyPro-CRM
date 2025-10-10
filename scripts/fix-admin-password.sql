-- Fix admin password with real bcrypt hash
-- Password: Admin2024!
-- Generated hash: $2b$10$XanildL1azhQPE9rHl6Rl.btSBYichDZsiipHz/obXLwPwCtolDpO

UPDATE users
SET password_hash = '$2b$10$XanildL1azhQPE9rHl6Rl.btSBYichDZsiipHz/obXLwPwCtolDpO',
    is_admin = TRUE,
    admin_phone = '+18886103810',
    phone_number = '+18886103810',
    terms_accepted = TRUE,
    email_verified = TRUE,
    updated_at = NOW()
WHERE email = 'info@digit2ai.com';

-- Verify the update
SELECT
    id,
    email,
    first_name,
    last_name,
    phone_number,
    is_admin,
    admin_phone,
    email_verified,
    terms_accepted,
    LENGTH(password_hash) as hash_length
FROM users
WHERE email = 'info@digit2ai.com';

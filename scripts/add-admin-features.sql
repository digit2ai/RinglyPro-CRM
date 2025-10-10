-- Add admin features to RinglyPro CRM
-- Run this in PgAdmin or psql

-- 1. Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_phone VARCHAR(20);

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- 2. Add admin message flag to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Create index for admin messages
CREATE INDEX IF NOT EXISTS idx_messages_admin ON messages(is_admin_message) WHERE is_admin_message = TRUE;

-- 3. Create admin_communications table for tracking admin interactions with clients
CREATE TABLE IF NOT EXISTS admin_communications (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER REFERENCES users(id),
    client_id INTEGER REFERENCES clients(id),
    communication_type VARCHAR(20) NOT NULL, -- 'sms', 'note', 'call'
    message TEXT,
    phone_number VARCHAR(20),
    twilio_sid VARCHAR(50),
    direction VARCHAR(10), -- 'inbound', 'outbound'
    status VARCHAR(20), -- 'sent', 'delivered', 'failed'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for admin communications
CREATE INDEX IF NOT EXISTS idx_admin_comms_admin ON admin_communications(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_comms_client ON admin_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_admin_comms_phone ON admin_communications(phone_number);
CREATE INDEX IF NOT EXISTS idx_admin_comms_created ON admin_communications(created_at DESC);

-- 4. Create admin_notes table for support annotations
CREATE TABLE IF NOT EXISTS admin_notes (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER REFERENCES users(id),
    client_id INTEGER REFERENCES clients(id),
    note TEXT NOT NULL,
    note_type VARCHAR(20) DEFAULT 'general', -- 'general', 'technical', 'billing', 'support'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for admin notes
CREATE INDEX IF NOT EXISTS idx_admin_notes_client ON admin_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_admin ON admin_notes(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_created ON admin_notes(created_at DESC);

-- 5. Add last_activity_at to clients table for "Date of Last Used"
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;

-- Update last_activity_at based on most recent activity
UPDATE clients c
SET last_activity_at = (
    SELECT MAX(activity_time) FROM (
        SELECT MAX(created_at) as activity_time FROM appointments WHERE client_id = c.id
        UNION ALL
        SELECT MAX(created_at) as activity_time FROM calls WHERE client_id = c.id
        UNION ALL
        SELECT MAX(created_at) as activity_time FROM messages WHERE client_id = c.id
    ) activities
);

-- Create index for last activity
CREATE INDEX IF NOT EXISTS idx_clients_last_activity ON clients(last_activity_at DESC);

-- Verify changes
SELECT
    'users' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('is_admin', 'admin_phone')

UNION ALL

SELECT
    'messages' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'messages' AND column_name IN ('is_admin_message', 'admin_notes')

UNION ALL

SELECT
    'clients' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'last_activity_at';

-- Show new tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('admin_communications', 'admin_notes');

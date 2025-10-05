-- Create clients table for production
-- Run this in your Render PostgreSQL database

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    business_phone VARCHAR(20) NOT NULL,
    ringlypro_number VARCHAR(20) NOT NULL UNIQUE,
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    custom_greeting TEXT,
    business_hours_start TIME,
    business_hours_end TIME,
    business_days VARCHAR(20),
    timezone VARCHAR(50),
    appointment_duration INTEGER,
    booking_enabled BOOLEAN DEFAULT false,
    sms_notifications BOOLEAN DEFAULT true,
    call_recording BOOLEAN DEFAULT false,
    credit_plan VARCHAR(50),
    monthly_free_minutes INTEGER DEFAULT 0,
    per_minute_rate NUMERIC(10,2),
    auto_reload_enabled BOOLEAN DEFAULT false,
    auto_reload_amount NUMERIC(10,2),
    auto_reload_threshold NUMERIC(10,2),
    stripe_customer_id VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id INTEGER,
    rachel_enabled BOOLEAN DEFAULT false,
    booking_url VARCHAR(255),
    forwarding_active BOOLEAN DEFAULT false,
    forwarding_carrier VARCHAR(50),
    forwarding_type VARCHAR(50),
    forwarding_activated_at TIMESTAMP WITH TIME ZONE,
    forwarding_deactivated_at TIMESTAMP WITH TIME ZONE,
    forwarding_test_number VARCHAR(20),
    twilio_number_sid VARCHAR(50),
    forwarding_status VARCHAR(20)
);

-- Insert test client for bilingual bot
INSERT INTO clients (
    business_name,
    business_phone,
    ringlypro_number,
    owner_name,
    owner_phone,
    owner_email,
    rachel_enabled,
    booking_enabled,
    active,
    timezone,
    business_hours_start,
    business_hours_end,
    business_days
) VALUES (
    'RinglyPro',
    '+18886103810',
    '+18886103810',
    'RinglyPro Admin',
    '+18886103810',
    'admin@ringlypro.com',
    true,
    true,
    true,
    'America/New_York',
    '09:00:00',
    '17:00:00',
    'mon-fri'
) ON CONFLICT (ringlypro_number) DO UPDATE
SET rachel_enabled = true, active = true, updated_at = NOW();

-- Also add the existing Digit2AI client if it doesn't exist
INSERT INTO clients (
    business_name,
    business_phone,
    ringlypro_number,
    owner_name,
    owner_phone,
    owner_email,
    rachel_enabled,
    active,
    custom_greeting
) VALUES (
    'Digit2AI',
    '+12232949184',
    '+12232949184',
    'Digit2AI Admin',
    '+12232949184',
    'admin@digit2ai.com',
    true,
    true,
    'Thank you for calling. I''m Rachel, your virtual assistant.'
) ON CONFLICT (ringlypro_number) DO UPDATE
SET rachel_enabled = true, active = true, updated_at = NOW();

SELECT 'Clients table created and test data inserted!' AS result;

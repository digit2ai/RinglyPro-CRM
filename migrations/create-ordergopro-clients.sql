-- =====================================================
-- ORDERGOPRO SAAS PLATFORM - CLIENT MANAGEMENT
-- Multi-tenant SaaS client accounts and subscriptions
-- =====================================================

-- Clients table (OrderGoPro SaaS customers)
CREATE TABLE IF NOT EXISTS ordergopro_clients (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,

    -- Business info
    business_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(50),

    -- Subscription
    subscription_plan VARCHAR(50) DEFAULT 'starter', -- starter, basic, professional, enterprise
    subscription_status VARCHAR(50) DEFAULT 'trial', -- trial, active, past_due, cancelled
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),

    -- Trial tracking
    trial_ends_at TIMESTAMP,

    -- Billing
    billing_email VARCHAR(255),
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, annual
    next_billing_date DATE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP
);

-- Add foreign key to storefront_businesses
ALTER TABLE storefront_businesses
ADD COLUMN IF NOT EXISTS ordergopro_client_id INTEGER REFERENCES ordergopro_clients(id) ON DELETE CASCADE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ordergopro_clients_email ON ordergopro_clients(email);
CREATE INDEX IF NOT EXISTS idx_ordergopro_clients_subscription ON ordergopro_clients(subscription_status);
CREATE INDEX IF NOT EXISTS idx_storefront_businesses_client ON storefront_businesses(ordergopro_client_id);

-- Comments
COMMENT ON TABLE ordergopro_clients IS 'OrderGoPro SaaS platform clients who create and manage storefronts';
COMMENT ON COLUMN ordergopro_clients.subscription_plan IS 'starter (free), basic ($29), professional ($79), enterprise ($149)';
COMMENT ON COLUMN ordergopro_clients.subscription_status IS 'trial, active, past_due, cancelled';
COMMENT ON COLUMN storefront_businesses.ordergopro_client_id IS 'Links storefront to OrderGoPro client account';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ OrderGoPro client management tables created successfully';
END $$;

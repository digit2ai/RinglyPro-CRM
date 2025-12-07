-- =====================================================
-- UPMENU-EQUIVALENT ENHANCEMENTS
-- Add ordering, modifiers, SaaS plans, and advanced features
-- =====================================================

-- =====================================================
-- ENHANCE STOREFRONT BUSINESSES TABLE
-- =====================================================

-- Add SaaS subscription fields
ALTER TABLE storefront_businesses
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free', -- free, basic, pro, premium, enterprise
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(10, 2) DEFAULT 0.00,

-- Brand extraction (AI-detected)
ADD COLUMN IF NOT EXISTS brand_tone VARCHAR(100), -- formal, warm, fun, elegant, casual
ADD COLUMN IF NOT EXISTS brand_fonts_json JSONB, -- {primary: "Montserrat", secondary: "Open Sans"}
ADD COLUMN IF NOT EXISTS brand_keywords TEXT[], -- ["artisan", "handcrafted", "organic"]

-- Storefront theme settings
ADD COLUMN IF NOT EXISTS theme_template VARCHAR(100) DEFAULT 'modern', -- modern, classic, minimal, elegant
ADD COLUMN IF NOT EXISTS theme_layout VARCHAR(50) DEFAULT 'grid', -- grid, list, masonry
ADD COLUMN IF NOT EXISTS custom_css TEXT,

-- SEO & Marketing
ADD COLUMN IF NOT EXISTS meta_title VARCHAR(500),
ADD COLUMN IF NOT EXISTS meta_description TEXT,
ADD COLUMN IF NOT EXISTS meta_keywords TEXT[],
ADD COLUMN IF NOT EXISTS og_image_url TEXT, -- Open Graph image

-- Ordering features (future)
ADD COLUMN IF NOT EXISTS ordering_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS delivery_radius_km DECIMAL(5, 2),

-- Business hours (enhanced)
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS is_open_now BOOLEAN DEFAULT true,

-- Analytics
ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12, 2) DEFAULT 0.00;

-- Create index for subscription queries
CREATE INDEX IF NOT EXISTS idx_storefront_subscription ON storefront_businesses(subscription_plan, subscription_status);

-- =====================================================
-- ITEM MODIFIERS / OPTIONS TABLE
-- For customizations like "Size", "Toppings", "Add-ons"
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_item_modifiers (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES storefront_items(id) ON DELETE CASCADE,

    -- Modifier Group
    group_name VARCHAR(255) NOT NULL, -- "Size", "Toppings", "Temperature", etc.
    group_type VARCHAR(50) DEFAULT 'single', -- single (radio), multiple (checkbox)
    is_required BOOLEAN DEFAULT false,
    min_selections INTEGER DEFAULT 0,
    max_selections INTEGER DEFAULT 1,

    -- Display
    display_order INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_modifier_item ON storefront_item_modifiers(item_id);

-- =====================================================
-- MODIFIER OPTIONS TABLE
-- Individual options within a modifier group
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_modifier_options (
    id SERIAL PRIMARY KEY,
    modifier_id INTEGER NOT NULL REFERENCES storefront_item_modifiers(id) ON DELETE CASCADE,

    -- Option Details
    name VARCHAR(255) NOT NULL, -- "Small", "Medium", "Large", "Extra Cheese"
    price_adjustment DECIMAL(10, 2) DEFAULT 0.00, -- +2.00, -1.00, etc.

    -- Display
    display_order INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_modifier_option_modifier ON storefront_modifier_options(modifier_id);

-- =====================================================
-- SAAS SUBSCRIPTION PLANS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_subscription_plans (
    id SERIAL PRIMARY KEY,

    -- Plan Details
    plan_name VARCHAR(100) NOT NULL UNIQUE, -- free, basic, pro, premium, enterprise
    display_name VARCHAR(255) NOT NULL, -- "Professional Plan"
    description TEXT,

    -- Pricing
    monthly_price DECIMAL(10, 2) NOT NULL,
    annual_price DECIMAL(10, 2), -- discounted annual rate

    -- Features (JSON array of feature slugs)
    features_json JSONB, -- ["ai_import", "photo_enhancement", "ordering", "analytics"]

    -- Limits
    max_items INTEGER, -- null = unlimited
    max_categories INTEGER,
    max_photos_per_month INTEGER,
    max_orders_per_month INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true, -- show on pricing page

    -- Display
    display_order INTEGER DEFAULT 0,
    badge_text VARCHAR(50), -- "Most Popular", "Best Value"

    -- Stripe Integration
    stripe_price_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CUSTOMER ORDERS TABLE (Future Phase 2)
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_orders (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Order Details
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_type VARCHAR(50) NOT NULL, -- pickup, delivery, dine_in
    order_status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, preparing, ready, completed, cancelled

    -- Customer Info
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    delivery_address TEXT,
    delivery_instructions TEXT,

    -- CRM Integration
    crm_contact_id INTEGER, -- links to RinglyPro contacts

    -- Items (JSON)
    items_json JSONB NOT NULL, -- [{item_id, name, price, quantity, modifiers: [...]}]

    -- Pricing
    subtotal DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0.00,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
    tip_amount DECIMAL(10, 2) DEFAULT 0.00,
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,

    -- Payment
    payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, paid, refunded
    payment_method VARCHAR(50), -- card, cash, online
    payment_intent_id VARCHAR(255), -- Stripe payment intent

    -- Fulfillment
    scheduled_for TIMESTAMP,
    estimated_ready_time TIMESTAMP,
    completed_at TIMESTAMP,

    -- Notes
    special_instructions TEXT,
    internal_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_storefront ON storefront_orders(storefront_id);
CREATE INDEX idx_order_status ON storefront_orders(order_status);
CREATE INDEX idx_order_customer ON storefront_orders(customer_email, customer_phone);
CREATE INDEX idx_order_crm_contact ON storefront_orders(crm_contact_id);

-- =====================================================
-- STOREFRONT VISITORS / CONTACTS TABLE
-- Track every visitor for CRM integration
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_visitors (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Visitor Identification
    session_id VARCHAR(255) NOT NULL,
    fingerprint_hash VARCHAR(255), -- browser fingerprint

    -- Contact Info (captured during checkout or signup)
    email VARCHAR(255),
    phone VARCHAR(50),
    name VARCHAR(255),

    -- CRM Link
    crm_contact_id INTEGER, -- auto-created contact in RinglyPro

    -- Behavior
    first_visit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_visit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_visits INTEGER DEFAULT 1,
    total_page_views INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0.00,

    -- Device Info
    user_agent TEXT,
    device_type VARCHAR(50), -- desktop, mobile, tablet
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Location
    ip_address INET,
    country_code VARCHAR(10),
    city VARCHAR(255),

    -- Marketing Attribution
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    referrer TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_visitor_storefront ON storefront_visitors(storefront_id);
CREATE INDEX idx_visitor_session ON storefront_visitors(session_id);
CREATE INDEX idx_visitor_contact ON storefront_visitors(email, phone);
CREATE INDEX idx_visitor_crm ON storefront_visitors(crm_contact_id);

-- =====================================================
-- COUPONS & PROMOTIONS TABLE (Future)
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_coupons (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Coupon Details
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Discount
    discount_type VARCHAR(50) NOT NULL, -- percentage, fixed_amount, free_delivery
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_amount DECIMAL(10, 2),

    -- Validity
    starts_at TIMESTAMP,
    expires_at TIMESTAMP,
    max_uses INTEGER, -- null = unlimited
    current_uses INTEGER DEFAULT 0,
    max_uses_per_customer INTEGER DEFAULT 1,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(storefront_id, code)
);

CREATE INDEX idx_coupon_storefront ON storefront_coupons(storefront_id);
CREATE INDEX idx_coupon_code ON storefront_coupons(code);

-- =====================================================
-- BRAND ASSETS TABLE
-- Store all brand files (logo variations, banners, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS storefront_brand_assets (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Asset Details
    asset_type VARCHAR(100) NOT NULL, -- logo, logo_white, hero_banner, category_banner, favicon
    file_url TEXT NOT NULL,
    file_name VARCHAR(500),
    file_size_bytes INTEGER,

    -- Dimensions
    width INTEGER,
    height INTEGER,

    -- Source
    source VARCHAR(100), -- scraped, uploaded, ai_generated

    -- PixlyPro Processing
    pixlypro_enhanced BOOLEAN DEFAULT false,
    original_url TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_brand_asset_storefront ON storefront_brand_assets(storefront_id);
CREATE INDEX idx_brand_asset_type ON storefront_brand_assets(asset_type);

-- =====================================================
-- UPDATE TRIGGERS FOR NEW TABLES
-- =====================================================

CREATE TRIGGER trigger_item_modifiers_updated_at
    BEFORE UPDATE ON storefront_item_modifiers
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON storefront_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

CREATE TRIGGER trigger_visitors_updated_at
    BEFORE UPDATE ON storefront_visitors
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

-- =====================================================
-- SEED DATA - SUBSCRIPTION PLANS
-- =====================================================

INSERT INTO storefront_subscription_plans (
    plan_name, display_name, description, monthly_price, annual_price,
    features_json, max_items, max_categories, display_order
) VALUES
    (
        'free',
        'Free Plan',
        'Basic online menu for getting started',
        0.00,
        0.00,
        '["basic_menu", "10_items", "manual_upload"]'::jsonb,
        10,
        3,
        1
    ),
    (
        'basic',
        'Basic Plan',
        'Perfect for small cafés and food trucks',
        29.00,
        290.00,
        '["unlimited_items", "ai_descriptions", "basic_analytics"]'::jsonb,
        NULL,
        NULL,
        2
    ),
    (
        'pro',
        'Professional Plan',
        'Full-featured storefront with AI tools',
        79.00,
        790.00,
        '["ai_website_import", "photo_enhancement", "advanced_analytics", "custom_domain", "ordering_system"]'::jsonb,
        NULL,
        NULL,
        3
    ),
    (
        'premium',
        'Premium Plan',
        'Everything + delivery management and marketing automation',
        149.00,
        1490.00,
        '["all_pro_features", "delivery_management", "marketing_automation", "crm_integration", "priority_support"]'::jsonb,
        NULL,
        NULL,
        4
    )
ON CONFLICT (plan_name) DO NOTHING;

COMMENT ON TABLE storefront_item_modifiers IS 'Modifier groups for menu items (Size, Toppings, Add-ons, etc.)';
COMMENT ON TABLE storefront_modifier_options IS 'Individual options within modifier groups';
COMMENT ON TABLE storefront_subscription_plans IS 'SaaS pricing plans for storefront businesses';
COMMENT ON TABLE storefront_orders IS 'Customer orders (pickup, delivery) - Phase 2';
COMMENT ON TABLE storefront_visitors IS 'Track visitors and auto-create CRM contacts';
COMMENT ON TABLE storefront_coupons IS 'Discount codes and promotions';
COMMENT ON TABLE storefront_brand_assets IS 'Logo, banners, and brand files';

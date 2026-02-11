-- TunjoRacing Database Schema
-- Run this SQL in your PostgreSQL database to create all required tables

-- =====================================================
-- SPONSORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_sponsors (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    phone VARCHAR(50),
    logo_url TEXT,
    sponsorship_level VARCHAR(20) NOT NULL DEFAULT 'supporting' CHECK (sponsorship_level IN ('title', 'primary', 'supporting', 'media')),
    contract_start_date DATE,
    contract_end_date DATE,
    total_investment DECIMAL(12, 2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive', 'expired')),
    notes TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_sponsors_tenant ON tunjo_sponsors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_sponsors_level ON tunjo_sponsors(sponsorship_level);
CREATE INDEX IF NOT EXISTS idx_tunjo_sponsors_status ON tunjo_sponsors(status);

-- =====================================================
-- FANS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_fans (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    country VARCHAR(100),
    city VARCHAR(100),
    membership_tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (membership_tier IN ('free', 'premium', 'vip')),
    interests JSONB DEFAULT '[]',
    engagement_score INTEGER NOT NULL DEFAULT 0,
    email_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
    sms_subscribed BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(100),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    last_email_opened_at TIMESTAMP WITH TIME ZONE,
    last_email_clicked_at TIMESTAMP WITH TIME ZONE,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_spent DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tunjo_fans_tenant ON tunjo_fans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_fans_email ON tunjo_fans(email);
CREATE INDEX IF NOT EXISTS idx_tunjo_fans_country ON tunjo_fans(country);
CREATE INDEX IF NOT EXISTS idx_tunjo_fans_tier ON tunjo_fans(membership_tier);

-- =====================================================
-- PRODUCTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_products (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    price DECIMAL(10, 2) NOT NULL,
    compare_at_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    tags JSONB DEFAULT '[]',
    images JSONB DEFAULT '[]',
    sku VARCHAR(100),
    barcode VARCHAR(100),
    inventory_quantity INTEGER NOT NULL DEFAULT 0,
    track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    allow_backorder BOOLEAN NOT NULL DEFAULT FALSE,
    weight DECIMAL(8, 2),
    dimensions JSONB,
    has_variants BOOLEAN NOT NULL DEFAULT FALSE,
    variant_options JSONB DEFAULT '[]',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
    seo_title VARCHAR(255),
    seo_description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    total_sold INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tunjo_products_tenant ON tunjo_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_products_slug ON tunjo_products(slug);
CREATE INDEX IF NOT EXISTS idx_tunjo_products_category ON tunjo_products(category);
CREATE INDEX IF NOT EXISTS idx_tunjo_products_status ON tunjo_products(status);

-- =====================================================
-- PRODUCT VARIANTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES tunjo_products(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    price DECIMAL(10, 2),
    compare_at_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    inventory_quantity INTEGER NOT NULL DEFAULT 0,
    weight DECIMAL(8, 2),
    option1_name VARCHAR(100),
    option1_value VARCHAR(100),
    option2_name VARCHAR(100),
    option2_value VARCHAR(100),
    option3_name VARCHAR(100),
    option3_value VARCHAR(100),
    image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_variants_product ON tunjo_product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_variants_tenant ON tunjo_product_variants(tenant_id);

-- =====================================================
-- CART ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_cart_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    session_id VARCHAR(255) NOT NULL,
    fan_id INTEGER REFERENCES tunjo_fans(id) ON DELETE SET NULL,
    product_id INTEGER NOT NULL REFERENCES tunjo_products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES tunjo_product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_add DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_cart_session ON tunjo_cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_cart_fan ON tunjo_cart_items(fan_id);

-- =====================================================
-- ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    fan_id INTEGER REFERENCES tunjo_fans(id) ON DELETE SET NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_first_name VARCHAR(100) NOT NULL,
    customer_last_name VARCHAR(100),
    customer_phone VARCHAR(50),
    shipping_address_line1 VARCHAR(255) NOT NULL,
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(20) NOT NULL,
    shipping_country VARCHAR(100) NOT NULL DEFAULT 'United States',
    billing_same_as_shipping BOOLEAN NOT NULL DEFAULT TRUE,
    billing_address_line1 VARCHAR(255),
    billing_city VARCHAR(100),
    billing_state VARCHAR(100),
    billing_postal_code VARCHAR(20),
    billing_country VARCHAR(100),
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_code VARCHAR(50),
    total DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    stripe_checkout_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
    fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'cancelled')),
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    customer_notes TEXT,
    internal_notes TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    confirmation_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    shipping_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_orders_tenant ON tunjo_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_orders_fan ON tunjo_orders(fan_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_orders_email ON tunjo_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_tunjo_orders_payment ON tunjo_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_tunjo_orders_fulfillment ON tunjo_orders(fulfillment_status);

-- =====================================================
-- ORDER ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES tunjo_orders(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    product_id INTEGER NOT NULL REFERENCES tunjo_products(id),
    variant_id INTEGER REFERENCES tunjo_product_variants(id),
    product_name VARCHAR(255) NOT NULL,
    variant_title VARCHAR(255),
    sku VARCHAR(100),
    image_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    fulfilled_quantity INTEGER NOT NULL DEFAULT 0,
    refunded_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_order_items_order ON tunjo_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_order_items_product ON tunjo_order_items(product_id);

-- =====================================================
-- MEDIA CONTENT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_media_content (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('social_post', 'video', 'photo', 'press_release', 'race_highlight', 'interview', 'behind_scenes')),
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'linkedin', 'website', 'press')),
    url TEXT,
    media_url TEXT,
    thumbnail_url TEXT,
    sponsor_id INTEGER REFERENCES tunjo_sponsors(id) ON DELETE SET NULL,
    sponsor_tags JSONB DEFAULT '[]',
    race_event VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    reach INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    engagement INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    video_views INTEGER NOT NULL DEFAULT 0,
    watch_time_seconds INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    estimated_media_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
    audience_countries JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_media_tenant ON tunjo_media_content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_media_sponsor ON tunjo_media_content(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_media_type ON tunjo_media_content(content_type);
CREATE INDEX IF NOT EXISTS idx_tunjo_media_platform ON tunjo_media_content(platform);

-- =====================================================
-- RACE EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_race_events (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    series VARCHAR(100),
    track_name VARCHAR(255) NOT NULL,
    track_location VARCHAR(255),
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    qualifying_position INTEGER,
    race1_position INTEGER,
    race2_position INTEGER,
    race3_position INTEGER,
    points_earned INTEGER DEFAULT 0,
    fastest_lap BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_attendance INTEGER,
    tv_viewership BIGINT,
    social_mentions INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_races_tenant ON tunjo_race_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_races_date ON tunjo_race_events(start_date);
CREATE INDEX IF NOT EXISTS idx_tunjo_races_status ON tunjo_race_events(status);

-- =====================================================
-- SPONSOR INQUIRIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_sponsor_inquiries (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(255),
    industry VARCHAR(100),
    company_size VARCHAR(50),
    interested_level VARCHAR(20) CHECK (interested_level IN ('title', 'primary', 'supporting', 'media', 'undecided')),
    budget_range VARCHAR(100),
    message TEXT,
    how_found_us VARCHAR(255),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost')),
    assigned_to VARCHAR(255),
    follow_up_date DATE,
    notes TEXT,
    converted_to_sponsor_id INTEGER REFERENCES tunjo_sponsors(id) ON DELETE SET NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_inquiries_tenant ON tunjo_sponsor_inquiries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_inquiries_email ON tunjo_sponsor_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_tunjo_inquiries_status ON tunjo_sponsor_inquiries(status);

-- =====================================================
-- SPONSORSHIP DEALS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tunjo_sponsorship_deals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    sponsor_id INTEGER REFERENCES tunjo_sponsors(id) ON DELETE SET NULL,
    deal_name VARCHAR(255) NOT NULL,
    sponsorship_level VARCHAR(20) NOT NULL CHECK (sponsorship_level IN ('title', 'primary', 'supporting', 'media')),
    number_of_races INTEGER NOT NULL DEFAULT 1,
    logo_placements JSONB DEFAULT '[]',
    content_campaigns INTEGER NOT NULL DEFAULT 0,
    social_mentions INTEGER NOT NULL DEFAULT 0,
    vip_experiences INTEGER NOT NULL DEFAULT 0,
    hospitality_passes INTEGER NOT NULL DEFAULT 0,
    estimated_exposure BIGINT NOT NULL DEFAULT 0,
    estimated_media_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
    package_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    contract_duration_months INTEGER NOT NULL DEFAULT 12,
    payment_terms VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'template' CHECK (status IN ('template', 'proposal', 'negotiation', 'accepted', 'active', 'completed', 'cancelled')),
    custom_inclusions JSONB DEFAULT '[]',
    exclusions JSONB DEFAULT '[]',
    notes TEXT,
    proposal_pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunjo_deals_tenant ON tunjo_sponsorship_deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_deals_sponsor ON tunjo_sponsorship_deals(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_tunjo_deals_status ON tunjo_sponsorship_deals(status);

-- =====================================================
-- SEED SAMPLE DATA
-- =====================================================

-- Insert sample products
INSERT INTO tunjo_products (tenant_id, name, slug, description, price, compare_at_price, category, images, inventory_quantity, status, featured) VALUES
(1, 'TunjoRacing Team Hoodie', 'team-hoodie', 'Official TunjoRacing team hoodie. Premium cotton blend with embroidered logo.', 79.99, 99.99, 'apparel', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Team+Hoodie"]', 100, 'active', true),
(1, 'Racing Cap - Black', 'racing-cap-black', 'Classic black racing cap with TunjoRacing embroidered logo.', 34.99, NULL, 'apparel', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Racing+Cap"]', 200, 'active', true),
(1, 'Pit Crew T-Shirt', 'pit-crew-tshirt', 'Comfortable pit crew style t-shirt with racing graphics.', 44.99, NULL, 'apparel', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Pit+Crew"]', 150, 'active', false),
(1, 'Signed Mini Helmet', 'signed-mini-helmet', 'Collectible mini helmet signed by the driver. Limited edition.', 149.99, NULL, 'collectibles', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Mini+Helmet"]', 25, 'active', true),
(1, 'Lanyard & Badge', 'lanyard-badge', 'Team lanyard with badge holder. Perfect for race day.', 14.99, NULL, 'accessories', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Lanyard"]', 500, 'active', false),
(1, 'Racing Gloves', 'racing-gloves', 'Professional-grade racing gloves. Fire resistant.', 89.99, 109.99, 'accessories', '["https://placehold.co/600x600/1a1a2e/ffffff?text=Racing+Gloves"]', 50, 'active', false);

-- Insert sample race events
INSERT INTO tunjo_race_events (tenant_id, name, series, track_name, country, city, start_date, end_date, status, race1_position, points_earned) VALUES
(1, 'Imola F4 Round 1', 'Italian F4', 'Autodromo Enzo e Dino Ferrari', 'Italy', 'Imola', '2024-03-15', '2024-03-17', 'completed', 3, 18),
(1, 'Spa F4 Championship', 'Euro F4', 'Circuit de Spa-Francorchamps', 'Belgium', 'Stavelot', '2024-04-05', '2024-04-07', 'completed', 5, 12),
(1, 'Monaco Historic', 'Invitation', 'Circuit de Monaco', 'Monaco', 'Monte Carlo', '2024-05-10', '2024-05-12', 'upcoming', NULL, NULL),
(1, 'Monza F4 Round', 'Italian F4', 'Autodromo Nazionale Monza', 'Italy', 'Monza', '2024-06-14', '2024-06-16', 'upcoming', NULL, NULL),
(1, 'Hockenheim Challenge', 'ADAC F4', 'Hockenheimring', 'Germany', 'Hockenheim', '2024-07-19', '2024-07-21', 'upcoming', NULL, NULL);

SELECT 'TunjoRacing schema created successfully!' AS status;
SELECT 'Products created: ' || COUNT(*) FROM tunjo_products;
SELECT 'Race events created: ' || COUNT(*) FROM tunjo_race_events;

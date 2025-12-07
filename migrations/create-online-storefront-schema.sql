-- =====================================================
-- ONLINE STOREFRONT & MENU MODULE - DATABASE SCHEMA
-- Multi-tenant SaaS storefront with AI-powered onboarding
-- =====================================================

-- =====================================================
-- STOREFRONT BUSINESSES TABLE
-- Each business gets a unique storefront
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_businesses (
    id SERIAL PRIMARY KEY,

    -- Business Identity
    business_slug VARCHAR(255) UNIQUE NOT NULL, -- URL: orders.ringlypro.com/{business_slug}
    business_name VARCHAR(500) NOT NULL,
    business_type VARCHAR(100), -- restaurant, cafe, bakery, boutique, retail, etc.

    -- Link to RinglyPro CRM
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,

    -- Original Website (for AI import)
    original_website_url TEXT,
    website_import_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    website_import_metadata JSONB, -- Store scraping results

    -- Branding (AI-detected or manually set)
    logo_url TEXT,
    primary_color VARCHAR(50), -- hex color
    secondary_color VARCHAR(50),
    accent_color VARCHAR(50),
    font_family VARCHAR(255),
    brand_style VARCHAR(100), -- modern, rustic, elegant, playful, luxury, casual

    -- Storefront Settings
    tagline TEXT,
    description TEXT,
    hero_image_url TEXT,

    -- Contact & Location
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(255),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(50),

    -- Operating Hours
    hours_of_operation JSONB, -- {monday: {open: "09:00", close: "17:00"}, ...}

    -- Social Media
    social_media JSONB, -- {facebook: "url", instagram: "url", ...}

    -- Storefront Status
    is_active BOOLEAN DEFAULT true,
    is_published BOOLEAN DEFAULT false, -- visible to public

    -- iframe Embed Settings
    embed_code TEXT, -- Auto-generated iframe snippet

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_imported_at TIMESTAMP
);

CREATE INDEX idx_storefront_slug ON storefront_businesses(business_slug);
CREATE INDEX idx_storefront_client ON storefront_businesses(client_id);
CREATE INDEX idx_storefront_active ON storefront_businesses(is_active, is_published);

-- =====================================================
-- MENU CATEGORIES TABLE
-- Organize menu items into sections
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_categories (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Category Info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL, -- for URL-friendly navigation
    description TEXT,

    -- Display
    icon_emoji VARCHAR(10), -- 🍕 🍰 ☕ 💍 👗
    banner_image_url TEXT,
    display_order INTEGER DEFAULT 0,

    -- AI-generated
    ai_generated BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_category_storefront ON storefront_categories(storefront_id);
CREATE INDEX idx_category_active ON storefront_categories(is_active);
CREATE UNIQUE INDEX idx_category_slug_unique ON storefront_categories(storefront_id, slug);

-- =====================================================
-- MENU ITEMS / PRODUCTS TABLE
-- Individual items in the catalog
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_items (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES storefront_categories(id) ON DELETE SET NULL,

    -- Item Identity
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL,

    -- Pricing
    price DECIMAL(10, 2),
    original_price DECIMAL(10, 2), -- for showing discounts
    price_type VARCHAR(50) DEFAULT 'fixed', -- fixed, from, range, custom

    -- Description
    description TEXT,
    short_description VARCHAR(500),

    -- Images (PixlyPro enhanced)
    image_url TEXT, -- Main image
    images_json JSONB, -- [{url: "...", alt: "...", is_enhanced: true}, ...]
    original_image_url TEXT, -- Before PixlyPro enhancement

    -- Metadata
    ingredients TEXT, -- for food items
    allergens TEXT[], -- array of allergens
    dietary_tags TEXT[], -- vegetarian, vegan, gluten-free, etc.

    -- Inventory (optional)
    is_available BOOLEAN DEFAULT true,
    stock_quantity INTEGER,

    -- Options/Variants
    has_variants BOOLEAN DEFAULT false,
    variants_json JSONB, -- [{name: "Size", options: ["Small", "Medium", "Large"]}, ...]

    -- Display
    is_featured BOOLEAN DEFAULT false,
    is_bestseller BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,

    -- AI-generated
    ai_generated BOOLEAN DEFAULT false,
    ai_confidence_score DECIMAL(3, 2), -- 0.00 to 1.00

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_storefront ON storefront_items(storefront_id);
CREATE INDEX idx_item_category ON storefront_items(category_id);
CREATE INDEX idx_item_active ON storefront_items(is_active);
CREATE INDEX idx_item_featured ON storefront_items(is_featured);
CREATE UNIQUE INDEX idx_item_slug_unique ON storefront_items(storefront_id, slug);

-- =====================================================
-- AI IMPORT LOGS TABLE
-- Track website scraping and AI processing
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_ai_imports (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Import Details
    import_type VARCHAR(50) NOT NULL, -- full_website, incremental, manual
    source_url TEXT NOT NULL,

    -- AI Processing
    ai_model VARCHAR(100), -- gpt-4-turbo, claude, etc.
    ai_prompt TEXT,

    -- Results
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    extracted_data JSONB, -- Raw scraped content
    processed_data JSONB, -- AI-structured output

    -- Statistics
    items_found INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    categories_created INTEGER DEFAULT 0,

    -- Error Handling
    error_message TEXT,
    error_details JSONB,

    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_import_storefront ON storefront_ai_imports(storefront_id);
CREATE INDEX idx_ai_import_status ON storefront_ai_imports(status);

-- =====================================================
-- PIXLYPRO IMAGE ENHANCEMENTS TABLE
-- Track image processing through PixlyPro
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_image_enhancements (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES storefront_items(id) ON DELETE CASCADE,

    -- Image Details
    image_type VARCHAR(50), -- product, hero, category_banner, logo
    original_url TEXT NOT NULL,
    enhanced_url TEXT,

    -- PixlyPro Processing
    pixlypro_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    pixlypro_job_id VARCHAR(255),
    enhancement_type VARCHAR(50), -- ai_enhance, upscale, background_remove, style_transfer

    -- AI Model Used
    ai_model VARCHAR(100),
    processing_time_ms INTEGER,

    -- Quality Metrics
    before_width INTEGER,
    before_height INTEGER,
    after_width INTEGER,
    after_height INTEGER,
    file_size_bytes INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_image_enhancement_storefront ON storefront_image_enhancements(storefront_id);
CREATE INDEX idx_image_enhancement_item ON storefront_image_enhancements(item_id);
CREATE INDEX idx_image_enhancement_status ON storefront_image_enhancements(pixlypro_status);

-- =====================================================
-- STOREFRONT ANALYTICS TABLE (Future)
-- Track views, clicks, orders
-- =====================================================
CREATE TABLE IF NOT EXISTS storefront_analytics (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefront_businesses(id) ON DELETE CASCADE,

    -- Event Tracking
    event_type VARCHAR(100) NOT NULL, -- page_view, item_view, add_to_cart, checkout_start
    event_data JSONB,

    -- Session Info
    session_id VARCHAR(255),
    user_agent TEXT,
    ip_address INET,
    referrer TEXT,

    -- Context
    item_id INTEGER REFERENCES storefront_items(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES storefront_categories(id) ON DELETE SET NULL,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_storefront ON storefront_analytics(storefront_id);
CREATE INDEX idx_analytics_event ON storefront_analytics(event_type);
CREATE INDEX idx_analytics_created ON storefront_analytics(created_at);

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_storefront_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_storefront_businesses_updated_at
    BEFORE UPDATE ON storefront_businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

CREATE TRIGGER trigger_storefront_categories_updated_at
    BEFORE UPDATE ON storefront_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

CREATE TRIGGER trigger_storefront_items_updated_at
    BEFORE UPDATE ON storefront_items
    FOR EACH ROW
    EXECUTE FUNCTION update_storefront_updated_at();

-- =====================================================
-- INITIAL DATA / SEED
-- =====================================================

-- No seed data - categories will be created when storefronts are created

COMMENT ON TABLE storefront_businesses IS 'Multi-tenant storefront businesses hosted at orders.ringlypro.com/{business_slug}';
COMMENT ON TABLE storefront_categories IS 'Menu categories/sections for organizing products';
COMMENT ON TABLE storefront_items IS 'Individual menu items or products in the catalog';
COMMENT ON TABLE storefront_ai_imports IS 'Logs of AI-powered website imports and data extraction';
COMMENT ON TABLE storefront_image_enhancements IS 'Track PixlyPro image processing for storefront assets';
COMMENT ON TABLE storefront_analytics IS 'Analytics and event tracking for storefront performance';

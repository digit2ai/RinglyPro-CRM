-- =====================================================
-- Photo Studio Design Briefs Table
-- Purpose: Store graphic design brief per order (1-to-1 with orders)
-- =====================================================

CREATE TABLE IF NOT EXISTS photo_studio_design_briefs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES photo_studio_orders(id) ON DELETE CASCADE,

  -- Business Information
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(100) NOT NULL CHECK (business_type IN (
    'Restaurant',
    'Bakery',
    'Café',
    'Pastry Shop',
    'Ice Cream Shop',
    'Dessert Shop',
    'Other'
  )),
  website VARCHAR(500),
  business_phone VARCHAR(50),
  location_city VARCHAR(100),
  location_country VARCHAR(100),

  -- Design Request
  primary_design_need VARCHAR(100) NOT NULL CHECK (primary_design_need IN (
    'Menu',
    'Flyer/Postcard',
    'Social Media Graphics',
    'Product/Packaging Label',
    'Other'
  )),
  design_goal TEXT NOT NULL,
  target_audience TEXT,
  usage_channels TEXT,

  -- Branding
  brand_colors TEXT,
  brand_fonts TEXT,
  style_reference_links TEXT,
  logo_present BOOLEAN DEFAULT false,
  logo_notes TEXT,

  -- Content / Copy
  copy_status VARCHAR(50) CHECK (copy_status IN (
    'client_provides_copy',
    'designer_writes_copy',
    'mixed'
  )),
  main_headline TEXT,
  key_offers_or_items TEXT,
  special_requirements TEXT,
  languages TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast order lookups
CREATE INDEX IF NOT EXISTS idx_design_briefs_order_id ON photo_studio_design_briefs(order_id);

-- Comments
COMMENT ON TABLE photo_studio_design_briefs IS 'Graphic design briefs for Photo Studio orders - food service businesses only';
COMMENT ON COLUMN photo_studio_design_briefs.business_type IS 'Type of food service business: Restaurant, Bakery, Café, etc.';
COMMENT ON COLUMN photo_studio_design_briefs.primary_design_need IS 'Main design deliverable needed';
COMMENT ON COLUMN photo_studio_design_briefs.copy_status IS 'Who provides the marketing copy: client, designer with AI, or mixed';

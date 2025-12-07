-- Lina's Treasures Database Schema
-- Migration: create-linas-treasures-schema
-- Description: Creates all tables for Lina's Treasures e-commerce platform

-- ============================================
-- 1. Product Categories
-- ============================================
CREATE TABLE IF NOT EXISTS lt_product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_category_id INTEGER REFERENCES lt_product_categories(id),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Products
-- ============================================
CREATE TABLE IF NOT EXISTS lt_products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES lt_product_categories(id),

  -- Pricing
  retail_price DECIMAL(10, 2) NOT NULL,
  wholesale_price DECIMAL(10, 2) NOT NULL,
  partner_tier_1_price DECIMAL(10, 2), -- Bronze partners (20% off wholesale)
  partner_tier_2_price DECIMAL(10, 2), -- Silver partners (30% off wholesale)
  partner_tier_3_price DECIMAL(10, 2), -- Gold partners (40% off wholesale)

  -- Inventory
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,

  -- Product details
  images JSONB, -- Array of image URLs: ["url1", "url2"]
  specifications JSONB, -- {material: "sterling silver", weight: "10g"}
  tags TEXT[], -- {earrings, handmade, wedding}

  -- SEO
  meta_title VARCHAR(255),
  meta_description TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- ============================================
-- 3. Partnerships
-- ============================================
CREATE TABLE IF NOT EXISTS lt_partnerships (
  id SERIAL PRIMARY KEY,

  -- Business Information
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(100), -- boutique, spa, gift shop, etc.
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  website VARCHAR(255),

  -- Address
  address_line_1 VARCHAR(255),
  address_line_2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',

  -- Tax Information
  tax_id VARCHAR(50), -- EIN or SSN
  resale_certificate_number VARCHAR(100),
  resale_certificate_url TEXT, -- Uploaded document

  -- Partnership Details
  tier VARCHAR(20) DEFAULT 'bronze', -- bronze, silver, gold
  discount_percentage DECIMAL(5, 2) DEFAULT 20.00,
  minimum_order_amount DECIMAL(10, 2) DEFAULT 250.00,

  -- Agreement
  agreement_signed BOOLEAN DEFAULT false,
  agreement_signed_at TIMESTAMP,
  agreement_ip_address INET,
  agreement_signature_data TEXT, -- Base64 signature image
  agreement_document_url TEXT, -- Signed PDF
  docusign_envelope_id VARCHAR(255), -- If using DocuSign

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, suspended, active
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,

  -- Linked User Account
  user_id INTEGER REFERENCES users(id), -- Created after approval

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- ============================================
-- 4. Orders
-- ============================================
CREATE TABLE IF NOT EXISTS lt_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL, -- LT-2024-00001

  -- Customer Information
  customer_type VARCHAR(20) NOT NULL, -- 'retail' or 'partner'
  partnership_id INTEGER REFERENCES lt_partnerships(id), -- NULL for retail
  user_id INTEGER REFERENCES users(id), -- NULL for guest checkout

  -- Shipping Information
  ship_to_name VARCHAR(255) NOT NULL,
  ship_to_email VARCHAR(255) NOT NULL,
  ship_to_phone VARCHAR(50),
  ship_to_address_line_1 VARCHAR(255) NOT NULL,
  ship_to_address_line_2 VARCHAR(255),
  ship_to_city VARCHAR(100) NOT NULL,
  ship_to_state VARCHAR(50) NOT NULL,
  ship_to_zip VARCHAR(20) NOT NULL,
  ship_to_country VARCHAR(100) DEFAULT 'USA',

  -- Billing Information (if different from shipping)
  billing_address_same_as_shipping BOOLEAN DEFAULT true,
  bill_to_name VARCHAR(255),
  bill_to_address_line_1 VARCHAR(255),
  bill_to_address_line_2 VARCHAR(255),
  bill_to_city VARCHAR(100),
  bill_to_state VARCHAR(50),
  bill_to_zip VARCHAR(20),
  bill_to_country VARCHAR(100),

  -- Order Totals
  subtotal DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  shipping_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,

  -- Payment
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed, refunded, partial_refund
  payment_method VARCHAR(50), -- card, wire_transfer, net_30, check
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  paid_at TIMESTAMP,

  -- Fulfillment
  fulfillment_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled
  tracking_number VARCHAR(100),
  shipping_carrier VARCHAR(100),
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. Order Items
-- ============================================
CREATE TABLE IF NOT EXISTS lt_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES lt_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES lt_products(id),

  -- Product snapshot (in case product changes later)
  sku VARCHAR(50) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_description TEXT,
  product_image_url TEXT,

  -- Pricing
  unit_price DECIMAL(10, 2) NOT NULL, -- Price at time of purchase
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total DECIMAL(10, 2) NOT NULL, -- unit_price * quantity

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. Shopping Cart
-- ============================================
CREATE TABLE IF NOT EXISTS lt_cart_items (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255), -- For guest users
  user_id INTEGER REFERENCES users(id), -- For logged-in users
  product_id INTEGER REFERENCES lt_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure each product appears only once per session/user
  CONSTRAINT unique_session_product UNIQUE(session_id, product_id),
  CONSTRAINT unique_user_product UNIQUE(user_id, product_id),

  -- Ensure either session_id or user_id is set
  CONSTRAINT check_session_or_user CHECK (
    (session_id IS NOT NULL AND user_id IS NULL) OR
    (session_id IS NULL AND user_id IS NOT NULL)
  )
);

-- ============================================
-- 7. Product Reviews (Optional - Future)
-- ============================================
CREATE TABLE IF NOT EXISTS lt_product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES lt_products(id) ON DELETE CASCADE,
  partnership_id INTEGER REFERENCES lt_partnerships(id),
  user_id INTEGER REFERENCES users(id),

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  review_text TEXT,

  is_verified_purchase BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. Inventory History (Track stock changes)
-- ============================================
CREATE TABLE IF NOT EXISTS lt_inventory_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES lt_products(id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL, -- sale, restock, adjustment, return
  quantity_change INTEGER NOT NULL, -- Positive or negative
  quantity_after INTEGER NOT NULL,
  order_id INTEGER REFERENCES lt_orders(id),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Products
CREATE INDEX idx_lt_products_category ON lt_products(category_id);
CREATE INDEX idx_lt_products_active ON lt_products(is_active);
CREATE INDEX idx_lt_products_featured ON lt_products(is_featured);
CREATE INDEX idx_lt_products_sku ON lt_products(sku);

-- Partnerships
CREATE INDEX idx_lt_partnerships_status ON lt_partnerships(status);
CREATE INDEX idx_lt_partnerships_email ON lt_partnerships(email);
CREATE INDEX idx_lt_partnerships_user_id ON lt_partnerships(user_id);

-- Orders
CREATE INDEX idx_lt_orders_order_number ON lt_orders(order_number);
CREATE INDEX idx_lt_orders_customer_type ON lt_orders(customer_type);
CREATE INDEX idx_lt_orders_partnership_id ON lt_orders(partnership_id);
CREATE INDEX idx_lt_orders_payment_status ON lt_orders(payment_status);
CREATE INDEX idx_lt_orders_fulfillment_status ON lt_orders(fulfillment_status);
CREATE INDEX idx_lt_orders_created_at ON lt_orders(created_at DESC);

-- Order Items
CREATE INDEX idx_lt_order_items_order_id ON lt_order_items(order_id);
CREATE INDEX idx_lt_order_items_product_id ON lt_order_items(product_id);

-- Cart
CREATE INDEX idx_lt_cart_session_id ON lt_cart_items(session_id);
CREATE INDEX idx_lt_cart_user_id ON lt_cart_items(user_id);
CREATE INDEX idx_lt_cart_product_id ON lt_cart_items(product_id);

-- Reviews
CREATE INDEX idx_lt_reviews_product_id ON lt_product_reviews(product_id);
CREATE INDEX idx_lt_reviews_approved ON lt_product_reviews(is_approved);

-- ============================================
-- Triggers for Updated Timestamps
-- ============================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_lt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trigger_lt_products_updated_at
  BEFORE UPDATE ON lt_products
  FOR EACH ROW
  EXECUTE FUNCTION update_lt_updated_at();

CREATE TRIGGER trigger_lt_partnerships_updated_at
  BEFORE UPDATE ON lt_partnerships
  FOR EACH ROW
  EXECUTE FUNCTION update_lt_updated_at();

CREATE TRIGGER trigger_lt_orders_updated_at
  BEFORE UPDATE ON lt_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_lt_updated_at();

CREATE TRIGGER trigger_lt_cart_items_updated_at
  BEFORE UPDATE ON lt_cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_lt_updated_at();

-- ============================================
-- Seed Data: Categories
-- ============================================

INSERT INTO lt_product_categories (name, slug, description, display_order) VALUES
('Necklaces', 'necklaces', 'Beautiful handcrafted necklaces', 1),
('Earrings', 'earrings', 'Elegant earrings for every occasion', 2),
('Bracelets', 'bracelets', 'Stylish bracelets and bangles', 3),
('Rings', 'rings', 'Stunning rings and bands', 4),
('Accessories', 'accessories', 'Hair accessories, brooches, and more', 5),
('Gift Sets', 'gift-sets', 'Curated jewelry gift sets', 6),
('Bridal Collection', 'bridal', 'Special pieces for brides and weddings', 7),
('Seasonal', 'seasonal', 'Holiday and seasonal collections', 8)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Complete!
-- ============================================

COMMENT ON TABLE lt_products IS 'Lina''s Treasures product catalog';
COMMENT ON TABLE lt_partnerships IS 'B2B partnership applications and agreements';
COMMENT ON TABLE lt_orders IS 'Customer and partner orders';
COMMENT ON TABLE lt_order_items IS 'Line items for each order';
COMMENT ON TABLE lt_cart_items IS 'Shopping cart for guests and logged-in users';

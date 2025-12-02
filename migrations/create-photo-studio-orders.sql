-- =====================================================
-- Photo Studio Orders Table
-- Purpose: Track Photo Studio package orders separately from token system
-- =====================================================

CREATE TABLE IF NOT EXISTS photo_studio_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Order Details
  package_type VARCHAR(50) NOT NULL CHECK (package_type IN ('demo', 'starter', 'pro', 'elite')),
  price DECIMAL(10,2) NOT NULL,

  -- Photo Counts
  photos_to_upload INTEGER NOT NULL,
  photos_to_receive INTEGER NOT NULL,
  photos_uploaded INTEGER DEFAULT 0,

  -- Payment Info
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),

  -- Order Status
  order_status VARCHAR(50) DEFAULT 'awaiting_upload' CHECK (order_status IN ('awaiting_upload', 'processing', 'completed', 'cancelled')),

  -- Timestamps
  order_date TIMESTAMP DEFAULT NOW(),
  payment_date TIMESTAMP,
  upload_completed_date TIMESTAMP,
  delivery_date TIMESTAMP,

  -- Additional Info
  customer_notes TEXT,
  admin_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_photo_studio_orders_user_id ON photo_studio_orders(user_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_photo_studio_orders_status ON photo_studio_orders(order_status);

-- Index for Stripe session lookups
CREATE INDEX IF NOT EXISTS idx_photo_studio_orders_stripe_session ON photo_studio_orders(stripe_session_id);

-- Comments
COMMENT ON TABLE photo_studio_orders IS 'Photo Studio package orders - independent from token system';
COMMENT ON COLUMN photo_studio_orders.photos_to_upload IS 'Number of photos customer should upload';
COMMENT ON COLUMN photo_studio_orders.photos_to_receive IS 'Total number of photos customer will receive (includes variations)';
COMMENT ON COLUMN photo_studio_orders.photos_uploaded IS 'Number of photos customer has uploaded so far';

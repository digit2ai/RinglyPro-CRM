-- =====================================================
-- PixlyPro Database Schema
-- AI-Assisted Photo Enhancement Service
-- =====================================================

-- PixlyPro Orders Table
CREATE TABLE IF NOT EXISTS pixlypro_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Order Details
  package_type VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  photo_count INTEGER NOT NULL,

  -- Order Status
  order_status VARCHAR(50) DEFAULT 'awaiting_upload' CHECK (
    order_status IN (
      'awaiting_upload',
      'processing',
      'ai_enhanced',
      'designer_review',
      'completed',
      'cancelled'
    )
  ),

  -- Payment
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'pending',
  paid_at TIMESTAMP,

  -- Timestamps
  order_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Original Photos Uploaded by Customer
CREATE TABLE IF NOT EXISTS pixlypro_photo_uploads (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pixlypro_orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File Details
  original_filename VARCHAR(500) NOT NULL,
  storage_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),

  -- Photo Metadata
  width INTEGER,
  height INTEGER,

  -- Status
  upload_status VARCHAR(50) DEFAULT 'uploaded',

  -- Timestamps
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- AI-Enhanced Photos (Pixelixe Generated)
CREATE TABLE IF NOT EXISTS pixlypro_ai_enhanced (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pixlypro_orders(id) ON DELETE CASCADE,
  original_photo_id INTEGER NOT NULL REFERENCES pixlypro_photo_uploads(id) ON DELETE CASCADE,

  -- AI Enhancement Details
  ai_enhanced_url TEXT NOT NULL,
  pixelixe_image_id VARCHAR(255),
  enhancement_type VARCHAR(50) DEFAULT 'auto', -- auto, filter, custom
  enhancement_settings JSONB,

  -- Processing Status
  status VARCHAR(50) DEFAULT 'processing' CHECK (
    status IN (
      'processing',
      'completed',
      'failed',
      'pending_review',
      'approved',
      'rejected'
    )
  ),

  -- Designer Review
  designer_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Final Enhanced Photos (Designer-Approved or Modified)
CREATE TABLE IF NOT EXISTS pixlypro_final_enhanced (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pixlypro_orders(id) ON DELETE CASCADE,
  original_photo_id INTEGER NOT NULL REFERENCES pixlypro_photo_uploads(id) ON DELETE CASCADE,
  ai_enhanced_id INTEGER REFERENCES pixlypro_ai_enhanced(id) ON DELETE SET NULL,

  -- File Details
  filename VARCHAR(500) NOT NULL,
  storage_url TEXT NOT NULL,
  file_size BIGINT,

  -- Source
  source VARCHAR(50) DEFAULT 'ai_approved' CHECK (
    source IN ('ai_approved', 'ai_modified', 'manual')
  ),

  -- Customer Approval
  approval_status VARCHAR(50) DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'revision_requested')
  ),
  customer_feedback TEXT,

  -- Timestamps
  uploaded_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP
);

-- Communications (Messages between customer and team)
CREATE TABLE IF NOT EXISTS pixlypro_communications (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pixlypro_orders(id) ON DELETE CASCADE,

  -- Communication Details
  from_type VARCHAR(20) NOT NULL CHECK (from_type IN ('customer', 'admin', 'system')),
  to_type VARCHAR(20) NOT NULL CHECK (to_type IN ('customer', 'admin')),
  subject VARCHAR(255),
  message TEXT NOT NULL,

  -- Related Photo (optional)
  related_photo_id INTEGER REFERENCES pixlypro_final_enhanced(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'responded')),
  read_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Indexes for Performance
CREATE INDEX idx_pixlypro_orders_user ON pixlypro_orders(user_id);
CREATE INDEX idx_pixlypro_orders_status ON pixlypro_orders(order_status);
CREATE INDEX idx_pixlypro_photo_uploads_order ON pixlypro_photo_uploads(order_id);
CREATE INDEX idx_pixlypro_ai_enhanced_order ON pixlypro_ai_enhanced(order_id);
CREATE INDEX idx_pixlypro_ai_enhanced_original ON pixlypro_ai_enhanced(original_photo_id);
CREATE INDEX idx_pixlypro_ai_enhanced_status ON pixlypro_ai_enhanced(status);
CREATE INDEX idx_pixlypro_final_enhanced_order ON pixlypro_final_enhanced(order_id);
CREATE INDEX idx_pixlypro_final_enhanced_original ON pixlypro_final_enhanced(original_photo_id);
CREATE INDEX idx_pixlypro_communications_order ON pixlypro_communications(order_id);

-- Add Comments for Documentation
COMMENT ON TABLE pixlypro_orders IS 'Main orders table for PixlyPro AI-assisted photo enhancement service';
COMMENT ON TABLE pixlypro_ai_enhanced IS 'AI-enhanced photos generated by Pixelixe API for designer review';
COMMENT ON TABLE pixlypro_final_enhanced IS 'Final enhanced photos delivered to customers (AI-approved or manually edited)';
COMMENT ON COLUMN pixlypro_orders.order_status IS 'awaiting_upload: Paid, waiting for photos | processing: Photos uploaded, AI enhancing | ai_enhanced: AI done, needs designer review | designer_review: Designer reviewing | completed: Delivered to customer';
COMMENT ON COLUMN pixlypro_ai_enhanced.source IS 'ai_approved: Used AI version as-is | ai_modified: Designer tweaked AI version | manual: Designer created from scratch';

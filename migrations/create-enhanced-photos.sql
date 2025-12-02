-- =====================================================
-- Enhanced Photos Table
-- Purpose: Track enhanced photos delivered to customers
-- =====================================================

CREATE TABLE IF NOT EXISTS enhanced_photos (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES photo_studio_orders(id) ON DELETE CASCADE,
  original_photo_id INTEGER REFERENCES photo_uploads(id) ON DELETE SET NULL,

  -- File Details
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,

  -- Storage Info
  storage_provider VARCHAR(50) DEFAULT 's3',
  storage_bucket VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  storage_url TEXT NOT NULL,

  -- Image Metadata
  image_width INTEGER,
  image_height INTEGER,
  image_format VARCHAR(50),

  -- Upload Info
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW(),

  -- Status
  delivery_status VARCHAR(50) DEFAULT 'ready' CHECK (delivery_status IN ('ready', 'downloaded', 'archived')),
  downloaded_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast order lookups
CREATE INDEX IF NOT EXISTS idx_enhanced_photos_order_id ON enhanced_photos(order_id);

-- Index for original photo tracking
CREATE INDEX IF NOT EXISTS idx_enhanced_photos_original_id ON enhanced_photos(original_photo_id);

-- Comments
COMMENT ON TABLE enhanced_photos IS 'Enhanced photos delivered to customers';
COMMENT ON COLUMN enhanced_photos.original_photo_id IS 'Link to original uploaded photo (if applicable)';
COMMENT ON COLUMN enhanced_photos.uploaded_by IS 'Admin user who uploaded the enhanced photo';

-- =====================================================
-- Photo Uploads Table
-- Purpose: Store uploaded photos for Photo Studio and future services
-- Design: Extensible to support multiple service types
-- =====================================================

CREATE TABLE IF NOT EXISTS photo_uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Service Association (extensible for future services)
  service_type VARCHAR(50) NOT NULL DEFAULT 'photo_studio' CHECK (service_type IN ('photo_studio', 'video_studio', 'content_creation', 'other')),
  service_order_id INTEGER NOT NULL, -- References photo_studio_orders.id or future service tables

  -- File Information
  original_filename VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL, -- in bytes
  mime_type VARCHAR(100) NOT NULL,
  file_extension VARCHAR(10) NOT NULL,

  -- Cloud Storage Info
  storage_provider VARCHAR(50) DEFAULT 's3', -- 's3', 'gcs', 'azure', etc.
  storage_bucket VARCHAR(255),
  storage_key VARCHAR(500) NOT NULL, -- Full path in cloud storage
  storage_url TEXT, -- Pre-signed URL or CDN URL

  -- Image Metadata (for photos)
  image_width INTEGER,
  image_height INTEGER,
  image_format VARCHAR(20), -- 'jpeg', 'png', 'heic', etc.

  -- Processing Status
  upload_status VARCHAR(50) DEFAULT 'uploading' CHECK (upload_status IN ('uploading', 'uploaded', 'processing', 'completed', 'failed')),
  processing_status VARCHAR(50) CHECK (processing_status IN ('pending', 'in_progress', 'completed', 'failed')),

  -- Delivery Tracking
  is_processed BOOLEAN DEFAULT FALSE,
  processed_files JSONB, -- Array of processed file URLs/keys

  -- Device & Upload Info
  upload_device VARCHAR(50), -- 'browser', 'ios', 'android'
  upload_ip VARCHAR(45),
  user_agent TEXT,

  -- Timestamps
  uploaded_at TIMESTAMP DEFAULT NOW(),
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,

  -- Notes
  upload_notes TEXT,
  processing_notes TEXT,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Fast lookups by user
CREATE INDEX IF NOT EXISTS idx_photo_uploads_user_id ON photo_uploads(user_id);

-- Fast lookups by service and order
CREATE INDEX IF NOT EXISTS idx_photo_uploads_service ON photo_uploads(service_type, service_order_id);

-- Status queries for processing pipeline
CREATE INDEX IF NOT EXISTS idx_photo_uploads_status ON photo_uploads(upload_status, processing_status);

-- Storage key lookups
CREATE INDEX IF NOT EXISTS idx_photo_uploads_storage_key ON photo_uploads(storage_key);

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_photo_uploads_uploaded_at ON photo_uploads(uploaded_at);

-- =====================================================
-- Photo Studio Orders - Add Upload Tracking
-- =====================================================

-- Add column to track upload URLs in photo_studio_orders table
ALTER TABLE photo_studio_orders
ADD COLUMN IF NOT EXISTS upload_urls JSONB DEFAULT '[]'::jsonb;

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_photo_studio_orders_upload_urls ON photo_studio_orders USING gin(upload_urls);

-- =====================================================
-- Comments for Documentation
-- =====================================================

COMMENT ON TABLE photo_uploads IS 'Universal photo upload table for Photo Studio and future services';
COMMENT ON COLUMN photo_uploads.service_type IS 'Type of service: photo_studio, video_studio, content_creation, etc.';
COMMENT ON COLUMN photo_uploads.service_order_id IS 'References the order ID in the respective service table';
COMMENT ON COLUMN photo_uploads.storage_key IS 'Full path/key in cloud storage (e.g., uploads/photo_studio/user_123/order_456/image.jpg)';
COMMENT ON COLUMN photo_uploads.processed_files IS 'JSON array of processed/enhanced file information';
COMMENT ON COLUMN photo_uploads.upload_device IS 'Device type used for upload: browser, ios, android';

-- =====================================================
-- Trigger to Update updated_at Timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_photo_uploads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_photo_uploads_timestamp
BEFORE UPDATE ON photo_uploads
FOR EACH ROW
EXECUTE FUNCTION update_photo_uploads_timestamp();

-- =====================================================
-- View: Photo Studio Upload Summary
-- =====================================================

CREATE OR REPLACE VIEW photo_studio_upload_summary AS
SELECT
  o.id AS order_id,
  o.user_id,
  u.email,
  o.package_type,
  o.photos_to_upload,
  o.photos_uploaded,
  COUNT(p.id) AS total_uploads,
  COUNT(CASE WHEN p.upload_status = 'completed' THEN 1 END) AS completed_uploads,
  COUNT(CASE WHEN p.processing_status = 'completed' THEN 1 END) AS processed_uploads,
  o.order_status,
  o.order_date
FROM photo_studio_orders o
LEFT JOIN photo_uploads p ON p.service_order_id = o.id AND p.service_type = 'photo_studio'
LEFT JOIN users u ON o.user_id = u.id
GROUP BY o.id, o.user_id, u.email, o.package_type, o.photos_to_upload, o.photos_uploaded, o.order_status, o.order_date;

COMMENT ON VIEW photo_studio_upload_summary IS 'Summary view of Photo Studio orders with upload progress';

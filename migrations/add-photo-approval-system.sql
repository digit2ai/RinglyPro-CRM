-- =====================================================
-- Photo Approval System Migration
-- Purpose: Track customer approval/rejection of enhanced photos and communications
-- =====================================================

-- Add approval fields to enhanced_photos table
ALTER TABLE enhanced_photos
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revision_requested')),
ADD COLUMN IF NOT EXISTS customer_feedback TEXT,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Create photo_communications table for tracking all interactions
CREATE TABLE IF NOT EXISTS photo_communications (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES photo_studio_orders(id) ON DELETE CASCADE,
  enhanced_photo_id INTEGER REFERENCES enhanced_photos(id) ON DELETE SET NULL,

  -- Communication Details
  from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  from_type VARCHAR(20) NOT NULL CHECK (from_type IN ('customer', 'admin')),
  to_type VARCHAR(20) NOT NULL CHECK (to_type IN ('customer', 'admin')),

  -- Message Content
  subject VARCHAR(255),
  message TEXT NOT NULL,
  communication_type VARCHAR(50) NOT NULL CHECK (communication_type IN ('feedback', 'revision_request', 'approval', 'rejection', 'general')),

  -- Status Tracking
  status VARCHAR(50) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'responded', 'resolved')),
  read_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_enhanced_photos_approval ON enhanced_photos(approval_status);
CREATE INDEX IF NOT EXISTS idx_photo_communications_order ON photo_communications(order_id);
CREATE INDEX IF NOT EXISTS idx_photo_communications_status ON photo_communications(status, from_type);
CREATE INDEX IF NOT EXISTS idx_photo_communications_created ON photo_communications(created_at DESC);

-- Add comment
COMMENT ON TABLE photo_communications IS 'Tracks all communications between customers and admin for photo studio orders';
COMMENT ON COLUMN enhanced_photos.approval_status IS 'Customer approval status: pending, approved, rejected, revision_requested';
COMMENT ON COLUMN photo_communications.communication_type IS 'Type of communication: feedback, revision_request, approval, rejection, general';

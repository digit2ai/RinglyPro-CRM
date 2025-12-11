-- Migration: Create PixlyPro tables
-- Description: Creates orders and photos tables for PixlyPro AI photo enhancement service
-- Date: 2025-12-11

-- Create pixlypro_orders table
CREATE TABLE IF NOT EXISTS pixlypro_orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    package_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    total_amount DECIMAL(10, 2) NOT NULL,
    photo_count INTEGER NOT NULL,
    order_status VARCHAR(50) NOT NULL DEFAULT 'awaiting_upload',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    stripe_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_pixlypro_orders_user_id ON pixlypro_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pixlypro_orders_created_at ON pixlypro_orders(created_at DESC);

-- Create pixlypro_photos table
CREATE TABLE IF NOT EXISTS pixlypro_photos (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    original_url TEXT NOT NULL,
    enhanced_url TEXT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES pixlypro_orders(id) ON DELETE CASCADE
);

-- Create index on order_id for faster queries
CREATE INDEX IF NOT EXISTS idx_pixlypro_photos_order_id ON pixlypro_photos(order_id);

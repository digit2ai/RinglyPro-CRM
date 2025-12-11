const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Creating PixlyPro tables...');
    
    await client.query(`
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
    `);
    console.log('✅ pixlypro_orders table created');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pixlypro_orders_user_id ON pixlypro_orders(user_id);
    `);
    console.log('✅ Index idx_pixlypro_orders_user_id created');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pixlypro_orders_created_at ON pixlypro_orders(created_at DESC);
    `);
    console.log('✅ Index idx_pixlypro_orders_created_at created');
    
    await client.query(`
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
    `);
    console.log('✅ pixlypro_photos table created');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pixlypro_photos_order_id ON pixlypro_photos(order_id);
    `);
    console.log('✅ Index idx_pixlypro_photos_order_id created');

    // Add temp_photo_ids column if it doesn't exist
    await client.query(`
      ALTER TABLE pixlypro_orders
      ADD COLUMN IF NOT EXISTS temp_photo_ids TEXT;
    `);
    console.log('✅ temp_photo_ids column added to pixlypro_orders');

    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

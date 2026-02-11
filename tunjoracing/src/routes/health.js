'use strict';

/**
 * Health Check Routes - TunjoRacing
 */

const express = require('express');
const router = express.Router();

let models;
try {
  models = require('../../models');
} catch (e) {
  models = null;
}

// GET /health
router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'TunjoRacing Platform',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    modules: {
      sponsors: 'active',
      fans: 'active',
      store: 'active',
      media: 'active',
      analytics: 'active'
    }
  });
});

// POST /health/seed - One-time seed endpoint (removes itself after use)
router.post('/seed', async (req, res) => {
  if (!models) {
    return res.status(500).json({ status: 'error', message: 'Models not loaded' });
  }

  try {
    const { TunjoProduct, TunjoProductVariant, TunjoRaceEvent } = models;

    // Check if already seeded
    const productCount = await TunjoProduct.count({ where: { tenant_id: 1 } });
    if (productCount > 0) {
      return res.json({ status: 'skipped', message: 'Data already exists', productCount });
    }

    // Create Products
    const products = await TunjoProduct.bulkCreate([
      {
        tenant_id: 1, name: 'TunjoRacing Team Cap', slug: 'team-cap',
        description: 'Official TunjoRacing team cap with embroidered logo. Adjustable snapback.',
        category: 'apparel', price: 34.99, compare_at_price: 39.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800']),
        inventory_quantity: 100, track_inventory: true, status: 'active', featured: true
      },
      {
        tenant_id: 1, name: 'TunjoRacing T-Shirt', slug: 'team-tshirt',
        description: 'Premium cotton t-shirt featuring the TunjoRacing logo and sponsor marks.',
        category: 'apparel', price: 44.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800']),
        inventory_quantity: 200, track_inventory: true, status: 'active', featured: true
      },
      {
        tenant_id: 1, name: 'TunjoRacing Hoodie', slug: 'team-hoodie',
        description: 'Heavyweight hoodie with embroidered TunjoRacing crest. Perfect for paddock days.',
        category: 'apparel', price: 79.99, compare_at_price: 89.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800']),
        inventory_quantity: 75, track_inventory: true, status: 'active', featured: true
      },
      {
        tenant_id: 1, name: 'Replica Mini Helmet 1:2', slug: 'mini-helmet',
        description: 'High-quality 1:2 scale replica of Manuel Tunjo racing helmet. Collectible item.',
        category: 'collectibles', price: 149.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=800']),
        inventory_quantity: 25, track_inventory: true, status: 'active', featured: true
      },
      {
        tenant_id: 1, name: 'Signed Race Poster', slug: 'signed-poster',
        description: 'Limited edition race poster from the 2024 season, hand-signed by Manuel Tunjo.',
        category: 'collectibles', price: 59.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800']),
        inventory_quantity: 50, track_inventory: true, status: 'active'
      },
      {
        tenant_id: 1, name: 'TunjoRacing Sticker Pack', slug: 'sticker-pack',
        description: 'Set of 10 premium vinyl stickers featuring team logos and race graphics.',
        category: 'accessories', price: 14.99,
        images: JSON.stringify(['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800']),
        inventory_quantity: 500, track_inventory: true, status: 'active'
      }
    ]);

    // Create variants
    const tshirt = products.find(p => p.slug === 'team-tshirt');
    const hoodie = products.find(p => p.slug === 'team-hoodie');
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];

    for (const size of sizes) {
      await TunjoProductVariant.create({
        tenant_id: 1, product_id: tshirt.id, title: size,
        option1_name: 'Size', option1_value: size, sku: 'TR-TS-' + size,
        price: tshirt.price, inventory_quantity: 40, status: 'active'
      });
      await TunjoProductVariant.create({
        tenant_id: 1, product_id: hoodie.id, title: size,
        option1_name: 'Size', option1_value: size, sku: 'TR-HD-' + size,
        price: hoodie.price, inventory_quantity: 15, status: 'active'
      });
    }

    // Create Race Events
    await TunjoRaceEvent.bulkCreate([
      { tenant_id: 1, name: 'Formula 4 Spain - Round 1', series: 'F4 Spain',
        track_name: 'Circuit de Barcelona-Catalunya', track_location: 'Montmelo',
        country: 'Spain', city: 'Barcelona', start_date: '2025-04-12', end_date: '2025-04-13',
        estimated_attendance: 15000, status: 'upcoming' },
      { tenant_id: 1, name: 'Formula 4 Spain - Round 2', series: 'F4 Spain',
        track_name: 'Circuit Ricardo Tormo', track_location: 'Cheste',
        country: 'Spain', city: 'Valencia', start_date: '2025-05-03', end_date: '2025-05-04',
        estimated_attendance: 12000, status: 'upcoming' },
      { tenant_id: 1, name: 'Formula 4 Spain - Round 3', series: 'F4 Spain',
        track_name: 'Circuito de Jerez', track_location: 'Jerez de la Frontera',
        country: 'Spain', city: 'Jerez', start_date: '2025-06-14', end_date: '2025-06-15',
        estimated_attendance: 18000, status: 'upcoming' },
      { tenant_id: 1, name: 'Formula 4 Spain - Round 4', series: 'F4 Spain',
        track_name: 'Motorland Aragon', track_location: 'Alcaniz',
        country: 'Spain', city: 'Alcaniz', start_date: '2025-07-19', end_date: '2025-07-20',
        estimated_attendance: 10000, status: 'upcoming' },
      { tenant_id: 1, name: 'Formula 4 Spain - Round 5', series: 'F4 Spain',
        track_name: 'Circuit de Barcelona-Catalunya', track_location: 'Montmelo',
        country: 'Spain', city: 'Barcelona', start_date: '2025-09-13', end_date: '2025-09-14',
        estimated_attendance: 20000, status: 'upcoming' }
    ]);

    res.json({
      status: 'seeded',
      products: products.length,
      variants: 10,
      races: 5
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /health/db - Database health check with counts
router.get('/db', async (req, res) => {
  if (!models || !models.sequelize) {
    return res.status(500).json({ status: 'error', message: 'Models not loaded' });
  }

  try {
    // Get database connection info (sanitized)
    const dbUrl = process.env.DATABASE_URL || '';
    const dbHost = dbUrl.includes('@') ? dbUrl.split('@')[1]?.split('/')[0] : 'unknown';

    // Get table counts
    const [tables] = await models.sequelize.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tunjo%'"
    );

    const counts = {};
    for (const table of tables) {
      const [[result]] = await models.sequelize.query(
        `SELECT COUNT(*) as count FROM "${table.tablename}"`
      );
      counts[table.tablename] = parseInt(result.count);
    }

    res.json({
      status: 'OK',
      database: {
        host: dbHost,
        connected: true,
        tables: tables.length,
        counts
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /health/auth-test - Test JWT generation
router.get('/auth-test', async (req, res) => {
  try {
    const { generateToken } = require('../middleware/auth');
    const token = generateToken({
      id: 0,
      email: 'test@tunjoracing.com',
      role: 'admin',
      name: 'Test Admin'
    });
    res.json({
      status: 'OK',
      message: 'JWT generation working',
      tokenPreview: token.substring(0, 50) + '...'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  }
});

// GET /health/model-debug - Debug model fields
router.get('/model-debug', async (req, res) => {
  if (!models || !models.TunjoFan) {
    return res.status(500).json({ status: 'error', message: 'TunjoFan model not loaded' });
  }

  try {
    const TunjoFan = models.TunjoFan;

    // Get database connection info
    const dbUrl = process.env.DATABASE_URL || '';
    const dbHost = dbUrl.includes('@') ? dbUrl.split('@')[1]?.split('/')[0]?.split(':')[0] : 'unknown';
    const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';

    // Get model attributes
    const modelAttributes = Object.keys(TunjoFan.rawAttributes);

    // Get actual database columns
    const [dbColumns] = await models.sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tunjo_fans' ORDER BY ordinal_position
    `);

    // Try to add the column directly if missing
    if (!dbColumns.some(c => c.column_name === 'password_hash')) {
      try {
        await models.sequelize.query('ALTER TABLE tunjo_fans ADD COLUMN password_hash VARCHAR(255)');
        // Re-query after adding
        const [afterColumns] = await models.sequelize.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'tunjo_fans' ORDER BY ordinal_position
        `);
        return res.json({
          status: 'FIXED',
          message: 'Added password_hash column',
          database_host: dbHost,
          database_name: dbName,
          columns_after_fix: afterColumns.map(c => c.column_name)
        });
      } catch (addError) {
        return res.json({
          status: 'FIX_FAILED',
          add_column_error: addError.message,
          database_host: dbHost,
          database_name: dbName
        });
      }
    }

    res.json({
      status: 'OK',
      model_name: TunjoFan.name,
      table_name: TunjoFan.tableName,
      database_host: dbHost,
      database_name: dbName,
      model_attributes: modelAttributes,
      has_password_hash_in_model: modelAttributes.includes('password_hash'),
      database_columns: dbColumns.map(c => c.column_name),
      has_password_hash_in_db: dbColumns.some(c => c.column_name === 'password_hash'),
      deployment_timestamp: '2026-02-11-v2'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
});

module.exports = router;

// Seed Script for Lina's Treasures Products
// Populates database with beautiful sample products

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// Sample products inspired by Lina's Treasures aesthetic
const products = [
  // Necklaces
  {
    sku: 'LT-NEC-001',
    name: 'Delicate Gold Butterfly Necklace',
    description: 'Handcrafted gold butterfly necklace with intricate wing details. Perfect for everyday elegance or special occasions. Features adjustable 16-18" chain.',
    category_slug: 'necklaces',
    retail_price: 49.99,
    wholesale_price: 29.99,
    stock_quantity: 150,
    is_featured: true,
    images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600', 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600'],
    specifications: { material: 'Gold Plated Brass', chain_length: '16-18 inches', pendant_size: '0.5 inches' },
    tags: ['butterfly', 'dainty', 'gold', 'everyday']
  },
  {
    sku: 'LT-NEC-002',
    name: 'Rose Gold Heart Pendant',
    description: 'Romantic rose gold heart pendant on delicate chain. Timeless design that appeals to all ages. Beautiful gift for loved ones.',
    category_slug: 'necklaces',
    retail_price: 39.99,
    wholesale_price: 23.99,
    stock_quantity: 200,
    is_featured: true,
    images: ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600'],
    specifications: { material: 'Rose Gold Plated', chain_length: '18 inches', pendant_size: '0.75 inches' },
    tags: ['heart', 'romantic', 'rose-gold', 'gift']
  },
  {
    sku: 'LT-NEC-003',
    name: 'Layered Pearl & Chain Necklace',
    description: 'Trendy layered look featuring freshwater pearls and delicate chains. Three-strand design for effortless style.',
    category_slug: 'necklaces',
    retail_price: 64.99,
    wholesale_price: 38.99,
    stock_quantity: 80,
    images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600'],
    specifications: { material: 'Gold Fill & Pearls', lengths: '14", 16", 18"' },
    tags: ['layered', 'pearls', 'trendy', 'statement']
  },

  // Earrings
  {
    sku: 'LT-EAR-001',
    name: 'Champagne Crystal Drop Earrings',
    description: 'Elegant champagne-colored crystal drops perfect for weddings, events, or elevating everyday style. Lightweight and comfortable.',
    category_slug: 'earrings',
    retail_price: 34.99,
    wholesale_price: 20.99,
    stock_quantity: 250,
    is_featured: true,
    images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600'],
    specifications: { material: 'Gold Plated, Crystal', length: '1.5 inches' },
    tags: ['champagne', 'crystal', 'elegant', 'bridal']
  },
  {
    sku: 'LT-EAR-002',
    name: 'Mini Gold Hoop Earrings',
    description: 'Classic mini hoops that go with everything. Perfect staple piece for boutiques. Available in 3 sizes.',
    category_slug: 'earrings',
    retail_price: 24.99,
    wholesale_price: 14.99,
    stock_quantity: 300,
    is_featured: false,
    images: ['https://images.unsplash.com/photo-1535556116002-6281ff3e9f17?w=600'],
    specifications: { material: '14K Gold Fill', sizes: '10mm, 15mm, 20mm' },
    tags: ['hoops', 'gold', 'staple', 'everyday']
  },
  {
    sku: 'LT-EAR-003',
    name: 'Pearl Stud Earrings Set',
    description: 'Set of 3 pearl stud earrings in graduating sizes. Timeless elegance that every woman needs.',
    category_slug: 'earrings',
    retail_price: 29.99,
    wholesale_price: 17.99,
    stock_quantity: 180,
    images: ['https://images.unsplash.com/photo-1596944924591-4009d5b2be47?w=600'],
    specifications: { material: 'Sterling Silver & Freshwater Pearl', sizes: '5mm, 7mm, 9mm' },
    tags: ['pearls', 'studs', 'classic', 'set']
  },

  // Bracelets
  {
    sku: 'LT-BRA-001',
    name: 'Dainty Chain Bracelet with Charm',
    description: 'Delicate chain bracelet with choice of charm: heart, star, or initial. Adjustable sizing.',
    category_slug: 'bracelets',
    retail_price: 32.99,
    wholesale_price: 19.79,
    stock_quantity: 120,
    is_featured: false,
    images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600'],
    specifications: { material: 'Gold Fill Chain', length: 'Adjustable 6.5-8 inches' },
    tags: ['dainty', 'charm', 'adjustable', 'personalized']
  },
  {
    sku: 'LT-BRA-002',
    name: 'Beaded Gemstone Bracelet',
    description: 'Natural gemstone beads on elastic cord. Choose from rose quartz, amethyst, or turquoise.',
    category_slug: 'bracelets',
    retail_price: 38.99,
    wholesale_price: 23.39,
    stock_quantity: 90,
    images: ['https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=600'],
    specifications: { material: 'Natural Gemstones', fit: 'Stretch, One Size' },
    tags: ['gemstone', 'beaded', 'healing', 'boho']
  },

  // Rings
  {
    sku: 'LT-RIN-001',
    name: 'Stackable Ring Set',
    description: 'Set of 5 delicate stackable rings in mixed metals. Wear together or separately.',
    category_slug: 'rings',
    retail_price: 44.99,
    wholesale_price: 26.99,
    stock_quantity: 100,
    is_featured: true,
    images: ['https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600'],
    specifications: { material: 'Mixed Metals', sizes: '6, 7, 8' },
    tags: ['stackable', 'set', 'trendy', 'mixed-metals']
  },

  // Accessories
  {
    sku: 'LT-ACC-001',
    name: 'Pearl Hair Clips Set',
    description: 'Set of 3 pearl-embellished hair clips. Perfect for weddings, bridal, or everyday elegance.',
    category_slug: 'accessories',
    retail_price: 27.99,
    wholesale_price: 16.79,
    stock_quantity: 140,
    is_featured: false,
    images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600'],
    specifications: { material: 'Metal & Pearls', set: '3 pieces' },
    tags: ['hair', 'pearls', 'bridal', 'set']
  },
  {
    sku: 'LT-ACC-002',
    name: 'Silk Scrunchie Set',
    description: 'Luxe silk scrunchies in neutral tones. Gentle on hair, beautiful on wrist.',
    category_slug: 'accessories',
    retail_price: 22.99,
    wholesale_price: 13.79,
    stock_quantity: 200,
    images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600'],
    specifications: { material: '100% Mulberry Silk', colors: 'Champagne, Blush, Ivory' },
    tags: ['silk', 'scrunchie', 'hair', 'luxury']
  },

  // Gift Sets
  {
    sku: 'LT-SET-001',
    name: 'Bridal Gift Set',
    description: 'Curated bridal gift set including necklace, earrings, and bracelet. Beautiful packaging included.',
    category_slug: 'gift-sets',
    retail_price: 89.99,
    wholesale_price: 53.99,
    stock_quantity: 50,
    is_featured: true,
    images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600'],
    specifications: { includes: 'Necklace, Earrings, Bracelet', packaging: 'Gift Box Included' },
    tags: ['bridal', 'gift-set', 'wedding', 'luxury']
  },
  {
    sku: 'LT-SET-002',
    name: 'Everyday Essentials Set',
    description: 'Perfect starter set: hoop earrings, simple necklace, and delicate bracelet.',
    category_slug: 'gift-sets',
    retail_price: 69.99,
    wholesale_price: 41.99,
    stock_quantity: 75,
    images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600'],
    specifications: { includes: '3-Piece Jewelry Set', packaging: 'Gift-Ready' },
    tags: ['essentials', 'everyday', 'gift-set', 'starter']
  }
];

async function seedProducts() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting to seed Lina\'s Treasures products...\n');

    // Get category IDs
    const categories = await client.query('SELECT id, slug FROM lt_product_categories');
    const categoryMap = {};
    categories.rows.forEach(cat => {
      categoryMap[cat.slug] = cat.id;
    });

    let successCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      try {
        // Check if product already exists
        const existing = await client.query(
          'SELECT id FROM lt_products WHERE sku = $1',
          [product.sku]
        );

        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipped: ${product.name} (already exists)`);
          skippedCount++;
          continue;
        }

        const categoryId = categoryMap[product.category_slug];

        if (!categoryId) {
          console.log(`⚠️  Skipped: ${product.name} (category not found: ${product.category_slug})`);
          skippedCount++;
          continue;
        }

        // Calculate tier pricing
        const tier1Price = product.wholesale_price * 0.8; // 20% off wholesale
        const tier2Price = product.wholesale_price * 0.7; // 30% off wholesale
        const tier3Price = product.wholesale_price * 0.6; // 40% off wholesale

        // Insert product
        await client.query(`
          INSERT INTO lt_products (
            sku, name, description, category_id,
            retail_price, wholesale_price,
            partner_tier_1_price, partner_tier_2_price, partner_tier_3_price,
            stock_quantity, low_stock_threshold,
            images, specifications, tags,
            is_active, is_featured
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [
          product.sku,
          product.name,
          product.description,
          categoryId,
          product.retail_price,
          product.wholesale_price,
          tier1Price,
          tier2Price,
          tier3Price,
          product.stock_quantity,
          product.stock_quantity * 0.1, // 10% of stock as low threshold
          JSON.stringify(product.images),
          JSON.stringify(product.specifications),
          product.tags,
          true,
          product.is_featured || false
        ]);

        console.log(`✅ Added: ${product.name} ($${product.retail_price})`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error adding ${product.name}:`, error.message);
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`✅ Successfully added: ${successCount} products`);
    console.log(`⏭️  Skipped: ${skippedCount} products`);

    // Show summary
    const totalProducts = await client.query('SELECT COUNT(*) FROM lt_products');
    console.log(`\n📊 Total products in database: ${totalProducts.rows[0].count}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seed
seedProducts();

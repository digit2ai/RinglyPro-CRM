#!/usr/bin/env node

/**
 * Create test storefront for Joe's Pizza
 * Includes sample categories and menu items
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function createTestStorefront() {
  const client = await pool.connect();

  try {
    console.log('🍕 Creating test storefront for Joe\'s Pizza...\n');

    // Step 1: Create storefront business
    console.log('📄 Creating storefront business...');
    const storefrontResult = await client.query(`
      INSERT INTO storefront_businesses (
        business_name,
        business_slug,
        business_type,
        tagline,
        description,
        primary_color,
        secondary_color,
        accent_color,
        logo_url,
        brand_style,
        brand_tone,
        brand_keywords,
        is_active,
        is_published,
        subscription_plan,
        subscription_status,
        created_at
      ) VALUES (
        'Joe''s Pizza',
        'joes-pizza',
        'restaurant',
        'Authentic NY-Style Pizza Since 1995',
        'Family-owned pizzeria serving authentic New York-style pizza with fresh ingredients and traditional recipes passed down through generations.',
        '#c92a2a',
        '#f4e4c1',
        '#d4af37',
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400',
        'rustic',
        'warm',
        ARRAY['authentic', 'family-owned', 'traditional', 'fresh', 'NY-style'],
        true,
        true,
        'pro',
        'active',
        NOW()
      )
      ON CONFLICT (business_slug)
      DO UPDATE SET
        is_active = true,
        is_published = true,
        updated_at = NOW()
      RETURNING id, business_slug
    `);

    const storefrontId = storefrontResult.rows[0].id;
    console.log(`✅ Storefront created: ID ${storefrontId}, slug: ${storefrontResult.rows[0].business_slug}\n`);

    // Step 2: Create categories
    console.log('📋 Creating menu categories...');

    const categories = [
      { name: 'Pizza', slug: 'pizza', icon: '🍕', order: 1 },
      { name: 'Appetizers', slug: 'appetizers', icon: '🥖', order: 2 },
      { name: 'Salads', slug: 'salads', icon: '🥗', order: 3 },
      { name: 'Beverages', slug: 'beverages', icon: '🥤', order: 4 },
      { name: 'Desserts', slug: 'desserts', icon: '🍰', order: 5 }
    ];

    const categoryIds = {};

    for (const cat of categories) {
      const result = await client.query(`
        INSERT INTO storefront_categories (
          storefront_id, name, slug, icon_emoji, display_order, is_active
        ) VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (storefront_id, slug)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `, [storefrontId, cat.name, cat.slug, cat.icon, cat.order]);

      categoryIds[cat.slug] = result.rows[0].id;
      console.log(`   ✅ ${cat.icon} ${cat.name}`);
    }

    console.log('');

    // Step 3: Create menu items
    console.log('🍴 Creating menu items...\n');

    // Pizza items
    const pizzaItems = [
      {
        name: 'Margherita Pizza',
        description: 'Classic pizza with fresh mozzarella, San Marzano tomato sauce, fresh basil, and extra virgin olive oil',
        price: 14.99,
        image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600',
        featured: true
      },
      {
        name: 'Pepperoni Pizza',
        description: 'Our signature pizza topped with premium pepperoni and mozzarella cheese',
        price: 16.99,
        image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600',
        featured: true
      },
      {
        name: 'Vegetarian Supreme',
        description: 'Bell peppers, mushrooms, red onions, black olives, and fresh tomatoes',
        price: 15.99,
        image: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600',
        featured: false
      },
      {
        name: 'Meat Lovers',
        description: 'Pepperoni, Italian sausage, bacon, and ham with extra cheese',
        price: 18.99,
        image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600',
        featured: false
      }
    ];

    for (const item of pizzaItems) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(`
        INSERT INTO storefront_items (
          storefront_id, category_id, name, slug, description, price, image_url,
          is_active, is_available, is_featured, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, $8, 1)
        ON CONFLICT (storefront_id, slug) DO NOTHING
      `, [storefrontId, categoryIds['pizza'], item.name, slug, item.description, item.price, item.image, item.featured]);

      console.log(`   ✅ ${item.name} - $${item.price}`);
    }

    // Appetizers
    const appetizerItems = [
      {
        name: 'Garlic Knots',
        description: 'Fresh-baked knots brushed with garlic butter and herbs',
        price: 6.99,
        image: 'https://images.unsplash.com/photo-1619640408185-1f96e5d40c1f?w=600'
      },
      {
        name: 'Mozzarella Sticks',
        description: 'Golden-fried mozzarella served with marinara sauce',
        price: 8.99,
        image: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=600'
      },
      {
        name: 'Buffalo Wings',
        description: 'Crispy chicken wings tossed in spicy buffalo sauce',
        price: 11.99,
        image: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600'
      }
    ];

    for (const item of appetizerItems) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(`
        INSERT INTO storefront_items (
          storefront_id, category_id, name, slug, description, price, image_url,
          is_active, is_available, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, 1)
        ON CONFLICT (storefront_id, slug) DO NOTHING
      `, [storefrontId, categoryIds['appetizers'], item.name, slug, item.description, item.price, item.image]);

      console.log(`   ✅ ${item.name} - $${item.price}`);
    }

    // Salads
    const saladItems = [
      {
        name: 'Caesar Salad',
        description: 'Crisp romaine, parmesan, croutons, and Caesar dressing',
        price: 9.99,
        image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600'
      },
      {
        name: 'House Salad',
        description: 'Mixed greens, tomatoes, cucumbers, red onions, and Italian dressing',
        price: 7.99,
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600'
      }
    ];

    for (const item of saladItems) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(`
        INSERT INTO storefront_items (
          storefront_id, category_id, name, slug, description, price, image_url,
          is_active, is_available, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, 1)
        ON CONFLICT (storefront_id, slug) DO NOTHING
      `, [storefrontId, categoryIds['salads'], item.name, slug, item.description, item.price, item.image]);

      console.log(`   ✅ ${item.name} - $${item.price}`);
    }

    // Beverages
    const beverageItems = [
      { name: 'Coca-Cola', price: 2.99 },
      { name: 'Sprite', price: 2.99 },
      { name: 'Bottled Water', price: 1.99 },
      { name: 'Iced Tea', price: 2.99 }
    ];

    for (const item of beverageItems) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(`
        INSERT INTO storefront_items (
          storefront_id, category_id, name, slug, price, is_active, is_available, display_order
        ) VALUES ($1, $2, $3, $4, $5, true, true, 1)
        ON CONFLICT (storefront_id, slug) DO NOTHING
      `, [storefrontId, categoryIds['beverages'], item.name, slug, item.price]);

      console.log(`   ✅ ${item.name} - $${item.price}`);
    }

    // Desserts
    const dessertItems = [
      {
        name: 'Tiramisu',
        description: 'Classic Italian dessert with espresso-soaked ladyfingers and mascarpone',
        price: 7.99,
        image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600'
      },
      {
        name: 'Cannoli',
        description: 'Crispy shells filled with sweet ricotta cream',
        price: 6.99,
        image: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=600'
      }
    ];

    for (const item of dessertItems) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await client.query(`
        INSERT INTO storefront_items (
          storefront_id, category_id, name, slug, description, price, image_url,
          is_active, is_available, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, 1)
        ON CONFLICT (storefront_id, slug) DO NOTHING
      `, [storefrontId, categoryIds['desserts'], item.name, slug, item.description, item.price, item.image]);

      console.log(`   ✅ ${item.name} - $${item.price}`);
    }

    console.log('\n🎉 Test storefront created successfully!\n');
    console.log('🌐 Public URL: https://aiagent.ringlypro.com/storefront/joes-pizza');
    console.log('📦 Embed Code:');
    console.log(`<iframe src="https://aiagent.ringlypro.com/storefront/joes-pizza" style="width: 100%; min-height: 900px; border: none;"></iframe>`);
    console.log('');

  } catch (error) {
    console.error('❌ Error creating test storefront:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createTestStorefront();

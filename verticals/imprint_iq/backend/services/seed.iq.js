/**
 * ImprintIQ Demo Data Seeder
 * Generates realistic promotional products data for dashboard demos
 */
const sequelize = require('./db.iq');

const TENANT = 'imprint_iq';

const CATEGORIES = ['Drinkware', 'Writing Instruments', 'Apparel', 'Bags', 'Tech Accessories', 'Awards', 'Headwear', 'Outdoor', 'Desk Accessories', 'Food Gifts'];
const DECORATIONS = ['Screen Print', 'Embroidery', 'Laser Engrave', 'ColorBrite', 'Full Color Digital', 'Deboss', 'Heat Transfer', 'Pad Print'];
const COMPANIES = [
  'Meridian Healthcare', 'TechVault Solutions', 'Horizon Financial', 'Summit Construction', 'Atlas Logistics',
  'Pinnacle Marketing', 'Evergreen University', 'Catalyst Biotech', 'Vanguard Insurance', 'Apex Manufacturing',
  'BlueSky Events', 'Coastal Realty Group', 'NovaStar Energy', 'Keystone Automotive', 'Pacific Trade Alliance',
  'Redwood Consulting', 'Sterling Legal Partners', 'Trident Defense', 'Zenith Pharmaceuticals', 'Olympus Sports'
];
const PRODUCTS = [
  { name: '20oz Stainless Tumbler', cat: 'Drinkware', base: 8.50, cost: 3.20, deco: ['Laser Engrave','Screen Print','ColorBrite'] },
  { name: '16oz Ceramic Mug', cat: 'Drinkware', base: 6.00, cost: 2.10, deco: ['Screen Print','Full Color Digital'] },
  { name: 'Retractable Ballpoint Pen', cat: 'Writing Instruments', base: 1.25, cost: 0.35, deco: ['Pad Print','Screen Print'] },
  { name: 'Executive Metal Pen Set', cat: 'Writing Instruments', base: 12.00, cost: 4.50, deco: ['Laser Engrave'] },
  { name: 'Dri-Fit Polo Shirt', cat: 'Apparel', base: 22.00, cost: 9.50, deco: ['Embroidery','Screen Print','Heat Transfer'] },
  { name: 'Cotton Canvas Tote', cat: 'Bags', base: 4.50, cost: 1.60, deco: ['Screen Print','Full Color Digital'] },
  { name: 'Laptop Backpack', cat: 'Bags', base: 28.00, cost: 12.00, deco: ['Embroidery','Screen Print'] },
  { name: 'Wireless Charging Pad', cat: 'Tech Accessories', base: 15.00, cost: 5.80, deco: ['Pad Print','Full Color Digital'] },
  { name: 'Bluetooth Speaker', cat: 'Tech Accessories', base: 18.00, cost: 7.20, deco: ['Pad Print','Laser Engrave'] },
  { name: 'Crystal Award Trophy', cat: 'Awards', base: 45.00, cost: 18.00, deco: ['Laser Engrave','Deboss'] },
  { name: 'Richardson Trucker Cap', cat: 'Headwear', base: 14.00, cost: 5.50, deco: ['Embroidery'] },
  { name: 'Patio Umbrella', cat: 'Outdoor', base: 35.00, cost: 14.00, deco: ['Screen Print','Full Color Digital'] },
  { name: 'Bamboo Desk Organizer', cat: 'Desk Accessories', base: 16.00, cost: 6.00, deco: ['Laser Engrave'] },
  { name: 'Gourmet Cookie Box', cat: 'Food Gifts', base: 24.00, cost: 10.00, deco: ['Full Color Digital'] },
  { name: 'PopSocket Phone Grip', cat: 'Tech Accessories', base: 5.00, cost: 1.80, deco: ['Full Color Digital','Pad Print'] }
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  try {
    // Check if FULL data already exists (customers + quotes + orders)
    const [existingQ] = await sequelize.query(`SELECT COUNT(*) as cnt FROM iq_quotes WHERE tenant_id = $1`, { bind: [TENANT] });
    if (parseInt(existingQ[0]?.cnt) >= 20) {
      console.log('  ✅ ImprintIQ demo data already seeded');
      return;
    }

    console.log('  🌱 Seeding ImprintIQ demo data...');

    // Seed Suppliers
    const supplierNames = ['SanMar', 'alphabroder', 'S&S Activewear', 'Hit Factory Direct', 'Koozie Group', 'PCNA', 'Gemline', 'HPG'];
    for (const name of supplierNames) {
      await sequelize.query(`
        INSERT INTO iq_suppliers (tenant_id, name, country, lead_time_days, quality_score, on_time_rate, status)
        VALUES ($1, $2, 'US', $3, $4, $5, 'active')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, name, rand(3, 14), (rand(70, 98) / 10).toFixed(1), rand(85, 99)] });
    }

    // Seed Products
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      await sequelize.query(`
        INSERT INTO iq_products (tenant_id, sku, name, category, base_price, cost, min_qty, decoration_methods, stock_qty, reorder_point, lead_time_days, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, `IQ-${1000 + i}`, p.name, p.cat, p.base, p.cost, rand(24, 500), `{${p.deco.map(d => `"${d}"`).join(',')}}`, rand(100, 5000), rand(50, 500), rand(3, 10)] });
    }

    // Seed Customers
    for (const company of COMPANIES) {
      const ltv = rand(5000, 250000);
      const hasRecentOrder = Math.random() > 0.3;
      const lastOrder = hasRecentOrder
        ? `NOW() - INTERVAL '${rand(1, 90)} days'`
        : Math.random() > 0.5 ? `NOW() - INTERVAL '${rand(180, 400)} days'` : 'NULL';
      await sequelize.query(`
        INSERT INTO iq_customers (tenant_id, company_name, contact_name, contact_email, industry, account_type, lifetime_value, last_order_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, ${lastOrder === 'NULL' ? 'NULL' : lastOrder}, 'active')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, company, `Contact at ${company}`, `info@${company.toLowerCase().replace(/\s+/g, '')}.com`, pick(['Healthcare','Technology','Finance','Construction','Education','Manufacturing','Events','Legal','Energy','Sports']), pick(['standard','premium','enterprise']), ltv] });
    }

    // Seed Quotes (mix of stages)
    const stages = ['draft', 'sent', 'sent', 'sent', 'won', 'won', 'won', 'converted', 'lost', 'lost', 'expired'];
    for (let i = 0; i < 40; i++) {
      const stage = pick(stages);
      const total = rand(500, 50000);
      const margin = rand(20, 45);
      const daysAgo = rand(1, 60);
      await sequelize.query(`
        INSERT INTO iq_quotes (tenant_id, quote_number, customer_id, title, total_amount, margin_pct, stage, source, created_at, updated_at)
        VALUES ($1, $2, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $3, $4, $5, $6, $7, NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${Math.max(0, daysAgo - rand(0, 5))} days')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, `QT-${2024000 + i}`, `${pick(['Q4 Trade Show','Employee Gifts','Conference Swag','Client Appreciation','Product Launch','Holiday Campaign','Onboarding Kits','Fundraiser'])} - ${pick(COMPANIES)}`, total, margin, stage, pick(['website','phone','email','referral','trade_show'])] });
    }

    // Seed Orders
    for (let i = 0; i < 25; i++) {
      const stage = pick(['received', 'in_production', 'in_production', 'qc_check', 'shipped', 'shipped', 'delivered', 'delivered']);
      const total = rand(1000, 35000);
      const costTotal = Math.round(total * (1 - rand(25, 40) / 100));
      await sequelize.query(`
        INSERT INTO iq_orders (tenant_id, order_number, customer_id, title, total_amount, cost_total, margin_pct, stage, payment_status, created_at)
        VALUES ($1, $2, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${rand(1, 45)} days')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, `ORD-${3024000 + i}`, `Order for ${pick(COMPANIES)}`, total, costTotal, rand(25, 42), stage, pick(['unpaid','paid','partial','overdue'])] });
    }

    // Seed Artwork
    const proofStatuses = ['pending', 'pending', 'in_review', 'approved', 'approved', 'approved', 'rejected', 'revision'];
    for (let i = 0; i < 20; i++) {
      const status = pick(proofStatuses);
      await sequelize.query(`
        INSERT INTO iq_artwork (tenant_id, customer_id, file_name, file_type, dpi, is_vector, proof_status, revision_count, created_at)
        VALUES ($1, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '${rand(1, 30)} days')
      `, { bind: [TENANT, `logo_${pick(COMPANIES).toLowerCase().replace(/\s+/g, '_')}.${pick(['ai','eps','pdf','png','jpg'])}`, pick(['ai','eps','pdf','png','jpg']), pick([72, 150, 300, 600, 1200]), Math.random() > 0.4, status, status === 'approved' ? rand(0, 1) : rand(1, 5)] });
    }

    // Seed Production Jobs
    const prodStages = ['queued', 'setup', 'running', 'running', 'completed', 'completed', 'completed', 'qc_hold'];
    for (let i = 0; i < 30; i++) {
      const qty = rand(100, 5000);
      const defects = Math.random() > 0.8 ? rand(1, Math.ceil(qty * 0.05)) : 0;
      const stage = pick(prodStages);
      await sequelize.query(`
        INSERT INTO iq_production_jobs (tenant_id, decoration_method, machine_line, quantity_target, quantity_good, quantity_defect, run_time_min, color_count, priority, stage, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '${rand(1, 21)} days')
      `, { bind: [TENANT, pick(DECORATIONS), `Line ${rand(1, 6)}`, qty, stage === 'completed' ? qty - defects : 0, defects, rand(30, 480), rand(1, 6), pick(['normal','normal','normal','rush','rush']), stage] });
    }

    // Seed Inventory
    const [products] = await sequelize.query(`SELECT id, sku FROM iq_products WHERE tenant_id = $1`, { bind: [TENANT] });
    for (const prod of products) {
      const onHand = rand(0, 3000);
      const reorderPt = rand(100, 500);
      await sequelize.query(`
        INSERT INTO iq_inventory (tenant_id, product_id, sku, qty_on_hand, qty_reserved, qty_on_order, reorder_point, reorder_qty, unit_cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, prod.id, prod.sku, onHand, rand(0, Math.min(onHand, 200)), onHand < reorderPt ? rand(500, 2000) : 0, reorderPt, rand(500, 2000), rand(1, 15)] });
    }

    // Seed Calls
    const outcomes = ['completed', 'completed', 'completed', 'missed', 'missed', 'voicemail', 'no_answer', 'transferred'];
    const intents = ['quote_request', 'order_status', 'reorder', 'product_inquiry', 'complaint', 'general', 'rush_order', 'artwork_question'];
    for (let i = 0; i < 50; i++) {
      await sequelize.query(`
        INSERT INTO iq_calls (tenant_id, customer_id, direction, agent_name, duration_sec, outcome, intent, sentiment, quote_generated, created_at)
        VALUES ($1, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${rand(0, 14)} days')
      `, { bind: [TENANT, pick(['inbound','inbound','inbound','outbound']), pick(['Rachel','Ana','Lina']), rand(0, 600), pick(outcomes), pick(intents), pick(['positive','neutral','neutral','negative']), Math.random() > 0.7] });
    }

    // Seed Invoices
    for (let i = 0; i < 20; i++) {
      const total = rand(1000, 30000);
      const tax = Math.round(total * 0.075);
      const grandTotal = total + tax;
      const status = pick(['paid','paid','paid','pending','pending','overdue','overdue']);
      const paidAmt = status === 'paid' ? grandTotal : status === 'pending' ? 0 : rand(0, Math.round(grandTotal * 0.5));
      await sequelize.query(`
        INSERT INTO iq_invoices (tenant_id, invoice_number, customer_id, amount, tax_amount, total_amount, paid_amount, status, due_date, created_at)
        VALUES ($1, $2, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${rand(5, 60)} days')
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, `INV-${4024000 + i}`, total, tax, grandTotal, paidAmt, status, new Date(Date.now() - rand(0, 45) * 86400000).toISOString().split('T')[0]] });
    }

    // Seed Reorder Predictions
    for (let i = 0; i < 12; i++) {
      await sequelize.query(`
        INSERT INTO iq_reorder_predictions (tenant_id, customer_id, product_id, predicted_date, confidence, predicted_qty, order_frequency_days)
        VALUES ($1, (SELECT id FROM iq_customers WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), (SELECT id FROM iq_products WHERE tenant_id = $1 ORDER BY RANDOM() LIMIT 1), $2, $3, $4, $5)
      `, { bind: [TENANT, new Date(Date.now() + rand(7, 60) * 86400000).toISOString().split('T')[0], rand(60, 95), rand(100, 3000), rand(60, 365)] });
    }

    console.log('  ✅ ImprintIQ demo data seeded successfully');
  } catch (err) {
    console.error('  ⚠️ ImprintIQ seed error:', err.message);
  }
}

module.exports = { seed };

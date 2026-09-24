'use strict';

/**
 * Sample catalog for testing RinglyPro Supply end to end.
 *
 *   node verticals/supply/scripts/seed-sample-products.js <tenant_id>           add / refresh
 *   node verticals/supply/scripts/seed-sample-products.js <tenant_id> --remove  delete them again
 *
 * THESE PRICES ARE MADE UP. Every row has a SKU starting "SAMPLE-", a note
 * saying so, and attributes.sample = true. The AI agent quotes whatever the
 * catalog says, so do not run a campaign on these rows to real contractors:
 * test with your own phone, then remove them. Categories follow what Pro City
 * Supply's site lists (flooring, trim, countertops, cabinets, coatings, tools).
 * Idempotent: re-running updates the same SKUs.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
process.env.SUPPLY_DIALER = 'off';
const db = require('../src/db');
const catalog = require('../src/services/catalog');
const intelligence = require('../src/services/intelligence');

const NOTE = 'SAMPLE DATA for testing. Prices are made up. Remove before real campaigns.';
const P = [
  // sku, name, category, subcategory, brand, material, dimensions, unit, qty, cost, price, min, promo, description
  ['SAMPLE-SPC-01', 'SPC Rigid Core Plank, Coastal Oak', 'Flooring', 'SPC', 'Sample Floors', 'stone plastic composite', '7 x 48 in, 5.5 mm, 20 mil wear layer', 'sq ft', 18000, 1.15, 1.89, 1.59, null, 'Waterproof SPC click-lock vinyl plank flooring with attached underlayment.'],
  ['SAMPLE-LVP-02', 'Luxury Vinyl Plank, Gray Driftwood', 'Flooring', 'Vinyl plank', 'Sample Floors', 'vinyl', '9 x 60 in, 6 mm, 12 mil wear layer', 'sq ft', 12500, 1.05, 1.79, 1.49, 1.69, 'Waterproof luxury vinyl plank LVP floor for kitchens, baths and rentals.'],
  ['SAMPLE-LAM-03', 'Laminate Flooring, Natural Hickory 12 mm', 'Flooring', 'Laminate', 'Sample Floors', 'laminate', '8 x 48 in, 12 mm, AC4', 'sq ft', 9000, 0.95, 1.59, 1.29, null, 'AC4 laminate floor with water-resistant core.'],
  ['SAMPLE-ENG-04', 'Engineered Hardwood, White Oak 1/2 in', 'Flooring', 'Engineered hardwood', 'Sample Woods', 'white oak', '7.5 in wide, 1/2 in thick', 'sq ft', 4200, 2.60, 4.29, 3.79, null, 'Wire-brushed engineered hardwood flooring.'],
  ['SAMPLE-CPT-05', 'Carpet, Plush Beige Rental Grade', 'Flooring', 'Carpet', 'Sample Floors', 'polyester', '12 ft roll', 'sq ft', 6000, 0.70, 1.19, 0.99, null, 'Rental-grade plush carpet for property renovation turnovers.'],
  ['SAMPLE-UND-06', 'Flooring Underlayment with Vapor Barrier', 'Flooring', 'Underlayment', 'Sample Supply', 'foam', '100 sq ft roll, 3 mm', 'roll', 350, 14.00, 24.99, 19.99, null, 'Underlayment and moisture barrier for laminate and engineered floor.'],
  ['SAMPLE-BASE-07', 'Primed MDF Baseboard 5-1/4 in', 'Trim mouldings', 'Baseboard', 'Sample Millwork', 'MDF', '5-1/4 in x 16 ft', 'lf', 20000, 0.55, 0.99, 0.79, null, 'Primed baseboard trim moulding, ready to paint.'],
  ['SAMPLE-QTR-08', 'Primed Quarter Round 3/4 in', 'Trim mouldings', 'Quarter round', 'Sample Millwork', 'pine', '3/4 in x 8 ft', 'lf', 15000, 0.22, 0.45, 0.35, null, 'Quarter round moulding trim for flooring transitions.'],
  ['SAMPLE-CAS-09', 'Primed Door Casing 2-1/4 in', 'Trim mouldings', 'Casing', 'Sample Millwork', 'pine', '2-1/4 in x 7 ft', 'lf', 8000, 0.40, 0.79, 0.65, null, 'Primed wood door and window casing trim moulding.'],
  ['SAMPLE-QTZ-10', 'Quartz Countertop Slab, Calacatta White', 'Countertops', 'Quartz', 'Sample Stone', 'quartz', '126 x 63 in, 3 cm', 'slab', 40, 780, 1290, 1100, null, 'Quartz countertop slab for kitchen and bath remodels. Fabrication quoted separately.'],
  ['SAMPLE-GRN-11', 'Granite Countertop Slab, Absolute Black', 'Countertops', 'Granite', 'Sample Stone', 'granite', '110 x 65 in, 3 cm', 'slab', 25, 640, 1090, 950, null, 'Granite countertop slab for kitchen remodel projects.'],
  ['SAMPLE-CAB-12', 'Shaker Kitchen Cabinet Set, White (10x10)', 'Cabinets', 'Kitchen', 'Sample Cabinets', 'plywood', '10 x 10 ft kitchen layout', 'set', 30, 2400, 3890, 3400, 3590, 'Face-frame shaker kitchen cabinets, soft-close, 10x10 layout.'],
  ['SAMPLE-VAN-13', 'Bathroom Vanity Cabinet 36 in, Navy', 'Cabinets', 'Bath', 'Sample Cabinets', 'plywood', '36 x 21 in', 'each', 60, 210, 369, 319, null, 'Bath vanity cabinet for bathroom remodel projects.'],
  ['SAMPLE-EPX-14', 'Garage Floor Epoxy Coating Kit', 'Concrete coatings', 'Epoxy', 'Sample Coatings', 'epoxy', 'covers 500 sq ft', 'kit', 120, 95, 169, 145, null, 'Two-part epoxy concrete floor coating kit with flakes.'],
  ['SAMPLE-POL-15', 'Polyaspartic Topcoat, 1 gal', 'Concrete coatings', 'Polyaspartic', 'Sample Coatings', 'polyaspartic', '1 gallon', 'each', 200, 62, 109, 94, null, 'Fast-cure polyaspartic concrete coating topcoat.'],
  ['SAMPLE-ADH-16', 'Flooring Adhesive, Urethane 4 gal', 'Tools & supplies', 'Adhesives', 'Sample Supply', 'urethane', '4 gallon pail', 'each', 90, 88, 149, 129, null, 'Urethane adhesive for engineered hardwood and vinyl flooring.'],
  ['SAMPLE-PAT-17', 'Self-Leveling Floor Patch, 50 lb', 'Tools & supplies', 'Floor patch', 'Sample Supply', 'cement', '50 lb bag', 'bag', 400, 21, 36.99, 31.99, null, 'Self-leveling cement floor patch and leveler for subfloor prep.'],
  ['SAMPLE-THN-18', 'Tile Thinset Mortar, 50 lb', 'Tools & supplies', 'Tile supplies', 'Sample Supply', 'cement', '50 lb bag', 'bag', 300, 13, 22.99, 19.49, null, 'Modified thinset mortar for tile, grout and backer board installs.']
];

(async () => {
  const tenantId = Number(process.argv[2]);
  if (!tenantId) { console.error('Usage: node seed-sample-products.js <tenant_id> [--remove]'); process.exit(1); }
  if (process.argv.includes('--remove')) {
    const ids = (await db.tq(tenantId, `SELECT id FROM sup_products WHERE tenant_id = :tenant AND sku LIKE 'SAMPLE-%'`)).map((r) => r.id);
    if (ids.length) {
      await db.trun(tenantId, 'DELETE FROM sup_product_relevance WHERE tenant_id = :tenant AND product_id IN (:ids)', { ids });
      await db.trun(tenantId, 'DELETE FROM sup_competitor_prices WHERE tenant_id = :tenant AND product_id IN (:ids)', { ids });
      await db.trun(tenantId, 'DELETE FROM sup_products WHERE tenant_id = :tenant AND id IN (:ids)', { ids });
    }
    console.log(`Removed ${ids.length} sample products from tenant ${tenantId}.`);
    return db.sequelize.close();
  }
  const rows = P.map(([sku, name, category, subcategory, brand, material, dimensions, unit, qty, cost, price, min, promo, description]) => ({
    SKU: sku, Name: name, Category: category, Subcategory: subcategory, Brand: brand, Material: material, Dimensions: dimensions, Unit: unit,
    Qty: qty, Cost: cost, Price: price, 'Min Price': min, 'Promo Price': promo == null ? '' : promo, Description: description, Notes: NOTE, sample: 'true'
  }));
  const report = await catalog.importRows(tenantId, rows, null);
  console.log('Import:', JSON.stringify({ created: report.created, updated: report.updated, failed: report.failed, errors: report.errors }));
  const a = await intelligence.analyzeAll(tenantId);
  console.log(`Analyzed likely buyers for ${a.analyzed} products.`);
  await db.sequelize.close();
})().catch(async (e) => { console.error(e.message); try { await db.sequelize.close(); } catch (x) { /* ok */ } process.exit(1); });

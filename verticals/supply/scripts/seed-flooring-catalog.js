'use strict';

/**
 * Real flooring catalog supplied by the owner (flooring_catalog_final_en.pdf, 2026-10-15).
 *   node verticals/supply/scripts/seed-flooring-catalog.js <tenant_id>
 * Only what the PDF states is loaded: name, size, thickness, wear layer, price per sq ft,
 * "sold in full boxes". SKU is derived from the name so a re-run updates instead of
 * duplicating. Brand, material, stock, cost and box size were NOT in the PDF and stay empty.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
process.env.SUPPLY_DIALER = 'off';
const db = require('../src/db');
const catalog = require('../src/services/catalog');
const intelligence = require('../src/services/intelligence');

const P = [
  ['Olympia Cream', 9, 60, '7 mm', '22 mil', 2.29],
  ['Miami Blanco', 9, 48, '6.5 mm', '22 mil', 2.29],
  ['Amazon Chestnut', 9, 48, '6.5 mm', '22 mil', 2.29],
  ['Modern Beige', 9, 48, '5 mm', '22 mil', 1.79],
  ['Amazon Blanco', 9, 48, '5.5 mm', '22 mil', 1.79],
  ['Golden Oak', 9, 48, '5 mm', '22 mil', 1.79],
  ['Olympia Pearl', 9, 60, '5 mm', '22 mil', 1.79],
  ['Sequoia', 9, 60, '5 mm', '12 mil', 1.79],
  ['Avalon', 9, 60, '5.5 mm', '20 mil', 1.89],
  ['Camelot', 9, 60, '5.5 mm', '20 mil', 1.89],
  ['Troy', 9, 60, '5.5 mm', '20 mil', 1.89]
];

(async () => {
  const tenantId = Number(process.argv[2]);
  if (!tenantId) { console.error('Usage: node seed-flooring-catalog.js <tenant_id>'); process.exit(1); }
  const rows = P.map(([name, w, l, thick, wear, price]) => ({
    SKU: 'FLR-' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
    Name: name, Category: 'Flooring',
    Dimensions: `${w} x ${l} in, ${thick} thick, ${wear} wear layer`,
    Unit: 'sq ft', Price: price,
    Description: `Flooring plank ${w}" x ${l}", ${thick} thick, ${wear} wear layer. Sold in full boxes.`,
    Notes: 'Source: flooring_catalog_final_en.pdf. Sold in full boxes; box size not stated.'
  }));
  const report = await catalog.importRows(tenantId, rows, null);
  console.log('Import:', JSON.stringify({ created: report.created, updated: report.updated, failed: report.failed, errors: report.errors }));
  const a = await intelligence.analyzeAll(tenantId);
  console.log(`Analyzed likely buyers for ${a.analyzed} products.`);
  await db.sequelize.close();
})().catch(async (e) => { console.error(e.message); try { await db.sequelize.close(); } catch (x) { /* ok */ } process.exit(1); });

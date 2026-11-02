'use strict';
/**
 * The starting wardrobe from the brief: 12 identified Ralph Lauren Oxford shirts,
 * 8 customisable shirt slots, 5 Levi's bottoms and the white Veja sneakers.
 * Colours are a starting guess for each garment's name; the owner corrects them
 * in Wardrobe and, once he uploads a photo, the photo's own fabric is used.
 * Seeding is idempotent by seed_key and NEVER overwrites an edit.
 */
const SHIRTS = [
  ['s01', 'Light blue Oxford', 'Light blue', '#a9c6e8', null, 'oxford'],
  ['s02', 'White Oxford', 'White', '#f7f6f2', null, 'oxford'],
  ['s03', 'Yellow Oxford', 'Yellow', '#f3dc86', null, 'oxford'],
  ['s04', 'Purple Oxford', 'Lavender purple', '#b9a6d6', null, 'oxford'],
  ['s05', 'Pink Oxford', 'Pink', '#f2b8c6', null, 'oxford'],
  ['s06', 'Red gingham Oxford', 'Red / white gingham', '#fbf7f4', '#c8313a', 'gingham'],
  ['s07', 'Red-and-white striped Oxford', 'Red / white stripe', '#fbf7f4', '#c8313a', 'stripe'],
  ['s08', 'Beige Oxford', 'Beige', '#e3d3b6', null, 'oxford'],
  ['s09', 'Multicolor plaid Oxford', 'Multicolour plaid', '#e9dfcf', '#3d6fa8', 'plaid'],
  ['s10', 'Blue gingham Oxford', 'Blue / white gingham', '#fbfbfa', '#3f6fb6', 'gingham'],
  ['s11', 'Green-and-navy plaid Oxford', 'Green / navy plaid', '#2f5a45', '#1d2a4a', 'plaid'],
  ['s12', 'Light-blue-and-white striped Oxford', 'Light blue / white stripe', '#fbfbfa', '#86aee0', 'stripe']
];
const PANTS = [
  ['p01', "Levi's dark blue denim", 'Dark blue denim', 'denim', '#22314f'],
  ['p02', "Levi's light blue denim", 'Light blue denim', 'denim', '#8eaacb'],
  ['p03', "Levi's black denim", 'Black denim', 'denim', '#1d1d20'],
  ['p04', "Levi's khaki", 'Khaki', 'chino', '#c2a777'],
  ['p05', "Levi's medium grey", 'Medium grey', 'chino', '#86898e']
];

async function seed(db, tenantId) {
  const rows = [];
  SHIRTS.forEach(([k, name, colorName, hex, hex2, pattern], i) => rows.push({ k, cat: 'shirt', name, brand: 'Ralph Lauren', type: 'Oxford button-down', colorName, hex, hex2, pattern, slot: false, sort: i + 1 }));
  for (let i = 13; i <= 20; i++) rows.push({ k: 's' + i, cat: 'shirt', name: 'Oxford shirt ' + i, brand: 'Ralph Lauren', type: 'Oxford button-down', colorName: 'Not set yet', hex: '#e8e6e1', hex2: null, pattern: 'oxford', slot: true, sort: i });
  PANTS.forEach(([k, name, colorName, type, hex], i) => rows.push({ k, cat: 'pants', name, brand: "Levi's", type, colorName, hex, hex2: null, pattern: 'solid', slot: false, sort: i + 1 }));
  rows.push({ k: 'sh01', cat: 'shoes', name: 'White Veja sneakers', brand: 'Veja', type: 'sneaker', colorName: 'White with black V', hex: '#f6f5f1', hex2: '#111111', pattern: 'solid', slot: false, sort: 1 });

  for (const r of rows) {
    await db.exec(`INSERT INTO sty_items (tenant_id,category,name,brand,garment_type,color_name,color_hex,color2_hex,pattern,is_slot,sort,seed_key)
      VALUES (:t,:cat,:name,:brand,:type,:colorName,:hex,:hex2,:pattern,:slot,:sort,:k)
      ON CONFLICT (tenant_id, seed_key) WHERE seed_key IS NOT NULL DO NOTHING`, { t: tenantId, ...r });
  }
}

module.exports = { seed, SHIRTS, PANTS };

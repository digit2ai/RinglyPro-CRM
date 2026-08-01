'use strict';

// =====================================================
// seed-oos-demo.js — CLI wrapper around services/oos-demo-seed.js
//
//   NODE_ENV=production node store-health-ai/seed-oos-demo.js [YYYY-MM-DD]
//
// NOTE: this seeds whatever database DATABASE_URL points at. The local .env and
// the production environment point at DIFFERENT databases, so running this on a
// laptop populates dev only. To seed production use the JWT-gated endpoint:
//
//   TOKEN=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({tenant_id:1},process.env.JWT_SECRET,{expiresIn:'1h'}))")
//   curl -X POST https://aiagent.ringlypro.com/aiastore/api/v1/oos/seed-demo \
//     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
// =====================================================

require('dotenv').config();

const { sequelize } = require('./models');
const { seedDemoDay } = require('./src/services/oos-demo-seed');

(async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log(`Seeding OOS demo day ${date}…`);

  const r = await seedDemoDay(date);

  console.log(`\nSeeded ${r.seeded_rows} inventory rows across ${r.stores} stores.\n`);
  console.log('Chain result:');
  console.log(`  OOS rate          ${r.chain.oos_rate}%  (worldwide avg 8.3%)`);
  console.log(`  stockouts         ${r.chain.oos_count} of ${r.chain.total_skus} SKUs`);
  console.log(`  lost sales        $${r.chain.lost_sales_usd.toLocaleString()}`);
  console.log(`  lost gross profit $${r.chain.lost_gross_profit_usd.toLocaleString()}`);
  console.log(`  annualized        $${r.chain.annualized_lost_sales_usd.toLocaleString()}/yr`);
  console.log(`  in-store causes   ${r.chain.in_store_pct}%  (benchmark 70-75%)`);
  console.log('  root cause mix:');
  r.chain.root_cause_mix.forEach((c) => {
    console.log(`    ${String(c.count).padStart(4)}  ${c.pct.toFixed(1).padStart(5)}%  ${c.category} [${c.layer}]`);
  });

  await sequelize.close();
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

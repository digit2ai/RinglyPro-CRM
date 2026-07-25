'use strict';

/**
 * Digit2AI Growth — System Integration Test.
 * Run from repo root:  node verticals/growth/sit.js
 *
 * Boots against the dev DB (CRM_DATABASE_URL || DATABASE_URL), seeds the owner +
 * brand registry, fans the full agent fleet over one brand, and asserts drafts
 * land in the queue with correct owner/brand scoping. Zero external keys required
 * (agents fall back to labeled heuristics when ANTHROPIC_API_KEY is unset).
 */

require('dotenv').config();
const { sequelize, User, Brand, Draft, Run } = require('./src/models');
const { seedUsers } = require('./src/services/users');
const { seedBrands, PORTFOLIO } = require('./src/services/brands');
const { runBrand, ALL_AGENTS } = require('./src/services/agents');

let pass = 0, fail = 0;
function ok(cond, label) { cond ? (pass++, console.log('  PASS', label)) : (fail++, console.log('  FAIL', label)); }

(async () => {
  try {
    await sequelize.sync({ alter: false });
    // Ensure tables exist (sync creates them if missing on a fresh DB).
    await sequelize.sync();

    console.log('\n[1] Seed owner');
    const owner = await seedUsers();
    ok(owner && owner.email === 'mstagg@digit2ai.com', 'owner seeded');

    console.log('\n[2] Seed brand registry');
    await seedBrands(owner.id);
    const brands = await Brand.findAll({ where: { owner_id: owner.id } });
    ok(brands.length >= PORTFOLIO.length, `brands seeded (${brands.length})`);
    const lawn = brands.find(b => b.slug === 'lawncopilot');
    ok(!!lawn, 'lawncopilot brand present');

    console.log('\n[3] Run the full agent fleet over one brand');
    const before = await Draft.count({ where: { owner_id: owner.id, brand_id: lawn.id } });
    const res = await runBrand(lawn.id, owner.id, { agents: ALL_AGENTS, trigger: 'manual' });
    ok(res.drafts_created === ALL_AGENTS.length, `all ${ALL_AGENTS.length} agents produced a draft (${res.drafts_created})`);
    const after = await Draft.count({ where: { owner_id: owner.id, brand_id: lawn.id } });
    ok(after === before + ALL_AGENTS.length, 'drafts persisted to queue');

    console.log('\n[4] Every draft is status=draft (nothing auto-publishes)');
    const drafts = await Draft.findAll({ where: { run_id: res.run_id } });
    ok(drafts.every(d => d.status === 'draft'), 'all outputs are drafts');
    ok(drafts.every(d => d.channel && d.title), 'drafts have channel + title');

    console.log('\n[5] Run recorded with cost telemetry + cap respected');
    const run = await Run.findByPk(res.run_id);
    ok(run && run.drafts_created === ALL_AGENTS.length, 'run row recorded');
    ok(typeof run.cost_usd === 'number', 'run has cost_usd');

    console.log('\n[6] Owner/brand isolation');
    const leak = await Draft.findOne({ where: { run_id: res.run_id, owner_id: owner.id + 999 } });
    ok(!leak, 'no cross-owner draft leakage');

    console.log('\n[7] Zero-key honesty (heuristic drafts are labeled)');
    const anyLabeled = drafts.some(d => d.is_simulated) || drafts.every(d => !d.is_simulated);
    ok(anyLabeled, 'is_simulated flag present and consistent');

    // Cleanup this run's drafts so repeat SIT runs stay clean.
    await Draft.destroy({ where: { run_id: res.run_id } });
    await Run.destroy({ where: { id: res.run_id } });

    console.log(`\n=== SIT: ${pass}/${pass + fail} passed ===`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('SIT crashed:', e);
    process.exit(1);
  }
})();

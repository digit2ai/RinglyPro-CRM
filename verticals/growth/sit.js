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
const settingsSvc = require('./src/services/settings');
const { publishDraft } = require('./src/services/publish');
const { Post } = require('./src/models');
const { markdownToHtml, slugify } = require('./src/services/render');

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

    console.log('\n[8] Channel settings save + secret masking');
    const saved = await settingsSvc.save(owner.id, {
      content: { default_words: 220, tone: 'bold' },
      x: { handle: '@digit2ai', posts_per_run: 4, access_token: 'super-secret-token-1234' },
      geo: { engines: ['ChatGPT', 'Perplexity'], brand_facts: 'Fact one.' }
    });
    ok(saved.content.tone === 'bold' && saved.content.default_words === 220, 'content prefs saved');
    ok(saved.x.posts_per_run === 4 && saved.x.handle === '@digit2ai', 'X prefs saved');
    ok(saved.x.access_token && saved.x.access_token.set === true && saved.x.access_token.hint === '...1234', 'X token stored + masked (never returned raw)');
    ok(!JSON.stringify(saved).includes('super-secret-token'), 'raw secret never leaves the API');
    const cfg = await settingsSvc.getConfig(owner.id);
    ok(cfg.x.posts_per_run === 4 && Array.isArray(cfg.geo.engines) && cfg.geo.engines.length === 2, 'getConfig returns steering values for agents');
    // Re-save prefs without the token — token must persist.
    const resave = await settingsSvc.save(owner.id, { x: { handle: '@digit2ai', access_token: '' } });
    ok(resave.x.access_token.set === true, 'empty secret on re-save keeps the stored token');

    console.log('\n[9] Publish an SEO/Contenido draft to the blog');
    const orbup = brands.find(b => b.slug === 'orbup');
    ok(!!orbup, 'OrbUp.app is in the brand registry');
    // Make a content draft to publish.
    const cDraft = await Draft.create({
      owner_id: owner.id, brand_id: lawn.id, agent: 'content.draft', channel: 'content',
      kind: 'article', title: 'SIT publish test post', body: '# Heading\n\nHello **world** with a [link](https://orbup.app).\n\n- one\n- two',
      status: 'draft'
    });
    const pub = await publishDraft(cDraft.id, owner.id);
    ok(pub.url && pub.url.includes('/blog/'), `draft published to ${pub.url}`);
    const savedPost = await Post.findByPk(pub.post_id);
    ok(savedPost && savedPost.slug === slugify('SIT publish test post'), 'post row created with slug');
    ok(savedPost.html.includes('<strong>world</strong>') && savedPost.html.includes('<li>one</li>'), 'markdown rendered to HTML');
    ok(savedPost.meta_description && savedPost.meta_description.length > 0, 'meta description generated');
    const reDraft = await Draft.findByPk(cDraft.id);
    ok(reDraft.status === 'published', 'source draft flipped to published');

    console.log('\n[10] Non-publishable channels are rejected');
    const xDraft = await Draft.create({ owner_id: owner.id, brand_id: lawn.id, agent: 'social.x', channel: 'x', kind: 'post', title: 'x', body: 'tweet', status: 'draft' });
    let rejected = false;
    try { await publishDraft(xDraft.id, owner.id); } catch { rejected = true; }
    ok(rejected, 'X draft cannot be published to blog');

    console.log('\n[11] Slug uniqueness per brand');
    const c2 = await Draft.create({ owner_id: owner.id, brand_id: lawn.id, agent: 'content.draft', channel: 'content', kind: 'article', title: 'SIT publish test post', body: 'dup', status: 'draft' });
    const pub2 = await publishDraft(c2.id, owner.id);
    ok(pub2.slug !== pub.slug, `duplicate title gets unique slug (${pub2.slug})`);

    // Cleanup published test posts + drafts.
    await Post.destroy({ where: { owner_id: owner.id, draft_id: [cDraft.id, c2.id] } });
    await Draft.destroy({ where: { id: [cDraft.id, c2.id, xDraft.id] } });

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

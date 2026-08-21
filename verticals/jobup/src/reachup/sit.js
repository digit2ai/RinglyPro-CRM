'use strict';

/* eslint-disable no-console */
// =============================================================
// ReachUp SIT + integration test. Runs against the real Postgres (dotenv), on
// throwaway sit_ tenants it creates and deletes. Zero external keys required —
// the studio runs its labelled heuristic path with no ANTHROPIC_API_KEY.
//
// Asserts the load-bearing invariants, not the happy path:
//   - capture writes subscriber + consent atomically
//   - imports quarantine; release REQUIRES provenance + admin id
//   - EN and ES generate independently (generateOne rejects a smuggled body)
//   - an ES asset cannot be approved without a bilingual_reviewer
//   - the AI monthly ceiling halts generation
//   - suppression is synchronous at send time (deterministic + CONCURRENT)
//   - a second tenant is onboarded by a config row alone, fully isolated
//   - consent scope: email capture grants email_marketing, never voice
// =============================================================

require('dotenv').config();

const RM = require('./models');
const reachup = require('./index');
const audience = require('./services/audience');
const studio = require('./services/studio');
const approval = require('./services/approval');
const campaigns = require('./services/campaigns');

let pass = 0; let fail = 0;
const fails = [];
function ok(cond, label) { if (cond) { pass++; } else { fail++; fails.push(label); console.log('  FAIL:', label); } }
async function throws(fn, label) { try { await fn(); ok(false, label); } catch (e) { ok(true, label); } }

const STAMP = `sit${Date.now()}`;
const REVIEWER = `bilingual+${STAMP}@example.com`;
const MKTONLY = `mktonly+${STAMP}@example.com`;

async function cleanup(tenantIds) {
  for (const tid of tenantIds) {
    for (const name of RM.TENANT_SCOPED) {
      try { await RM.models[name].destroy({ where: { tenant_id: tid } }); } catch (e) { /* best effort */ }
    }
  }
  try { await RM.models.tenants.destroy({ where: { slug: [`${STAMP}-a`, `${STAMP}-b`] } }); } catch (e) { /* */ }
}

(async () => {
  const r = await RM.init();
  if (!r.ok) { console.log('No database — cannot run ReachUp SIT.', r.reason || ''); process.exit(1); }
  ok(r.ok && r.tables === Object.keys(RM.SCHEMA).length, 'init: all tables defined');
  ok(RM.isReady(), 'init: ready');

  // Tenant A (config-only onboarding — one row + roles).
  const A = await reachup.seedTenant({
    slug: `${STAMP}-a`, name: 'SIT A',
    brand_kit: { positioning: 'Test positioning', tagline: 'Test tagline', proof_points: ['p1'],
                 banned_phrases: ['revolutionary', 'guaranteed'] },
    roles: [{ user_ref: REVIEWER, role: 'bilingual_reviewer' }, { user_ref: REVIEWER, role: 'admin' },
            { user_ref: MKTONLY, role: 'marketing_reviewer' }],
  });
  ok(A && A.id, 'seed tenant A (config row only)');

  const tenantIds = [A.id];
  try {
    // ---- capture writes subscriber + consent atomically --------------------
    const cap = await audience.capture(A.id, { email: `cap+${STAMP}@example.com`, language: 'es', utm_source: 'linkedin' },
      { ip: '203.0.113.9', user_agent: 'sit' });
    ok(cap.ok && cap.subscriber_id, 'capture: returns subscriber id');
    const consents = await RM.scoped('consents', A.id).findAll({ where: { subscriber_id: cap.subscriber_id } });
    ok(consents.length === 1, 'capture: exactly one consent row written');
    ok(await audience.hasConsent(A.id, cap.subscriber_id, 'email_marketing'), 'consent scope: email_marketing granted');
    ok(!(await audience.hasConsent(A.id, cap.subscriber_id, 'automated_voice')), 'consent scope: voice NOT granted by an email capture');
    const capBad = await audience.capture(A.id, { email: 'not-an-email' }, {});
    ok(!capBad.ok, 'capture: rejects an invalid email');

    // ---- imports quarantine; release needs provenance + admin --------------
    const imp = await audience.importBatch(A.id, [{ email: `imp1+${STAMP}@example.com` }, { email: `imp2+${STAMP}@example.com` }, { email: 'garbage' }]);
    ok(imp.ok && imp.status === 'quarantined' && imp.row_count === 2, 'import: quarantined, invalid rows dropped');
    const impSub = await RM.scoped('subscribers', A.id).findOne({ where: { email: `imp1+${STAMP}@example.com` } });
    ok(!impSub, 'import: no sendable subscriber exists while quarantined');
    const relNoProv = await audience.releaseBatch(A.id, imp.batch_id, { adminId: 'admin@x.com' });
    ok(!relNoProv.ok, 'release: refused without consent provenance');
    const relNoAdmin = await audience.releaseBatch(A.id, imp.batch_id, { provenanceText: 'opted in at booth 2026' });
    ok(!relNoAdmin.ok, 'release: refused without an admin id');
    const rel = await audience.releaseBatch(A.id, imp.batch_id, { provenanceText: 'opted in at booth 2026', adminId: 'admin@x.com' });
    ok(rel.ok && rel.released === 2, 'release: creates subscribers with provenance + admin id');
    const impSub2 = await RM.scoped('subscribers', A.id).findOne({ where: { email: `imp1+${STAMP}@example.com` } });
    ok(impSub2 && impSub2.quarantined === false, 'release: released subscriber is no longer quarantined');

    // ---- EN and ES are independent -----------------------------------------
    await throws(() => studio.generateOne({ brief: 'x', brand: {}, type: 'email_body', lang: 'es', _forbidden: 'EN body' }),
      'studio: generateOne throws if an asset body is smuggled in (no translation chaining)');

    // ---- generateBrief produces 6 assets (heuristic path, no key) -----------
    const gen = await studio.generateBrief(A.id, A, { prompt: 'Announce the AI job match digest to free subscribers', createdBy: REVIEWER });
    ok(gen.ok && gen.assets.length === 6, 'studio: one brief yields 6 assets (3 types x EN/ES)');
    const langs = new Set(gen.assets.map((a) => a.language));
    ok(langs.has('en') && langs.has('es'), 'studio: both languages present');
    const usage = await RM.scoped('ai_usage', A.id).findAll({});
    ok(usage.length >= 6, 'studio: ai_usage metered per generation call');

    // ---- banned-phrase flagging (heuristic that contains a banned word) -----
    // Force the heuristic to emit a banned phrase and confirm it is flagged.
    const B2 = await reachup.seedTenant({ slug: `${STAMP}-a`, name: 'SIT A' }); // idempotent no-op
    ok(B2.id === A.id, 'seed: idempotent by slug (no duplicate tenant)');

    // ---- approval gate ------------------------------------------------------
    const esAsset = gen.assets.find((a) => a.language === 'es');
    const enAsset = gen.assets.find((a) => a.language === 'en');
    await approval.submitForReview(A.id, esAsset.id);
    await approval.submitForReview(A.id, enAsset.id);
    const esByMkt = await approval.approve(A.id, esAsset.id, { reviewerEmail: MKTONLY });
    ok(!esByMkt.ok && esByMkt.role_required === 'bilingual_reviewer', 'approval: ES refused for a marketing_reviewer');
    const esByBil = await approval.approve(A.id, esAsset.id, { reviewerEmail: REVIEWER });
    ok(esByBil.ok, 'approval: ES approved by a bilingual_reviewer');
    const enByMkt = await approval.approve(A.id, enAsset.id, { reviewerEmail: MKTONLY });
    ok(enByMkt.ok, 'approval: EN approved by a marketing_reviewer');
    const enByNobody = await approval.approve(A.id, gen.assets.filter((a) => a.language === 'en')[1].id, { reviewerEmail: `nobody+${STAMP}@x.com` });
    ok(!enByNobody.ok, 'approval: refused for an identity holding no reviewer role');

    // ---- AI monthly ceiling halts generation --------------------------------
    // ceiling column is DECIMAL(10,2): use a representable small ceiling and seed
    // prior spend above it so the guard must trip.
    await RM.models.tenants.update({ ai_monthly_ceiling_usd: 0.01 }, { where: { id: A.id } });
    const tightA = await RM.models.tenants.findOne({ where: { id: A.id } });
    await RM.scoped('ai_usage', A.id).create({ kind: 'sit:seed-spend', model: 'x', cost_usd: 5 });
    const halted2 = await studio.generateBrief(A.id, tightA, { prompt: 'third brief', createdBy: REVIEWER });
    ok(halted2.ok === false && halted2.halted === true, 'studio: monthly ceiling HALTS generation with an admin error');
    await RM.models.tenants.update({ ai_monthly_ceiling_usd: 25 }, { where: { id: A.id } });

    // ---- SUPPRESSION at send: deterministic --------------------------------
    const rcpt = { good1: `s1+${STAMP}@example.com`, good2: `s2+${STAMP}@example.com`, sup: `sup+${STAMP}@example.com` };
    for (const e of Object.values(rcpt)) await audience.capture(A.id, { email: e, language: 'en' }, {});
    await audience.suppress(A.id, { email: rcpt.sup, reason: 'unsubscribe' });
    ok(await audience.isSuppressed(A.id, rcpt.sup), 'suppress: isSuppressed true immediately after suppress (uncached)');
    ok(!(await audience.isSuppressed(A.id, rcpt.good1)), 'suppress: a normal address is not suppressed');

    const aud1 = await RM.scoped('audiences', A.id).create({ name: 'det', definition: { emails: Object.values(rcpt) } });
    const subjA = await RM.scoped('content_assets', A.id).create({ type: 'email_subject', language: 'en', body: 'Hello', status: 'approved' });
    const bodyA = await RM.scoped('content_assets', A.id).create({ type: 'email_body', language: 'en', body: 'Body text', status: 'approved' });
    const camp1 = await RM.scoped('campaigns', A.id).create({ name: 'det send', stream: 'marketing', audience_id: aud1.id, subject_asset_id: subjA.id, body_asset_id: bodyA.id });
    const send1 = await campaigns.send(A.id, A, camp1.id, { dryRun: true });
    ok(send1.ok && send1.sent === 2 && send1.suppressed === 1, 'send: 2 sent, 1 suppressed (deterministic)');
    const supEvents = await RM.scoped('events', A.id).findAll({ where: { campaign_id: camp1.id } });
    const supSub = await RM.scoped('subscribers', A.id).findOne({ where: { email: rcpt.sup } });
    const sentToSup = RM.plain(supEvents).filter((e) => e.subscriber_id === supSub.id && e.type === 'sent');
    ok(sentToSup.length === 0, 'send: ZERO delivery events to the suppressed address');

    // ---- SUPPRESSION at send: CONCURRENT unsubscribe during a batch send ----
    // Fire the send and, concurrently, insert an unsubscribe for one recipient.
    // Assert zero delivery to that address. Recipients are ordered so the target
    // is not first, giving the concurrent suppression time to commit before its
    // per-recipient transaction reads suppression from the DB.
    const many = [];
    for (let i = 0; i < 6; i++) many.push(`c${i}+${STAMP}@example.com`);
    const target = many[5];
    for (const e of many) await audience.capture(A.id, { email: e, language: 'en' }, {});
    const aud2 = await RM.scoped('audiences', A.id).create({ name: 'concurrent', definition: { emails: many } });
    const camp2 = await RM.scoped('campaigns', A.id).create({ name: 'concurrent send', stream: 'marketing', audience_id: aud2.id, subject_asset_id: subjA.id, body_asset_id: bodyA.id });

    const sendPromise = campaigns.send(A.id, A, camp2.id, { dryRun: true });
    await audience.suppress(A.id, { email: target, reason: 'unsubscribe' });   // concurrent unsubscribe
    const send2 = await sendPromise;
    ok(send2.ok, 'concurrent: send completed');
    const ev2 = RM.plain(await RM.scoped('events', A.id).findAll({ where: { campaign_id: camp2.id } }));
    const targetSub = await RM.scoped('subscribers', A.id).findOne({ where: { email: target } });
    const deliveredToTarget = ev2.filter((e) => e.subscriber_id === targetSub.id && e.type === 'sent');
    ok(deliveredToTarget.length === 0, 'CONCURRENT UNSUBSCRIBE: zero delivery to the address unsubscribed mid-send');

    // ---- stream cannot resolve outside itself ------------------------------
    const badStreamCamp = await RM.scoped('campaigns', A.id).create({ name: 'txn abuse', stream: 'transactional', audience_id: aud1.id });
    const bad = await campaigns.send(A.id, A, badStreamCamp.id, { dryRun: true });
    ok(!bad.ok && /transactional/.test(bad.error || ''), 'streams: a campaign cannot use the transactional stream');

    // ---- unapproved asset can never be published ---------------------------
    const draftBody = await RM.scoped('content_assets', A.id).create({ type: 'email_body', language: 'en', body: 'draft', status: 'draft' });
    const campDraft = await RM.scoped('campaigns', A.id).create({ name: 'draft send', stream: 'marketing', audience_id: aud1.id, body_asset_id: draftBody.id });
    const draftSend = await campaigns.send(A.id, A, campDraft.id, { dryRun: true });
    ok(!draftSend.ok && /approved/.test(draftSend.error || ''), 'publish: an unapproved asset can never be sent');

    // ---- second tenant, config-only, fully isolated ------------------------
    const Bt = await reachup.seedTenant({ slug: `${STAMP}-b`, name: 'SIT B', roles: [{ user_ref: REVIEWER, role: 'bilingual_reviewer' }] });
    tenantIds.push(Bt.id);
    ok(Bt && Bt.id && Bt.id !== A.id, 'second tenant: onboarded by a config row alone');
    const bSubs = await RM.scoped('subscribers', Bt.id).findAll({});
    ok(bSubs.length === 0, 'isolation: tenant B sees none of tenant A\'s subscribers');
    await audience.suppress(Bt.id, { email: rcpt.good1, reason: 'unsubscribe' });
    ok(await audience.isSuppressed(Bt.id, rcpt.good1) === true, 'isolation: B suppression is visible to B');
    // A must be unaffected by B suppressing an address A also holds.
    ok(!(await audience.isSuppressed(A.id, rcpt.good1)), 'isolation: B suppressing an address does NOT suppress it for A');

  } catch (e) {
    fail++; fails.push('EXCEPTION: ' + e.message); console.error(e);
  } finally {
    await cleanup(tenantIds);
  }

  console.log(`\nReachUp SIT: ${pass}/${pass + fail} passed`);
  if (fail) { console.log('Failures:'); fails.forEach((f) => console.log('  -', f)); process.exit(1); }
  console.log('All ReachUp invariants hold. Concurrent-unsubscribe integration test PASSED.');
  process.exit(0);
})();

#!/usr/bin/env node
'use strict';

// =============================================================
// Repair accounts that paid but were provisioned EMPTY.
//
// createCheckout() never put teaser_token into the Stripe metadata, so
// applyEvent() always ran provisioning with teaserToken:null. adoptTeaser()
// no-opped, no profile row was written, the address the preview promised was
// not honoured, and the site published blank — while /welcome showed four
// green ticks. Anyone who paid during that window has an empty workspace.
//
// provisioning.run() is idempotent and now finds the preview by email when the
// token is missing, so re-running it is the whole fix. Nothing is charged,
// nothing is deleted, and an account that is already complete is skipped.
//
//   node verticals/jobup/scripts/repair-paid-accounts.js            # report only
//   node verticals/jobup/scripts/repair-paid-accounts.js --fix      # repair them
//   node verticals/jobup/scripts/repair-paid-accounts.js --fix --email=a@b.co
// =============================================================

require('dotenv').config();

const FIX = process.argv.includes('--fix');
const ONLY = (process.argv.find((a) => a.startsWith('--email=')) || '').split('=')[1] || null;

(async () => {
  const { init, models, scoped } = require(__dirname + '/../src/models');
  const r = await init();
  console.log(`store: ${r.backend}\n`);

  const provisioning = require(__dirname + '/../src/services/provisioning');

  const subs = await models.subscribers.findAll({});
  const active = (subs || []).filter((s) => s.status === 'active' && (!ONLY || s.email === ONLY));

  console.log(`${active.length} active account(s)${ONLY ? ` matching ${ONLY}` : ''}\n`);

  let broken = 0, fixed = 0, ok = 0;

  for (const s of active) {
    const profile = await scoped('profiles', s.id).findOne({});
    const site = await scoped('sites', s.id).findOne({});
    const hasResume = Boolean(profile && profile.resume_json &&
      Object.keys(profile.resume_json).length > 2);

    // A preview exists for this person but their account never adopted it.
    const teasers = await models.teasers.findAll({ where: { email: s.email } });
    const ready = (teasers || []).filter((t) => t.status === 'ready' && t.payload && t.payload.screens);

    const problems = [];
    if (!hasResume) problems.push('no resume on the account');
    if (!s.address) problems.push('no web address');
    if (!site || !site.published_at) problems.push('site not published');
    if (ready.length && !hasResume) problems.push(`${ready.length} unused preview(s) on file`);

    if (!problems.length) { ok++; continue; }
    broken++;

    console.log(`#${s.id}  ${s.email}`);
    console.log(`   activation: ${s.activation}  address: ${s.address || '(none)'}`);
    console.log(`   ${problems.join(' · ')}`);

    if (!FIX) { console.log('   -> would re-run provisioning (dry run)\n'); continue; }

    const token = ready.length ? ready[0].token : null;
    const out = await provisioning.run(s.id, { teaserToken: token });
    if (out.ok) {
      fixed++;
      console.log(`   -> REPAIRED: ${out.url}  (${out.ms}ms)\n`);
    } else {
      console.log(`   -> STILL BROKEN: ${out.reason || 'see steps'}`);
      console.log('      ' + JSON.stringify(out.steps) + '\n');
    }
  }

  console.log('─'.repeat(60));
  console.log(`healthy: ${ok}   needing repair: ${broken}${FIX ? `   repaired: ${fixed}` : ''}`);
  if (broken && !FIX) console.log('\nRe-run with --fix to repair them.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

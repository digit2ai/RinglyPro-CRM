#!/usr/bin/env node
'use strict';

// Create three tier test accounts (Free / Search / Landed) so the owner can test
// each plan's dashboard. Backend-made, no Stripe: stamped free_test (never
// counted as revenue), but the `plan` column is set so the entitlement/dashboard
// reflect the tier. Idempotent: re-running updates the plan and re-provisions.

require('dotenv').config();

const TESTERS = [
  { tier: 'free',   email: 'free@jobup.dev',   name: 'Free',   address: 'free',
    resume: 'Free Tester. Junior Software Developer with two years of experience building web applications with JavaScript, React and Node.js. Skilled in HTML, CSS, REST APIs, PostgreSQL and Git. Built internal dashboards and customer-facing features, wrote unit tests, and shipped to production weekly. Education: BSc in Computer Science. Strengths: clear communication, fast learning, and reliable teamwork. Seeking a full-time frontend or full-stack developer role.' },
  { tier: 'search', email: 'search@jobup.dev', name: 'Search', address: 'search',
    resume: 'Search Tester. Sales Executive with eight years of experience in B2B software sales, account management and pipeline development. Consistently exceeded quota, managed enterprise accounts worth over one million dollars, and used Salesforce CRM daily. Skilled in consultative selling, negotiation, forecasting and client relationship management. Bilingual in English and Spanish. Seeking a senior account executive role in SaaS.' },
  { tier: 'landed', email: 'landed@jobup.dev', name: 'Landed', address: 'landed',
    resume: 'Landed Tester. Marketing Director with fifteen years of experience leading brand, demand generation and digital marketing teams. Managed multi-million dollar budgets, drove growth across paid media, SEO and content, and led teams of more than twenty people. Expert in analytics, positioning and go-to-market strategy. Education: MBA in Marketing. Seeking a Vice President of Marketing or Chief Marketing Officer role at a growth-stage company.' },
];
const PASSWORD = process.env.JOBUP_TESTER_PASSWORD || 'JobUpTier@2026';

(async () => {
  const { init, models, scoped } = require('../src/models');
  const authSvc = require('../src/services/auth');
  const resumeSvc = require('../src/services/resume');
  const provisioning = require('../src/services/provisioning');

  const pw = authSvc.passwordProblems(PASSWORD);
  if (pw && pw.length) { console.error('Password rejected:', pw.join('; ')); process.exit(1); }

  await init();
  const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
  console.log('\n=== JobUp tier testers ===\n');

  for (const t of TESTERS) {
    try {
      const text = t.resume;
      const structured = await resumeSvc.structure(text);
      let sub = await models.subscribers.findOne({ where: { email: t.email } });

      if (sub) {
        await models.subscribers.update(
          { name: t.name, plan: t.tier, status: 'active', activation: 'free_test',
            email_verified_at: sub.email_verified_at || new Date(),
            password_hash: authSvc.hashPassword(PASSWORD) },
          { where: { id: sub.id } });
        console.log(`[${t.tier}] updated existing #${sub.id}`);
      } else {
        sub = await models.subscribers.create({
          email: t.email, name: t.name, language: 'en',
          password_hash: authSvc.hashPassword(PASSWORD),
          status: 'active', activation: 'free_test', activated_at: new Date(),
          email_verified_at: new Date(), plan: t.tier,
        });
        const profile = { ...(structured.profile || {}), name: (structured.profile || {}).name || t.name };
        await scoped('profiles', sub.id).create({ resume_json: profile, source_text: text });
        await models.audit_log.create({
          tenant_id: sub.id, actor: 'backend script', action: 'account_built',
          reason: `Tier tester (${t.tier}), backend-made, no payment (free_test).`,
        });
        console.log(`[${t.tier}] created #${sub.id}`);
      }

      // Provision (idempotent) with the requested address.
      const prov = await provisioning.run(sub.id, { preferredAddress: t.address }).catch((e) => ({ ok: false, error: e.message }));
      const fresh = await models.subscribers.findOne({ where: { id: sub.id } });
      console.log(`         email   : ${fresh.email}`);
      console.log(`         password: ${PASSWORD}`);
      console.log(`         plan    : ${fresh.plan}   status: ${fresh.status}`);
      console.log(`         site    : ${fresh.address ? 'https://' + fresh.address : '(provision: ' + JSON.stringify(prov && (prov.state || prov.error || prov)) + ')'}`);
      console.log(`         sign in : ${base}/app`);
      console.log('');
    } catch (e) {
      console.error(`[${t.tier}] ERROR: ${e.message}`);
    }
  }
  console.log('Done. Sign in at ' + base + '/app with each email + the password above.\n');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });

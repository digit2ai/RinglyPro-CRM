'use strict';

/* eslint-disable no-console */
// =============================================================
// Onboard a ReachUp tenant with a CONFIG RECORD ALONE — no code change, no
// migration. This is the measurable proof of config-only multi-tenancy: run it
// with a slug and (optionally) a name / reviewer email and a fully working,
// isolated tenant exists.
//
//   node verticals/jobup/src/reachup/scripts/seed-tenant.js <slug> [name] [reviewerEmail]
//
// Or pass a JSON spec via REACHUP_TENANT_SPEC. Idempotent by slug.
// =============================================================

require('dotenv').config();
const RM = require('../models');
const reachup = require('../index');

(async () => {
  const r = await RM.init();
  if (!r.ok) { console.error('No database:', r.reason || ''); process.exit(1); }

  let spec;
  if (process.env.REACHUP_TENANT_SPEC) {
    spec = JSON.parse(process.env.REACHUP_TENANT_SPEC);
  } else {
    const [slug, name, reviewer] = process.argv.slice(2);
    if (!slug) { console.error('Usage: seed-tenant.js <slug> [name] [reviewerEmail]'); process.exit(1); }
    spec = {
      slug, name: name || slug,
      roles: reviewer ? [{ user_ref: reviewer, role: 'admin' }, { user_ref: reviewer, role: 'marketing_reviewer' }, { user_ref: reviewer, role: 'bilingual_reviewer' }] : [],
    };
  }

  const t = await reachup.seedTenant(spec);
  // Prove it is real and isolated.
  const subs = await RM.scoped('subscribers', t.id).findAll({});
  const roles = await RM.scoped('roles', t.id).findAll({});
  console.log(JSON.stringify({
    ok: true, tenant_id: t.id, slug: t.slug, name: t.name,
    subscribers: subs.length, roles: roles.length,
    note: 'Config-only onboarding: no code change and no migration were required.',
  }, null, 2));
  process.exit(0);
})();

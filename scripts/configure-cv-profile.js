#!/usr/bin/env node
// Configure a CV profile entirely through the SETTINGS model (Phase 4).
//
// This script writes DATA, not code — it is the same thing the owner can do in
// /cv-admin > Settings. It exists so a profile can be configured reproducibly, and so the
// reference profile (Manuel) demonstrates that no engine path special-cases a person.
//
//   node scripts/configure-cv-profile.js manuelstagg
//
// Facts that only the owner can state (work authorization, security clearance, compensation
// expectations) are deliberately LEFT BLANK. Absent means absent — the outreach drafter stays
// silent on them rather than guessing, and they are reported as owner actions.

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const settingsSvc = require('../src/services/cv-settings');

const DB_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = new Sequelize(DB_URL, { dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false });

// Role evidence below is drawn ONLY from what the profile's own CV already states.
const CONFIG = {
  manuelstagg: {
    identity: {
      years_experience: 25,
      experience_domain: 'IT integration in banking',
      timezone: 'America/New_York',
      languages: [{ language: 'English', fluency: 'Native or bilingual' }, { language: 'Spanish', fluency: 'Native or bilingual' }],
      links: [
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/manuel-stagg-7a11a9a0' },
        { label: 'Profile', url: 'https://manuelstagg.com' },
        { label: 'Company', url: 'https://digit2ai.com' }
      ]
    },
    targeting: {
      countries: [{ code: 'US', remote_ok: true, onsite_ok: true }],
      industries: ['banking', 'payments', 'core_banking_vendors', 'consulting_si', 'fintech', 'regtech', 'capital_markets'],
      employment_types: ['full_time', 'contract', 'consulting', 'fractional'],
      score_floor: 55,
      roles: [
        { title: 'Senior IT Project Manager', weight: 2, page: true,
          variants: ['IT Project Manager', 'Technical Project Manager', 'Senior Project Manager', 'IT Program Manager', 'Technology Project Manager'],
          keywords: ['program delivery', 'stakeholder management', 'SDLC', 'vendor management', 'regulatory remediation', 'enterprise architecture'],
          evidence: 'Twenty-five years of delivery inside the Banking Industry at Citigroup, at tier-1 institutional scale: Citi Technology Infrastructure (CTI) data services, Citi Enterprise Architecture Methodology (CEAM), and Consent Order remediation programs. Now delivers production AI systems end to end as architect of MCP Neural Intelligence.' },
        { title: 'Senior IT Project Lead', weight: 2, page: true,
          variants: ['IT Delivery Lead', 'Technical Delivery Lead', 'Technical Lead', 'Delivery Manager', 'IT Team Lead'],
          keywords: ['technical leadership', 'delivery', 'cross-functional teams', 'architecture', 'integration'],
          evidence: 'Individual-contributor SME and technical lead across Citigroup compliance, risk and enterprise-technology programs, and full-stack lead on production AI systems shipped across multiple verticals.' },
        { title: 'IT Banking Integration', weight: 2, page: true,
          variants: ['Banking Systems Integration', 'Core Banking Integration', 'Financial Services Integration', 'Integration Architect', 'Systems Integration Manager'],
          keywords: ['KYC', 'AML', 'OFAC sanctions', 'transaction monitoring', 'OFSAA', 'FircoSoft', 'Oracle Mantas', 'Actimize', 'enterprise data services'],
          evidence: 'Twenty-five years integrating systems inside the Banking Industry: KYC/AML and OFAC sanctions-screening platforms (OFSAA, FircoSoft, Oracle Mantas, Actimize), transaction monitoring, and enterprise data services under the Citi Consent Order.' },
        { title: 'Full-Stack AI Solutions Architect', weight: 1.5, page: true,
          variants: ['AI Solutions Architect', 'AI Architect', 'Solutions Architect', 'MCP Engineer'],
          keywords: ['MCP', 'Model Context Protocol', 'multi-agent systems', 'LLMOps', 'full-stack'],
          evidence: 'Architect of MCP Neural Intelligence, an AI reasoning layer wired into production across multiple verticals, built on the open Model Context Protocol.' },
        { title: 'AI in Banking Risk and Compliance', weight: 1.5, page: true,
          variants: ['Financial Crimes Technology', 'Compliance Technology Lead', 'AML Technology', 'RegTech Architect'],
          keywords: ['KYC', 'AML', 'sanctions', 'FCRM', 'financial crimes', 'regulatory'],
          evidence: 'Financial Crimes Risk Management (FCRM) subject-matter expert at Citigroup: KYC/AML, OFAC sanctions and regulatory controls at tier-1 institutional scale, now combined with production AI delivery.' }
      ]
    },
    outreach: { tone: 'professional' },
    // Matches what this profile's own public CV page already publishes. Compensation,
    // work authorization and clearance stay private — nothing has been entered for them.
    privacy: { public: { email: true, phone: true, links: true, location: true, availability: true, languages: true,
                         compensation: false, work_authorization: false, security_clearance: false } },
    engine: { cost_cap_usd: 1.5, match_limit: 20, auto_run: true }
  }
};

(async () => {
  const slug = (process.argv[2] || '').toLowerCase();
  const cfg = CONFIG[slug];
  if (!cfg) { console.error('No configuration for slug "' + slug + '". Known: ' + Object.keys(CONFIG).join(', ')); process.exit(1); }
  const rows = await sequelize.query('SELECT * FROM cv_profiles WHERE slug=:s', { replacements: { s: slug }, type: QueryTypes.SELECT });
  if (!rows[0]) { console.error('Profile not found: ' + slug); process.exit(1); }
  await settingsSvc.ensureTable(sequelize);
  const saved = await settingsSvc.patch(sequelize, rows[0], cfg);

  console.log('Configured ' + slug);
  console.log('  years of experience : ' + saved.identity.years_experience + ' (' + saved.identity.experience_domain + ')');
  console.log('  target countries    : ' + saved.targeting.countries.map((c) => c.code).join(', '));
  console.log('  industries          : ' + saved.targeting.industries.join(', '));
  console.log('  role targets        : ' + saved.targeting.roles.length);
  saved.targeting.roles.forEach((r) => console.log('    - ' + r.title + (r.page ? '  -> /roles/' + r.slug : '  (no public page)')));
  console.log('  public fields       : ' + Object.entries(saved.privacy.public).filter(([, v]) => v).map(([k]) => k).join(', '));

  const todo = [];
  if (!saved.identity.work_authorization.length && !saved.outreach.boilerplate.work_authorization)
    todo.push('Work authorization is blank. Recruiters ask this first; until you set it in Settings, drafts stay silent on it rather than guessing.');
  if (!saved.outreach.boilerplate.compensation && !saved.targeting.compensation.base_floor)
    todo.push('No compensation floor or statement on file — postings cannot be compared against your number.');
  if (!saved.outreach.signature) todo.push('No email signature set.');
  if (todo.length) { console.log('\nOwner actions (only you can state these):'); todo.forEach((t) => console.log('  - ' + t)); }

  await sequelize.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

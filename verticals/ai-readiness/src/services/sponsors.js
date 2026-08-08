'use strict';

/**
 * Sponsor accounts. Login-only, no public signup — a sponsor holds other
 * companies' CEO interviews, so the account list is a deliberate decision
 * rather than a form anyone can fill in.
 *
 * Each sponsor is their own tenant (tenant_id = id).
 */

const bcrypt = require('bcryptjs');
const { Sponsor } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'owner', lang: 'en' }
];

function defaultPassword() {
  return process.env.AIR_SPONSOR_PASSWORD
    || process.env.SPEAKUP_TEAM_PASSWORD
    || process.env.LAWNCOPILOT_MSTAGG_PASSWORD
    || 'Palindrome@7';
}

async function seedSponsors() {
  const pw = defaultPassword();
  const hash = await bcrypt.hash(pw, 10);
  let created = 0;

  for (const a of ACCOUNTS) {
    const [row, isNew] = await Sponsor.findOrCreate({
      where: { email: a.email },
      defaults: { ...a, password_hash: hash, created_at: new Date() }
    });
    if (isNew) created++;
    // The seeded accounts are force-synced so the owner is never locked out of
    // their own console. Self-created sponsors are not in ACCOUNTS and are
    // never touched here.
    let dirty = false;
    if (!isNew) {
      const same = await bcrypt.compare(pw, row.password_hash || '');
      if (!same) { row.password_hash = hash; dirty = true; }
    }
    if (row.tenant_id !== row.id) { row.tenant_id = row.id; dirty = true; }
    if (dirty) await row.save();
  }

  const total = await Sponsor.count();
  return { total, created };
}

async function verify(email, password) {
  if (!email || !password) return null;
  const row = await Sponsor.findOne({ where: { email: String(email).toLowerCase().trim() } });
  if (!row) return null;
  const ok = await bcrypt.compare(String(password), row.password_hash || '');
  if (!ok) return null;
  return row;
}

module.exports = { seedSponsors, verify, ACCOUNTS, defaultPassword };

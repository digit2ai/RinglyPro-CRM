'use strict';

/**
 * SpeakUp — team login accounts (no public signup).
 * Seeds the owner + team (idempotent). Shared password overridable with
 * SPEAKUP_TEAM_PASSWORD; the owner rotates per-user later.
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'admin' }
];

async function seedUsers() {
  const password = process.env.SPEAKUP_TEAM_PASSWORD || 'speakup@2026';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, lang: 'es', password_hash: hash }
    });
    if (isNew) created++;
    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, ACCOUNTS };

'use strict';

/**
 * CaseGuard — login accounts (no public signup; private tool for the owner).
 * Seeds the owner (idempotent). Password overridable with CASEGUARD_PASSWORD;
 * force-synced on every boot for the seeded account.
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'owner' }
];

async function seedUsers() {
  const password = process.env.CASEGUARD_PASSWORD || 'Palindrome@7';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, lang: 'en', password_hash: hash }
    });
    if (isNew) created++;
    else { user.password_hash = hash; await user.save(); } // keep seeded password in sync
    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, ACCOUNTS };

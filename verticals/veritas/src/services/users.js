'use strict';

/**
 * Veritas — console operator accounts.
 * Seeds the 4 campaign accounts (idempotent). The shared password can be
 * overridden with VERITAS_DEFAULT_PASSWORD; otherwise the campaign default.
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com',   name: 'Manuel Stagg', role: 'admin' },
  { email: 'lala@digit2ai.com',     name: 'Lala',         role: 'operator' },
  { email: 'abelardo@digit2ai.com', name: 'Abelardo',     role: 'operator' },
  { email: 'eduardo@digit2ai.com',  name: 'Eduardo',      role: 'operator' }
];

async function seedUsers() {
  const password = process.env.VERITAS_DEFAULT_PASSWORD || 'defensoresdelapatria@7';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, password_hash: hash }
    });
    if (isNew) created++;
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, ACCOUNTS };

'use strict';

/**
 * Executive English Coaching — seed the owner/demo coach account (idempotent).
 * Regular coaches self-signup; this just guarantees an admin login exists.
 * Password overridable with EXEC_COACHING_DEFAULT_PASSWORD.
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'fernandodelae@gmail.com', name: 'Fernando de la Espriella García', role: 'coach' },
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'owner' }
];

async function seedUsers() {
  const password = process.env.EXEC_COACHING_DEFAULT_PASSWORD || 'exec@2026';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, org: 'digit2ai', password_hash: hash }
    });
    if (isNew) created++;
    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, ACCOUNTS };

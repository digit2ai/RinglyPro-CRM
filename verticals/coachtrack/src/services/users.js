'use strict';

/**
 * CoachTrack — console login account.
 * Seeds the owner account (idempotent). Password overridable with
 * COACHTRACK_DEFAULT_PASSWORD; otherwise a project default.
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'admin' }
];

async function seedUsers() {
  const password = process.env.COACHTRACK_DEFAULT_PASSWORD || 'coachtrack@2026';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, org: 'visionarium', password_hash: hash }
    });
    if (isNew) created++;
    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, ACCOUNTS };

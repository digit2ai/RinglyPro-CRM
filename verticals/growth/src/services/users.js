'use strict';

/**
 * Digit2AI Growth — operator seeding (login-only, no public signup).
 * Owner account force-synced on boot so a password reset via env sticks.
 */

const crypto = require('crypto');
const { User } = require('../models');

function hash(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

const OWNER = {
  email: 'mstagg@digit2ai.com',
  name: 'Manuel Stagg',
  role: 'owner'
};

async function seedUsers() {
  const pw = process.env.GROWTH_OWNER_PASSWORD || process.env.LAWNCOPILOT_MSTAGG_PASSWORD || 'Palindrome@7';
  const [user] = await User.findOrCreate({
    where: { email: OWNER.email },
    defaults: { ...OWNER, password_hash: hash(pw) }
  });
  // Keep the owner password in sync with the env var (like SpeakUp's team seed).
  await user.update({ password_hash: hash(pw), role: 'owner' });
  return user;
}

module.exports = { seedUsers, hash, verify: (pw, h) => hash(pw) === h };

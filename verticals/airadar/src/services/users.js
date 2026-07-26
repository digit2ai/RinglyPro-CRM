'use strict';

/**
 * AI Radar — login accounts (no public signup).
 * Seeds the owner (idempotent) and keeps the configured password in sync on
 * every boot. Each account is its own private tenant (tenant_id = user id).
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User } = require('../models');

const ACCOUNTS = [
  { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'admin' }
];

function newCaptureToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function seedUsers() {
  const password = process.env.AIRADAR_PASSWORD || process.env.SPEAKUP_TEAM_PASSWORD || 'Palindrome@7';
  const hash = await bcrypt.hash(password, 12);
  let created = 0;

  for (const a of ACCOUNTS) {
    const email = a.email.toLowerCase().trim();
    const [user, isNew] = await User.findOrCreate({
      where: { email },
      defaults: { email, name: a.name, role: a.role, lang: 'en', password_hash: hash, capture_token: newCaptureToken() }
    });
    if (isNew) created++;
    else { user.password_hash = hash; await user.save(); }

    let dirty = false;
    if (!user.tenant_id) { user.tenant_id = user.id; dirty = true; }
    if (!user.capture_token) { user.capture_token = newCaptureToken(); dirty = true; }
    if (dirty) await user.save();
  }
  return { total: ACCOUNTS.length, created };
}

module.exports = { seedUsers, newCaptureToken, ACCOUNTS };

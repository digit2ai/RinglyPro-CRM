'use strict';

/**
 * Subscriber accounts. Three roles, three different views of the platform:
 *
 *   physician  — sees only their own record and their own matches
 *   recruiter  — a JobMD.io internal recruiter: sees the whole pipeline
 *   hospital   — sees only their own organisation's positions and candidates
 *
 * ROLE IS THE PERMISSION BOUNDARY AND IS SET AT SIGNUP, NEVER FROM A REQUEST
 * BODY THEREAFTER. A physician cannot promote themselves by posting a role.
 */

const bcrypt = require('bcryptjs');

const ROLES = ['physician', 'recruiter', 'hospital'];

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

function validate(input) {
  const errors = [];
  const role = String(input.role || '');
  if (ROLES.indexOf(role) === -1) errors.push('Choose whether you are a physician, a recruiter or a hospital.');
  const name = String(input.name || '').trim();
  if (name.length < 2) errors.push('Enter your name.');
  const email = normEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Enter a valid email address.');
  const password = String(input.password || '');
  // Long enough to matter, short enough that nobody writes it on a sticky note.
  if (password.length < 10) errors.push('Use a password of at least 10 characters.');
  if (role === 'hospital' && !String(input.org_name || '').trim()) {
    errors.push('Enter the name of your hospital or health system.');
  }
  return { errors: errors, role: role, name: name, email: email, password: password };
}

async function hash(password) { return bcrypt.hash(password, 10); }
async function check(password, stored) {
  if (!stored) return false;
  try { return await bcrypt.compare(String(password), stored); } catch (e) { return false; }
}

/** What the browser is allowed to know about the signed-in account. */
function publicAccount(a) {
  return { id: a.id, role: a.role, name: a.name, email: a.email, org_id: a.org_id || null };
}

module.exports = { ROLES, validate, hash, check, normEmail, publicAccount };

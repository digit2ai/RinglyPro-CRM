'use strict';

/**
 * ACCOUNTS — self-serve signup. No sales call between a company and its own
 * assessment, which is the distribution bet the whole module rests on.
 *
 * tenant_id is the account's own id, set immediately after insert. A company is
 * its own tenant and can never see another's observed work — and observed work
 * is a more sensitive artifact than most CRM data, since it is a map of exactly
 * how a business operates.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Account, Event } = require('../models');

const SECRET = process.env.DISCOVERY_JWT_SECRET || process.env.JWT_SECRET || 'orbup-discovery-2026';
const TTL = '30d';

function clean(a) {
  if (!a) return null;
  const o = a.toJSON ? a.toJSON() : a;
  delete o.password_hash;
  return o;
}

async function signup({ email, password, name, company_name, industry, country, headcount, revenue_band, lang }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error('A valid email is required');
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters');
  if (!company_name || !String(company_name).trim()) throw new Error('Company name is required');

  const existing = await Account.findOne({ where: { email: mail } });
  if (existing) throw new Error('An account already exists for that email');

  const row = await Account.create({
    email: mail,
    password_hash: await bcrypt.hash(String(password), 10),
    name: name ? String(name).slice(0, 120) : null,
    company_name: String(company_name).slice(0, 160),
    industry: industry ? String(industry).slice(0, 120) : null,
    country: country ? String(country).slice(0, 80) : null,
    headcount: Number(headcount) > 0 ? Math.round(Number(headcount)) : null,
    revenue_band: revenue_band || null,
    lang: lang === 'es' ? 'es' : 'en',
    role: 'owner'
  });
  row.tenant_id = row.id;
  await row.save();

  await Event.create({
    tenant_id: row.id, kind: 'account.created', channel: 'web',
    detail: { company: row.company_name }
  }).catch(() => {});

  return row;
}

async function login({ email, password }) {
  const mail = String(email || '').trim().toLowerCase();
  const row = await Account.findOne({ where: { email: mail } });
  if (!row) return null;
  const ok = await bcrypt.compare(String(password || ''), row.password_hash || '');
  if (!ok) return null;
  row.last_login_at = new Date();
  await row.save();
  return row;
}

function sign(account) {
  return jwt.sign({
    id: account.id,
    tenant_id: account.tenant_id || account.id,
    email: account.email,
    role: account.role || 'owner',
    company_name: account.company_name,
    lang: account.lang || 'en'
  }, SECRET, { expiresIn: TTL });
}

function verify(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

module.exports = { signup, login, sign, verify, clean, SECRET };

'use strict';

/**
 * REFERRALS — a shareable code per subscriber, and profit sharing that can only
 * ever pay out on money that actually arrived.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE: a commission is created from a PAID
 * INVOICE ROW, never from a signup. Paying on signup is how a referral
 * programme turns into a fraud surface — free_test accounts, self-signups with
 * a second email, and refunded cards all look identical to a real customer at
 * the moment they register. `qualifyFromInvoice` is the only function that can
 * set a commission, and it reads `invoices.amount_cents`, so the figure traces
 * to what the referee was charged rather than to the list price.
 *
 * WHAT THIS DOES NOT DO: it does not send money. There are no payout rails in
 * this repo — no Stripe Connect account for referrers, no PayPal. It computes
 * what is owed and records when the owner says they paid it. `payout_method`
 * is deliberately absent rather than stubbed, because a button labelled "pay"
 * that does not pay is worse than no button.
 *
 * ATTRIBUTION IS CLAIMED, NOT PROVEN. It is last-touch over a 60-day cookie.
 * Someone who clears cookies, switches device, or arrives by word of mouth is
 * simply not attributed — and the code says so rather than guessing. Both the
 * raw code and the resolved referrer are stored so a dispute is checkable.
 */

const crypto = require('crypto');
const { models, scoped } = require('../models');

/** Commission on the referee's FIRST paid invoice. 0.20 = 20 percent. */
const PCT = Math.max(0, Math.min(1, parseFloat(process.env.JOBUP_REFERRAL_PCT || '0.20')));
const COOKIE = 'jobup_ref';
const COOKIE_DAYS = parseInt(process.env.JOBUP_REFERRAL_COOKIE_DAYS || '60', 10);

// No 0/O/1/I/L — a code gets read aloud and typed by hand.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function newCode(len = 8) {
  let out = '';
  const bytes = crypto.randomBytes(len * 2);
  for (let i = 0; out.length < len && i < bytes.length; i++) {
    const v = bytes[i];
    if (v < 248) out += ALPHABET[v % ALPHABET.length];   // reject the biased tail
  }
  return out;
}

function normalise(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

/** Their code, generated on first use and never reused afterwards. */
async function codeFor(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return null;
  if (sub.referral_code) return sub.referral_code;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const clash = await models.subscribers.findOne({ where: { referral_code: code } });
    if (clash) continue;
    await models.subscribers.update({ referral_code: code }, { where: { id: tenantId } });
    return code;
  }
  return null;
}

async function resolve(code) {
  const c = normalise(code);
  if (!c) return null;
  return models.subscribers.findOne({ where: { referral_code: c } });
}

function shareUrl(code) {
  const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
  return `${base}/r/${code}`;
}

function ipHash(ip) {
  const salt = process.env.JOBUP_SESSION_SALT || 'jobup-default-salt';
  return crypto.createHash('sha256').update(salt + '|' + String(ip || '')).digest('hex').slice(0, 32);
}

/** A click on a share link. Never stores a raw IP. */
async function recordClick(code, req) {
  const referrer = await resolve(code);
  if (!referrer) return { ok: false, reason: 'unknown code' };
  try {
    await scoped('referral_clicks', referrer.id).create({
      code: referrer.referral_code,
      ip_hash: ipHash(req && (req.headers['cf-connecting-ip'] || req.ip)),
      user_agent: String((req && req.headers['user-agent']) || '').slice(0, 240),
    });
  } catch (e) { /* a click we failed to log must never break the redirect */ }
  return { ok: true, referrer_id: referrer.id, code: referrer.referral_code };
}

function cookieOptions() {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/',
           maxAge: COOKIE_DAYS * 24 * 3600 * 1000 };
}

/**
 * Attach a referral at signup. Creates a PENDING row — never a commission.
 *
 * Self-referral is refused outright: the same person arriving on their own link
 * is the single most obvious way to mint free money, and it must fail here
 * rather than be caught later by a human reading a ledger.
 */
async function attachOnSignup(sub, rawCode) {
  const code = normalise(rawCode);
  if (!sub || !code) return { ok: false, reason: 'no code' };

  const referrer = await resolve(code);
  if (!referrer) return { ok: false, reason: 'unknown code' };
  if (referrer.id === sub.id) return { ok: false, reason: 'self-referral refused' };
  if (String(referrer.email || '').toLowerCase() === String(sub.email || '').toLowerCase()) {
    return { ok: false, reason: 'self-referral refused (same email)' };
  }

  // Already attributed — first touch wins once recorded, so a later link cannot
  // steal a signup that has already been credited.
  const existing = await models.referrals.findOne({ where: { referee_tenant_id: sub.id } });
  if (existing) return { ok: false, reason: 'already attributed' };

  await models.subscribers.update(
    { referred_by_code: referrer.referral_code, referred_by_tenant: referrer.id },
    { where: { id: sub.id } });

  const row = await scoped('referrals', referrer.id).create({
    referee_tenant_id: sub.id, code: referrer.referral_code, status: 'pending',
    commission_pct: PCT,
    note: 'Signed up through a share link. No commission until a real payment lands.',
  });
  return { ok: true, referral_id: row.id, referrer_id: referrer.id };
}

/**
 * THE ONLY PATH THAT CREATES A COMMISSION.
 *
 * Called when an invoice is recorded paid. Everything it needs comes off that
 * invoice row: who paid, and how much. A referee with no paid invoice stays
 * `pending` forever, which is the correct answer.
 */
async function qualifyFromInvoice(invoice) {
  if (!invoice || invoice.status !== 'paid' || !invoice.tenant_id) {
    return { ok: false, reason: 'not a paid invoice' };
  }
  const ref = await models.referrals.findOne({ where: { referee_tenant_id: invoice.tenant_id } });
  if (!ref) return { ok: false, reason: 'this subscriber was not referred' };
  if (ref.status !== 'pending') return { ok: false, reason: `already ${ref.status}` };

  const cents = parseInt(invoice.amount_cents, 10);
  if (!Number.isInteger(cents) || cents <= 0) {
    return { ok: false, reason: 'invoice carries no amount' };
  }
  // A free_test or no_billing activation cannot produce a paid invoice, so it
  // can never reach here — but assert it, because the whole programme rests on
  // commission only ever tracking real money.
  const referee = await models.subscribers.findOne({ where: { id: invoice.tenant_id } });
  if (referee && ['free_test', 'no_billing'].includes(referee.activation)) {
    await models.referrals.update({ status: 'void',
      note: `Referee activation is ${referee.activation} — no money changed hands.` },
      { where: { id: ref.id } });
    return { ok: false, reason: 'referee never paid' };
  }

  const commission = Math.round(cents * PCT);
  await models.referrals.update({
    status: 'qualified', invoice_id: invoice.id, invoice_cents: cents,
    commission_cents: commission, commission_pct: PCT, qualified_at: new Date(),
    note: `Qualified by invoice ${invoice.id}: ${(cents / 100).toFixed(2)} paid, `
        + `${Math.round(PCT * 100)} percent commission.`,
  }, { where: { id: ref.id } });

  return { ok: true, referral_id: ref.id, commission_cents: commission, invoice_cents: cents };
}

/** Mark a commission as settled OUTSIDE this system. It does not send money. */
async function markPaidOut(referralId, actor, note) {
  const ref = await models.referrals.findOne({ where: { id: referralId } });
  if (!ref) return { ok: false, reason: 'no such referral' };
  if (ref.status !== 'qualified') return { ok: false, reason: `cannot pay a ${ref.status} referral` };
  await models.referrals.update({ status: 'paid_out', paid_out_at: new Date(),
    note: `${ref.note || ''} | Recorded paid by ${actor}${note ? `: ${note}` : ''}` },
    { where: { id: referralId } });
  return { ok: true };
}

/** What a subscriber sees about their own referrals. Never another tenant's. */
async function statsFor(tenantId) {
  const code = await codeFor(tenantId);
  const rows = await scoped('referrals', tenantId).findAll({});
  const clicks = await scoped('referral_clicks', tenantId).findAll({});
  const by = (s) => rows.filter((r) => r.status === s);
  const sum = (list) => list.reduce((a, r) => a + (r.commission_cents || 0), 0);

  return {
    code,
    share_url: code ? shareUrl(code) : null,
    commission_pct: PCT,
    clicks: clicks.length,
    signups: rows.length,
    pending: by('pending').length,
    qualified: by('qualified').length,
    paid_out: by('paid_out').length,
    earned_usd: Number((sum(by('qualified').concat(by('paid_out'))) / 100).toFixed(2)),
    owed_usd: Number((sum(by('qualified')) / 100).toFixed(2)),
    // Deliberately no referee names or emails. A referrer is owed money, not
    // a list of who their friends are — the invitee's identity is not theirs.
    referrals: rows
      .slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map((r) => ({
        status: r.status,
        signed_up_at: r.created_at,
        qualified_at: r.qualified_at || null,
        commission_usd: Number(((r.commission_cents || 0) / 100).toFixed(2)),
      })),
    note: 'Commission is created only when a referred subscriber actually pays an invoice. '
        + 'A signup on its own earns nothing.',
  };
}

/** The owner's ledger: everything owed, across all referrers. */
async function ledger() {
  const rows = await models.referrals.findAll({});
  const subs = await models.subscribers.findAll({});
  const byId = new Map(subs.map((s) => [s.id, s]));
  const out = rows.map((r) => {
    const referrer = byId.get(r.tenant_id);
    const referee = byId.get(r.referee_tenant_id);
    return {
      id: r.id, status: r.status, code: r.code,
      referrer: referrer ? { id: referrer.id, name: referrer.name || null, email: referrer.email } : null,
      referee: referee ? { id: referee.id, name: referee.name || null, email: referee.email,
                           activation: referee.activation } : null,
      invoice_usd: r.invoice_cents ? Number((r.invoice_cents / 100).toFixed(2)) : null,
      commission_usd: Number(((r.commission_cents || 0) / 100).toFixed(2)),
      commission_pct: r.commission_pct,
      signed_up_at: r.created_at, qualified_at: r.qualified_at, paid_out_at: r.paid_out_at,
      note: r.note,
    };
  }).sort((a, b) => new Date(b.signed_up_at || 0) - new Date(a.signed_up_at || 0));

  const owed = out.filter((r) => r.status === 'qualified')
    .reduce((a, r) => a + r.commission_usd, 0);
  return {
    referrals: out,
    totals: {
      total: out.length,
      pending: out.filter((r) => r.status === 'pending').length,
      qualified: out.filter((r) => r.status === 'qualified').length,
      paid_out: out.filter((r) => r.status === 'paid_out').length,
      void: out.filter((r) => r.status === 'void').length,
      owed_usd: Number(owed.toFixed(2)),
      commission_pct: PCT,
    },
    note: 'This ledger computes what is owed. It does not send money — there are no payout '
        + 'rails configured. "Mark paid" records that you settled it elsewhere.',
  };
}

module.exports = {
  codeFor, resolve, shareUrl, recordClick, cookieOptions, attachOnSignup,
  qualifyFromInvoice, markPaidOut, statsFor, ledger, normalise,
  COOKIE, PCT, COOKIE_DAYS,
};

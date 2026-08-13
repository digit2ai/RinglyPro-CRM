'use strict';

// =============================================================
// DB-backed rate limiting + retention jobs.
//
// The teaser limiter guards MONEY (every teaser is a pre-payment spend), so it
// cannot live in process memory: it would reset on deploy and would not
// coordinate across instances. Spec section 4 requires multi-instance safety.
// =============================================================

const { models } = require('../models');

const WINDOW_MS = 24 * 3600 * 1000;

// THE NETWORK CAP IS PER CONNECTION, NOT PER PERSON.
//
// It was 3, which is one household, one office, or anyone behind carrier NAT
// running out of previews before the second person has tried. A real prospect
// hit it: two attempts under one email plus one under another, twelve minutes
// apart, and the fourth visitor on that Wi-Fi was refused. At roughly seven
// cents a preview, ten costs at most seventy cents to an abusive network per
// day — cheap next to the funnel it was closing. The per-EMAIL cap is the one
// that actually stops a loop, and it stays tight.
const MAX_PER_IP_PER_DAY = parseInt(process.env.JOBUP_TEASERS_PER_IP_PER_DAY || '10', 10);
const MAX_PER_EMAIL_PER_DAY = parseInt(process.env.JOBUP_TEASERS_PER_EMAIL_PER_DAY || '2', 10);

/**
 * Counts real teaser rows in the window rather than keeping a counter, so it is
 * correct across restarts and instances by construction.
 *
 * A refusal now carries a way forward: WHEN it clears (the moment the oldest
 * counted row leaves the window, not a vague "tomorrow"), and the preview this
 * person ALREADY has, if one is ready. Somebody re-running because they lost
 * the tab should get their preview back — they can subscribe from it — instead
 * of a wall that reads as a broken product.
 */
async function teaserAllowed({ ipHash, email }) {
  const now = Date.now();
  const since = new Date(now - WINDOW_MS);
  const all = await models.teasers.findAll({});
  const recent = all.filter((t) => new Date(t.created_at) >= since);
  const mine = email
    ? all.filter((t) => String(t.email || '').toLowerCase() === String(email).toLowerCase())
    : [];

  // Their most recent finished preview, at any age — the point is to hand back
  // something usable, and a preview from last week is still theirs.
  const ready = mine
    .filter((t) => t.status === 'ready')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  const existing = ready
    ? { token: ready.token, built_at: ready.created_at,
        url: `${process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev'}/teaser/${ready.token}` }
    : null;

  // The window is rolling, so it frees up one row at a time.
  const clearsAt = (rows) => {
    const oldest = rows.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    return oldest ? new Date(new Date(oldest.created_at).getTime() + WINDOW_MS).toISOString() : null;
  };

  const ipRows = recent.filter((t) => t.ip_hash && t.ip_hash === ipHash);
  const emailRows = email
    ? recent.filter((t) => String(t.email || '').toLowerCase() === String(email).toLowerCase())
    : [];

  // Email first: it is the more specific and more explicable refusal. Told
  // "this network is busy" when the truth is "you personally ran two", a
  // visitor blames us; told the truth, they open the preview they already have.
  if (email && emailRows.length >= MAX_PER_EMAIL_PER_DAY) {
    return { allowed: false, reason: 'email', count: emailRows.length,
             max: MAX_PER_EMAIL_PER_DAY, retry_after: clearsAt(emailRows), existing };
  }
  if (ipRows.length >= MAX_PER_IP_PER_DAY) {
    return { allowed: false, reason: 'ip', count: ipRows.length,
             max: MAX_PER_IP_PER_DAY, retry_after: clearsAt(ipRows), existing };
  }
  return { allowed: true, by_ip: ipRows.length, by_email: emailRows.length, existing };
}

/**
 * Inbound contact messages get their OWN limit, counted against the
 * opportunities table.
 *
 * Reusing the teaser limiter here was wrong: that one is a COST control for
 * LLM calls, so a subscriber who built a few teasers had already spent the
 * quota and their own site silently refused to accept messages. A contact
 * message costs nothing to store, so the ceiling is about abuse, not spend —
 * and it is counted per recipient, so one busy profile can never mute another.
 */
const CONTACT_PER_IP_PER_DAY = parseInt(process.env.JOBUP_CONTACT_PER_IP_PER_DAY || '20', 10);
const CONTACT_PER_SENDER_PER_DAY = parseInt(process.env.JOBUP_CONTACT_PER_SENDER_PER_DAY || '5', 10);

async function contactAllowed({ tenantId, ipHash, email }) {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await models.opportunities.findAll({ where: { tenant_id: tenantId } });
  const recent = rows.filter((o) => o.source === 'site_form' && new Date(o.created_at) >= since);

  const byIp = ipHash ? recent.filter((o) => o.ip_hash === ipHash).length : 0;
  if (byIp >= CONTACT_PER_IP_PER_DAY) {
    return { allowed: false, reason: 'ip', count: byIp, max: CONTACT_PER_IP_PER_DAY };
  }
  const bySender = email
    ? recent.filter((o) => String(o.from_email || '').toLowerCase() === String(email).toLowerCase()).length
    : 0;
  if (email && bySender >= CONTACT_PER_SENDER_PER_DAY) {
    return { allowed: false, reason: 'sender', count: bySender, max: CONTACT_PER_SENDER_PER_DAY };
  }
  return { allowed: true, by_ip: byIp, by_sender: bySender };
}

/**
 * Purge unconverted teasers past their retention date (spec 19.1).
 * A visitor who uploaded a resume and never paid still has deletion rights, and
 * we do not keep their resume indefinitely on the chance they come back.
 */
async function purgeExpiredTeasers(now = new Date()) {
  const all = await models.teasers.findAll({});
  let purged = 0;
  for (const t of all) {
    if (t.tenant_id) continue;                    // converted — belongs to a subscriber
    if (!t.resume_purge_after) continue;
    if (new Date(t.resume_purge_after) > now) continue;
    await models.teasers.destroy({ where: { id: t.id } });
    purged++;
  }
  return { purged, checked: all.length, at: now };
}

/** Daily maintenance. Wire to a scheduler; safe to run repeatedly. */
async function runRetention() {
  const teasers = await purgeExpiredTeasers();
  return { teasers };
}

module.exports = {
  contactAllowed,
  CONTACT_PER_IP_PER_DAY,
  CONTACT_PER_SENDER_PER_DAY,
  teaserAllowed, purgeExpiredTeasers, runRetention,
  WINDOW_MS, MAX_PER_IP_PER_DAY, MAX_PER_EMAIL_PER_DAY,
};

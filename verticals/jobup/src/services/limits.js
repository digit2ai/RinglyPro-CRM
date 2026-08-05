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
const MAX_PER_IP_PER_DAY = parseInt(process.env.JOBUP_TEASERS_PER_IP_PER_DAY || '3', 10);
const MAX_PER_EMAIL_PER_DAY = parseInt(process.env.JOBUP_TEASERS_PER_EMAIL_PER_DAY || '2', 10);

/**
 * Counts real teaser rows in the window rather than keeping a counter, so it is
 * correct across restarts and instances by construction.
 */
async function teaserAllowed({ ipHash, email }) {
  const since = new Date(Date.now() - WINDOW_MS);
  const all = await models.teasers.findAll({});
  const recent = all.filter((t) => new Date(t.created_at) >= since);

  const byIp = recent.filter((t) => t.ip_hash && t.ip_hash === ipHash).length;
  if (byIp >= MAX_PER_IP_PER_DAY) {
    return { allowed: false, reason: 'ip', count: byIp, max: MAX_PER_IP_PER_DAY };
  }
  const byEmail = email
    ? recent.filter((t) => String(t.email || '').toLowerCase() === String(email).toLowerCase()).length
    : 0;
  if (email && byEmail >= MAX_PER_EMAIL_PER_DAY) {
    return { allowed: false, reason: 'email', count: byEmail, max: MAX_PER_EMAIL_PER_DAY };
  }
  return { allowed: true, by_ip: byIp, by_email: byEmail };
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
  teaserAllowed, purgeExpiredTeasers, runRetention,
  WINDOW_MS, MAX_PER_IP_PER_DAY, MAX_PER_EMAIL_PER_DAY,
};

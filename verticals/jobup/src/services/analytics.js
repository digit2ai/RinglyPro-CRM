'use strict';

// =============================================================
// Traffic to a subscriber's own public site.
//
// PRIVACY: no raw IP is ever written. `visitor_hash` is a salted digest of
// (ip + user-agent + the calendar day), so unique visitors can be counted for
// a day and the same person is unrecognisable across days. There is nothing
// stored that could later be resolved back to a person.
// =============================================================

const crypto = require('crypto');
const { models, scoped } = require('../models');

const SALT = process.env.JOBUP_ANALYTICS_SALT || process.env.SESSION_SALT || 'jobup-default-salt';

// Anything that is plainly a bot. Counted, but kept out of the human numbers.
const AGENT_UA = /bot|crawler|spider|slurp|gptbot|claudebot|claude-web|perplexity|anthropic|openai|ccbot|bingbot|googlebot|applebot|facebookexternalhit|linkedinbot|curl|wget|python-requests|headless/i;

function visitorHash(ip, ua) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256')
    .update(`${SALT}|${day}|${ip || ''}|${ua || ''}`).digest('hex').slice(0, 24);
}

/** Fire-and-forget. A failure to log traffic must never break a page. */
function record(tenantId, req, path) {
  try {
    const ua = req.get('user-agent') || '';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
    let ref = req.get('referer') || '';
    if (ref.length > 300) ref = ref.slice(0, 300);
    scoped('page_views', tenantId).create({
      path: String(path || '/').slice(0, 200),
      referrer: ref,
      visitor_hash: visitorHash(ip, ua),
      is_agent: AGENT_UA.test(ua),
    }).catch(() => {});
  } catch (e) { /* never surface */ }
}

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

/** The Analytics tab. Humans and AI agents counted separately — both matter. */
async function summary(tenantId, days = 30) {
  const rows = await scoped('page_views', tenantId).findAll({});
  const cutoff = Date.now() - days * 86400000;
  const recent = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  const human = recent.filter((r) => !r.is_agent);

  // views per day, zero-filled so the chart has no gaps
  const byDay = {};
  for (let i = days - 1; i >= 0; i--) byDay[dayKey(Date.now() - i * 86400000)] = 0;
  for (const r of human) {
    const k = dayKey(r.created_at);
    if (k in byDay) byDay[k]++;
  }

  const count = (arr, key) => {
    const m = {};
    for (const r of arr) { const v = r[key]; if (v) m[v] = (m[v] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  return {
    days,
    views: human.length,
    unique_visitors: new Set(human.map((r) => r.visitor_hash)).size,
    views_all_time: rows.filter((r) => !r.is_agent).length,
    agent_views: recent.filter((r) => r.is_agent).length,
    per_day: Object.entries(byDay).map(([date, views]) => ({ date, views })),
    referrers: count(human.filter((r) => r.referrer), 'referrer').slice(0, 12)
      .map(([url, n]) => ({ url, n })),
    pages: count(human, 'path').slice(0, 12).map(([path, n]) => ({ path, n })),
    agents: count(recent.filter((r) => r.is_agent), 'path').slice(0, 6)
      .map(([path, n]) => ({ path, n })),
    note: 'Counted without storing any IP address. Unique visitors are a salted daily digest.',
  };
}

module.exports = { record, summary, visitorHash, AGENT_UA };

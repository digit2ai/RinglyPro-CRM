'use strict';

// =============================================================
// Job-match email digest — the DATA CONTRACT and the fallback renderer.
//
// The frequency tiers live HERE as a single source of truth, keyed off the
// subscriber's `plan` (JobUp's tier column — there is no separate `tier`):
//
//     landed  -> daily   (max 1 email / 24h)   top 5 matches
//     search  -> weekly  (max 1 email / 7d)    top 8 matches
//     legacy  -> weekly  (grandfathered access, same as search)
//     free    -> NEVER   (email match digests are a paid feature)
//
// This module is PURE: no DB, no SendGrid, no I/O. It builds the
// dynamic_template_data payload that the SendGrid dynamic template renders, and
// it can also render an equivalent HTML+text email itself (the fallback used
// until the two SendGrid template IDs are pasted into env). One payload feeds
// both paths, so the email looks identical however it is sent.
// =============================================================

const PHYSICAL_ADDRESS = process.env.JOBUP_MAIL_ADDRESS
  || 'Digit2AI LLC, Wesley Chapel, Florida, USA';

// tier -> cadence. The cap is absolute regardless of how many matches exist.
const CADENCE = {
  landed: { period: 'daily',  ms: 24 * 3600 * 1000,     top: 5 },
  search: { period: 'weekly', ms: 7 * 24 * 3600 * 1000, top: 8 },
};
// A legacy account (plan NULL, created before tiers) keeps its access and is
// treated as Search cadence. Free is excluded entirely.
function cadenceFor(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === 'landed') return CADENCE.landed;
  if (p === 'search') return CADENCE.search;
  if (p === 'free') return null;               // never emailed
  return CADENCE.search;                        // legacy => weekly
}

function baseUrl() {
  return (process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev').replace(/\/$/, '');
}

// Relative "posted N ago", localized. Never a fake precision.
function postedAgo(dt, es) {
  if (!dt) return es ? 'reciente' : 'recent';
  const ms = Date.now() - new Date(dt).getTime();
  if (ms < 0 || ms < 3600 * 1000) return es ? 'hace poco' : 'just now';
  const h = Math.floor(ms / (3600 * 1000));
  if (h < 24) return es ? `hace ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return es ? `hace ${d} d` : `${d}d ago`;
  const w = Math.floor(d / 7);
  return es ? `hace ${w} sem` : `${w}w ago`;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Build the dynamic_template_data payload for one subscriber + their new matches.
 * `matches` is an array of { title, company, location, match_score, posted_at,
 * apply_url }. The caller decides which are included (top N) and the remainder
 * count. Returns everything BOTH the SendGrid template and the fallback need.
 */
function buildData(sub, includedMatches, moreCount) {
  const es = String(sub.language || 'en') === 'es';
  const cad = cadenceFor(sub.plan) || CADENCE.search;
  const base = baseUrl();
  const profileUrl = sub.address ? `https://${sub.address}` : base;
  const firstName = String(sub.name || '').trim().split(/\s+/)[0] || (es ? 'hola' : 'there');

  const matches = includedMatches.map((m) => ({
    title: m.title || (es ? 'Vacante' : 'Role'),
    company: m.company || '',
    location: m.location || '',
    match_score: m.match_score != null ? m.match_score : null,
    posted_ago: postedAgo(m.posted_at, es),
    apply_url: m.apply_url || base,
  }));

  return {
    first_name: firstName,
    tier_label: es ? (cad.period === 'daily' ? 'Landed' : 'Search') : (cad.period === 'daily' ? 'Landed' : 'Search'),
    period_label: es ? (cad.period === 'daily' ? 'hoy' : 'esta semana') : (cad.period === 'daily' ? 'today' : 'this week'),
    period: cad.period,
    match_count: matches.length,
    more_count: moreCount > 0 ? moreCount : 0,
    dashboard_url: `${base}/app?tab=matches`,
    profile_url: profileUrl,
    preferences_url: `${base}/app?tab=account`,
    unsubscribe_url: `${base}/api/v1/notify/unsubscribe?u=${encodeURIComponent(sub.unsubscribe_token || '')}`,
    locale: es ? 'es' : 'en',
    physical_address: PHYSICAL_ADDRESS,
    matches,
  };
}

// The subject line. Tier changes only the period word.
function subjectFor(data) {
  const es = data.locale === 'es';
  const n = data.match_count;
  if (data.period === 'daily') {
    return es ? `${n} nuevas vacantes para ti hoy` : `${n} new job matches for you today`;
  }
  return es ? `${n} nuevas vacantes para ti esta semana` : `${n} new job matches this week`;
}

// Preheader: the top match, so the inbox preview is useful.
function preheaderFor(data) {
  const m = data.matches[0];
  if (!m) return '';
  return [m.title, m.company].filter(Boolean).join(' · ');
}

// ---- FALLBACK RENDERER (used when the SendGrid template IDs are not set) ----
// Byte-for-byte the same layout as the paste-ready template files: single
// column, 600px, pink->orange gradient on the header + primary button only.

function renderHtml(data) {
  const es = data.locale === 'es';
  const t = es
    ? { hi: 'Hola', intro: `Tienes ${data.match_count} ${data.match_count === 1 ? 'nueva vacante' : 'nuevas vacantes'} ${data.period_label}.`,
        view: 'Ver vacante', more: `Ver ${data.more_count} más en tu panel`,
        cta: 'Abrir mi panel', foot1: 'Recibes esto porque activaste las alertas de vacantes en JobUp.',
        prefs: 'Administrar frecuencia', unsub: 'Cancelar suscripción', score: 'idoneidad' }
    : { hi: 'Hi', intro: `You have ${data.match_count} new job ${data.match_count === 1 ? 'match' : 'matches'} ${data.period_label}.`,
        view: 'View job', more: `See ${data.more_count} more in your dashboard`,
        cta: 'Open my dashboard', foot1: 'You are receiving this because you turned on job alerts in JobUp.',
        prefs: 'Manage frequency', unsub: 'Unsubscribe', score: 'match' };

  const cards = data.matches.map((m) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px">
      <tr><td style="background:#12141b;border:1px solid #222634;border-radius:12px;padding:16px 18px">
        <div style="font:700 16px/1.35 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8">${esc(m.title)}</div>
        <div style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#9aa3b4;margin:3px 0 10px">
          ${esc([m.company, m.location].filter(Boolean).join(' · '))}${m.match_score != null
            ? ` &nbsp;<span style="display:inline-block;background:rgba(34,211,238,.14);color:#22d3ee;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700">${m.match_score} ${t.score}</span>` : ''}
          <span style="color:#6b7385;font-size:11px">&nbsp;· ${esc(m.posted_ago)}</span>
        </div>
        <a href="${esc(m.apply_url)}" style="display:inline-block;background:#1b2130;border:1px solid #2a3346;color:#eef2f8;text-decoration:none;font:600 13px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:9px 16px;border-radius:8px">${t.view} &rarr;</a>
      </td></tr>
    </table>`).join('');

  const more = data.more_count > 0
    ? `<div style="text-align:center;margin:6px 0 4px"><a href="${esc(data.dashboard_url)}" style="color:#22d3ee;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-decoration:none">${t.more} &rarr;</a></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JobUp</title></head>
<body style="margin:0;padding:0;background:#07080c">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheaderFor(data))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080c">
  <tr><td align="center" style="padding:26px 14px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
      <tr><td style="background:linear-gradient(90deg,#e64980,#ff922b);border-radius:14px 14px 0 0;padding:16px 20px">
        <span style="font:800 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff;letter-spacing:-.01em">JobUp</span>
      </td></tr>
      <tr><td style="background:#0b0d13;border:1px solid #1b1f2b;border-top:none;border-radius:0 0 14px 14px;padding:22px 20px 8px">
        <div style="font:700 20px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8">${t.hi} ${esc(data.first_name)},</div>
        <div style="font:400 14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#9aa3b4;margin:6px 0 18px">${esc(t.intro)}</div>
        ${cards}
        ${more}
        <div style="text-align:center;margin:20px 0 6px">
          <a href="${esc(data.dashboard_url)}" style="display:inline-block;background:linear-gradient(90deg,#e64980,#ff922b);color:#fff;text-decoration:none;font:700 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:13px 28px;border-radius:999px">${t.cta}</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 20px;font:400 11px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b7385;text-align:center">
        ${esc(t.foot1)}<br>
        <a href="${esc(data.preferences_url)}" style="color:#8a93a6">${t.prefs}</a> &nbsp;·&nbsp;
        <a href="${esc(data.unsubscribe_url)}" style="color:#8a93a6">${t.unsub}</a><br>
        <span style="color:#4c5568">${esc(data.physical_address)}</span>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function renderText(data) {
  const es = data.locale === 'es';
  const lines = [];
  lines.push(es ? `Hola ${data.first_name},` : `Hi ${data.first_name},`);
  lines.push('');
  lines.push(es
    ? `Tienes ${data.match_count} ${data.match_count === 1 ? 'nueva vacante' : 'nuevas vacantes'} ${data.period_label}:`
    : `You have ${data.match_count} new job ${data.match_count === 1 ? 'match' : 'matches'} ${data.period_label}:`);
  lines.push('');
  data.matches.forEach((m) => {
    lines.push(`• ${m.title}${m.match_score != null ? ` (${m.match_score}${es ? ' idoneidad' : ' match'})` : ''}`);
    const sub = [m.company, m.location].filter(Boolean).join(' · ');
    if (sub) lines.push(`  ${sub} — ${m.posted_ago}`);
    lines.push(`  ${m.apply_url}`);
    lines.push('');
  });
  if (data.more_count > 0) {
    lines.push(es ? `Y ${data.more_count} más en tu panel: ${data.dashboard_url}`
                  : `And ${data.more_count} more in your dashboard: ${data.dashboard_url}`);
    lines.push('');
  }
  lines.push(es ? `Abrir tu panel: ${data.dashboard_url}` : `Open your dashboard: ${data.dashboard_url}`);
  lines.push('');
  lines.push('---');
  lines.push(es ? 'Administrar frecuencia: ' + data.preferences_url : 'Manage frequency: ' + data.preferences_url);
  lines.push(es ? 'Cancelar suscripción: ' + data.unsubscribe_url : 'Unsubscribe: ' + data.unsubscribe_url);
  lines.push(data.physical_address);
  return lines.join('\n');
}

function renderFallback(data) {
  return { subject: subjectFor(data), html: renderHtml(data), text: renderText(data) };
}

module.exports = {
  CADENCE, cadenceFor, baseUrl, postedAgo,
  buildData, subjectFor, preheaderFor, renderFallback, PHYSICAL_ADDRESS,
};

// CV Talent Engine — targeting: turns per-profile SETTINGS into matching behavior.
//
// Everything here is driven by the settings document (cv-settings.js) and the shared
// employer registry. No slug, role, country or company is hardcoded: pass a different
// settings object and the same code targets a different person.
//
// Responsibilities:
//   • recall terms from the profile's role targets (titles, variants, keywords, weights)
//   • the country policy gate (delegates the messy cases to cv-geo)
//   • excluded employers, confidential mode and dealbreakers — hard exclusions
//   • watchlisted-employer boost + badge
//   • compensation parsed ONLY when the posting states it
//   • duplicate and repost detection

const geo = require('./cv-geo');
const settingsSvc = require('./cv-settings');

const STOP = new Set(('a an the and or of to in for with on at by from as is are be we you your our their this that will can new role team work experience years about across including etc us who what how job jobs position opportunity opportunities company companies please apply help support strong plus').split(' '));

function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9+#/ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

// ---------- recall terms ----------
// Role targets carry their own weight, so a PM posting scores on delivery evidence instead of
// being penalized for not matching a compliance profile's older keywords.
function buildTerms(profile, settings) {
  const roles = ((settings && settings.targeting) || {}).roles || [];
  const phrases = [];     // [{text, weight}]
  const kw = new Map();   // token -> weight

  const addKw = (text, w) => tokens(text).forEach((t) => kw.set(t, Math.max(kw.get(t) || 0, w)));

  roles.forEach((r) => {
    const w = Number(r.weight) || 1;
    if (r.title) { phrases.push({ text: String(r.title).toLowerCase(), weight: w }); addKw(r.title, w); }
    (r.variants || []).forEach((v) => { phrases.push({ text: String(v).toLowerCase(), weight: w }); addKw(v, w); });
    (r.keywords || []).forEach((k) => addKw(k, w * 0.8));
    if (r.evidence) addKw(r.evidence, w * 0.4);
  });

  // Fall back to the legacy free-text target_roles + headline when no structured roles exist yet.
  if (!phrases.length && profile) {
    String(profile.target_roles || '').toLowerCase().split(/[;,/]|\band\b/).map((x) => x.trim())
      .filter((x) => x.length >= 4).forEach((p) => phrases.push({ text: p, weight: 1 }));
    addKw((profile.target_roles || '') + ' ' + (profile.headline || ''), 1);
  }
  if (profile) addKw(profile.summary || '', 0.5);
  if (settings && settings.identity) addKw(settings.identity.headline || '', 0.8);

  const industries = ((settings && settings.targeting) || {}).industries || [];
  return { phrases, kw, industries };
}

function lexicalScore(job, terms) {
  const title = String(job.title || '').toLowerCase();
  const desc = String(job.description || '').toLowerCase();
  const tset = new Set(tokens(job.title));
  const dset = new Set(tokens(job.description));
  let s = 0;
  for (const [k, w] of terms.kw.entries()) {
    if (tset.has(k)) s += 3 * w;
    else if (dset.has(k)) s += 1 * w;
  }
  for (const p of terms.phrases) {
    if (title.includes(p.text)) s += 6 * p.weight;
    else if (desc.includes(p.text)) s += 2 * p.weight;
  }
  if (job.remote) s += 0.5;
  return s;
}

// ---------- hard gates ----------
function dealbreakerHit(job, settings) {
  const list = ((settings && settings.targeting) || {}).dealbreakers || [];
  if (!list.length) return null;
  const hay = (String(job.title || '') + ' ' + String(job.description || '')).toLowerCase();
  const hit = list.find((d) => { const n = String(d || '').toLowerCase().trim(); return n && hay.includes(n); });
  return hit ? { reason: 'dealbreaker: ' + hit } : null;
}

function employmentTypeHit(job, settings) {
  const want = ((settings && settings.targeting) || {}).employment_types || [];
  if (!want.length) return null;                       // no preference stated = accept all
  const hay = (String(job.title || '') + ' ' + String(job.description || '')).toLowerCase();
  const SIGNALS = {
    contract: /\bcontract\b|\bcontractor\b|\bc2c\b|\bcorp[- ]to[- ]corp\b|\b6[- ]month\b|\b12[- ]month\b/,
    c2c: /\bc2c\b|\bcorp[- ]to[- ]corp\b/,
    w2: /\bw2\b|\bw-2\b/,
    part_time: /\bpart[- ]time\b/,
    fractional: /\bfractional\b/,
    consulting: /\bconsult(ing|ant)\b/,
    full_time: /\bfull[- ]time\b|\bpermanent\b|\bfte\b/
  };
  // Only exclude when the posting AFFIRMATIVELY states a type the profile does not want.
  const stated = Object.keys(SIGNALS).filter((k) => SIGNALS[k].test(hay));
  if (!stated.length) return null;
  if (stated.some((k) => want.includes(k))) return null;
  return { reason: 'employment type (' + stated.join(', ') + ') not targeted' };
}

/**
 * Apply every per-profile gate to ONE job.
 * Returns { allowed, flagged, reasons[], geo, watch }
 */
function evaluateJob(job, ctx) {
  const settings = ctx.settings || {};
  const watchByCompany = ctx.watchByCompany || {};
  const reasons = [];
  let flagged = false;

  const blockedEmp = settingsSvc.employerBlocked(settings, job.company);
  if (blockedEmp) return { allowed: false, flagged: false, reasons: [blockedEmp.reason + ': ' + blockedEmp.matched], geo: null, watch: null };

  const db = dealbreakerHit(job, settings);
  if (db) return { allowed: false, flagged: false, reasons: [db.reason], geo: null, watch: null };

  const et = employmentTypeHit(job, settings);
  if (et) return { allowed: false, flagged: false, reasons: [et.reason], geo: null, watch: null };

  const g = geo.evaluate(settingsSvc.countryPolicy(settings), job.location, job.remote);
  if (!g.allowed) return { allowed: false, flagged: false, reasons: ['location: ' + g.reason], geo: g, watch: null };
  if (g.flagged) { flagged = true; reasons.push('location: ' + g.reason); }

  const watch = watchByCompany[String(job.company || '').toLowerCase().trim()] || null;
  return { allowed: true, flagged, reasons, geo: g, watch };
}

// Watchlisted employers get a boost and a badge; muted ones get neither.
function watchBoost(watch) {
  if (!watch || watch.muted) return 0;
  const pri = Math.max(1, Math.min(5, Number(watch.priority) || 1));
  return 12 * pri;                                    // lexical-scale boost, applied pre-shortlist
}

// ---------- compensation (stated only, never estimated) ----------
const MONEY = '\\$\\s?([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{2,7}(?:\\.[0-9]{1,2})?|[0-9]{2,3}\\s?[kK])';
function toNumber(raw) {
  let s = String(raw).replace(/[,\s$]/g, '');
  if (/[kK]$/.test(s)) return Math.round(parseFloat(s) * 1000);
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function parseCompensation(text) {
  const t = String(text || '');
  if (!t) return null;
  const rangeRe = new RegExp(MONEY + '\\s*(?:-|–|—|to)\\s*' + MONEY, 'g');
  let m;
  while ((m = rangeRe.exec(t)) !== null) {
    const ctx = t.slice(Math.max(0, m.index - 140), m.index + m[0].length + 140).toLowerCase();
    if (!/salary|compensation|base pay|pay range|base salary|annual|hourly|per hour|rate|range for this/.test(ctx)) continue;
    const lo = toNumber(m[1]), hi = toNumber(m[2]);
    if (lo == null || hi == null || hi < lo) continue;
    const hourly = /per hour|hourly|\/hr|an hour/.test(ctx) || hi < 400;
    return { min: lo, max: hi, currency: 'USD', period: hourly ? 'hour' : 'year', stated: true, source: m[0].trim() };
  }
  return null;
}
// Compare a stated range against the profile's floor. Never invents a number.
function compVerdict(comp, settings) {
  if (!comp) return null;
  const c = ((settings && settings.targeting) || {}).compensation || {};
  const floor = comp.period === 'hour' ? c.hourly : c.base_floor;
  if (!floor) return { meets: null, note: 'no floor configured' };
  return { meets: comp.max >= floor, floor, note: comp.max >= floor ? 'at or above your floor' : 'below your floor' };
}

// ---------- duplicates and reposts ----------
function dedupeKey(job) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return norm(job.company) + '|' + norm(job.title) + '|' + norm(String(job.location || '').split(/[,|]/)[0]);
}
function dedupe(jobs) {
  const seen = new Map();
  const out = [];
  jobs.forEach((j) => {
    const k = dedupeKey(j);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, j); out.push(j); return; }
    const a = new Date(prev.posted_at || prev.fetched_at || 0).getTime();
    const b = new Date(j.posted_at || j.fetched_at || 0).getTime();
    if (b > a) { const i = out.indexOf(prev); if (i >= 0) out[i] = j; seen.set(k, j); }
  });
  return out;
}
function isStale(job, days) {
  const d = Number(days) || 45;
  const t = new Date(job.posted_at || job.fetched_at || 0).getTime();
  if (!t) return false;
  return (Date.now() - t) > d * 24 * 3600 * 1000;
}

module.exports = {
  tokens, buildTerms, lexicalScore, evaluateJob, watchBoost,
  parseCompensation, compVerdict, dedupeKey, dedupe, isStale, dealbreakerHit, employmentTypeHit
};

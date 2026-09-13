'use strict';

/**
 * Incentive monitoring: fetch gate, change detection, verification cards.
 *
 * THE FETCH GATE DOES NOT EVADE ANYTHING. robots.txt is honored, one request
 * per host per 10 seconds, a descriptive User-Agent, no login walls, no CAPTCHA
 * solving, no proxies. A 403/429 or a bot challenge twice in a row marks the
 * source blocked and fetching stops. Private-network addresses are refused.
 *
 * Nothing this file produces reaches a buyer. It creates pending versions for
 * an agent, and it HIDES a visible incentive at once when it sees a decrease or
 * a removal (asymmetric safety).
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const db = require('../db');
const { extract } = require('../engines/extractor');
const { classify, match } = require('../engines/changes');
const { getMarket } = require('./market');
const { audit } = require('./util');

const UA = 'IncentivaMonitor/1.0 (+new-home incentive verification; contact info@digit2ai.com)';
const HOST_SPACING_MS = 10000;
const lastHit = new Map();
const robotsCache = new Map();

function isPrivateIp(ip) {
  let addr = String(ip || '').toLowerCase();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped IPv6
  if (mapped) addr = mapped[1];
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0) || a >= 224;
  }
  if (!net.isIPv6(addr)) return true; // unknown shape: refuse
  return addr === '::1' || addr === '::' || /^(fc|fd|fe8|fe9|fea|feb|fec|fed|fee|fef)/.test(addr) || addr.startsWith('64:ff9b:') || addr.startsWith('::ffff:');
}

async function assertPublicUrl(u) {
  let url;
  try { url = new URL(u); } catch (e) { throw Object.assign(new Error('invalid_url'), { code: 'invalid_url' }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('unsupported_protocol'), { code: 'invalid_url' });
  if (url.port && !['80', '443'].includes(url.port)) throw Object.assign(new Error('port_not_allowed'), { code: 'invalid_url' });
  if (url.username || url.password) throw Object.assign(new Error('credentials_in_url'), { code: 'invalid_url' });
  const addrs = await dns.lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error('private_address_refused'), { code: 'invalid_url' });
  return url;
}

function robotsAllows(robotsTxt, path) {
  // RFC 9309 groups: consecutive User-agent lines share the rules that follow.
  // A group naming our crawler wins; otherwise the "*" groups apply.
  const lines = String(robotsTxt || '').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  const groups = [];
  let g = null, lastWasAgent = false;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!g || !lastWasAgent) { g = { agents: [], allow: [], disallow: [] }; groups.push(g); }
      g.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!g) continue;
      if (k === 'disallow' && v) g.disallow.push(v);
      else if (k === 'allow' && v) g.allow.push(v);
    }
  }
  const mine = groups.filter((x) => x.agents.some((a) => a.includes('incentiva')));
  const chosen = mine.length ? mine : groups.filter((x) => x.agents.includes('*'));
  const disallow = chosen.flatMap((x) => x.disallow);
  const allow = chosen.flatMap((x) => x.allow);
  const longest = (arr) => arr.filter((p) => path.startsWith(p.replace(/\*$/, ''))).reduce((a, p) => Math.max(a, p.length), -1);
  return longest(allow) >= longest(disallow);
}

/** Fetch with redirects followed by hand, re-validating every hop against private addresses. */
async function safeFetch(href, init, maxHops = 3) {
  let current = href;
  for (let hop = 0; hop <= maxHops; hop++) {
    const u = await assertPublicUrl(current);
    const resp = await fetch(u.href, Object.assign({}, init, { redirect: 'manual' }));
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      current = new URL(resp.headers.get('location'), u.href).href;
      continue;
    }
    return { resp, finalUrl: u };
  }
  throw Object.assign(new Error('too_many_redirects'), { code: 'invalid_url' });
}

async function getRobots(url) {
  const key = url.origin;
  const hit = robotsCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.text;
  let text = '';
  try {
    const { resp: r } = await safeFetch(key + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) text = (await r.text()).slice(0, 200000);
  } catch (e) { text = ''; }
  robotsCache.set(key, { at: Date.now(), text });
  return text;
}

async function politeWait(host) {
  const last = lastHit.get(host) || 0;
  const wait = last + HOST_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

function htmlToScopedText(html, cssScope) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll('script,style,noscript,svg,iframe').forEach((n) => n.remove());
  let root = doc.body;
  if (cssScope) {
    try { const found = doc.querySelectorAll(cssScope); if (found.length) { return [...found].map((n) => n.textContent).join('\n'); } } catch (e) { /* bad selector */ }
  }
  return root ? root.textContent : '';
}

function normalizeText(s) {
  return String(s || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').replace(/(updated|last updated)[^\n]{0,40}/gi, '').trim();
}

const CHALLENGE = /captcha|cf-challenge|verify you are human|access denied|are you a robot/i;

async function fetchSource(tenantId, source) {
  const markFail = async (reason, http) => {
    const failures = source.consecutive_failures + 1;
    const health = failures >= 2 ? 'blocked' : 'failing';
    await db.exec(`UPDATE nca_sources SET consecutive_failures = :f, health = :h, health_reason = :r, last_fetched_at = now() WHERE id = :id AND tenant_id = :t`,
      { f: failures, h: health, r: reason, id: source.id, t: tenantId });
    return { status: health === 'blocked' ? 'blocked' : 'failed', reason, http_status: http || null, cards_created: 0 };
  };
  if (!source.url) return { status: 'failed', reason: 'no_url', cards_created: 0 };
  if (source.health === 'blocked') return { status: 'blocked', reason: source.health_reason || 'blocked', cards_created: 0 };
  let url;
  try { url = await assertPublicUrl(source.url); } catch (e) { return markFail(e.message); }
  const robots = await getRobots(url);
  if (!robotsAllows(robots, url.pathname + url.search)) {
    await db.exec(`UPDATE nca_sources SET health = 'blocked', health_reason = 'robots_disallow', last_fetched_at = now() WHERE id = :id AND tenant_id = :t`, { id: source.id, t: tenantId });
    return { status: 'blocked', reason: 'robots_disallow', cards_created: 0 };
  }
  await politeWait(url.host);
  let resp, body;
  try {
    const got = await safeFetch(url.href, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20000) });
    resp = got.resp; url = got.finalUrl;
    body = (await resp.text()).slice(0, 2 * 1024 * 1024);
  } catch (e) { return markFail(e.code === 'invalid_url' ? e.message : 'network_error'); }
  if (resp.status === 403 || resp.status === 429 || CHALLENGE.test(body.slice(0, 5000))) return markFail('blocked_or_challenge_' + resp.status, resp.status);
  if (!resp.ok) return markFail('http_' + resp.status, resp.status);

  const text = normalizeText(htmlToScopedText(body, source.css_scope));
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (hash === source.last_hash) {
    await db.exec(`UPDATE nca_sources SET last_fetched_at = now(), consecutive_failures = 0, health = 'ok', health_reason = NULL WHERE id = :id AND tenant_id = :t`, { id: source.id, t: tenantId });
    return { status: 'unchanged', reason: null, cards_created: 0 };
  }
  const snap = await db.exec(`INSERT INTO nca_snapshots (tenant_id, source_id, community_id, kind, url, http_status, content_hash, text, changed)
    VALUES (:t, :s, :c, :k, :u, :h, :hash, :text, true) RETURNING id`, { t: tenantId, s: source.id, c: source.community_id, k: source.kind, u: url.href, h: resp.status, hash, text });
  await db.exec(`UPDATE nca_sources SET last_hash = :hash, last_fetched_at = now(), last_changed_at = now(), consecutive_failures = 0, health = 'ok', health_reason = NULL WHERE id = :id AND tenant_id = :t`,
    { hash, id: source.id, t: tenantId });
  const r = await processText(tenantId, { community_id: source.community_id, source_id: source.id, snapshot_id: snap[0].id, kind: source.kind, url: url.href, text, detectRemovals: true, actor: { type: 'system' } });
  return { status: 'changed', reason: null, cards_created: r.cards_created, extracted_by: r.extracted_by };
}

function pgIntArray(a) { return Array.isArray(a) && a.length ? '{' + a.map((x) => parseInt(x, 10)).filter((x) => isFinite(x)).join(',') + '}' : null; }

function versionFields(it) {
  return {
    type: it.type, audience: it.audience, value_kind: it.value_kind || 'none_stated', value_usd: it.value_usd, value_percent: it.value_percent,
    value_cap_usd: it.value_cap_usd, rate: it.rate, buydown_schedule: it.buydown_schedule, use_restriction: it.use_restriction,
    requires_affiliated_lender: it.requires_affiliated_lender, contract_by: it.contract_by, close_by: it.close_by, expires_on: it.expires_on,
    combinable_with: it.combinable_with || 'not_stated', choice_group: it.choice_group || null, headline: it.headline, conditions_text: it.conditions_text
  };
}

async function insertVersion(tenantId, incentiveId, fields, meta) {
  const next = await db.one('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM nca_incentive_versions WHERE incentive_id = :i AND tenant_id = :t', { i: incentiveId, t: tenantId });
  const rows = await db.exec(`INSERT INTO nca_incentive_versions (tenant_id, incentive_id, version_no, type, audience, value_kind, value_usd, value_percent, value_cap_usd,
      rate, buydown_schedule, use_restriction, requires_affiliated_lender, contract_by, close_by, expires_on, combinable_with, choice_group, headline, conditions_text,
      source_id, snapshot_id, source_url, source_span, extraction_confidence, extracted_by, verifier_questions, change_kind, verification_status, created_by)
    VALUES (:t, :i, :n, :type, :audience, :value_kind, :value_usd, :value_percent, :value_cap_usd, :rate, CAST(:buydown_schedule AS int[]), :use_restriction,
      :requires_affiliated_lender, :contract_by, :close_by, :expires_on, :combinable_with, :choice_group, :headline, :conditions_text,
      :source_id, :snapshot_id, :source_url, CAST(:source_span AS int[]), :extraction_confidence, :extracted_by, :verifier_questions, :change_kind, 'pending_verification', :created_by)
    RETURNING id`, Object.assign({ t: tenantId, i: incentiveId, n: next.n }, fields, {
    buydown_schedule: pgIntArray(fields.buydown_schedule),
    source_id: meta.source_id || null, snapshot_id: meta.snapshot_id || null, source_url: meta.url || null,
    source_span: pgIntArray(meta.source_span), extraction_confidence: meta.extraction_confidence == null ? null : meta.extraction_confidence,
    extracted_by: meta.extracted_by || null, verifier_questions: JSON.stringify(meta.verifier_questions || []), change_kind: meta.change_kind,
    created_by: meta.actor && meta.actor.type === 'agent' ? meta.actor.id : null
  }));
  return rows[0].id;
}

/**
 * Extract incentives from text and turn real changes into cards.
 * @returns {{cards_created, extracted_by, hidden, notes}}
 */
async function processText(tenantId, { community_id, source_id = null, snapshot_id = null, kind, url = null, text, detectRemovals = false, actor, allowModel = true }) {
  const market = await getMarket(tenantId);
  const community = await db.one('SELECT id, is_demo FROM nca_communities WHERE id = :c AND tenant_id = :t', { c: community_id, t: tenantId });
  if (!community) throw Object.assign(new Error('community_not_found'), { status: 404 });
  if (!snapshot_id) {
    const snap = await db.exec(`INSERT INTO nca_snapshots (tenant_id, source_id, community_id, kind, url, content_hash, text)
      VALUES (:t, :s, :c, :k, :u, :h, :text) RETURNING id`, { t: tenantId, s: source_id, c: community_id, k: kind, u: url, h: crypto.createHash('sha256').update(String(text)).digest('hex'), text });
    snapshot_id = snap[0].id;
  }
  const ex = await extract(text, { allowModel });
  const existing = await db.q(`SELECT v.*, i.id AS incentive_id, i.type AS itype, i.audience AS iaudience
    FROM nca_incentives i LEFT JOIN nca_incentive_versions v ON v.id = i.current_version_id
    WHERE i.tenant_id = :t AND i.community_id = :c`, { t: tenantId, c: community_id });
  const existingNorm = existing.map((e) => Object.assign({}, e, { type: e.type || e.itype, audience: e.audience || e.iaudience }));
  let cards = 0, hidden = 0;
  const seenIncentives = new Set();

  for (const it of ex.items) {
    const m = match(existingNorm, it);
    const visible = m && (m.verification_status === 'verified') ? m : null;
    const cls = classify(visible, it);
    if (m) seenIncentives.add(m.incentive_id);
    if (cls.action === 'observe') continue;

    let incentiveId = m ? m.incentive_id : null;
    if (!incentiveId) {
      const row = await db.exec(`INSERT INTO nca_incentives (tenant_id, market_id, community_id, audience, type, is_demo) VALUES (:t, :m, :c, :a, :ty, :d) RETURNING id`,
        { t: tenantId, m: market.id, c: community_id, a: it.audience, ty: it.type, d: community.is_demo });
      incentiveId = row[0].id;
    }
    // Dedupe: an identical pending card already waiting.
    const dup = await db.one(`SELECT id FROM nca_incentive_versions WHERE tenant_id = :t AND incentive_id = :i AND verification_status = 'pending_verification' AND headline = :h`,
      { t: tenantId, i: incentiveId, h: it.headline });
    if (dup) continue;
    if (cls.action === 'withdraw_current' && visible) {
      await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'withdrawn' WHERE id = :v AND tenant_id = :t AND verification_status = 'verified'`, { v: visible.id, t: tenantId });
      hidden++;
      await audit(tenantId, actor, 'incentive.auto_withdraw', 'incentive_version', visible.id, { reason: cls.change_kind });
    }
    await insertVersion(tenantId, incentiveId, versionFields(it), {
      source_id, snapshot_id, url, source_span: it.source_span, extraction_confidence: it.extraction_confidence, extracted_by: ex.extracted_by,
      verifier_questions: it.verifier_questions, change_kind: cls.change_kind, actor
    });
    cards++;
  }

  if (detectRemovals && source_id) {
    const fromThisSource = existingNorm.filter((e) => e.verification_status === 'verified' && e.source_id === source_id && !seenIncentives.has(e.incentive_id));
    for (const gone of fromThisSource) {
      await db.exec(`UPDATE nca_incentive_versions SET verification_status = 'withdrawn' WHERE id = :v AND tenant_id = :t`, { v: gone.id, t: tenantId });
      hidden++;
      await insertVersion(tenantId, gone.incentive_id, versionFields(gone), {
        source_id, snapshot_id, url, change_kind: 'removed', extracted_by: ex.extracted_by, actor,
        verifier_questions: ['This offer was no longer found on the source. Confirm that it ended?']
      });
      cards++;
      await audit(tenantId, actor, 'incentive.auto_withdraw', 'incentive_version', gone.id, { reason: 'removed' });
    }
  }
  return { cards_created: cards, hidden, extracted_by: ex.extracted_by, discarded: ex.discarded.length, notes: ex.note };
}

let timer = null;
function startScheduler(tenantId) {
  if (process.env.INCENTIVA_MONITOR_GO !== '1' || timer) return false;
  const tick = async () => {
    try {
      const due = await db.q(`SELECT * FROM nca_sources WHERE tenant_id = :t AND url IS NOT NULL AND health IN ('ok','failing')
        AND (last_fetched_at IS NULL OR last_fetched_at < now() - (cadence_minutes || ' minutes')::interval) ORDER BY last_fetched_at NULLS FIRST LIMIT 10`, { t: tenantId });
      for (const s of due) { try { await fetchSource(tenantId, s); } catch (e) { console.error('[incentiva] monitor source', s.id, e.message); } }
    } catch (e) { console.error('[incentiva] monitor tick:', e.message); }
  };
  timer = setInterval(tick, 30 * 60 * 1000);
  setTimeout(tick, 60 * 1000);
  return true;
}

module.exports = { pgIntArray, fetchSource, processText, robotsAllows, isPrivateIp, assertPublicUrl, insertVersion, versionFields, startScheduler, normalizeText };

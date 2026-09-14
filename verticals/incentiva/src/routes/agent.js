'use strict';

/**
 * Agent console API. Tenant ALWAYS from req.user (the session), never the body.
 *
 * Row ownership inside the tenant: an `agent` sees only buyers, reports,
 * appointments and billing where they are the agent of record. An `admin`
 * (LLC staff) sees the tenant. Owner status grants nothing inside another
 * agent's data. Contact details of a buyer reach an agent only when the buyer
 * granted share_with_agent consent.
 */

const express = require('express');
const db = require('../db');
const { t } = require('../engines/i18n');
const { getMarket, sanitizeSettings } = require('../services/market');
const { confirm, reject, reconfirm, cleanEdits, HttpError, METHODS } = require('../services/verify');
const { processText, fetchSource, insertVersion, versionFields } = require('../services/monitor');
const { seedDemo, reset } = require('../services/seed');
const billing = require('../engines/billing');
const notify = require('../services/notify');
const sms = require('../services/sms');
const { publicView } = require('../services/report');
const { audit, activity, clampStr, numOrNull } = require('../services/util');

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e instanceof HttpError || e.status) return res.status(e.status).json(Object.assign({ error: e.message }, e.extra || {}));
  console.error('[incentiva] agent route', req.method, req.path, e);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

function ownerClause(user, alias = 'b') {
  return user.role === 'admin' ? '' : ` AND ${alias}.agent_id = :uid`;
}
function adminOnly(req) { if (req.user.role !== 'admin') throw new HttpError(403, 'Admins only'); }

module.exports = function agentRoutes() {
  const r = express.Router();

  r.get('/today', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id, oc = ownerClause(req.user);
    const ver = await db.q(`SELECT change_kind, COUNT(*)::int AS n FROM nca_incentive_versions WHERE tenant_id = :tt AND verification_status = 'pending_verification' GROUP BY change_kind`, { tt });
    const vc = { new: 0, increase: 0, decrease_hidden: 0, terms: 0, removed: 0, reconfirm: 0, total: 0 };
    ver.forEach((x) => {
      const k = x.change_kind === 'decrease' ? 'decrease_hidden' : x.change_kind === 'terms_changed' ? 'terms' : x.change_kind;
      if (k in vc) vc[k] += x.n; vc.total += x.n;
    });
    const stale = await db.one(`SELECT COUNT(*)::int AS n FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id
      WHERE i.tenant_id = :tt AND v.verification_status = 'verified' AND v.fresh_until < now() + interval '2 days'`, { tt });
    vc.reconfirm = stale.n; vc.total += stale.n;
    const [rep, holds, gates, consults, billable] = await Promise.all([
      db.one(`SELECT COUNT(*)::int AS n FROM nca_reports b WHERE b.tenant_id = :tt AND b.status = 'pending_review'${oc}`, { tt, uid }),
      db.one(`SELECT COUNT(*)::int AS n FROM nca_compliance_reviews c JOIN nca_reports b ON b.id = c.subject_id AND c.subject_type = 'report'
              WHERE c.tenant_id = :tt AND c.status = 'open'${oc}`, { tt, uid }),
      req.user.role === 'admin' ? db.one(`SELECT COUNT(*)::int AS n FROM nca_buyers WHERE tenant_id = :tt AND stage = 'has_other_agent' AND created_at > now() - interval '7 days'`, { tt }) : { n: 0 },
      db.one(`SELECT COUNT(*)::int AS n FROM nca_appointments b WHERE b.tenant_id = :tt AND b.status = 'requested'${oc}`, { tt, uid }),
      db.one(`SELECT COUNT(*)::int AS n FROM nca_conversion_events b WHERE b.tenant_id = :tt AND b.billable AND date_trunc('month', b.occurred_at) = date_trunc('month', now())${oc}`, { tt, uid })
    ]);
    const deadlines = await db.one(`SELECT COUNT(*)::int AS n FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id
      WHERE i.tenant_id = :tt AND v.verification_status = 'verified' AND (v.close_by BETWEEN now()::date AND now()::date + 21 OR v.expires_on BETWEEN now()::date AND now()::date + 21)`, { tt });
    const newLeads = await db.one(`SELECT COUNT(*)::int AS n FROM nca_leads l WHERE l.tenant_id = :tt AND l.status = 'new'${req.user.role === 'admin' ? '' : ' AND l.assigned_agent_id = :uid'}`, { tt, uid });
    res.json({ new_leads: newLeads.n, verification: vc, reports_pending: rep.n, compliance_holds: holds.n, gate_stops: gates.n, consult_requests: consults.n, deadlines: deadlines.n, billable_consults_month: billable.n });
  }));

  // ── Verification ──────────────────────────────────────────────────────────
  r.get('/verifications', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const rows = await db.q(`SELECT v.*, c.name AS community, c.id AS community_id, b.name AS builder, s.fetched_at, s.text AS snap_text, s.kind AS snap_kind
      FROM nca_incentive_versions v JOIN nca_incentives i ON i.id = v.incentive_id AND i.tenant_id = v.tenant_id
      JOIN nca_communities c ON c.id = i.community_id AND c.tenant_id = i.tenant_id JOIN nca_builders b ON b.id = c.builder_id
      LEFT JOIN nca_snapshots s ON s.id = v.snapshot_id AND s.tenant_id = v.tenant_id
      WHERE v.tenant_id = :tt AND v.verification_status = 'pending_verification' ORDER BY v.created_at ASC LIMIT 200`, { tt });
    const currents = rows.length ? await db.q(`SELECT i.id AS incentive_id, v.* FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id WHERE i.tenant_id = :tt AND i.id IN (:ids)`,
      { tt, ids: [...new Set(rows.map((x) => x.incentive_id))] }) : [];
    const pick = (v) => v ? ({ type: v.type, audience: v.audience, value_kind: v.value_kind, value_usd: v.value_usd != null ? Number(v.value_usd) : null, value_percent: v.value_percent != null ? Number(v.value_percent) : null,
      value_cap_usd: v.value_cap_usd != null ? Number(v.value_cap_usd) : null, rate: v.rate != null ? Number(v.rate) : null, buydown_schedule: v.buydown_schedule, use_restriction: v.use_restriction,
      requires_affiliated_lender: v.requires_affiliated_lender, contract_by: v.contract_by, close_by: v.close_by, expires_on: v.expires_on, combinable_with: v.combinable_with,
      choice_group: v.choice_group, conditions_text: v.conditions_text, headline: v.headline }) : null;
    const cards = rows.map((v) => {
      const cur = currents.find((c) => c.incentive_id === v.incentive_id && c.id !== v.id);
      let excerpt = null, offset = 0;
      if (v.snap_text) {
        const span = v.source_span;
        offset = span ? Math.max(0, span[0] - 300) : 0;
        excerpt = v.snap_text.slice(offset, span ? span[1] + 300 : 900);
      }
      return { version_id: v.id, incentive_id: v.incentive_id, change_kind: v.change_kind,
        hidden_from_buyers: ['decrease', 'removed'].includes(v.change_kind) || (cur && cur.verification_status === 'withdrawn'),
        builder: v.builder, community: v.community, community_id: v.community_id,
        before: cur && ['verified', 'withdrawn'].includes(cur.verification_status) ? pick(cur) : null, after: pick(v),
        source: { kind: v.snap_kind || null, url: v.source_url, snapshot_id: v.snapshot_id, fetched_at: v.fetched_at || null, excerpt, excerpt_offset: offset, span: v.source_span },
        extraction_confidence: v.extraction_confidence != null ? Number(v.extraction_confidence) : null, extracted_by: v.extracted_by,
        verifier_questions: v.verifier_questions || [], created_at: v.created_at };
    });
    const reconfirmRows = await db.q(`SELECT i.id AS incentive_id, v.id AS version_id, c.name AS community, b.name AS builder, v.headline, v.last_verified_at, v.fresh_until
      FROM nca_incentives i JOIN nca_incentive_versions v ON v.id = i.current_version_id JOIN nca_communities c ON c.id = i.community_id JOIN nca_builders b ON b.id = c.builder_id
      WHERE i.tenant_id = :tt AND v.verification_status = 'verified' AND v.fresh_until < now() + interval '2 days' ORDER BY v.fresh_until ASC LIMIT 100`, { tt });
    res.json({ cards, reconfirm: reconfirmRows });
  }));

  r.post('/verifications/:id/confirm', wrap(async (req, res) => {
    const v = await confirm(req.user.tenant_id, req.user, Number(req.params.id), { edits: req.body.edits, verification_method: req.body.verification_method });
    res.json({ ok: true, version: { id: v.id, verification_status: v.verification_status, fresh_until: v.fresh_until } });
  }));
  r.post('/verifications/:id/reject', wrap(async (req, res) => {
    await reject(req.user.tenant_id, req.user, Number(req.params.id), req.body.reason);
    res.json({ ok: true });
  }));
  r.post('/incentives/:id/reconfirm', wrap(async (req, res) => {
    await reconfirm(req.user.tenant_id, req.user, Number(req.params.id), req.body.verification_method);
    res.json({ ok: true });
  }));

  r.get('/incentives', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const rows = await db.q(`SELECT i.id AS incentive_id, v.id AS version_id, c.name AS community, b.name AS builder, v.headline, v.type,
        CASE WHEN v.verification_status = 'verified' AND (v.fresh_until <= now() OR (v.expires_on IS NOT NULL AND v.expires_on < (now() AT TIME ZONE 'America/New_York')::date)) THEN 'expired'
             WHEN v.id IS NULL THEN 'pending' WHEN v.verification_status = 'pending_verification' THEN 'pending' ELSE v.verification_status END AS status,
        v.last_verified_at, v.fresh_until, v.expires_on,
        EXISTS (SELECT 1 FROM nca_incentive_versions p WHERE p.incentive_id = i.id AND p.verification_status = 'pending_verification') AS has_pending
      FROM nca_incentives i JOIN nca_communities c ON c.id = i.community_id JOIN nca_builders b ON b.id = c.builder_id
      LEFT JOIN nca_incentive_versions v ON v.id = COALESCE(i.current_version_id, (SELECT MAX(id) FROM nca_incentive_versions x WHERE x.incentive_id = i.id))
      WHERE i.tenant_id = :tt ORDER BY c.name, v.headline LIMIT 500`, { tt });
    const status = req.query.status;
    res.json({ incentives: status ? rows.filter((x) => x.status === status) : rows });
  }));

  r.post('/incentives', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const community = await db.one('SELECT id, is_demo FROM nca_communities WHERE id = :c AND tenant_id = :tt', { c: Number(req.body.community_id), tt });
    if (!community) throw new HttpError(404, 'Community not found');
    const e = cleanEdits(Object.assign({ combinable_with: 'not_stated' }, req.body));
    if (!e.type || !e.headline) throw new HttpError(400, 'type and headline are required');
    const market = await getMarket(tt);
    const audience = e.type === 'broker_bonus' ? 'broker' : 'buyer';
    const ir = await db.exec(`INSERT INTO nca_incentives (tenant_id, market_id, community_id, audience, type, is_demo) VALUES (:tt, :m, :c, :a, :ty, :d) RETURNING id`,
      { tt, m: market.id, c: community.id, a: audience, ty: e.type, d: community.is_demo });
    const vid = await insertVersion(tt, ir[0].id, versionFields(Object.assign({ audience, conditions_text: e.conditions_text || e.headline }, e)), {
      change_kind: 'new', extracted_by: 'manual', actor: { type: 'agent', id: req.user.id },
      verifier_questions: METHODS.includes(req.body.verification_method) ? [] : ['Entered by hand: confirm the source.']
    });
    await audit(tt, { type: 'agent', id: req.user.id }, 'incentive.create_manual', 'incentive_version', vid, {});
    res.json({ ok: true, version_id: vid });
  }));

  // ── Registry ──────────────────────────────────────────────────────────────
  r.get('/builders', wrap(async (req, res) => {
    const rows = await db.q(`SELECT b.id, b.name, b.website, b.co_broke_policy, b.automated_access, b.is_demo,
      (SELECT COUNT(*)::int FROM nca_communities c WHERE c.builder_id = b.id AND c.tenant_id = b.tenant_id) AS communities_count
      FROM nca_builders b WHERE b.tenant_id = :tt ORDER BY b.name`, { tt: req.user.tenant_id });
    res.json({ builders: rows });
  }));
  r.post('/builders', wrap(async (req, res) => {
    const b = req.body || {};
    const name = clampStr(b.name, 200);
    if (!name) throw new HttpError(400, 'name is required');
    const policy = { percent: numOrNull(b.co_broke_percent ?? (b.co_broke_policy || {}).percent), requires_first_visit_registration: !!(b.requires_first_visit_registration ?? (b.co_broke_policy || {}).requires_first_visit_registration),
      registration_valid_days: numOrNull(b.registration_valid_days ?? (b.co_broke_policy || {}).registration_valid_days) };
    const access = ['allowed', 'blocked', 'unknown', 'permission_granted'].includes(b.automated_access) ? b.automated_access : 'unknown';
    const rows = await db.exec(`INSERT INTO nca_builders (tenant_id, name, website, co_broke_policy, automated_access) VALUES (:tt, :n, :w, :p, :a)
      ON CONFLICT (tenant_id, name) DO UPDATE SET website = EXCLUDED.website, co_broke_policy = EXCLUDED.co_broke_policy, automated_access = EXCLUDED.automated_access RETURNING *`,
    { tt: req.user.tenant_id, n: name, w: clampStr(b.website, 500), p: JSON.stringify(policy), a: access });
    await audit(req.user.tenant_id, { type: 'agent', id: req.user.id }, 'builder.upsert', 'builder', rows[0].id, {});
    res.json({ ok: true, builder: rows[0] });
  }));

  async function communitiesFor(tt, where, repl) {
    const cs = await db.q(`SELECT c.*, b.name AS builder FROM nca_communities c JOIN nca_builders b ON b.id = c.builder_id AND b.tenant_id = c.tenant_id WHERE c.tenant_id = :tt ${where} ORDER BY b.name, c.name`, Object.assign({ tt }, repl));
    if (!cs.length) return [];
    const ids = cs.map((c) => c.id);
    const [fees, homes, sources] = await Promise.all([
      db.q('SELECT id, community_id, fee_type, amount_usd, period FROM nca_community_fees WHERE tenant_id = :tt AND community_id IN (:ids)', { tt, ids }),
      db.q('SELECT id, community_id, label, plan_name, beds, baths, sqft, stories, list_price, est_completion, status FROM nca_homes WHERE tenant_id = :tt AND community_id IN (:ids) ORDER BY list_price', { tt, ids }),
      db.q('SELECT id, community_id, kind, url, css_scope, health, health_reason, last_fetched_at, last_changed_at FROM nca_sources WHERE tenant_id = :tt AND community_id IN (:ids)', { tt, ids })
    ]);
    return cs.map((c) => Object.assign(c, { fees: fees.filter((f) => f.community_id === c.id), homes: homes.filter((h) => h.community_id === c.id), sources: sources.filter((s) => s.community_id === c.id) }));
  }

  r.get('/communities', wrap(async (req, res) => {
    const bid = numOrNull(req.query.builder_id);
    res.json({ communities: await communitiesFor(req.user.tenant_id, bid ? 'AND c.builder_id = :bid' : '', { bid }) });
  }));

  const COMMUNITY_FIELDS = ['name', 'division_name', 'status', 'address', 'city', 'county', 'zip', 'lat', 'lng', 'age_restricted', 'price_from', 'price_to', 'url',
    'sales_counselor_name', 'sales_counselor_phone', 'sales_counselor_email', 'co_broke_display'];
  function cleanCommunity(b) {
    const out = {};
    for (const k of COMMUNITY_FIELDS) {
      if (!(k in b)) continue;
      let v = b[k];
      if (['lat', 'lng', 'price_from', 'price_to'].includes(k)) v = numOrNull(v);
      else if (k === 'age_restricted') v = v === true || v === 'true';
      else if (k === 'status') v = ['coming_soon', 'selling', 'closeout', 'sold_out'].includes(v) ? v : 'selling';
      else if (k === 'zip') { v = clampStr(v, 10); if (v && !/^\d{5}$/.test(v)) throw new HttpError(400, 'zip must be 5 digits'); }
      else v = clampStr(v, 500);
      out[k] = v;
    }
    return out;
  }

  r.post('/communities', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const builder = await db.one('SELECT id FROM nca_builders WHERE id = :b AND tenant_id = :tt', { b: Number(req.body.builder_id), tt });
    if (!builder) throw new HttpError(404, 'Builder not found');
    const f = cleanCommunity(req.body);
    if (!f.name) throw new HttpError(400, 'name is required');
    const market = await getMarket(tt);
    const cols = Object.keys(f);
    const rows = await db.exec(`INSERT INTO nca_communities (tenant_id, market_id, builder_id, ${cols.join(', ')}) VALUES (:tt, :m, :b, ${cols.map((c) => ':' + c).join(', ')}) RETURNING id`,
      Object.assign({ tt, m: market.id, b: builder.id }, f));
    await audit(tt, { type: 'agent', id: req.user.id }, 'community.create', 'community', rows[0].id, {});
    res.json({ ok: true, community: (await communitiesFor(tt, 'AND c.id = :id', { id: rows[0].id }))[0] });
  }));

  r.patch('/communities/:id', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const f = cleanCommunity(req.body);
    const cols = Object.keys(f);
    if (!cols.length) throw new HttpError(400, 'Nothing to update');
    const rows = await db.exec(`UPDATE nca_communities SET ${cols.map((c) => `${c} = :${c}`).join(', ')}, updated_at = now() WHERE id = :id AND tenant_id = :tt RETURNING id`,
      Object.assign({ id: Number(req.params.id), tt }, f));
    if (!rows.length) throw new HttpError(404, 'Community not found');
    res.json({ ok: true, community: (await communitiesFor(tt, 'AND c.id = :id', { id: rows[0].id }))[0] });
  }));

  async function ownCommunity(tt, id) {
    const c = await db.one('SELECT id FROM nca_communities WHERE id = :id AND tenant_id = :tt', { id: Number(id), tt });
    if (!c) throw new HttpError(404, 'Community not found');
    return c;
  }

  r.post('/communities/:id/fees', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const c = await ownCommunity(tt, req.params.id);
    const type = req.body.fee_type;
    if (!['hoa', 'cdd_om', 'cdd_debt', 'amenity', 'other'].includes(type)) throw new HttpError(400, 'fee_type is invalid');
    const period = ['month', 'year', 'one_time'].includes(req.body.period) ? req.body.period : 'month';
    const amount = numOrNull(req.body.amount_usd); // blank stays NULL = not confirmed
    await db.exec(`INSERT INTO nca_community_fees (tenant_id, community_id, fee_type, amount_usd, period, verified_at) VALUES (:tt, :c, :ty, :a, :p, CASE WHEN CAST(:a AS numeric) IS NULL THEN NULL ELSE now() END)
      ON CONFLICT (tenant_id, community_id, fee_type) DO UPDATE SET amount_usd = EXCLUDED.amount_usd, period = EXCLUDED.period, verified_at = EXCLUDED.verified_at`,
    { tt, c: c.id, ty: type, a: amount, p: period });
    res.json({ ok: true });
  }));

  r.post('/communities/:id/homes', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const c = await ownCommunity(tt, req.params.id);
    const b = req.body || {};
    const label = clampStr(b.label, 200);
    if (!label) throw new HttpError(400, 'label is required');
    const est = clampStr(b.est_completion, 20);
    if (est && !/^(ready|\d{4}-\d{2})$/i.test(est)) throw new HttpError(400, 'est_completion must be "ready" or YYYY-MM');
    await db.exec(`INSERT INTO nca_homes (tenant_id, community_id, label, plan_name, beds, baths, sqft, stories, list_price, est_completion, status)
      VALUES (:tt, :c, :l, :p, :beds, :baths, :sqft, :st, :price, :est, :status)`, {
      tt, c: c.id, l: label, p: clampStr(b.plan_name, 160), beds: numOrNull(b.beds), baths: numOrNull(b.baths), sqft: numOrNull(b.sqft), st: numOrNull(b.stories),
      price: numOrNull(b.list_price), est, status: ['available', 'under_contract', 'sold', 'removed'].includes(b.status) ? b.status : 'available'
    });
    res.json({ ok: true });
  }));

  r.post('/sources', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const c = await ownCommunity(tt, req.body.community_id);
    const kind = ['community_page', 'promo_page', 'qmi_page', 'broker_email', 'flyer', 'sales_rep_note'].includes(req.body.kind) ? req.body.kind : 'promo_page';
    const url = clampStr(req.body.url, 1000);
    if (url && !/^https?:\/\//i.test(url)) throw new HttpError(400, 'url must start with http:// or https://');
    const rows = await db.exec(`INSERT INTO nca_sources (tenant_id, community_id, kind, url, css_scope) VALUES (:tt, :c, :k, :u, :s) RETURNING *`,
      { tt, c: c.id, k: kind, u: url, s: clampStr(req.body.css_scope, 300) });
    res.json({ ok: true, source: rows[0] });
  }));

  r.post('/sources/:id/fetch', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const s = await db.one('SELECT * FROM nca_sources WHERE id = :id AND tenant_id = :tt', { id: Number(req.params.id), tt });
    if (!s) throw new HttpError(404, 'Source not found');
    const result = await fetchSource(tt, s);
    await audit(tt, { type: 'agent', id: req.user.id }, 'source.fetch', 'source', s.id, { status: result.status });
    res.json({ ok: true, result });
  }));

  r.post('/ingest/text', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const c = await ownCommunity(tt, req.body.community_id);
    const text = String(req.body.text || '');
    if (text.trim().length < 20) throw new HttpError(400, 'Paste at least a sentence of source text');
    if (text.length > 60000) throw new HttpError(400, 'Text is too long (60,000 characters max)');
    const kind = ['flyer', 'broker_email', 'sales_rep_note', 'promo_page', 'community_page'].includes(req.body.kind) ? req.body.kind : 'flyer';
    const out = await processText(tt, { community_id: c.id, kind, text, actor: { type: 'agent', id: req.user.id } });
    await audit(tt, { type: 'agent', id: req.user.id }, 'ingest.text', 'community', c.id, { cards: out.cards_created, extracted_by: out.extracted_by });
    res.json({ ok: true, cards_created: out.cards_created, hidden: out.hidden, extracted_by: out.extracted_by, notes: out.notes || null });
  }));

  // ── Reports and compliance ────────────────────────────────────────────────
  r.get('/reports', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id;
    const status = ['pending_review', 'compliance_hold', 'ready'].includes(req.query.status) ? req.query.status : 'pending_review';
    const rows = await db.q(`SELECT b.id, b.token, b.status, b.created_at, b.compliance_verdict, b.payload, u.first_name,
      (SELECT findings FROM nca_compliance_reviews c WHERE c.subject_type = 'report' AND c.subject_id = b.id AND c.tenant_id = b.tenant_id ORDER BY c.id DESC LIMIT 1) AS findings
      FROM nca_reports b JOIN nca_buyers u ON u.id = b.buyer_id WHERE b.tenant_id = :tt AND b.status = :status${ownerClause(req.user)} ORDER BY b.created_at DESC LIMIT 100`, { tt, uid, status });
    res.json({ reports: rows.map((x) => ({ id: x.id, token: x.token, status: x.status, buyer_first_name: x.first_name, created_at: x.created_at,
      items_count: ((x.payload[x.payload.en ? 'en' : 'es'] || {}).items || []).length, compliance: { verdict: x.compliance_verdict, findings: x.findings || [] } })) });
  }));

  // Agent preview: the same view the buyer will get, for a report the buyer cannot see yet. Read-only.
  r.get('/reports/:id/preview', wrap(async (req, res) => {
    const rep = await ownReport(req);
    const lang = req.query.lang === 'es' || req.query.lang === 'en' ? req.query.lang : rep.language;
    res.setHeader('Cache-Control', 'no-store');
    res.json(Object.assign(await publicView(rep.tenant_id, rep, lang), { status: 'ready', preview: true, report_status: rep.status }));
  }));

  async function ownReport(req) {
    const rep = await db.one(`SELECT b.* FROM nca_reports b WHERE b.id = :id AND b.tenant_id = :tt${ownerClause(req.user)}`, { id: Number(req.params.id), tt: req.user.tenant_id, uid: req.user.id });
    if (!rep) throw new HttpError(404, 'Report not found');
    return rep;
  }

  r.post('/reports/:id/approve', wrap(async (req, res) => {
    const rep = await ownReport(req);
    if (rep.status === 'compliance_hold' && rep.compliance_verdict !== 'block') {
      throw new HttpError(409, 'This report is on hold. Release the hold in Compliance first.');
    }
    if (rep.compliance_verdict === 'block' || rep.status === 'compliance_hold') {
      const f = await db.one(`SELECT findings FROM nca_compliance_reviews WHERE subject_type = 'report' AND subject_id = :id AND tenant_id = :tt ORDER BY id DESC LIMIT 1`, { id: rep.id, tt: rep.tenant_id });
      throw new HttpError(409, 'This report has a blocking compliance finding and cannot be released. Generate a new report after fixing the data.', { findings: f ? f.findings : [] });
    }
    if (rep.status !== 'pending_review') throw new HttpError(409, 'Report is not awaiting review');
    await db.exec(`UPDATE nca_reports SET status = 'ready', approved_by = :uid, approved_at = now() WHERE id = :id AND tenant_id = :tt`, { uid: req.user.id, id: rep.id, tt: rep.tenant_id });
    await db.exec(`UPDATE nca_compliance_reviews SET status = 'released', resolved_by = :uid, resolved_at = now(), resolution_note = COALESCE(resolution_note, 'Approved with report') WHERE subject_type = 'report' AND subject_id = :id AND tenant_id = :tt AND status = 'open' AND verdict = 'hold'`,
      { uid: req.user.id, id: rep.id, tt: rep.tenant_id });
    await db.exec(`UPDATE nca_buyers SET stage = 'report_sent', stage_changed_at = now() WHERE id = :b AND tenant_id = :tt AND stage = 'intake_complete'`, { b: rep.buyer_id, tt: rep.tenant_id });
    await activity(rep.tenant_id, rep.buyer_id, { type: 'agent', id: req.user.id }, 'report_approved', { report_id: rep.id });
    await audit(rep.tenant_id, { type: 'agent', id: req.user.id }, 'report.approve', 'report', rep.id, {});
    notify.later(notify.buyerReportReady, rep.tenant_id, rep.id);
    res.json({ ok: true });
  }));

  r.post('/reports/:id/hold', wrap(async (req, res) => {
    const rep = await ownReport(req);
    const note = clampStr(req.body.note, 1000);
    if (!note) throw new HttpError(400, 'A note is required');
    await db.exec(`INSERT INTO nca_compliance_reviews (tenant_id, subject_type, subject_id, verdict, findings, resolution_note) VALUES (:tt, 'report', :id, 'hold', :f, :n)`,
      { tt: rep.tenant_id, id: rep.id, f: JSON.stringify([{ severity: 'hold', category: 'agent_hold', quote: note, why: 'Held by agent', suggested_fix: '' }]), n: note });
    // A hold hides the report from the buyer, including one already released.
    await db.exec(`UPDATE nca_reports SET status = 'compliance_hold' WHERE id = :id AND tenant_id = :tt AND status IN ('pending_review', 'ready')`, { id: rep.id, tt: rep.tenant_id });
    await audit(rep.tenant_id, { type: 'agent', id: req.user.id }, 'report.hold', 'report', rep.id, {});
    res.json({ ok: true });
  }));

  r.get('/compliance', wrap(async (req, res) => {
    const rows = await db.q(`SELECT c.id, c.subject_type, c.subject_id, c.verdict, c.findings, c.created_at FROM nca_compliance_reviews c
      JOIN nca_reports b ON b.id = c.subject_id AND c.subject_type = 'report' AND b.tenant_id = c.tenant_id
      WHERE c.tenant_id = :tt AND c.status = 'open'${ownerClause(req.user)} ORDER BY c.created_at DESC LIMIT 100`, { tt: req.user.tenant_id, uid: req.user.id });
    res.json({ holds: rows });
  }));

  r.post('/compliance/:id/release', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const note = clampStr(req.body.note, 1000);
    if (!note) throw new HttpError(400, 'A note is required');
    const c = await db.one(`SELECT c.* FROM nca_compliance_reviews c JOIN nca_reports b ON b.id = c.subject_id AND c.subject_type = 'report' AND b.tenant_id = c.tenant_id
      WHERE c.id = :id AND c.tenant_id = :tt AND c.status = 'open'${ownerClause(req.user)}`, { id: Number(req.params.id), tt, uid: req.user.id });
    if (!c) throw new HttpError(404, 'Hold not found');
    if (c.verdict === 'block') throw new HttpError(409, 'A blocking finding cannot be released; the content must change.');
    await db.exec(`UPDATE nca_compliance_reviews SET status = 'released', resolved_by = :uid, resolved_at = now(), resolution_note = :n WHERE id = :id`, { uid: req.user.id, n: note, id: c.id });
    // Last open hold released: the report returns to review, never straight to the buyer.
    await db.exec(`UPDATE nca_reports r SET status = 'pending_review' WHERE r.id = :rid AND r.tenant_id = :tt AND r.status = 'compliance_hold'
      AND COALESCE(r.compliance_verdict, 'pass') <> 'block'
      AND NOT EXISTS (SELECT 1 FROM nca_compliance_reviews x WHERE x.subject_type = 'report' AND x.subject_id = r.id AND x.tenant_id = r.tenant_id AND x.status = 'open')`,
    { rid: c.subject_id, tt });
    await audit(tt, { type: 'agent', id: req.user.id }, 'compliance.release', 'compliance_review', c.id, { note: note.slice(0, 200) });
    res.json({ ok: true });
  }));

  // ── Buyers ────────────────────────────────────────────────────────────────
  // ── Leads from Martha's conversational intake ─────────────────────────────
  // Row ownership: an agent sees only leads assigned to them; the admin sees the tenant.
  function leadOwner(user, alias = 'l') { return user.role === 'admin' ? '' : ` AND ${alias}.assigned_agent_id = :uid`; }
  const LEAD_STATUSES = ['new', 'contacted', 'working', 'closed', 'lost'];

  r.get('/leads', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id, oc = leadOwner(req.user);
    const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = await db.q(`SELECT l.id, l.first_name, l.lang, l.city, l.zip, l.county, l.max_price, l.move_timeline, l.financing_type, l.has_agent, l.agent_agreement_signed,
      l.referral_consent, l.status, l.assigned_agent_id, l.created_at, u.name AS assigned_agent_name,
      (SELECT COUNT(*)::int FROM nca_lead_visited_offices v WHERE v.lead_id = l.id AND v.tenant_id = l.tenant_id) AS visited_count,
      (SELECT COUNT(*)::int FROM nca_lead_selections s WHERE s.lead_id = l.id AND s.tenant_id = l.tenant_id) AS selected_count
      FROM nca_leads l LEFT JOIN nca_users u ON u.id = l.assigned_agent_id AND u.tenant_id = l.tenant_id
      WHERE l.tenant_id = :tt${oc}${status ? ' AND l.status = :status' : ''} ORDER BY l.created_at DESC LIMIT 200`, { tt, uid, status });
    const counts = await db.q(`SELECT l.status, COUNT(*)::int AS n FROM nca_leads l WHERE l.tenant_id = :tt${oc} GROUP BY l.status`, { tt, uid });
    res.json({ leads: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
  }));

  async function ownLead(req) {
    const l = await db.one(`SELECT l.* FROM nca_leads l WHERE l.id = :id AND l.tenant_id = :tt${leadOwner(req.user)}`, { id: Number(req.params.id) || 0, tt: req.user.tenant_id, uid: req.user.id });
    if (!l) throw new HttpError(404, 'Lead not found');
    return l;
  }

  r.get('/leads/:id', wrap(async (req, res) => {
    const l = await ownLead(req);
    const tt = req.user.tenant_id;
    const [visits, consents, selections, agents, notices] = await Promise.all([
      db.q('SELECT builder, community FROM nca_lead_visited_offices WHERE tenant_id = :tt AND lead_id = :l ORDER BY id', { tt, l: l.id }),
      db.q('SELECT channel, granted, consent_text, consent_version, ip, user_agent, granted_at, revoked_at, revoked_via FROM nca_lead_consents WHERE tenant_id = :tt AND lead_id = :l ORDER BY id', { tt, l: l.id }),
      db.q(`SELECT r.* FROM nca_lead_selections s JOIN nca_research_rows r ON r.id = s.research_row_id AND r.tenant_id = s.tenant_id WHERE s.tenant_id = :tt AND s.lead_id = :l ORDER BY r.builder`, { tt, l: l.id }),
      req.user.role === 'admin' ? db.q(`SELECT id, name, role, license_no FROM nca_users WHERE tenant_id = :tt AND active = true ORDER BY role DESC, name`, { tt }) : Promise.resolve([]),
      db.q(`SELECT action, detail, created_at FROM nca_audit_log WHERE tenant_id = :tt AND subject_type = 'lead' AND subject_id = :l ORDER BY created_at`, { tt, l: l.id })
    ]);
    let researchRun = null, researchRows = [];
    if (l.research_run_id) {
      researchRun = await db.one('SELECT id, area_label, city, county, zip, status, source, notice, model, searches, ran_at, finished_at, top_deals, inventory, error FROM nca_research_runs WHERE id = :id AND tenant_id = :tt', { id: l.research_run_id, tt });
      researchRows = await db.q('SELECT * FROM nca_research_rows WHERE tenant_id = :tt AND run_id = :r ORDER BY (origin = \'agent_verified\') DESC, builder, community', { tt, r: l.research_run_id });
    }
    const assigned = l.assigned_agent_id ? await db.one('SELECT id, name FROM nca_users WHERE id = :id AND tenant_id = :tt', { id: l.assigned_agent_id, tt }) : null;
    await audit(tt, { type: 'agent', id: req.user.id }, 'lead.view', 'lead', l.id, {});
    res.json({ lead: Object.assign({}, l, { ip_hash: undefined, assigned_agent: assigned }), visited_offices: visits, consents, selections, research_run: researchRun, research_rows: researchRows,
      agents, notifications: notices.filter((n) => /^(email|sms)\./.test(n.action)), report_only: !l.referral_consent });
  }));

  r.patch('/leads/:id', wrap(async (req, res) => {
    const l = await ownLead(req);
    const b = req.body || {};
    const tt = req.user.tenant_id;
    const sets = [], rep2 = { id: l.id, tt };
    if (b.status !== undefined) {
      if (!LEAD_STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status');
      sets.push('status = :status'); rep2.status = b.status;
    }
    let newAgent;
    if (b.assigned_agent_id !== undefined) {
      adminOnly(req);
      newAgent = b.assigned_agent_id === null ? null : Number(b.assigned_agent_id);
      if (newAgent !== null) {
        const u = await db.one('SELECT id FROM nca_users WHERE id = :id AND tenant_id = :tt AND active = true', { id: newAgent, tt });
        if (!u) throw new HttpError(400, 'Unknown agent');
      }
      sets.push('assigned_agent_id = :agent'); rep2.agent = newAgent;
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    await db.exec(`UPDATE nca_leads SET ${sets.join(', ')}, updated_at = now() WHERE id = :id AND tenant_id = :tt`, rep2);
    await audit(tt, { type: 'agent', id: req.user.id }, 'lead.update', 'lead', l.id, { status: b.status, assigned_agent_id: newAgent });
    // A newly assigned agent is told about the lead only when the buyer agreed to agent contact.
    if (newAgent && l.referral_consent && l.notified_agent_id !== newAgent) {
      notify.later(notify.agentNewLead, tt, l.id);
      notify.later(sms.agentNewLeadSms, tt, l.id);
      await db.exec('UPDATE nca_leads SET notified_agent_id = :a WHERE id = :id AND tenant_id = :tt', { a: newAgent, id: l.id, tt });
    }
    res.json({ ok: true });
  }));

  r.get('/buyers', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id;
    const stage = clampStr(req.query.stage, 30);
    const rows = await db.q(`SELECT b.id, b.first_name, b.stage, b.preferred_language AS language, b.has_other_agent, b.updated_at,
      (SELECT criteria FROM nca_buyer_criteria c WHERE c.buyer_id = b.id AND c.tenant_id = b.tenant_id ORDER BY c.id DESC LIMIT 1) AS criteria,
      (SELECT prior_builder_visits FROM nca_buyer_criteria c WHERE c.buyer_id = b.id AND c.tenant_id = b.tenant_id ORDER BY c.id DESC LIMIT 1) AS visits,
      (SELECT MAX(occurred_at) FROM nca_activity a WHERE a.buyer_id = b.id AND a.tenant_id = b.tenant_id) AS last_activity_at
      FROM nca_buyers b WHERE b.tenant_id = :tt${ownerClause(req.user)}${stage ? ' AND b.stage = :stage' : ''} ORDER BY b.created_at DESC LIMIT 300`, { tt, uid, stage });
    res.json({ buyers: rows.map((x) => {
      const c = x.criteria || {};
      return { id: x.id, first_name: x.first_name, stage: x.stage, language: x.language, has_other_agent: x.has_other_agent,
        area: [(c.target_zips || []).join(', '), c.place_text].filter(Boolean).join(' · ') || null, budget_max: c.budget_max || null,
        timeline_label: c.timeline ? t('en', 'timeline.' + c.timeline) : null, financing_label: c.financing ? t('en', 'financing.' + c.financing) : null,
        last_activity_at: x.last_activity_at || x.updated_at, prior_visits_count: (x.visits || []).length };
    }) });
  }));

  r.get('/buyers/:id', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id;
    const b = await db.one(`SELECT b.* FROM nca_buyers b WHERE b.id = :id AND b.tenant_id = :tt${ownerClause(req.user)}`, { id: Number(req.params.id), tt, uid });
    if (!b) throw new HttpError(404, 'Buyer not found');
    const [crit, consents, reports, appts, acts] = await Promise.all([
      db.one('SELECT * FROM nca_buyer_criteria WHERE buyer_id = :b AND tenant_id = :tt ORDER BY id DESC LIMIT 1', { b: b.id, tt }),
      db.q('SELECT channel, granted, consent_text, consent_version, granted_at, revoked_at FROM nca_consents WHERE buyer_id = :b AND tenant_id = :tt ORDER BY id', { b: b.id, tt }),
      db.q('SELECT id, token, status, created_at FROM nca_reports WHERE buyer_id = :b AND tenant_id = :tt ORDER BY id DESC', { b: b.id, tt }),
      db.q('SELECT id, kind, status, preferred_times, channel, created_at, held_at FROM nca_appointments WHERE buyer_id = :b AND tenant_id = :tt ORDER BY id DESC', { b: b.id, tt }),
      db.q('SELECT event, actor_type, payload, occurred_at FROM nca_activity WHERE buyer_id = :b AND tenant_id = :tt ORDER BY id DESC LIMIT 100', { b: b.id, tt })
    ]);
    const shared = consents.some((c) => c.channel === 'share_with_agent' && c.granted && !c.revoked_at);
    const showContact = req.user.role === 'admin' || shared;
    res.json({
      buyer: { id: b.id, first_name: b.first_name, email: showContact ? b.email : null, phone: showContact ? b.phone : null, contact_shared: shared,
        stage: b.stage, language: b.preferred_language, created_at: b.created_at },
      criteria: crit ? crit.criteria : null, consents, reports, appointments: appts, prior_builder_visits: crit ? crit.prior_builder_visits : [], activity: acts
    });
  }));

  r.post('/appointments/:id/held', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id;
    const a = await db.one(`SELECT a.*, b.agent_id AS buyer_agent_id FROM nca_appointments a JOIN nca_buyers b ON b.id = a.buyer_id AND b.tenant_id = a.tenant_id
      WHERE a.id = :id AND a.tenant_id = :tt${ownerClause(req.user)}`, { id: Number(req.params.id), tt, uid });
    if (!a) throw new HttpError(404, 'Appointment not found');
    if (!a.buyer_agent_id) throw new HttpError(409, 'This buyer has no agent of record (they did not agree to share their details), so no consult can be billed.');
    if (a.status === 'held') throw new HttpError(409, 'Already marked held');
    const plan = billing.plan();
    const t0 = await db.sequelize.transaction();
    try {
      await db.sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: 91300000 + a.buyer_agent_id }, transaction: t0 });
      const [[cnt]] = await db.sequelize.query(`SELECT COUNT(*)::int AS n FROM nca_conversion_events WHERE tenant_id = :tt AND agent_id = :ag AND billable AND date_trunc('month', occurred_at) = date_trunc('month', now())`,
        { replacements: { tt, ag: a.buyer_agent_id }, transaction: t0 });
      const decision = billing.evaluate('consult_held', cnt.n, plan);
      const [ins] = await db.sequelize.query(`INSERT INTO nca_conversion_events (tenant_id, buyer_id, agent_id, appointment_id, event, evidence, billable, fee_usd, waiver_reason)
        VALUES (:tt, :b, :ag, :ap, 'consult_held', :ev, :bill, :fee, :w) RETURNING id, billable, fee_usd`, {
        replacements: { tt, b: a.buyer_id, ag: a.buyer_agent_id, ap: a.id, ev: JSON.stringify({ marked_by: uid, channel: a.channel }), bill: decision.billable, fee: decision.fee_usd, w: decision.waiver_reason },
        transaction: t0
      });
      await db.sequelize.query(`UPDATE nca_appointments SET status = 'held', held_at = now() WHERE id = :id`, { replacements: { id: a.id }, transaction: t0 });
      await db.sequelize.query(`UPDATE nca_buyers SET stage = 'consult_held', stage_changed_at = now() WHERE id = :b AND tenant_id = :tt`, { replacements: { b: a.buyer_id, tt }, transaction: t0 });
      await t0.commit();
      await activity(tt, a.buyer_id, { type: 'agent', id: uid }, 'consult_held', { appointment_id: a.id, billable: decision.billable });
      await audit(tt, { type: 'agent', id: uid }, 'conversion.consult_held', 'appointment', a.id, decision);
      res.json({ ok: true, conversion: { id: ins[0].id, billable: ins[0].billable, fee_usd: Number(ins[0].fee_usd) } });
    } catch (e) { await t0.rollback(); throw e; }
  }));

  r.get('/billing', wrap(async (req, res) => {
    const tt = req.user.tenant_id, uid = req.user.id;
    const plan = billing.plan();
    const rows = await db.q(`SELECT b.id, u.first_name AS buyer_first_name, b.occurred_at, b.billable, b.fee_usd, b.waiver_reason
      FROM nca_conversion_events b JOIN nca_buyers u ON u.id = b.buyer_id WHERE b.tenant_id = :tt AND date_trunc('month', b.occurred_at) = date_trunc('month', now())${ownerClause(req.user)}
      ORDER BY b.occurred_at DESC`, { tt, uid });
    const billable = rows.filter((x) => x.billable);
    res.json({ plan, month: new Date().toISOString().slice(0, 7),
      events: rows.map((x) => Object.assign(x, { fee_usd: Number(x.fee_usd) })),
      invoice_preview: { billable_count: billable.length, total_usd: billable.reduce((a, x) => a + Number(x.fee_usd), 0), capped: rows.some((x) => x.waiver_reason === 'monthly_cap_reached') } });
  }));

  // ── Settings and demo ─────────────────────────────────────────────────────
  r.get('/settings/market', wrap(async (req, res) => {
    const m = await getMarket(req.user.tenant_id);
    res.json({ market: { slug: m.slug, name: m.name, counties: m.counties, settings: m.settings } });
  }));
  r.put('/settings/market', wrap(async (req, res) => {
    const tt = req.user.tenant_id;
    const m = await getMarket(tt);
    const out = sanitizeSettings((req.body && req.body.settings) || {}, m.settings);
    if (out.error) throw new HttpError(400, out.error);
    if ('reference_rate' in ((req.body && req.body.settings) || {})) out.settings.reference_rate_is_demo = false;
    out.settings.co_owner_user_ids = m.settings.co_owner_user_ids; // not editable here
    await db.exec('UPDATE nca_markets SET settings = :s, updated_at = now() WHERE id = :id AND tenant_id = :tt', { s: JSON.stringify(out.settings), id: m.id, tt });
    await audit(tt, { type: 'agent', id: req.user.id }, 'market.settings', 'market', m.id, { keys: Object.keys(req.body.settings || {}) });
    const fresh = await getMarket(tt);
    res.json({ ok: true, market: { slug: fresh.slug, name: fresh.name, counties: fresh.counties, settings: fresh.settings } });
  }));

  r.post('/demo/seed', wrap(async (req, res) => {
    adminOnly(req);
    const out = await seedDemo(req.user.tenant_id, { resetFirst: req.body.reset === true, actor: { type: 'agent', id: req.user.id } });
    res.json(Object.assign({ ok: true }, out));
  }));
  r.post('/demo/reset', wrap(async (req, res) => {
    adminOnly(req);
    await reset(req.user.tenant_id);
    await audit(req.user.tenant_id, { type: 'agent', id: req.user.id }, 'demo.reset', 'market', null, {});
    res.json({ ok: true });
  }));

  return r;
};

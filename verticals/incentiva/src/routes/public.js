'use strict';

/**
 * Public API: config, buying power, intake, report, consult request.
 * The tenant is the configured operator; nothing here reads a tenant from the request.
 */

const express = require('express');
const db = require('../db');
const { t } = require('../engines/i18n');
const { estimate } = require('../engines/buyingPower');
const { getMarket, effectiveSettings } = require('../services/market');
const { buildReport, publicView, loadAgent, disclosures } = require('../services/report');
const { TENANT_ID, ipHash, rateLimit, activity, clampStr, numOrNull, audit } = require('../services/util');
const rentcast = require('../services/rentcast');
const notify = require('../services/notify');
const area = require('../services/area');
const research = require('../services/research');
const leads = require('../services/leads');
const sms = require('../services/sms');
const handoff = require('../services/handoff');
const followup = require('../services/followup');
const scheduling = require('../services/scheduling');

const CONSENT_VERSION = 'v2-2026-09-13'; // v2: product renamed BuyersLine
const MUST_HAVES = ['single_story', 'pool', 'three_car_garage', 'office', 'no_cdd', 'age_restricted', 'move_in_90_days'];
const FINANCING = ['preapproved', 'cash', 'needs_lender', 'va', 'fha', 'unsure'];
const TIMELINE = ['0_3m', '3_6m', '6_12m', '12m_plus'];

function langOf(v) { return v === 'es' ? 'es' : 'en'; }

async function defaultAgent(tenantId, market) {
  return loadAgent(tenantId, market.default_agent_id, market);
}

function consentTexts(lang, agent) {
  const share = agent && agent.brokerage_name
    ? t(lang, 'consent.share_named', { agent: agent.name, brokerage: agent.brokerage_name }) + (agent.co_owner ? ' ' + t(lang, 'consent.co_owner', { agent: agent.name }) : '')
    : t(lang, 'consent.share_unnamed');
  return { version: CONSENT_VERSION, email: t(lang, 'consent.email'), sms: t(lang, 'consent.sms'), share };
}

module.exports = function publicRoutes(opts = {}) {
  const tenantId = opts.tenantId || TENANT_ID;
  const allowModel = opts.allowModel !== false;
  const allowGeocode = opts.allowGeocode !== false;
  const router = express.Router();

  router.get('/config', async (req, res) => {
    try {
      const lang = langOf(req.query.lang);
      const market = await getMarket(tenantId);
      const agent = await defaultAgent(tenantId, market);
      const s = await effectiveSettings(market.settings);
      const demo = await db.one('SELECT EXISTS (SELECT 1 FROM nca_communities WHERE tenant_id = :t AND is_demo) AS d', { t: tenantId });
      res.json({
        market: { slug: market.slug, name: market.name, counties: market.counties },
        agent: agent ? { name: agent.name, title: agent.title, license_no: agent.license_no, brokerage_name: agent.brokerage_name, brokerage_license_no: agent.brokerage_license_no } : null,
        consent: consentTexts(lang, agent),
        lead_consent: leads.leadConsentTexts(lang, agent),
        options: {
          must_haves: MUST_HAVES.map((k) => ({ key: k, label: t(lang, 'must_haves.' + k) })),
          financing: FINANCING.map((k) => ({ key: k, label: t(lang, 'financing.' + k) })),
          timeline: TIMELINE.map((k) => ({ key: k, label: t(lang, 'timeline.' + k) }))
        },
        disclosures: disclosures(lang, agent),
        reference_rate: s.reference_rate != null ? { rate: s.reference_rate, source: s.reference_rate_is_feed ? require('../services/rates').source(lang) : s.reference_rate_source, as_of: s.reference_rate_as_of } : null,
        is_demo_data: !!demo.d
      });
    } catch (e) { console.error('[incentiva] config', e); res.status(500).json({ error: 'Could not load configuration. Try again in a minute.' }); }
  });

  // ── Ana: conversational intake ─────────────────────────────────────────
  router.post('/area', async (req, res) => {
    if (!rateLimit('area:' + ipHash(req), 60, 3600e3)) return res.status(429).json({ error: 'Too many lookups. Try again later.' });
    try { res.json(await area.resolveArea(tenantId, req.body && req.body.input)); }
    catch (e) { console.error('[incentiva] area', e); res.status(500).json({ ok: false, reason: 'error' }); }
  });

  // Start (or reuse the cached) research for an area. Never waits for the crawl.
  router.post('/research', async (req, res) => {
    const b = req.body || {};
    const a = b.area && typeof b.area === 'object' ? b.area : {};
    const clean = { input: clampStr(a.input, 120), zip: /^\d{5}$/.test(String(a.zip || '')) ? String(a.zip) : null, city: clampStr(a.city, 120), county: clampStr(a.county, 120), state: 'FL', label: clampStr(a.label, 160) };
    if (!clean.zip && !clean.input && !clean.city) return res.status(400).json({ error: 'An area is required.' });
    try {
      // Resolve on the server: the prompt and the shared cache key come only from the lookup,
      // never from place text a caller sent (that would let one caller poison an area for everyone).
      const resolved = await area.resolveArea(tenantId, clean.zip || clean.input || clean.city);
      if (!resolved.ok) return res.status(400).json({ error: 'That area could not be confirmed.', reason: resolved.reason });
      const safeArea = { zip: resolved.zip || null, city: resolved.city || null, county: resolved.county || null, state: 'FL',
        label: resolved.resolved ? resolved.label : (resolved.zip || String(resolved.input || '').replace(/[^A-Za-z .\'-]/g, '').slice(0, 60)) };
      safeArea.input = safeArea.label;
      const allowFresh = rateLimit('research:' + ipHash(req), Number(process.env.INCENTIVA_RESEARCH_PER_HOUR || 6), 3600e3);
      const out = await research.startOrGet(tenantId, safeArea, { allowFresh });
      if (!out.run) return res.status(429).json({ error: 'Too many new searches from this connection. Try again later.' });
      res.json({ token: out.run.token, status: out.run.status, fresh: out.fresh });
    } catch (e) { console.error('[incentiva] research start', e); res.status(500).json({ error: 'Could not start the research. Try again.' }); }
  });

  router.get('/research/:token', async (req, res) => {
    if (!rateLimit('rpoll:' + ipHash(req), 900, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const q = req.query || {};
      const market = await getMarket(tenantId);
      const settings = await effectiveSettings(market.settings);
      const view = await research.publicRun(tenantId, String(req.params.token || '').slice(0, 40), {
        max_price: numOrNull(q.max_price), max_monthly: numOrNull(q.max_monthly), down_payment: numOrNull(q.down_payment), financing: leads.FINANCING.includes(q.financing) ? q.financing : null
      }, settings);
      if (!view) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Cache-Control', 'no-store');
      res.json(view);
    } catch (e) { console.error('[incentiva] research poll', e); res.status(500).json({ error: 'Could not load the research.' }); }
  });

  router.post('/leads', async (req, res) => {
    const ih = ipHash(req);
    if (!rateLimit('lead:' + ih, Number(process.env.INCENTIVA_INTAKE_PER_HOUR || 10), 3600e3)) return res.status(429).json({ error: 'Too many submissions from this connection. Try again later.' });
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: 'Invalid submission' }); // honeypot
    const v = leads.validateLead(b);
    if (!v.value) return res.status(400).json({ error: 'Please complete the required answers.', missing: v.missing || [], invalid: v.errors || [] });
    try {
      const val = v.value;
      if (!val.under_agreement && val.research_token) {
        const run = await research.publicRun(tenantId, val.research_token, { max_price: val.max_price, max_monthly: val.max_monthly }, null);
        if (run && run.status === 'done' && run.rows.length && !val.selections.length) return res.status(400).json({ error: 'Choose at least one community.', missing: ['selections'] });
      }
      const market = await getMarket(tenantId);
      const agent = await defaultAgent(tenantId, market);
      const lead = await leads.createLead(tenantId, val, { req, agent, ipHash: ih });
      if (lead.email_consent) notify.later(notify.buyerLeadReport, tenantId, lead.id);
      // Hand-off agent: readiness score, agent brief + alerts (only with referral consent), then Rachel's plan.
      notify.later(handoff.afterLead, tenantId, lead.id);
      res.json({ ok: true, token: lead.token, gated: lead.gated, referral: lead.referral, emailed: lead.email_consent });
    } catch (e) { console.error('[incentiva] lead', e); res.status(500).json({ error: 'We could not save your answers right now. Please try again in a few minutes.' }); }
  });

  router.get('/leads/:token', async (req, res) => {
    if (!rateLimit('lview:' + ipHash(req), 120, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const tok = String(req.params.token || '');
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return res.status(404).json({ error: 'Not found' });
      const view = await leads.publicLead(tenantId, tok);
      if (!view) return res.status(404).json({ error: 'Not found' });
      // The lead token reaches a buyer only in their report email, so opening it confirms that address
      // (double opt-in for Rachel's follow-up emails).
      await db.exec(`UPDATE nca_lead_consents c SET confirmed_at = now() FROM nca_leads l WHERE l.token = :tok AND l.tenant_id = :t AND c.lead_id = l.id AND c.tenant_id = l.tenant_id
        AND c.channel = 'email' AND c.granted = true AND c.revoked_at IS NULL AND c.confirmed_at IS NULL`, { tok, t: tenantId });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.json(view);
    } catch (e) { console.error('[incentiva] lead view', e); res.status(500).json({ error: 'Could not load your report.' }); }
  });

  // ── Scheduler agent: book a consult from the report ──────────────────────
  router.get('/leads/:token/slots', async (req, res) => {
    if (!rateLimit('slots:' + ipHash(req), 120, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const out = await scheduling.availability(tenantId, String(req.params.token || ''));
      if (out.error) return res.status(out.error).json({ error: out.error === 404 ? 'Not found' : 'Booking needs agreement to agent contact.', reason: out.reason });
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) { console.error('[incentiva] slots', e); res.status(500).json({ error: 'Could not load times.' }); }
  });
  router.post('/leads/:token/meetings', async (req, res) => {
    if (!rateLimit('book:' + ipHash(req), 20, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const out = await scheduling.book(tenantId, String(req.params.token || ''), req.body && req.body.starts_at);
      if (out.error) return res.status(out.error).json({ error: out.reason === 'slot_unavailable' ? 'That time was just taken. Pick another.' : out.reason === 'already_booked' ? 'You already have a consult booked.' : 'Could not book that time.', reason: out.reason });
      res.json(out);
    } catch (e) { console.error('[incentiva] book', e); res.status(500).json({ error: 'Could not book right now.' }); }
  });
  router.get('/meetings/:token', async (req, res) => {
    if (!rateLimit('meet:' + ipHash(req), 120, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const m = await scheduling.publicMeeting(tenantId, String(req.params.token || '')).catch(() => null);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
    res.json(m);
  });
  router.post('/meetings/:token/cancel', async (req, res) => {
    if (!rateLimit('meetc:' + ipHash(req), 20, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const out = await scheduling.cancelByBuyer(tenantId, String(req.params.token || '')).catch(() => ({ error: 500 }));
    if (out.error) return res.status(out.error).json({ error: 'Could not cancel.' });
    res.json(out);
  });
  router.post('/meetings/:token/feedback', async (req, res) => {
    if (!rateLimit('meetf:' + ipHash(req), 20, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const b = req.body || {};
    const out = await scheduling.buyerFeedback(tenantId, String(req.params.token || ''), b.rating, b.comment).catch(() => ({ error: 500 }));
    if (out.error) return res.status(out.error).json({ error: 'Could not save your feedback.' });
    res.json(out);
  });

  // ── Rachel: unsubscribe (page button, or RFC 8058 one-click POST from the mail client) ──
  router.post('/unsubscribe/:token', express.urlencoded({ extended: false }), async (req, res) => {
    if (!rateLimit('unsub:' + ipHash(req), 60, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const b = req.body || {};
    const channels = Array.isArray(b.channels) ? b.channels : b.channel ? [b.channel] : ['email', 'sms'];
    const out = await followup.unsubscribe(tenantId, String(req.params.token || ''), channels).catch(() => ({ ok: false }));
    if (!out.ok) return res.status(404).json({ error: 'Not found' });
    res.json(out);
  });

  // Twilio inbound SMS webhook: STOP / START / HELP. Signature-validated.
  router.post('/sms/inbound', express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const url = process.env.INCENTIVA_SMS_WEBHOOK_URL || ((process.env.INCENTIVA_PUBLIC_URL || 'https://buyersline.app').replace(/\/+$/, '') + '/api/v1/public/sms/inbound');
      const out = await sms.handleInbound(tenantId, req, url);
      if (out.status !== 200) return res.status(out.status).end();
      res.type('text/xml').send(out.twiml);
    } catch (e) { console.error('[incentiva] sms inbound', e); res.status(500).end(); }
  });

  router.post('/buying-power', async (req, res) => {
    if (!rateLimit('bp:' + ipHash(req), 60, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const market = await getMarket(tenantId);
      const b = req.body || {};
      const out = estimate({ gross_income_annual: numOrNull(b.gross_income_annual), monthly_debts: numOrNull(b.monthly_debts), down_payment: numOrNull(b.down_payment), target_payment: numOrNull(b.target_payment) },
        await effectiveSettings(market.settings), langOf(req.query.lang || b.lang));
      res.json(out);
    } catch (e) { console.error('[incentiva] buying-power', e); res.status(500).json({ error: 'Could not estimate right now.' }); }
  });

  router.post('/intake', async (req, res) => {
    const ih = ipHash(req);
    if (!rateLimit('intake:' + ih, Number(process.env.INCENTIVA_INTAKE_PER_HOUR || 10), 3600e3)) return res.status(429).json({ error: 'Too many submissions from this connection. Try again later.' });
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: 'Invalid submission' }); // honeypot
    const lang = langOf(b.lang);
    const c = b.criteria || {}, g = b.gates || {}, cons = b.consents || {};

    const missing = [];
    const firstName = clampStr(b.first_name, 120);
    const email = clampStr(b.email, 200);
    const zips = (Array.isArray(c.target_zips) ? c.target_zips : String(c.target_zips || '').split(/[,;\s]+/)).map((z) => String(z).trim()).filter((z) => /^\d{5}$/.test(z)).slice(0, 10);
    const place = clampStr(c.place_text, 120);
    const criteria = {
      target_zips: zips, place_text: place, radius_miles: [5, 10, 15, 25, 40].includes(Number(c.radius_miles)) ? Number(c.radius_miles) : 15,
      budget_max: numOrNull(c.budget_max), budget_monthly_max: numOrNull(c.budget_monthly_max), down_payment: numOrNull(c.down_payment),
      beds_min: numOrNull(c.beds_min), baths_min: numOrNull(c.baths_min),
      timeline: TIMELINE.includes(c.timeline) ? c.timeline : null, financing: FINANCING.includes(c.financing) ? c.financing : null,
      must_haves: (Array.isArray(c.must_haves) ? c.must_haves : []).filter((k) => MUST_HAVES.includes(k))
    };
    const hasOther = ['no', 'yes_under_agreement', 'yes_informal'].includes(g.has_other_agent) ? g.has_other_agent : null;
    if (!firstName) missing.push('first_name');
    if (!hasOther) missing.push('gates.has_other_agent');
    if (hasOther === 'yes_under_agreement') {
      // Do not solicit a buyer represented by another agent. Keep the minimum: a first name and the fact.
      try {
        const market = await getMarket(tenantId);
        if (!firstName) return res.status(400).json({ error: 'Please complete the required fields.', missing });
        const r = await db.exec(`INSERT INTO nca_buyers (tenant_id, market_id, first_name, preferred_language, stage, has_other_agent, ip_hash)
          VALUES (:t, :m, :f, :l, 'has_other_agent', 'yes_under_agreement', :ih) RETURNING id`, { t: tenantId, m: market.id, f: firstName, l: lang, ih });
        await activity(tenantId, r[0].id, { type: 'buyer' }, 'stopped_other_agent', {});
        return res.json({ status: 'stopped_other_agent', message: t(lang, 'stopped_other_agent') });
      } catch (e) { console.error('[incentiva] intake stop', e); return res.status(500).json({ error: 'Could not save. Try again.' }); }
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) missing.push('email');
    if (!zips.length && !place) missing.push('criteria.target_zips');
    if (!(criteria.budget_max > 0)) missing.push('criteria.budget_max');
    if (!(criteria.beds_min >= 0) || criteria.beds_min === null) missing.push('criteria.beds_min');
    if (!criteria.timeline) missing.push('criteria.timeline');
    if (!criteria.financing) missing.push('criteria.financing');
    if (missing.length) return res.status(400).json({ error: 'Please complete the required fields.', missing });

    try {
      const market = await getMarket(tenantId);
      const agentCandidate = await defaultAgent(tenantId, market);
      const share = cons.share_with_agent === true;
      const agentId = share && agentCandidate ? agentCandidate.id : null;
      const texts = consentTexts(lang, agentCandidate); // stored wording is what the SERVER showed, not what a client claims
      const visits = (Array.isArray(g.prior_builder_visits) ? g.prior_builder_visits : []).slice(0, 10)
        .map((v) => ({ builder: clampStr(v.builder, 120), community: clampStr(v.community, 120), signed_guest_card: v.signed_guest_card === true }))
        .filter((v) => v.builder || v.community);

      const r = await db.exec(`INSERT INTO nca_buyers (tenant_id, market_id, agent_id, first_name, email, phone, preferred_language, stage, has_other_agent, ip_hash)
        VALUES (:t, :m, :a, :f, :e, :p, :l, 'intake_complete', :h, :ih) RETURNING *`, {
        t: tenantId, m: market.id, a: agentId, f: firstName, e: email.toLowerCase(), p: clampStr(b.phone, 40), l: lang, h: hasOther, ih
      });
      const buyer = r[0];
      const cr = await db.exec(`INSERT INTO nca_buyer_criteria (tenant_id, buyer_id, criteria, prior_builder_visits) VALUES (:t, :b, :c, :v) RETURNING id`,
        { t: tenantId, b: buyer.id, c: JSON.stringify(criteria), v: JSON.stringify(visits) });
      for (const [channel, key, text] of [['email', 'email', texts.email], ['sms', 'sms', texts.sms], ['share_with_agent', 'share_with_agent', texts.share]]) {
        await db.exec(`INSERT INTO nca_consents (tenant_id, buyer_id, channel, granted, consent_text, consent_version, ip_hash) VALUES (:t, :b, :ch, :g, :tx, :v, :ih)`,
          { t: tenantId, b: buyer.id, ch: channel, g: cons[key] === true && !(channel === 'sms' && !buyer.phone), tx: text, v: CONSENT_VERSION, ih });
      }
      await activity(tenantId, buyer.id, { type: 'buyer' }, 'intake_complete', { prior_visits: visits.length, has_other_agent: hasOther });

      const built = await buildReport(tenantId, { buyer, criteria, criteriaId: cr[0].id, lang, allowModel, allowGeocode });
      if (built.report.status === 'ready') notify.later(notify.buyerReportReady, tenantId, built.report.id);
      else notify.later(notify.reviewerReportWaiting, tenantId, built.report.id);
      const base = req.baseUrl.replace(/\/api\/v1\/public$/, '');
      res.json({ status: built.report.status === 'ready' ? 'report_ready' : 'pending_review', token: built.report.token, report_url: `${base}/r/${built.report.token}?lang=${lang}` });
    } catch (e) {
      console.error('[incentiva] intake', e);
      res.status(500).json({ error: 'We could not prepare your report right now. Please try again in a few minutes.' });
    }
  });

  // New-construction listing search (RentCast). Public, rate-limited, cached per area.
  router.get('/listings', async (req, res) => {
    if (!rateLimit('listings:' + ipHash(req), Number(process.env.INCENTIVA_LISTINGS_PER_HOUR || 60), 3600e3)) return res.status(429).json({ error: 'Too many searches. Try again later.' });
    try {
      const out = await rentcast.search(tenantId, req.query, { allowGeocode });
      res.setHeader('Cache-Control', 'no-store');
      const code = out.status === 'invalid' ? 400 : out.status === 'not_configured' ? 503 : out.status === 'upstream_error' ? 502 : out.status === 'cap_reached' ? 503 : 200;
      res.status(code).json(out);
    } catch (e) { console.error('[incentiva] listings', e); res.status(500).json({ status: 'error', error: 'Search is unavailable right now.' }); }
  });

  router.get('/reports/:token', async (req, res) => {
    try {
      const tok = String(req.params.token || '');
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return res.status(404).json({ error: 'Report not found' });
      const report = await db.one('SELECT * FROM nca_reports WHERE token = :tok AND tenant_id = :t', { tok, t: tenantId });
      if (!report || report.status === 'superseded') return res.status(404).json({ error: 'Report not found' });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      const lang = req.query.lang === 'es' || req.query.lang === 'en' ? req.query.lang : report.language;
      if (report.status !== 'ready') {
        const p = report.payload[lang] || report.payload[report.language];
        return res.json({ status: 'pending_review', language: report.language, buyer_first_name: p.buyer_first_name, agent: p.agent });
      }
      res.json(await publicView(tenantId, report, lang));
    } catch (e) { console.error('[incentiva] report', e); res.status(500).json({ error: 'Could not load the report.' }); }
  });

  router.post('/reports/:token/consult-request', async (req, res) => {
    if (!rateLimit('consult:' + ipHash(req), 10, 3600e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    try {
      const tok = String(req.params.token || '');
      const report = /^[A-Za-z0-9_-]{20,64}$/.test(tok) ? await db.one('SELECT id, buyer_id, agent_id FROM nca_reports WHERE token = :tok AND tenant_id = :t', { tok, t: tenantId }) : null;
      if (!report) return res.status(404).json({ error: 'Report not found' });
      const channel = ['call', 'video', 'text'].includes(req.body.channel) ? req.body.channel : null;
      const times = clampStr(req.body.preferred_times, 500);
      if (!channel || !times) return res.status(400).json({ error: 'Choose how to talk and when works for you.' });
      const open = await db.one(`SELECT id FROM nca_appointments WHERE tenant_id = :t AND buyer_id = :b AND status = 'requested'`, { t: tenantId, b: report.buyer_id });
      if (open) {
        await db.exec('UPDATE nca_appointments SET preferred_times = :p, channel = :c WHERE id = :id', { p: times, c: channel, id: open.id });
      } else {
        await db.exec(`INSERT INTO nca_appointments (tenant_id, buyer_id, agent_id, report_id, channel, preferred_times) VALUES (:t, :b, :a, :r, :c, :p)`,
          { t: tenantId, b: report.buyer_id, a: report.agent_id, r: report.id, c: channel, p: times });
      }
      await db.exec(`UPDATE nca_buyers SET stage = 'consult_booked', stage_changed_at = now(), updated_at = now() WHERE id = :b AND tenant_id = :t AND stage IN ('intake_complete','report_sent')`, { b: report.buyer_id, t: tenantId });
      await activity(tenantId, report.buyer_id, { type: 'buyer' }, 'consult_requested', { channel });
      await audit(tenantId, { type: 'buyer' }, 'consult.request', 'report', report.id, {});
      res.json({ ok: true });
    } catch (e) { console.error('[incentiva] consult', e); res.status(500).json({ error: 'Could not send your request. Try again.' }); }
  });

  return router;
};

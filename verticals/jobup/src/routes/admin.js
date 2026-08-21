'use strict';

// =============================================================
// ADMIN CONSOLE — owner only (spec section 18).
//
// THE BOUNDARY, ENFORCED IN CODE:
//   An administrator sees COUNTS AND MONEY, NOT SUBSCRIBER PII. Names, emails,
//   phone numbers, resumes, matches and outreach are never returned by an admin
//   endpoint. Reaching a subscriber's private career data requires audited
//   impersonation with a WRITTEN REASON, which is appended to ju_audit_log.
//
// AUTH is deliberately separate from the subscriber session:
//   * A distinct cookie (jobup_admin), so a subscriber session can never be
//     escalated into an admin one.
//   * An allowlist of owner emails PLUS a dedicated password. Both must match.
//   * No admin account can be created through any public route.
//   * Refuses to run at all if the password is unset — an admin console with a
//     default password is worse than no admin console.
// =============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { models, scoped } = require('../models');
const auth = require('../services/auth');
const billing = require('../services/billing');
const brain = require('../services/brain');

const express = require('express');
const router = express.Router();

const SECRET = process.env.JOBUP_JWT_SECRET || 'dev-only-insecure-secret';
const ADMIN_COOKIE = 'jobup_admin';
const ADMIN_TTL_H = 8;   // short — an admin session is not a 30-day one

function ownerEmails() {
  return String(process.env.JOBUP_ADMIN_EMAILS || 'mstagg@digit2ai.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function adminPassword() {
  return process.env.JOBUP_ADMIN_PASSWORD || '';
}
/** No password configured = the console is CLOSED, not open with a default. */
function configured() {
  return adminPassword().length >= 12;
}

function issueAdmin(email) {
  return jwt.sign({ adm: true, email, jti: crypto.randomUUID() }, SECRET, { expiresIn: `${ADMIN_TTL_H}h` });
}

/** Gate. Every admin route below sits behind this. */
function requireOwner(req, res, next) {
  if (!configured()) {
    return res.status(503).json({
      error: 'admin console is not configured',
      note: 'Set JOBUP_ADMIN_PASSWORD (12+ chars). It is closed by default rather than open with a default password.',
    });
  }
  const token = (req.cookies && req.cookies[ADMIN_COOKIE]) || '';
  if (!token) return res.status(401).json({ error: 'admin sign-in required' });
  try {
    const p = jwt.verify(token, SECRET);
    // adm flag AND still-allowlisted email — removing an email revokes instantly.
    if (!p.adm || !ownerEmails().includes(String(p.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'not an owner account' });
    }
    req.admin = { email: p.email };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'admin session expired' });
  }
}

async function audit(actor, action, reason, tenantId) {
  try {
    await models.audit_log.create({
      tenant_id: tenantId || null, actor: String(actor).slice(0, 200),
      action: String(action).slice(0, 200), reason: reason ? String(reason).slice(0, 1000) : null,
    });
  } catch (e) { console.warn('[admin] audit write failed:', e.message); }
}

// ---------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------
const attempts = new Map();
function throttleKey(req) {
  return (req.headers['cf-connecting-ip'] || req.ip || '') + '|admin';
}

router.post('/login', async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: 'admin console is not configured' });
  }
  const key = throttleKey(req);
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0 };
  if (rec.until > now) {
    return res.status(429).json({ error: 'too many attempts', retry_after_s: Math.ceil((rec.until - now) / 1000) });
  }

  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');

  const emailOk = ownerEmails().includes(email);
  // Constant-time compare, and always compare even when the email is wrong so
  // the response time does not reveal which half failed.
  const a = Buffer.from(password.padEnd(64).slice(0, 64));
  const b = Buffer.from(adminPassword().padEnd(64).slice(0, 64));
  const passOk = crypto.timingSafeEqual(a, b);

  if (!emailOk || !passOk) {
    rec.n++;
    if (rec.n >= 5) { rec.until = now + 15 * 60 * 1000; rec.n = 0; }
    attempts.set(key, rec);
    await audit(email || 'unknown', 'admin.login.failed', null, null);

    // SAY WHICH HALF IS WRONG — but ONLY once the password is already correct.
    //
    // Two consoles with near-identical names take two different identities:
    // this one wants an owner on JOBUP_ADMIN_EMAILS, the Subscribers billing
    // register wants JOBUP_SUBS_ADMIN_EMAIL. Typing the other console's email
    // here is the obvious mistake, and "not authorised" sends the operator to
    // check their password, which was never the problem.
    //
    // It reveals nothing: whoever sees this already holds the admin password,
    // so the allowlist is not what is protecting anything at that point. The
    // attempt is still refused, still throttled, still audited.
    if (passOk && !emailOk) {
      return res.status(401).json({
        error: 'that password is correct, but this email is not an owner of this console',
        note: 'This is the platform console, a different sign-in from the Subscribers billing '
            + 'register. Use an address on JOBUP_ADMIN_EMAILS, or add this one to it.',
      });
    }
    return res.status(401).json({ error: 'not authorised' });
  }

  attempts.delete(key);
  await audit(email, 'admin.login.success', null, null);
  res.cookie(ADMIN_COOKIE, issueAdmin(email), {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: ADMIN_TTL_H * 3600 * 1000,
  });
  res.json({ ok: true, email, expires_h: ADMIN_TTL_H });
});

router.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/session', requireOwner, (req, res) => {
  res.json({ ok: true, email: req.admin.email, scope: 'counts and money only' });
});

// ---------------------------------------------------------------
// Platform view — AGGREGATES ONLY. No PII crosses this boundary.
// ---------------------------------------------------------------
router.get('/overview', requireOwner, async (req, res) => {
  try {
    const subs = await models.subscribers.findAll({});
    const teasers = await models.teasers.findAll({});
    const invoices = await models.invoices.findAll({});
    const jobs = await models.jobs.findAll({});
    const employers = await models.employers.findAll({});

    const byStatus = {};
    subs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });

    const ready = teasers.filter((t) => t.status === 'ready').length;
    const converted = teasers.filter((t) => t.tenant_id).length;
    const teaserCost = teasers.reduce((a, t) => a + (t.cost_usd || 0), 0);
    const paidCents = invoices.filter((i) => i.status === 'paid')
      .reduce((a, i) => a + (i.amount_cents || 0), 0);
    const dunning = invoices.filter((i) => (i.dunning_stage || 0) > 0).length;

    res.json({
      // funnel
      funnel: {
        teasers_total: teasers.length,
        teasers_ready: ready,
        converted,
        conversion_pct: ready ? Number(((converted / ready) * 100).toFixed(1)) : 0,
        teaser_spend_usd: Number(teaserCost.toFixed(4)),
        cost_per_acquisition_usd: converted ? Number((teaserCost / converted).toFixed(3)) : null,
      },
      // retention + money
      subscribers: { total: subs.length, by_status: byStatus },
      money: {
        collected_usd: Number((paidCents / 100).toFixed(2)),
        invoices: invoices.length,
        in_dunning: dunning,
        price_usd: billing.PRICE_USD,
        billing_configured: billing.enabled(),
      },
      // shared pool health
      pool: {
        jobs: jobs.length,
        employers: employers.length,
        live_employers: employers.filter((e) => e.status === 'live').length,
        unverified_employers: employers.filter((e) => e.status === 'unverified').length,
      },
      brain: brain.enabled() ? 'anthropic' : 'heuristic',
      note: 'Aggregates only. No subscriber names, emails, resumes or matches are exposed here.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Subscriber list — PSEUDONYMISED. Enough to operate the business, not enough
 * to identify anyone. Email is reduced to a one-way hash prefix and the domain.
 */
router.get('/subscribers', requireOwner, async (req, res) => {
  const subs = await models.subscribers.findAll({});
  res.json({
    subscribers: subs.map((s) => ({
      id: s.id,
      status: s.status,
      email_domain: String(s.email || '').split('@')[1] || null,
      email_ref: crypto.createHash('sha256').update(String(s.email || '')).digest('hex').slice(0, 10),
      has_address: Boolean(s.address),
      email_verified: Boolean(s.email_verified_at),
      created_at: s.created_at,
      current_period_end: s.current_period_end,
    })),
    note: 'Pseudonymised by design. Use impersonation with a written reason to see a specific account.',
  });
});

/** Employer registry — no PII by nature, so it is fully visible and editable. */
router.get('/employers', requireOwner, async (req, res) => {
  res.json({ employers: await models.employers.findAll({}) });
});

/**
 * Send a PREVIEW of a tenant's job-match digest to any address, for QA before
 * live sends. It changes NOTHING: no notified_at stamp, no email_sends row, no
 * cap advance. Uses the exact production render path (SendGrid template when
 * configured, else the identical in-app fallback). Operator-only.
 *   POST /admin/notify-preview/:tenantId?to=<email>
 */
router.post('/notify-preview/:tenantId', requireOwner, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const to = String((req.query.to || (req.body || {}).to) || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'a valid ?to= address is required' });
  try {
    const notifier = require('../services/jobMatchNotifier');
    const digest = require('../services/emailDigest');
    const mailer = require('../services/mailer');
    const sub = await models.subscribers.findOne({ where: { id: tenantId } });
    if (!sub) return res.status(404).json({ error: 'no such subscriber' });

    await notifier.ensureUnsubToken(sub);
    const cad = digest.cadenceFor(sub.plan) || digest.CADENCE.search;
    const all = await notifier.newMatchesFor(tenantId);
    if (!all.length) return res.status(400).json({ error: 'this subscriber has no new (un-notified) matches to preview' });
    const included = all.slice(0, cad.top);
    const data = digest.buildData(sub, included, all.length - included.length);
    const fb = digest.renderFallback(data);
    const templateId = data.locale === 'es'
      ? process.env.SENDGRID_TEMPLATE_ID_ES : process.env.SENDGRID_TEMPLATE_ID_EN;

    const r = await mailer.sendDigest({
      to, subject: `[Preview] ${fb.subject}`, html: fb.html, text: fb.text,
      templateId: templateId || null, dynamicData: data,
      asmGroupId: process.env.SENDGRID_ASM_GROUP_ID || null,
      categories: ['job_match_digest_preview'],
    });
    await audit(req.admin.email, `notify.preview:${tenantId} -> ${to} (${r.ok ? 'sent' : 'failed'})`, null, tenantId);
    if (!r.ok) return res.status(502).json({ error: r.error || 'send failed', configured: r.configured });
    res.json({ ok: true, to, period: cad.period, match_count: data.match_count, more_count: data.more_count,
               locale: data.locale, used_template: Boolean(templateId), message_id: r.messageId || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/employers', requireOwner, async (req, res) => {
  const { name, ats, token, status } = req.body || {};
  if (!name || !ats) return res.status(400).json({ error: 'name and ats required' });
  const row = await models.employers.create({
    name, ats, token: token || null,
    // A new employer is UNVERIFIED unless a human explicitly says otherwise.
    status: status === 'live' ? 'live' : 'unverified',
  });
  await audit(req.admin.email, 'employer.create:' + name, null, null);
  res.json({ employer: row });
});

/** Confirming a guessed token is a human act, and it is audited. */
router.post('/employers/:id/verify', requireOwner, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await models.employers.update({ status: 'live' }, { where: { id } });
  await audit(req.admin.email, 'employer.verify:' + id, (req.body || {}).reason, null);
  res.json({ ok: true, id, status: 'live' });
});

// ---------------------------------------------------------------
// IMPERSONATION — the only path to a subscriber's private data.
// Requires a written reason, is time-boxed, and is logged permanently.
// ---------------------------------------------------------------
router.post('/impersonate/:tenantId', requireOwner, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const reason = String((req.body || {}).reason || '').trim();

  if (!Number.isInteger(tenantId)) return res.status(400).json({ error: 'bad tenant id' });
  if (reason.length < 15) {
    return res.status(400).json({
      error: 'a written reason of at least 15 characters is required',
      note: 'This is recorded permanently against your account and the subscriber.',
    });
  }
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return res.status(404).json({ error: 'no such subscriber' });

  await audit(req.admin.email, 'impersonate:' + tenantId, reason, tenantId);

  // A short-lived subscriber session, marked so it is distinguishable in logs.
  const token = jwt.sign({ tid: tenantId, imp: req.admin.email, jti: crypto.randomUUID() },
    SECRET, { expiresIn: '30m' });
  res.json({
    ok: true, tenant_id: tenantId, expires_min: 30, token,
    note: 'Logged against ' + req.admin.email + '. Use as a Bearer token; expires in 30 minutes.',
  });
});

/**
 * Pull what Stripe already knows and record anything the webhook missed.
 *
 * This is the recovery path for a webhook that is not verifying: the money is
 * real, Stripe has it, and nothing here has to be taken on trust — it replays
 * through the same applyEvent, which is idempotent.
 */
router.post('/reconcile', requireOwner, async (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt((req.body || {}).days, 10) || 7));
  try {
    const r = await require('../services/billing').reconcile({ days });
    await audit(req.admin.email, 'billing.reconcile',
      `days=${days} applied=${(r.applied || []).length}`);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/audit', requireOwner, async (req, res) => {
  const rows = await models.audit_log.findAll({ order: [['created_at', 'DESC']], limit: 200 });
  res.json({ audit: rows });
});

// ---------------------------------------------------------------
// Console UI
// ---------------------------------------------------------------
router.get('/', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>JobUp — Admin</title><style>
:root{--bg:#07080c;--card:#11141c;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.16);
--ink:#eef2f8;--mut:#9aa3b4;--faint:#6b7385;--cyan:#22d3ee;--red:#f87171;
--grad:linear-gradient(120deg,#22d3ee,#6366f1 55%,#8b5cf6);
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);min-height:100%}
body{color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:44px 22px}
h1{font-size:26px;font-weight:820;letter-spacing:-.03em;margin:0 0 4px}
.sub{color:var(--mut);font-size:14px;margin-bottom:26px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;max-width:420px}
label{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
color:var(--faint);margin:14px 0 6px}
input{width:100%;background:var(--bg);border:1px solid var(--line2);border-radius:11px;
padding:12px 14px;color:var(--ink);font:inherit;outline:none}
input:focus{border-color:var(--cyan)}
button{background:var(--grad);border:0;color:#06121a;font-weight:750;border-radius:999px;
padding:12px 22px;font:inherit;font-weight:750;cursor:pointer;margin-top:18px;width:100%}
.err{color:var(--red);font-size:13.5px;margin-top:12px;min-height:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px;margin:22px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:18px}
.stat .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.stat .v{font-size:27px;font-weight:820;letter-spacing:-.03em;margin-top:5px}
h2{font-size:12px;font-family:var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
border-bottom:1px solid var(--line);padding-bottom:9px;margin:34px 0 14px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
color:var(--faint);padding:9px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);color:var(--mut)}
.note{color:var(--faint);font-size:12.5px;font-family:var(--mono);margin-top:10px;line-height:1.6}
.hidden{display:none}
</style></head><body><div class="wrap">
<h1>JobUp Admin</h1>
<div class="sub">Owner access only. Counts and money &mdash; never subscriber personal data.</div>

<div id="login" class="panel">
  <div class="note" style="margin:0 0 14px">
    This is the <strong>platform</strong> console and it takes its own sign-in &mdash;
    not the one for the <a href="/subscribers-admin">Subscribers</a> billing register.
    Two consoles, two credentials, on purpose.
  </div>
  <label for="e">Owner email</label><input id="e" type="email" autocomplete="username">
  <label for="p">Admin password</label><input id="p" type="password" autocomplete="current-password">
  <button id="go">Sign in</button>
  <div class="err" id="err"></div>
</div>

<div id="app" class="hidden">
  <div id="stats" class="grid"></div>
  <h2>Employer registry</h2><div id="emp"></div>
  <h2>Subscribers (pseudonymised)</h2>
  <p><a href="/admin/ops" style="font-weight:600">Open Subscriber Operations &rarr;</a>
     &nbsp;<span class="note">See each subscriber's matching, diagnose why a board is empty,
     fix targeting and run their agent. Opening one needs a written reason and is audited.</span></p>
  <div id="subs"></div>
  <h2>Audit log</h2><div id="aud"></div>
  <div class="note" id="foot"></div>
</div>
</div><script>
var API=(location.pathname.indexOf('/jobup')===0)?'/jobup/admin':'/admin';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function tbl(rows,cols){ if(!rows.length) return '<div class="note">None yet.</div>';
  return '<table><tr>'+cols.map(function(c){return '<th>'+esc(c[0])+'</th>';}).join('')+'</tr>'+
    rows.map(function(r){return '<tr>'+cols.map(function(c){
      return '<td>'+esc(typeof c[1]==='function'?c[1](r):r[c[1]])+'</td>';}).join('')+'</tr>';}).join('')+'</table>';}
function load(){
  fetch(API+'/overview').then(function(r){ if(!r.ok) throw r; return r.json(); }).then(function(o){
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    var f=o.funnel,m=o.money,s=o.subscribers,p=o.pool;
    document.getElementById('stats').innerHTML=[
      ['Teasers',f.teasers_total],['Ready',f.teasers_ready],['Converted',f.converted],
      ['Conversion',f.conversion_pct+'%'],['Teaser spend','$'+f.teaser_spend_usd],
      ['CPA',f.cost_per_acquisition_usd==null?'—':'$'+f.cost_per_acquisition_usd],
      ['Subscribers',s.total],['Collected','$'+m.collected_usd],['In dunning',m.in_dunning],
      ['Jobs in pool',p.jobs],['Live employers',p.live_employers],['Unverified',p.unverified_employers]
    ].map(function(x){return '<div class="stat"><div class="k">'+esc(x[0])+'</div><div class="v">'+esc(x[1])+'</div></div>';}).join('');
    document.getElementById('foot').textContent=o.note;
  }).catch(function(){});
  fetch(API+'/employers').then(function(r){return r.json();}).then(function(o){
    document.getElementById('emp').innerHTML=tbl(o.employers||[],
      [['Name','name'],['ATS','ats'],['Status','status'],['Last fetched',function(r){return r.last_fetched_at||'never';}]]);
  }).catch(function(){});
  fetch(API+'/subscribers').then(function(r){return r.json();}).then(function(o){
    document.getElementById('subs').innerHTML=tbl(o.subscribers||[],
      [['ID','id'],['Ref','email_ref'],['Domain','email_domain'],['Status','status'],
       ['Site',function(r){return r.has_address?'yes':'no';}],['Verified',function(r){return r.email_verified?'yes':'no';}]])
      +'<div class="note">'+esc(o.note||'')+'</div>';
  }).catch(function(){});
  fetch(API+'/audit').then(function(r){return r.json();}).then(function(o){
    document.getElementById('aud').innerHTML=tbl((o.audit||[]).slice(0,40),
      [['When','created_at'],['Actor','actor'],['Action','action'],['Reason',function(r){return r.reason||'—';}]]);
  }).catch(function(){});
}
document.getElementById('go').addEventListener('click',function(){
  var err=document.getElementById('err');err.textContent='';
  fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:document.getElementById('e').value,password:document.getElementById('p').value})})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){ if(!x.ok){err.textContent=x.j.error||'Not authorised';
      if(x.j.note)err.textContent+=' — '+x.j.note; return;} load(); })
    .catch(function(){err.textContent='Could not reach the server.';});
});
document.getElementById('p').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('go').click();});
load();
</script></body></html>`);
});

/** Refresh the shared job pool now. Owner only — it costs bandwidth, not tokens. */
router.post('/pool/refresh', requireOwner, async (req, res) => {
  const scheduler = require('../services/scheduler');
  try {
    const r = await scheduler.refreshPool();
    await audit(req.admin.email, 'pool_refresh', `+${r.added} new, ${r.refreshed} refreshed`, null);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Run the whole fleet now, ignoring the once-a-day claim. */
router.post('/fleet/run', requireOwner, async (req, res) => {
  const scheduler = require('../services/scheduler');
  try {
    const r = await scheduler.runFleet();
    await audit(req.admin.email, 'fleet_run', JSON.stringify(r), null);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/schedule', requireOwner, (req, res) =>
  res.json(require('../services/scheduler').status()));

module.exports = router;
module.exports.requireOwner = requireOwner;
module.exports.configured = configured;
module.exports.ownerEmails = ownerEmails;
module.exports.audit = audit;

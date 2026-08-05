'use strict';

// =============================================================
// The three agents (spec section 10). Each has a schedule, a cost cap, an
// activity log and a dashboard surface.
//
// GLOBAL CONCURRENCY CEILING (spec section 4): agent runs fan out per
// subscriber inside a ceiling. A thousand tenants must never mean a thousand
// simultaneous LLM calls.
// =============================================================

const { models, scoped } = require('../../models');
const jobsource = require('../jobsource');
const matcher = require('../matcher');
const settingsSvc = require('../settings');
const identity = require('../identity');

const CONCURRENCY = parseInt(process.env.JOBUP_AGENT_CONCURRENCY || '4', 10);

async function loadContext(tenantId) {
  const t = scoped('profiles', tenantId);
  const profileRow = await t.findOne({});
  const sRow = await scoped('settings', tenantId).findOne({});
  return {
    profile: (profileRow && profileRow.resume_json) || {},
    sourceText: (profileRow && profileRow.source_text) || '',
    settings: settingsSvc.sanitize((sRow && sRow.settings) || {}),
  };
}

async function log(tenantId, agent, status, summary, cost, isSimulated) {
  return scoped('agent_runs', tenantId).create({
    agent, status, summary, cost_usd: cost || 0, is_simulated: Boolean(isSimulated),
  });
}

// ---------------------------------------------------------------
// Agent 1 — Opportunity Hunter
// ---------------------------------------------------------------
async function hunter(tenantId, opts = {}) {
  const { profile, settings, sourceText } = await loadContext(tenantId);
  const perDay = (settings.quotas && settings.quotas.jobs_scored_per_day) || 6;
  const cap = Math.min(settings.cost_cap_usd / 30, opts.capUsd || 0.05); // monthly cap / ~30 days

  const pool = await models.jobs.findAll({ limit: 500 });
  if (!pool.length) {
    await log(tenantId, 'hunter', 'idle', 'Shared job pool is empty — nothing to score.', 0, false);
    return { agent: 'hunter', scored: 0, note: 'pool empty' };
  }

  // COST MECHANIC #2 — free deterministic pre-filter before any model call.
  const ranked = jobsource.prefilter(pool, profile, settings, sourceText);

  // Skip anything already matched for this tenant.
  const existing = await scoped('job_matches', tenantId).findAll({});
  const seen = new Set(existing.map((m) => m.job_id));
  const fresh = ranked.filter((r) => !seen.has(r.job.id)).slice(0, perDay);

  if (!fresh.length) {
    await log(tenantId, 'hunter', 'idle', 'No new candidates after pre-filter.', 0, false);
    return { agent: 'hunter', scored: 0, note: 'nothing new' };
  }

  const res = await matcher.scoreBatch(fresh.map((r) => r.job), profile, settings,
    { capUsd: cap, limit: perDay });

  for (const m of res.matches) {
    await scoped('job_matches', tenantId).create({
      job_id: m.job_id, score: m.score, explanation: m.explanation,
      missing: m.missing, stage: 'new', is_simulated: m.is_simulated,
    });
  }

  const simulated = res.matches.some((m) => m.is_simulated);
  await log(tenantId, 'hunter', 'ok',
    `Scored ${res.matches.length} new openings${res.stopped_for_cap ? ' (stopped at cost cap)' : ''}.`,
    res.cost_usd, simulated);

  return { agent: 'hunter', scored: res.matches.length, cost_usd: res.cost_usd,
           stopped_for_cap: res.stopped_for_cap, is_simulated: simulated };
}

// ---------------------------------------------------------------
// Agent 2 — Career Broadcaster
//
// approval_required is forced on in settings.sanitize(). Nothing here can send.
// ---------------------------------------------------------------
async function broadcaster(tenantId, opts = {}) {
  const { settings } = await loadContext(tenantId);

  // Draft only. approved_at and sent_at are left null BY CONSTRUCTION.
  const matches = await scoped('job_matches', tenantId).findAll({
    where: { stage: 'new' }, order: [['score', 'DESC']], limit: opts.limit || 3,
  });

  const drafted = [];
  for (const m of matches) {
    const job = await models.jobs.findOne({ where: { id: m.job_id } });
    if (!job) continue;
    if (settingsSvc.employerBlocked(settings, job.employer)) continue;  // absolute

    const facts = settingsSvc.outreachFacts(settings);
    const row = await scoped('outreach', tenantId).create({
      channel: 'email',
      subject: `Interest in ${job.title} at ${job.employer}`,
      body: [
        `Regarding the ${job.title} role at ${job.employer}.`,
        m.explanation || '',
        ...facts.lines,   // owner-entered, verbatim, or absent
      ].filter(Boolean).join('\n\n'),
      approved_at: null,   // NEVER set here
      sent_at: null,       // NEVER set here
      consent_snapshot: null,
    });
    drafted.push(row.id);
  }

  await log(tenantId, 'broadcaster', 'ok',
    `Drafted ${drafted.length} outreach messages. All awaiting subscriber approval.`, 0, false);
  return { agent: 'broadcaster', drafted: drafted.length, approval_required: true, sent: 0 };
}

// ---------------------------------------------------------------
// Agent 3 — Professional Presence Agent
// ---------------------------------------------------------------
async function presence(tenantId) {
  const { profile, settings } = await loadContext(tenantId);
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  const url = sub && sub.address ? `https://${sub.address}` : null;

  const gaps = [];
  if (!profile.headline) gaps.push('No headline — recruiters and search engines both key on it.');
  if (!profile.summary) gaps.push('No professional summary.');
  if (!(profile.skills || []).length) gaps.push('No skills listed — this is what matching scores against.');
  if (!(profile.experience || []).length) gaps.push('No employment history.');
  if (!settingsSvc.pageRoles(settings).length) gaps.push('No role targets set — no indexable role pages will be generated.');

  // ONE SOURCE OF TRUTH: every surface is regenerated from the same record.
  const surfaces = url ? {
    resume_json: identity.resumeJson(profile, settings, { name: profile.name, url }),
    json_ld: identity.personJsonLd(profile, settings, { name: profile.name, url }),
    agent_card: identity.agentCard(profile, settings, { name: profile.name, url, slug: 'me' }),
    llms_txt: identity.llmsTxt(profile, settings, { name: profile.name, url }),
    sitemap: identity.sitemapXml({ url, roles: settingsSvc.pageRoles(settings) }),
    robots: identity.robotsTxt({ url }),
  } : null;

  await scoped('sites', tenantId).update({ health: { checked_at: new Date(), gaps } }, {});

  await log(tenantId, 'presence', 'ok',
    `Profile reviewed. ${gaps.length} gap(s) found. Surfaces regenerated from one source of truth.`, 0, false);

  return { agent: 'presence', gaps, surfaces_regenerated: Boolean(surfaces), url };
}

/** Fan out across tenants inside the global concurrency ceiling. */
async function runAll(agentName, tenantIds) {
  const fn = { hunter, broadcaster, presence }[agentName];
  if (!fn) throw new Error('unknown agent: ' + agentName);
  const out = [];
  for (let i = 0; i < tenantIds.length; i += CONCURRENCY) {
    const slice = tenantIds.slice(i, i + CONCURRENCY);
    const res = await Promise.all(slice.map((t) => fn(t).catch((e) => ({ error: e.message, tenant: t }))));
    out.push(...res);
  }
  return out;
}

module.exports = { hunter, broadcaster, presence, runAll, CONCURRENCY, loadContext };

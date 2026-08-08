'use strict';

/**
 * ENGAGEMENT STORE — every read filters on BOTH tenant_id and the row id.
 *
 * That is not belt-and-braces. The Brain already deletes a model-supplied
 * tenant_id, so the tenant on `ctx` is trustworthy — but a tool receives an
 * `engagement_id` straight from the caller, and a lookup by primary key alone
 * would happily return another sponsor's engagement. The pairing is what makes
 * a guessed id read as "not found" rather than as somebody else's CEO
 * interview, which in this department is unusually sensitive material.
 */

const crypto = require('crypto');
const { Engagement, Answer, Finding, Roadmap } = require('../models');

async function createEngagement(tenant_id, data = {}) {
  return Engagement.create({
    tenant_id,
    sponsor_id: data.sponsor_id || null,
    company_name: String(data.company_name || '').slice(0, 200),
    ceo_name: data.ceo_name ? String(data.ceo_name).slice(0, 200) : null,
    industry: data.industry ? String(data.industry).slice(0, 120) : null,
    country: data.country ? String(data.country).slice(0, 80) : null,
    headcount: Number.isFinite(Number(data.headcount)) ? Number(data.headcount) : null,
    revenue_band: data.revenue_band || null,
    lang: data.lang === 'es' ? 'es' : 'en',
    stage: 'intake',
    created_at: new Date(),
    updated_at: new Date()
  });
}

async function loadEngagement(tenant_id, engagement_id) {
  if (!engagement_id) return null;
  return Engagement.findOne({ where: { tenant_id, id: engagement_id } });
}

async function listEngagements(tenant_id, { stage } = {}) {
  const where = { tenant_id };
  if (stage) where.stage = stage;
  const rows = await Engagement.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
  return rows.map(r => ({
    id: r.id, company_name: r.company_name, ceo_name: r.ceo_name,
    industry: r.industry, stage: r.stage, lang: r.lang,
    decision: r.decision, created_at: r.created_at, share_token: r.share_token
  }));
}

async function updateEngagement(tenant_id, engagement_id, patch = {}) {
  const eng = await loadEngagement(tenant_id, engagement_id);
  if (!eng) return null;
  Object.keys(patch).forEach(k => { if (patch[k] !== undefined) eng[k] = patch[k]; });
  eng.updated_at = new Date();
  await eng.save();
  return eng;
}

/**
 * All interview answers as { section: payload }.
 * Returns null when the engagement does not exist for this tenant, so callers
 * can distinguish "no such engagement" from "engagement with no answers yet".
 */
async function loadAnswers(tenant_id, engagement_id) {
  const eng = await loadEngagement(tenant_id, engagement_id);
  if (!eng) return null;
  const rows = await Answer.findAll({ where: { tenant_id, engagement_id } });
  const out = {};
  rows.forEach(r => { out[r.section] = r.payload || {}; });
  return out;
}

async function saveAnswers(tenant_id, engagement_id, section, payload, answered_by) {
  const existing = await Answer.findOne({ where: { tenant_id, engagement_id, section } });
  if (existing) {
    existing.payload = payload;
    existing.answered_by = answered_by || existing.answered_by;
    existing.updated_at = new Date();
    await existing.save();
    return existing;
  }
  return Answer.create({
    tenant_id, engagement_id, section, payload,
    answered_by: answered_by || 'ceo',
    created_at: new Date(), updated_at: new Date()
  });
}

/**
 * Findings keyed by lane. Re-running an agent replaces its row rather than
 * appending, so a finding can never be stale relative to the agent that
 * produced it — a scorecard assembled from a mix of old and new lanes would
 * be quietly wrong in a way nobody could see.
 */
async function loadFindings(tenant_id, engagement_id) {
  const rows = await Finding.findAll({ where: { tenant_id, engagement_id } });
  const out = {};
  rows.forEach(r => { if (r.lane) out[r.lane] = r.payload || {}; });
  return out;
}

async function saveFinding(tenant_id, engagement_id, agent, lane, result) {
  const existing = await Finding.findOne({ where: { tenant_id, engagement_id, agent } });
  const fields = {
    lane,
    score: typeof result.score === 'number' ? result.score : null,
    rating: result.rating || null,
    payload: result,
    computed_by: result.computed_by || 'deterministic',
    updated_at: new Date()
  };
  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
    return existing;
  }
  return Finding.create({ tenant_id, engagement_id, agent, ...fields, created_at: new Date() });
}

/**
 * A new roadmap is a NEW VERSION, never an update. A document already put in
 * front of a CEO must not change under them afterwards; if the assessment
 * moves, that is a version 2 they can be shown deliberately.
 */
async function saveRoadmap(tenant_id, engagement_id, data) {
  const last = await latestRoadmap(tenant_id, engagement_id);
  return Roadmap.create({
    tenant_id, engagement_id,
    version: last ? last.version + 1 : 1,
    scorecard: data.scorecard || {},
    phases: data.phases || [],
    safe_next_step: data.safe_next_step || {},
    talk_track: data.talk_track || [],
    executive_summary: data.executive_summary || null,
    narrative_by: data.narrative_by || 'heuristic',
    is_simulated: data.is_simulated !== false,
    created_at: new Date()
  });
}

async function latestRoadmap(tenant_id, engagement_id) {
  return Roadmap.findOne({
    where: { tenant_id, engagement_id },
    order: [['version', 'DESC']]
  });
}

/** Stable per engagement: re-publishing must not break a link already sent. */
async function mintShareToken(tenant_id, engagement_id) {
  const eng = await loadEngagement(tenant_id, engagement_id);
  if (!eng) return null;
  if (eng.share_token) return eng.share_token;
  const token = crypto.randomBytes(24).toString('base64url');
  eng.share_token = token;
  eng.updated_at = new Date();
  await eng.save();
  return token;
}

/** Public read path. Deliberately does NOT take a tenant — the token is the key. */
async function byShareToken(token) {
  if (!token || String(token).length < 16) return null;
  const eng = await Engagement.findOne({ where: { share_token: String(token) } });
  if (!eng) return null;
  const roadmap = await latestRoadmap(eng.tenant_id, eng.id);
  if (!roadmap) return null;
  return { engagement: eng, roadmap };
}

module.exports = {
  createEngagement, loadEngagement, listEngagements, updateEngagement,
  loadAnswers, saveAnswers,
  loadFindings, saveFinding,
  saveRoadmap, latestRoadmap,
  mintShareToken, byShareToken
};

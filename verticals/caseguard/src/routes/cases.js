'use strict';

/**
 * CaseGuard — cases + all evidence-management sub-resources.
 * Every query is scoped by req.user.tenant_id (multi-tenant isolation) and, for
 * child resources, by case_id. One generic CRUD engine drives the eleven child
 * tables so the timeline, evidence inventory, provider list, communication log,
 * contradiction log, policy KB, policy comparisons, outstanding questions,
 * escalation tracker, correspondence, and analyses all share identical behavior.
 */

const express = require('express');
const router = express.Router();
const models = require('../models');
const {
  Case, TimelineEvent, Evidence, Provider, Communication, Contradiction,
  Policy, Comparison, Question, Escalation, Correspondence, Analysis
} = models;

// Resource registry: url segment -> { model, fields[], order }
const RESOURCES = {
  timeline:        { model: TimelineEvent,  order: [['event_date', 'ASC'], ['id', 'ASC']],
    fields: ['event_date', 'event_time', 'title', 'detail', 'location', 'category', 'provider_id', 'evidence_ids'] },
  evidence:        { model: Evidence,       order: [['evidence_date', 'ASC'], ['id', 'ASC']],
    fields: ['label', 'kind', 'source', 'evidence_date', 'content', 'file_path', 'mime', 'provider_id', 'tags', 'analyzed'] },
  providers:       { model: Provider,       order: [['name', 'ASC']],
    fields: ['name', 'role', 'facility', 'license_no', 'board', 'npi', 'contact', 'notes'] },
  communications:  { model: Communication,  order: [['comm_date', 'DESC'], ['id', 'DESC']],
    fields: ['comm_date', 'direction', 'channel', 'counterparty', 'subject', 'summary', 'outcome', 'evidence_ids'] },
  contradictions:  { model: Contradiction,  order: [['severity', 'DESC'], ['id', 'DESC']],
    fields: ['title', 'description', 'statement_a', 'statement_b', 'evidence_ids', 'severity', 'status', 'detected_by'] },
  policies:        { model: Policy,          order: [['authority', 'ASC'], ['id', 'ASC']],
    fields: ['authority', 'category', 'citation', 'title', 'body', 'source_url', 'relevance', 'verified'] },
  comparisons:     { model: Comparison,      order: [['id', 'ASC']],
    fields: ['topic', 'care_received', 'expected_standard', 'policy_id', 'gap', 'severity'] },
  questions:       { model: Question,        order: [['status', 'ASC'], ['id', 'ASC']],
    fields: ['text', 'directed_to', 'status', 'answer', 'priority'] },
  escalations:     { model: Escalation,      order: [['id', 'ASC']],
    fields: ['target', 'target_contact', 'method', 'status', 'sent_date', 'response_date', 'reference_no', 'response_summary', 'next_action', 'next_action_date', 'correspondence_id'] },
  correspondence:  { model: Correspondence,  order: [['id', 'DESC']],
    fields: ['kind', 'target', 'subject', 'body', 'tone', 'status', 'model'] },
  analyses:        { model: Analysis,        order: [['id', 'DESC']],
    fields: ['evidence_id', 'kind', 'summary', 'facts', 'flags', 'recommendations', 'model', 'is_simulated'] }
};

function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}
function tid(req) { return req.user.tenant_id || req.user.id; }

// ─── Cases ──────────────────────────────────────────────────────────────────
router.get('/cases', async (req, res) => {
  try {
    const cases = await Case.findAll({ where: { tenant_id: tid(req) }, order: [['updated_at', 'DESC'], ['id', 'DESC']] });
    res.json({ success: true, cases });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cases', async (req, res) => {
  try {
    const b = pick(req.body, ['title', 'subject_org', 'summary', 'objective', 'status', 'priority', 'opened_at']);
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const kase = await Case.create({ ...b, tenant_id: tid(req), user_id: req.user.id });
    res.status(201).json({ success: true, case: kase });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Full case overview: the case + every child collection + counts
router.get('/cases/:id', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await Case.findOne({ where: { id: req.params.id, tenant_id } });
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const out = { success: true, case: kase, counts: {} };
    for (const [name, def] of Object.entries(RESOURCES)) {
      const rows = await def.model.findAll({ where: { tenant_id, case_id: kase.id }, order: def.order });
      out[name] = rows;
      out.counts[name] = rows.length;
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/cases/:id', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await Case.findOne({ where: { id: req.params.id, tenant_id } });
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const b = pick(req.body, ['title', 'subject_org', 'summary', 'objective', 'status', 'priority', 'opened_at']);
    Object.assign(kase, b, { updated_at: new Date() });
    await kase.save();
    res.json({ success: true, case: kase });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/cases/:id', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await Case.findOne({ where: { id: req.params.id, tenant_id } });
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    for (const def of Object.values(RESOURCES)) await def.model.destroy({ where: { tenant_id, case_id: kase.id } });
    await kase.destroy();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Generic child-resource CRUD (scoped to tenant + case) ────────────────────
// GET/POST  /cases/:caseId/:resource
// PATCH/DELETE /:resource/:id
router.get('/cases/:caseId/:resource', async (req, res) => {
  const def = RESOURCES[req.params.resource];
  if (!def) return res.status(404).json({ error: 'Unknown resource' });
  try {
    const tenant_id = tid(req);
    const rows = await def.model.findAll({ where: { tenant_id, case_id: req.params.caseId }, order: def.order });
    res.json({ success: true, items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cases/:caseId/:resource', async (req, res) => {
  const def = RESOURCES[req.params.resource];
  if (!def) return res.status(404).json({ error: 'Unknown resource' });
  try {
    const tenant_id = tid(req);
    const kase = await Case.findOne({ where: { id: req.params.caseId, tenant_id } });
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const row = await def.model.create({ ...pick(req.body, def.fields), tenant_id, case_id: kase.id });
    await Case.update({ updated_at: new Date() }, { where: { id: kase.id, tenant_id } });
    res.status(201).json({ success: true, item: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:resource/:id', async (req, res) => {
  const def = RESOURCES[req.params.resource];
  if (!def) return res.status(404).json({ error: 'Unknown resource' });
  try {
    const tenant_id = tid(req);
    const row = await def.model.findOne({ where: { id: req.params.id, tenant_id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    Object.assign(row, pick(req.body, def.fields));
    if (row.updated_at !== undefined) row.updated_at = new Date();
    await row.save();
    res.json({ success: true, item: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:resource/:id', async (req, res) => {
  const def = RESOURCES[req.params.resource];
  if (!def) return res.status(404).json({ error: 'Unknown resource' });
  try {
    const tenant_id = tid(req);
    const n = await def.model.destroy({ where: { id: req.params.id, tenant_id } });
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, RESOURCES };

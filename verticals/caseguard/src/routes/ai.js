'use strict';

/**
 * CaseGuard — AI endpoints (analysis, contradiction scan, next steps, drafting, research).
 * All scoped to req.user.tenant_id. Persists results where useful (analyses,
 * contradictions, correspondence) so the case file grows over time.
 */

const express = require('express');
const router = express.Router();
const brain = require('../services/case-brain');
const { Case, Evidence, Contradiction, Analysis, Correspondence, Policy } = require('../models');

function tid(req) { return req.user.tenant_id || req.user.id; }
async function loadCase(req, id) {
  return Case.findOne({ where: { id, tenant_id: tid(req) } });
}

// POST /ai/analyze  { case_id, evidence_id?, text? }
// Analyze a document (by evidence_id or raw text). Persists a cg_analyses row.
router.post('/analyze', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await loadCase(req, req.body.case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    let text = req.body.text || '';
    let evidence_id = req.body.evidence_id || null;
    if (evidence_id) {
      const ev = await Evidence.findOne({ where: { id: evidence_id, tenant_id, case_id: kase.id } });
      if (!ev) return res.status(404).json({ error: 'Evidence not found' });
      text = text || ev.content || ev.label;
    }
    if (!String(text).trim()) return res.status(400).json({ error: 'text or evidence_id with content required' });

    const r = await brain.analyzeDocument(text, { caseTitle: kase.title, subjectOrg: kase.subject_org });
    const row = await Analysis.create({
      tenant_id, case_id: kase.id, evidence_id, kind: 'document',
      summary: r.summary, facts: r.facts, flags: r.flags, recommendations: r.recommendations,
      model: brain.activeModel(), is_simulated: r.is_simulated
    });
    if (evidence_id) await Evidence.update({ analyzed: true }, { where: { id: evidence_id, tenant_id } });
    res.status(201).json({ success: true, analysis: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /ai/scan-contradictions  { case_id, persist? }
// Compare all evidence items with content and surface conflicts. Optionally persist.
router.post('/scan-contradictions', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await loadCase(req, req.body.case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const items = await Evidence.findAll({ where: { tenant_id, case_id: kase.id }, order: [['evidence_date', 'ASC']] });
    const found = await brain.detectContradictions(items.map(i => ({
      label: i.label, kind: i.kind, evidence_date: i.evidence_date, content: i.content
    })), { caseTitle: kase.title, subjectOrg: kase.subject_org });

    let persisted = [];
    if (req.body.persist && found.length) {
      persisted = await Contradiction.bulkCreate(found.map(c => ({
        tenant_id, case_id: kase.id, title: c.title, description: c.description,
        statement_a: c.statement_a, statement_b: c.statement_b, severity: c.severity, detected_by: 'ai'
      })));
    }
    res.json({ success: true, found, persisted: persisted.length, ai: brain.hasAI() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /ai/next-steps  { case_id }
router.post('/next-steps', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await loadCase(req, req.body.case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const { Evidence: Ev, TimelineEvent, Contradiction: Cx, Question, Escalation } = require('../models');
    const [evidence, timeline, contradictions, questions, escs] = await Promise.all([
      Ev.count({ where: { tenant_id, case_id: kase.id } }),
      TimelineEvent.count({ where: { tenant_id, case_id: kase.id } }),
      Cx.count({ where: { tenant_id, case_id: kase.id } }),
      Question.count({ where: { tenant_id, case_id: kase.id, status: 'open' } }),
      Escalation.findAll({ where: { tenant_id, case_id: kase.id } })
    ]);
    const openTargets = escs.filter(e => ['planned', 'drafted'].includes(e.status)).map(e => e.target);
    const r = await brain.recommendNextSteps({
      title: kase.title, subjectOrg: kase.subject_org, objective: kase.objective,
      evidence, timeline, contradictions, questions, escalations: escs.length, openTargets
    });
    res.json({ success: true, ...r, ai: brain.hasAI() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /ai/draft  { case_id, kind, target, tone?, lang?, facts?, save? }
router.post('/draft', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const kase = await loadCase(req, req.body.case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found' });
    const facts = req.body.facts || kase.summary || '';
    const r = await brain.draftCorrespondence({
      kind: req.body.kind, target: req.body.target, tone: req.body.tone,
      lang: req.body.lang || req.user.lang || 'en', facts, caseTitle: kase.title, subjectOrg: kase.subject_org
    });
    let saved = null;
    if (req.body.save) {
      saved = await Correspondence.create({
        tenant_id, case_id: kase.id, kind: req.body.kind || 'complaint', target: req.body.target,
        subject: r.subject, body: r.body, tone: req.body.tone || 'formal', status: 'draft', model: r.model
      });
    }
    res.json({ success: true, subject: r.subject, body: r.body, is_simulated: r.is_simulated, saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /ai/research  { case_id?, question }
// Answer grounded in the seeded knowledge base (tenant/case scoped, with general fallback).
router.post('/research', async (req, res) => {
  try {
    const tenant_id = tid(req);
    const q = req.body.question;
    if (!String(q || '').trim()) return res.status(400).json({ error: 'question required' });
    const where = { tenant_id };
    if (req.body.case_id) where.case_id = req.body.case_id;
    const policies = await Policy.findAll({ where, order: [['authority', 'ASC']] });
    const r = await brain.researchAnswer(q, policies.map(p => ({
      authority: p.authority, category: p.category, title: p.title, body: p.body, citation: p.citation, source_url: p.source_url
    })));
    res.json({ success: true, ...r, kb_size: policies.length, ai: brain.hasAI() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

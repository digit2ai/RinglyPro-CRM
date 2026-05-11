'use strict';

// Project contracts: phase 1 of the auto-engagement flow. Generates a
// draft contract for the requestor to sign off on, asking for a 10%
// deposit and a monthly recurring amount. Phase 2 will wire Stripe to
// actually collect the deposit and start the recurring subscription —
// for now we store the contract record + emit a public signoff link.

const express = require('express');
const router = express.Router();
const { ProjectContract, Project, Company } = require('../models');
const { logActivity } = require('../services/activityService');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';

function buildContractHtml({ project, total, depositPct, depositAmount, monthly, currency }) {
  const safe = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const today = new Date().toISOString().slice(0, 10);
  const fmt = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: currency || 'USD' });
  return `
<h2>Master Services Engagement — ${safe(project.name)}</h2>
<p><strong>Effective date:</strong> ${today}</p>
<p><strong>Service provider:</strong> Digit2AI LLC ("Provider")</p>
<p><strong>Client:</strong> ${safe(project.submitter_name || 'Authorized Signer')} on behalf of the requesting organization.</p>

<h3>1. Scope</h3>
<p>Provider will deliver the work described in the project plan attached to project <em>${safe(project.name)}</em>, including the AI-generated milestones, the business plan, and the business requirements captured during kickoff. Material scope changes require a written amendment.</p>

<h3>2. Fees</h3>
<ul>
  <li><strong>Project total (good-faith estimate):</strong> ${fmt(total)}</li>
  <li><strong>Upfront deposit (${depositPct}% of total):</strong> ${fmt(depositAmount)} — due upon signature.</li>
  <li><strong>Monthly recurring fee:</strong> ${fmt(monthly)} — billed on the first of each month until project completion or written termination.</li>
</ul>

<h3>3. Payment Terms</h3>
<p>Deposit is non-refundable once Provider begins discovery. Monthly fees are billed in advance; failure to pay for 15 days suspends the engagement until cured.</p>

<h3>4. Deliverables &amp; Milestones</h3>
<p>The current milestone schedule is the one shown on the project page at the time of signature. Updates to the schedule are tracked in the project Updates feed and remain visible to the Client through the requestor magic link.</p>

<h3>5. Confidentiality</h3>
<p>Each party will treat the other's non-public information as confidential and use it only to perform under this engagement.</p>

<h3>6. Intellectual Property</h3>
<p>Custom deliverables built specifically for the Client transfer to the Client upon full payment. Provider retains rights to its pre-existing tooling, frameworks, and the underlying RinglyPro / Digit2AI platform code.</p>

<h3>7. Termination</h3>
<p>Either party may terminate with 30 days' written notice. Client remains responsible for fees accrued through termination.</p>

<h3>8. Governing Law</h3>
<p>This engagement is governed by the laws of the State of Florida, USA.</p>

<h3>9. Signature</h3>
<p>By submitting the signoff form linked from the magic-link page, the Client agrees to these terms and authorizes the deposit charge.</p>
`.trim();
}

// POST /api/v1/contracts — generate (or refresh) a draft contract for a project
router.post('/', async (req, res) => {
  try {
    const {
      project_id,
      total_amount_usd,
      deposit_percent = 10,
      monthly_amount_usd,
      currency = 'USD'
    } = req.body || {};
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id required' });

    const project = await Project.findByPk(project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const total = Number(total_amount_usd || 0);
    const depositPct = Number(deposit_percent || 10);
    const depositAmount = Math.round((total * (depositPct / 100)) * 100) / 100;
    const monthly = Number(monthly_amount_usd || 0);

    const contractHtml = buildContractHtml({
      project,
      total,
      depositPct,
      depositAmount,
      monthly,
      currency
    });

    const contract = await ProjectContract.create({
      workspace_id: 1,
      project_id: project.id,
      total_amount_usd: total,
      deposit_percent: depositPct,
      deposit_amount_usd: depositAmount,
      monthly_amount_usd: monthly,
      currency,
      status: 'draft',
      contract_html: contractHtml,
      scope_summary: project.description || null,
      created_by_email: req.user?.email || null
    });

    project.contract_status = 'draft';
    project.workflow_phase = 'contract_drafted';
    await project.save();

    await logActivity(req.user?.email, 'created', 'contract', contract.id, 'Contract drafted');

    res.status(201).json({
      success: true,
      data: contract,
      signoff_url: `${PUBLIC_BASE}/projects/contracts/sign.html?token=${contract.signoff_token}`
    });
  } catch (error) {
    console.error('[D2AI-Contracts] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/contracts?project_id=N — list contracts for a project
router.get('/', async (req, res) => {
  try {
    const where = { workspace_id: 1 };
    if (req.query.project_id) where.project_id = parseInt(req.query.project_id, 10);
    const rows = await ProjectContract.findAll({
      where,
      order: [['created_at', 'DESC']]
    });
    const enriched = rows.map(r => ({
      ...r.toJSON(),
      signoff_url: `${PUBLIC_BASE}/projects/contracts/sign.html?token=${r.signoff_token}`
    }));
    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/contracts/:id — single contract (admin)
router.get('/:id', async (req, res) => {
  try {
    const row = await ProjectContract.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({
      success: true,
      data: { ...row.toJSON(), signoff_url: `${PUBLIC_BASE}/projects/contracts/sign.html?token=${row.signoff_token}` }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/contracts/:id — update draft contract (admin)
router.put('/:id', async (req, res) => {
  try {
    const row = await ProjectContract.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (row.status !== 'draft' && row.status !== 'sent') {
      return res.status(400).json({ success: false, error: `Cannot edit contract in status: ${row.status}` });
    }
    const editable = ['total_amount_usd', 'deposit_percent', 'monthly_amount_usd', 'currency', 'scope_summary', 'terms_summary'];
    for (const k of editable) {
      if (req.body && req.body[k] !== undefined) row[k] = req.body[k];
    }
    if (req.body && (req.body.total_amount_usd !== undefined || req.body.deposit_percent !== undefined)) {
      const total = Number(row.total_amount_usd || 0);
      const depositPct = Number(row.deposit_percent || 10);
      row.deposit_amount_usd = Math.round((total * (depositPct / 100)) * 100) / 100;
    }
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

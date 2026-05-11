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

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid not installed — /send will return a soft warning */ }

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

// =====================================================
// HELPER — programmatic contract draft (called from
// generate-business-plan so the AI button auto-drafts
// the service contract at the same time).
// =====================================================
async function createContractFromProject(project, opts = {}) {
  const businessPlan = opts.businessPlan || project.business_plan_json || null;

  let total = Number(opts.total_amount_usd);
  if (!total || isNaN(total)) {
    const budget = (businessPlan && Array.isArray(businessPlan.budget_breakdown))
      ? businessPlan.budget_breakdown : [];
    total = budget.reduce((s, b) => s + (Number(b.amount_usd) || 0), 0);
  }
  if (!total || total < 1) total = 50000; // sensible default if plan has no budget yet

  const months = (() => {
    const m = (businessPlan && Array.isArray(businessPlan.timeline_milestones))
      ? businessPlan.timeline_milestones.map(x => Number(x.month) || 0) : [];
    const max = m.length ? Math.max.apply(null, m) : 0;
    return max > 0 ? max : 6;
  })();

  const depositPct = Number(opts.deposit_percent || 10);
  const depositAmount = Math.round((total * (depositPct / 100)) * 100) / 100;
  let monthly = Number(opts.monthly_amount_usd);
  if (!monthly || isNaN(monthly)) {
    monthly = Math.round((total / months) * 100) / 100;
  }
  const currency = opts.currency || 'USD';

  const contractHtml = buildContractHtml({
    project, total, depositPct, depositAmount, monthly, currency
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
    scope_summary: (businessPlan && businessPlan.executive_summary) || project.description || null,
    created_by_email: opts.created_by_email || null
  });

  project.contract_status = 'draft';
  project.workflow_phase = 'contract_drafted';
  await project.save();

  return contract;
}

// =====================================================
// POST /api/v1/contracts/:id/send
// Emails the contract + business plan summary to all project
// stakeholders (submitter + team_members). Marks the contract
// status as "sent" and stamps sent_at.
// =====================================================
router.post('/:id/send', async (req, res) => {
  try {
    const contract = await ProjectContract.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [{ model: Project, as: 'project' }]
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Not found' });
    const project = contract.project;
    if (!project) return res.status(400).json({ success: false, error: 'Contract has no linked project' });

    // Collect stakeholders: submitter + team_members emails + any extras the caller passes
    const stakeholders = new Set();
    if (project.submitter_email) stakeholders.add(String(project.submitter_email).trim().toLowerCase());
    if (Array.isArray(project.team_members)) {
      project.team_members.forEach(m => {
        if (m && m.email) stakeholders.add(String(m.email).trim().toLowerCase());
      });
    }
    if (req.body && Array.isArray(req.body.additional_emails)) {
      req.body.additional_emails.forEach(e => {
        if (e && String(e).trim()) stakeholders.add(String(e).trim().toLowerCase());
      });
    }
    if (!stakeholders.size) {
      return res.status(400).json({ success: false, error: 'No stakeholders to send to' });
    }
    if (!sgMail || !process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ success: false, error: 'SendGrid not configured (set SENDGRID_API_KEY)' });
    }

    const signoffUrl = `${PUBLIC_BASE}/projects/contracts/sign.html?token=${contract.signoff_token}`;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
    const replyTo = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';
    const fromName = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';

    const plan = project.business_plan_json || {};
    const execSummary = plan.executive_summary || project.description || '';
    const planTitle = plan.title || project.name;

    const subject = `Service Contract & Business Plan — ${project.name}`;

    const text = `Hello,

Please find below the service contract and business plan summary for "${project.name}".

BUSINESS PLAN: ${planTitle}
${execSummary ? '\n' + (execSummary.length > 600 ? execSummary.slice(0, 600) + '...' : execSummary) + '\n' : ''}

SERVICE CONTRACT TERMS:
- Project total (estimate): $${Number(contract.total_amount_usd || 0).toLocaleString('en-US')}
- Deposit (${contract.deposit_percent}%): $${Number(contract.deposit_amount_usd || 0).toLocaleString('en-US')} due on signature
- Monthly recurring fee: $${Number(contract.monthly_amount_usd || 0).toLocaleString('en-US')}

Review the full contract and sign here:
${signoffUrl}

If you have questions before signing, reply directly to this email.

Best,
${fromName}
Digit2AI`;

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:720px;margin:0 auto">
  <h2 style="margin:0 0 10px;color:#0f172a">Service Contract & Business Plan</h2>
  <p style="margin:0 0 14px;color:#64748b">Project: <strong style="color:#0f172a">${esc(project.name)}</strong></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">

  <h3 style="margin:0 0 8px;color:#0f172a">Business Plan: ${esc(planTitle)}</h3>
  ${execSummary ? `<blockquote style="margin:0 0 18px;padding:10px 14px;border-left:3px solid #38bdf8;background:#f7fbff;color:#334155;white-space:pre-wrap">${esc(execSummary.length > 800 ? execSummary.slice(0, 800) + '...' : execSummary)}</blockquote>` : ''}

  <h3 style="margin:18px 0 8px;color:#0f172a">Service Contract Terms</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
    <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">Project total (estimate)</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:600">$${Number(contract.total_amount_usd || 0).toLocaleString('en-US')}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">Deposit (${contract.deposit_percent}%) on signature</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:600">$${Number(contract.deposit_amount_usd || 0).toLocaleString('en-US')}</td></tr>
    <tr><td style="padding:6px 8px">Monthly recurring fee</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:600">$${Number(contract.monthly_amount_usd || 0).toLocaleString('en-US')}</td></tr>
  </table>

  <details style="margin-bottom:18px"><summary style="cursor:pointer;font-weight:600;color:#0f172a">Full contract text</summary><div style="margin-top:10px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">${contract.contract_html || ''}</div></details>

  <p style="margin:24px 0"><a href="${signoffUrl}" style="display:inline-block;background:#38bdf8;color:#020617;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Review & Sign Contract</a></p>

  <p style="font-size:12px;color:#64748b;margin-top:24px">If you have questions before signing, reply directly to this email — it goes to ${esc(replyTo)}.</p>
  <p style="font-size:12px;color:#64748b;margin:6px 0 0">— ${esc(fromName)}, Digit2AI</p>
</div>`;

    const msg = {
      to: Array.from(stakeholders),
      from: { email: fromEmail, name: `${fromName} / Digit2AI` },
      replyTo,
      subject,
      text,
      html
    };

    await sgMail.sendMultiple ? await sgMail.sendMultiple(msg) : await sgMail.send(msg);

    contract.status = 'sent';
    contract.sent_at = new Date();
    await contract.save();

    await logActivity(req.user && req.user.email, 'sent_contract', 'contract', contract.id, `Sent to ${Array.from(stakeholders).join(', ')}`);

    res.json({
      success: true,
      sent_to: Array.from(stakeholders),
      sent_at: contract.sent_at,
      signoff_url: signoffUrl
    });
  } catch (error) {
    console.error('[D2AI-Contracts] Send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

router.createContractFromProject = createContractFromProject;
module.exports = router;

'use strict';

// =====================================================
// PROJECT NDA — per-stakeholder magic-link signing
// =====================================================
//
// Two surfaces, mounted separately in src/index.js:
//
//   Admin (auth required): mounted at /api/v1/projects via adminRouter
//     POST   /:id/nda-tokens          mint NDA magic-link for one stakeholder
//     GET    /:id/nda-tokens          list NDAs for a project
//     DELETE /nda-tokens/:ndaId        revoke an unsigned NDA
//
//   Public (no auth): mounted at /api/v1/projects/nda via publicRouter
//     GET   /:token                    fetch project context + template
//     POST  /:token/sign               capture signature + persist
//
// The signer must:
//   - hold the token (UUID) AND
//   - submit the same email the token was bound to (case-insensitive)
//
// The NDA legal text is frozen into the row at sign time so future template
// edits cannot mutate an executed agreement.

const express = require('express');
const crypto = require('crypto');
const { Project, ProjectNda } = require('../models');
const { logActivity } = require('../services/activityService');

const NDA_TEMPLATE = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the Effective Date signed below between:

  Disclosing Party: DIGIT2AI LLC (Florida, USA)
  Receiving Party:  As identified and signed below

1. PURPOSE
The Receiving Party wishes to receive certain confidential information from the Disclosing Party for the purpose of discussing, evaluating, and/or collaborating on the technical details, architecture, business logic, integrations, and proprietary methodology of the AI-powered software solution referenced as "{{PROJECT_NAME}}" (the "Project"). The scope of disclosure includes, but is not limited to, system design, data flows, model selection, prompt engineering, vendor stack, pricing, and any related materials provided in writing, orally, or visually (the "Purpose").

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by the Disclosing Party, whether orally, in writing, or in any other form, that is designated as confidential or that reasonably should be understood to be confidential. This includes, but is not limited to:
  - Business plans, strategies, roadmaps, and forecasts
  - Software, source code, algorithms, models, and technical specifications
  - System architecture, data flows, integrations, and infrastructure
  - Customer lists, pipelines, pricing, and financial data
  - Trade secrets and proprietary processes
  - Any information related to the Project, AI matching systems, automation engines, or platform integrations

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to:
  a) Hold all Confidential Information in strict confidence;
  b) Not disclose Confidential Information to any third party without prior written consent;
  c) Use Confidential Information solely for the Purpose defined above;
  d) Limit access to employees or contractors who have a need to know and are bound by equivalent confidentiality obligations;
  e) Promptly notify the Disclosing Party upon discovery of any unauthorized use or disclosure.

4. EXCLUSIONS
Confidential Information does not include information that:
  a) Is or becomes publicly available through no fault of the Receiving Party;
  b) Was already known to the Receiving Party prior to disclosure;
  c) Is independently developed by the Receiving Party without use of Confidential Information;
  d) Is required to be disclosed by law or court order, provided prompt written notice is given.

5. TERM
This Agreement shall remain in effect for two (2) years from the Effective Date, or until the Confidential Information no longer qualifies as confidential, whichever occurs first.

6. RETURN OR DESTRUCTION OF INFORMATION
Upon written request or termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information, including copies, notes, or summaries.

7. NO LICENSE
Nothing in this Agreement grants the Receiving Party any rights in or to the Confidential Information except as expressly set forth herein.

8. REMEDIES
The Receiving Party acknowledges that any breach may cause irreparable harm to the Disclosing Party, for which monetary damages would be inadequate. The Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law.

9. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Florida, USA, without regard to its conflict of law provisions.

10. ENTIRE AGREEMENT & ELECTRONIC EXECUTION
This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior discussions relating to confidentiality. This Agreement is executed electronically. Electronic signatures captured herein are legally binding under the E-SIGN Act and UETA and constitute full acceptance of all terms above.`;

function buildNdaText(projectName) {
  return NDA_TEMPLATE.replace('{{PROJECT_NAME}}', projectName || 'the Project');
}

function normEmail(e) { return (e || '').toString().trim().toLowerCase(); }

function safeRow(row) {
  if (!row) return null;
  const j = row.toJSON ? row.toJSON() : row;
  delete j.signed_ip;
  delete j.signed_user_agent;
  return j;
}

// =====================================================
// ADMIN ROUTER (authenticated — mounted under /api/v1/projects)
// =====================================================
const adminRouter = express.Router();

// POST /api/v1/projects/:id/nda-tokens
// Body: { email, name?, company?, title?, purpose? }
adminRouter.post('/:id/nda-tokens', async (req, res) => {
  try {
    const { email, name, company, title, purpose } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Stakeholder email required' });
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const row = await ProjectNda.create({
      workspace_id: 1,
      project_id: project.id,
      token,
      stakeholder_email: normEmail(email),
      stakeholder_name: name || null,
      stakeholder_company: company || null,
      stakeholder_title: title || null,
      purpose: purpose || null,
      status: 'pending',
      created_by: req.user ? req.user.email : null,
      expires_at
    });
    await logActivity(
      req.user ? req.user.userId : null,
      'nda_token_created',
      'project',
      project.id,
      `${project.name} -> ${email}`
    );
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      data: safeRow(row),
      share_url: `${baseUrl}/projects/nda/${token}`,
      expires_at
    });
  } catch (error) {
    console.error('[D2AI] NDA mint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id/nda-tokens — list all NDAs for a project
adminRouter.get('/:id/nda-tokens', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const rows = await ProjectNda.findAll({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']]
    });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data = rows.map(r => {
      const j = safeRow(r);
      j.share_url = `${baseUrl}/projects/nda/${r.token}`;
      // Don't ship the signature blob in the list view (heavy + sensitive)
      if (j.signature_data) j.signature_data = j.signed_at ? '[signed]' : null;
      return j;
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[D2AI] NDA list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/nda-tokens/:ndaId — admin fetch a single NDA (with signature)
adminRouter.get('/nda-tokens/:ndaId', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({
      where: { id: req.params.ndaId, workspace_id: 1 }
    });
    if (!row) return res.status(404).json({ success: false, error: 'NDA not found' });
    res.json({ success: true, data: safeRow(row) });
  } catch (error) {
    console.error('[D2AI] NDA admin fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/nda-tokens/:ndaId — revoke (only if unsigned)
adminRouter.delete('/nda-tokens/:ndaId', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({
      where: { id: req.params.ndaId, workspace_id: 1 }
    });
    if (!row) return res.status(404).json({ success: false, error: 'NDA not found' });
    if (row.status === 'signed') {
      return res.status(400).json({ success: false, error: 'Cannot revoke a signed NDA' });
    }
    row.status = 'revoked';
    await row.save();
    await logActivity(
      req.user ? req.user.userId : null,
      'nda_token_revoked',
      'project',
      row.project_id,
      `${row.stakeholder_email}`
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[D2AI] NDA revoke error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUBLIC ROUTER (no auth — mounted at /api/v1/projects/nda)
// =====================================================
const publicRouter = express.Router();

// GET /api/v1/projects/nda/:token — fetch context + template
publicRouter.get('/:token', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({ where: { token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Invalid NDA link' });
    if (row.status === 'revoked') {
      return res.status(410).json({ success: false, error: 'This NDA link was revoked' });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This NDA link has expired' });
    }
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const nda_text = row.nda_text || buildNdaText(project.name);
    res.json({
      success: true,
      data: {
        id: row.id,
        token: row.token,
        status: row.status,
        stakeholder_email: row.stakeholder_email,
        stakeholder_name: row.stakeholder_name,
        stakeholder_company: row.stakeholder_company,
        stakeholder_title: row.stakeholder_title,
        purpose: row.purpose,
        signed_at: row.signed_at,
        signature_data: row.status === 'signed' ? row.signature_data : null,
        nda_text,
        project: {
          id: project.id,
          name: project.name,
          code: project.code
        },
        disclosing: {
          company: 'DIGIT2AI LLC',
          jurisdiction: 'Florida, USA',
          signatory_name: 'Manuel Stagg',
          signatory_title: 'CEO'
        }
      }
    });
  } catch (error) {
    console.error('[D2AI] NDA public fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/nda/:token/sign
// Body: { email, name, company, title, signature_data, purpose? }
// Email must match the bound stakeholder_email (case-insensitive) to sign.
publicRouter.post('/:token/sign', async (req, res) => {
  try {
    const { email, name, company, title, signature_data, purpose } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    if (!name || !title || !company) {
      return res.status(400).json({ success: false, error: 'Name, title, and company are required' });
    }
    if (!signature_data || !/^data:image\//.test(signature_data)) {
      return res.status(400).json({ success: false, error: 'Drawn signature required' });
    }
    const row = await ProjectNda.findOne({ where: { token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Invalid NDA link' });
    if (row.status === 'signed') {
      return res.status(400).json({ success: false, error: 'This NDA has already been signed' });
    }
    if (row.status === 'revoked') {
      return res.status(410).json({ success: false, error: 'This NDA link was revoked' });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This NDA link has expired' });
    }
    if (normEmail(email) !== normEmail(row.stakeholder_email)) {
      return res.status(403).json({ success: false, error: 'This NDA link is bound to a different email address.' });
    }
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    row.stakeholder_name = name;
    row.stakeholder_company = company;
    row.stakeholder_title = title;
    if (purpose) row.purpose = purpose;
    row.signature_data = signature_data;
    row.nda_text = buildNdaText(project.name); // freeze template at sign-time
    row.signed_at = new Date();
    row.signed_ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);
    row.signed_user_agent = (req.headers['user-agent'] || '').toString().slice(0, 1000);
    row.status = 'signed';
    await row.save();

    await logActivity(
      null,
      'nda_signed',
      'project',
      row.project_id,
      `${row.stakeholder_email} signed NDA`
    );

    res.json({
      success: true,
      data: {
        id: row.id,
        status: row.status,
        signed_at: row.signed_at,
        project_name: project.name
      }
    });
  } catch (error) {
    console.error('[D2AI] NDA sign error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { adminRouter, publicRouter, buildNdaText };

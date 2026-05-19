'use strict';

// =============================================================
// architectEmail — all outbound emails from the architectPipeline
//
// Five envelopes (Push #1):
//   sendSensitiveDataReviewRequest -> Manuel only
//   sendManualBuildHandoff         -> Manuel only (full prompt)
//   sendSitFailure                 -> Manuel only
//   sendUatHandoff                 -> stakeholders (submitter + team_members + Manuel)
//   sendUatRevisionRequest         -> Manuel only (forwards stakeholder comment)
//   sendShippedConfirmation        -> stakeholders + Manuel
//
// All emails From: info@digit2ai.com, Reply-To: mstagg@digit2ai.com
// (matches the convention set by contracts.js after the throttle fix).
// =============================================================

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

const { buildCcBcc } = require('./stakeholderRecipients');

const FROM_EMAIL = 'info@digit2ai.com';
const FROM_NAME = 'Manuel Stagg / Digit2AI';
const REPLY_TO = 'mstagg@digit2ai.com';
// Manuel-facing emails (manual-build handoff, SIT failure, UAT revision, sensitive-data
// review) go to BOTH addresses so Gmail picks it up instantly while Network Solutions
// catches up at its own pace. Override with env var MANUEL_EMAIL (comma-separated).
const MANUEL_EMAILS = (process.env.MANUEL_EMAIL || 'info@digit2ai.com,digitalinformation2ai@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stakeholderEmails(project) {
  const set = new Set();
  if (project.submitter_email) set.add(String(project.submitter_email).trim().toLowerCase());
  if (Array.isArray(project.team_members)) {
    project.team_members.forEach(m => { if (m && m.email) set.add(String(m.email).trim().toLowerCase()); });
  }
  return Array.from(set);
}

async function send({ to, subject, html, text, stakeholderFacing }) {
  if (!sgMail || !process.env.SENDGRID_API_KEY) {
    console.log('[architectEmail] SendGrid not configured; would have sent:', subject, '->', to);
    return { sent: false, reason: 'sendgrid_not_configured' };
  }
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    replyTo: REPLY_TO,
    subject,
    html
  };
  // Only attach text/plain if the caller actually provided one — SendGrid
  // rejects messages where any content part is an empty string with:
  //   "The content value must be a string at least one character in length"
  if (text && String(text).length) msg.text = text;
  if (stakeholderFacing) Object.assign(msg, buildCcBcc(to));
  try {
    const r = Array.isArray(to) && to.length > 1
      ? await sgMail.sendMultiple(msg)
      : await sgMail.send(msg);
    return { sent: true, status: r && r[0] && r[0].statusCode };
  } catch (e) {
    console.error('[architectEmail] send failed:', e.message);
    if (e.response) console.error(JSON.stringify(e.response.body, null, 2));
    return { sent: false, reason: 'sendgrid_error', error: e.message };
  }
}

function wrap(bodyHtml, options = {}) {
  const banner = options.banner ? `<div style="padding:10px 14px;background:${options.bannerBg || '#fffbeb'};border-left:3px solid ${options.bannerBar || '#f59e0b'};color:${options.bannerFg || '#7c2d12'};font-size:13px;margin:0 0 14px">${options.banner}</div>` : '';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:720px;margin:0 auto;padding:24px">
${banner}
${bodyHtml}
<p style="font-size:12px;color:#64748b;margin-top:32px">Reply directly to this email — it goes to ${esc(REPLY_TO)}.</p>
<p style="font-size:12px;color:#64748b;margin:6px 0 0">— Manuel Stagg, Digit2AI</p>
</div>`;
}

// -------------------------------------------------------------
// 1. Sensitive-data project — needs Manuel's greenlight before build
// -------------------------------------------------------------
async function sendSensitiveDataReviewRequest(project) {
  const greenlightUrl = `${PUBLIC_BASE}/projects/#/projects/${project.id}`; // dashboard deep link
  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">Sensitive-data project — greenlight required</h2>
<p>Project <strong>${esc(project.name)}</strong> (ID ${project.id}) just had its deposit cleared by Stripe, but the intake marked it as handling sensitive data:</p>
<blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid #f43f5e;background:#fef2f2;color:#7f1d1d">${esc(project.sensitive_data_detail || 'sensitive_data=true (no detail provided)')}</blockquote>
<p>The autonomous build pipeline is <strong>paused</strong> until you review and click the greenlight button on the project page.</p>
<p style="margin:18px 0"><a href="${greenlightUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open project ${project.id}</a></p>
<p style="font-size:12px;color:#64748b">If you decide this project should NOT auto-build, you can leave it in this state indefinitely. The Stripe subscription stays active until you cancel it from the project page.</p>
`, {
    banner: 'PIPELINE PAUSED — sensitive data flag set at intake',
    bannerBg: '#fef2f2', bannerBar: '#f43f5e', bannerFg: '#7f1d1d'
  });
  return send({
    to: MANUEL_EMAILS,
    subject: `[Greenlight required] ${project.name} — sensitive data`,
    html
  });
}

// -------------------------------------------------------------
// 2. Manual build handoff (Push #1) — full architect prompt to Manuel
// -------------------------------------------------------------
async function sendManualBuildHandoff(project, prompt) {
  const promptEscaped = esc(prompt || '');
  const buildCompleteUrl = `${PUBLIC_BASE}/projects/api/v1/projects/${project.id}/build-complete`;
  const dashboardUrl = `${PUBLIC_BASE}/projects/`;

  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">Build authorized — your turn</h2>
<p>Stripe cleared the deposit for <strong>${esc(project.name)}</strong> (ID ${project.id}). The orchestrator paused before the autonomous build step (Push #1 is human-in-the-loop) and is waiting for you to run the build.</p>

<h3 style="margin:18px 0 6px;color:#0f172a">Next step</h3>
<ol style="padding-left:20px;color:#334155">
  <li>Open your Claude Code session in this repo.</li>
  <li>Run <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">/ringlypro-architect</code> and paste the Master Architect Prompt below.</li>
  <li>Let it build the system at <code>projects/${esc(project.short_name)}/</code>. It will commit + push when done.</li>
  <li>Click the <strong>Build Complete</strong> button on the project page (${esc(dashboardUrl)}) — the orchestrator will run SIT against <code>${esc(project.production_url || '(no URL set)')}/health</code> and email all stakeholders the UAT handoff.</li>
</ol>

<p style="margin-top:14px"><strong>Production URL target:</strong> <a href="${esc(project.production_url || '')}" style="color:#0ea5e9">${esc(project.production_url || '(none)')}</a></p>

<details style="margin-top:20px"><summary style="cursor:pointer;font-weight:600;color:#0f172a;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">Master Architect Prompt (click to expand, then copy)</summary>
<pre style="margin-top:10px;padding:14px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:12px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-wrap:break-word">${promptEscaped}</pre>
</details>

<p style="font-size:12px;color:#64748b;margin-top:18px">Push #2 of this orchestrator will replace this manual step with a Claude Agent SDK loop. Until then, you're the agent.</p>
`, {
    banner: 'Build authorized — manual build step (Push #1)',
    bannerBg: '#eff6ff', bannerBar: '#0ea5e9', bannerFg: '#0c4a6e'
  });

  return send({
    to: MANUEL_EMAILS,
    subject: `[Build ready] ${project.name} — run /ringlypro-architect`,
    html
  });
}

// -------------------------------------------------------------
// 3. SIT failure — bring Manuel back to fix
// -------------------------------------------------------------
async function sendSitFailure(project, sit) {
  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">SIT failed for ${esc(project.name)}</h2>
<p>You just marked the build complete on project ${project.id}, but the SIT health check failed:</p>
<blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid #f43f5e;background:#fef2f2;color:#7f1d1d;font-family:monospace;font-size:12px;white-space:pre-wrap">${esc(sit.summary || '(no summary)')}</blockquote>
${sit.report_md ? `<details><summary style="cursor:pointer;font-weight:600">Full SIT report</summary><pre style="background:#f8fafc;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:12px">${esc(sit.report_md)}</pre></details>` : ''}
<p>The project moved back to <code>manual_build</code>. Fix the issue, push again, and click <strong>Build Complete</strong> once more to re-run SIT.</p>
`, {
    banner: 'SIT failed — project re-opened',
    bannerBg: '#fef2f2', bannerBar: '#f43f5e', bannerFg: '#7f1d1d'
  });
  return send({
    to: MANUEL_EMAILS,
    subject: `[SIT failed] ${project.name}`,
    html
  });
}

// -------------------------------------------------------------
// 4. UAT handoff — stakeholders get the production URL + SIT report
// -------------------------------------------------------------
async function sendUatHandoff(project, sit) {
  const set = new Set(stakeholderEmails(project));
  MANUEL_EMAILS.forEach(e => set.add(e));
  const recipients = Array.from(set);
  // Try to find the requestor magic-link token for the "give feedback" link
  let magicLink = '';
  try {
    const { CompanyAccessToken } = require('../models');
    if (CompanyAccessToken && project.company_id) {
      const tok = await CompanyAccessToken.findOne({
        where: { company_id: project.company_id },
        order: [['created_at', 'DESC']]
      });
      if (tok) magicLink = `${PUBLIC_BASE}/projects/intake/batch.html?token=${tok.token}`;
    }
  } catch (_) {}

  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">Ready for UAT — ${esc(project.name)}</h2>
<p>The build is complete and passed System Integration Testing. You can start User Acceptance Testing now.</p>

<p style="margin:20px 0"><a href="${esc(project.production_url || '')}" style="display:inline-block;background:linear-gradient(90deg,#38bdf8,#a78bfa);color:#020617;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Open ${esc(project.short_name)} in production</a></p>

<h3 style="margin:18px 0 8px;color:#0f172a">How to give feedback</h3>
<ul style="padding-left:20px;color:#334155">
  <li><strong>Approve as-is:</strong> open your magic link and click "Approve UAT" — the project moves to <em>shipped</em>.</li>
  <li><strong>Request changes:</strong> post a comment via the same magic link describing what needs to change. We'll see it immediately and re-build.</li>
</ul>
${magicLink ? `<p style="margin:12px 0"><a href="${esc(magicLink)}" style="color:#0ea5e9">${esc(magicLink)}</a></p>` : '<p style="color:#94a3b8;font-style:italic">(Magic link unavailable — reply to this email instead.)</p>'}

<details style="margin-top:24px"><summary style="cursor:pointer;font-weight:600;color:#0f172a;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">System Integration Test report</summary>
<pre style="background:#f8fafc;padding:14px;border-radius:6px;font-size:12px;white-space:pre-wrap;margin-top:10px">${esc(sit && sit.report_md ? sit.report_md : sit && sit.summary ? sit.summary : '(no report)')}</pre>
</details>
`, {
    banner: `UAT ready — production URL: ${esc(project.production_url || '')}`,
    bannerBg: '#ecfdf5', bannerBar: '#10b981', bannerFg: '#064e3b'
  });

  return send({
    to: recipients,
    subject: `[UAT ready] ${project.name}`,
    html,
    stakeholderFacing: true
  });
}

// -------------------------------------------------------------
// 5. UAT revision requested — stakeholders posted a comment after uat_ready
// -------------------------------------------------------------
async function sendUatRevisionRequest(project, comment) {
  const commenterName = (comment && (comment.commenter_name || comment.commenter_email)) || 'stakeholder';
  const text = (comment && (comment.comment_text || comment.body)) || '(no body)';
  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">UAT revision requested — ${esc(project.name)}</h2>
<p>${esc(commenterName)} just posted feedback on the magic-link page for project ${project.id}:</p>
<blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid #38bdf8;background:#f0f9ff;color:#0c4a6e;white-space:pre-wrap">${esc(text)}</blockquote>
<p>The project moved back to <code>uat_revision</code>. Make the change, push, and click <strong>Build Complete</strong> on the project page to re-run SIT and re-notify stakeholders.</p>
`, {
    banner: 'UAT feedback — change requested',
    bannerBg: '#f0f9ff', bannerBar: '#38bdf8', bannerFg: '#0c4a6e'
  });
  return send({
    to: MANUEL_EMAILS,
    subject: `[UAT revision] ${project.name} — ${esc(commenterName)} requested changes`,
    html
  });
}

// -------------------------------------------------------------
// 6. Shipped — final approval received
// -------------------------------------------------------------
async function sendShippedConfirmation(project) {
  const set = new Set(stakeholderEmails(project));
  MANUEL_EMAILS.forEach(e => set.add(e));
  const recipients = Array.from(set);
  const html = wrap(`
<h2 style="margin:0 0 12px;color:#0f172a">Shipped — ${esc(project.name)}</h2>
<p>UAT was approved by <strong>${esc(project.uat_approved_by || 'a stakeholder')}</strong> on ${esc(project.uat_approved_at ? new Date(project.uat_approved_at).toLocaleString() : 'now')}. The system is live at:</p>
<p style="margin:18px 0"><a href="${esc(project.production_url || '')}" style="color:#0ea5e9;font-size:18px;font-weight:600">${esc(project.production_url || '')}</a></p>
<p>The 12-month monthly subscription is already running on Stripe. Future feedback can come through the same magic link and we'll loop again.</p>
`, {
    banner: `Shipped — ${esc(project.production_url || '')}`,
    bannerBg: '#ecfdf5', bannerBar: '#10b981', bannerFg: '#064e3b'
  });
  return send({
    to: recipients,
    subject: `[Shipped] ${project.name}`,
    html,
    stakeholderFacing: true
  });
}

module.exports = {
  sendSensitiveDataReviewRequest,
  sendManualBuildHandoff,
  sendSitFailure,
  sendUatHandoff,
  sendUatRevisionRequest,
  sendShippedConfirmation
};

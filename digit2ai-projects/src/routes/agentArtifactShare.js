'use strict';

// Public, token-gated viewer for agent-generated artifacts. Lets the
// recipient of an outreach email click a link like
// /projects/artifact/<token>/0 and see the artifact (deck outline, doc,
// etc.) rendered as a clean standalone HTML page — sidesteps the
// "mailto can't attach files" problem.
//
// Security model: token is a UUID v4 minted per task, stored in
// d2_tasks.agent_share_token, indexed UNIQUE. Possession of the token
// grants read access to the task's agent_structured.artifacts[] only —
// no project, contact, or task metadata bleeds through. Rotate by
// nulling the column.

const express = require('express');
const router = express.Router();
const { Task } = require('../models');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Minimal, safe markdown -> HTML. Matches the subset the dashboard
// renderer supports (headings, bold, italics, links, lists, code blocks,
// paragraphs). Anchor URLs are validated; only http(s) survives.
function mdToHtml(md) {
  if (!md) return '';
  let s = escapeHtml(md);
  // Code blocks (```...```)
  s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:#0b1220;color:#e2e8f0;padding:14px 16px;border-radius:6px;overflow-x:auto;font-family:Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap"><code>${code}</code></pre>`);
  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3 style="margin:18px 0 8px;font-size:1.05rem;color:#1e293b">$1</h3>')
       .replace(/^## (.+)$/gm, '<h2 style="margin:22px 0 10px;font-size:1.2rem;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px">$1</h2>')
       .replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:1.5rem;color:#0f172a">$1</h1>');
  // Bold + italics
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/(^|\s)\*([^\s*][^*]*)\*/g, '$1<em>$2</em>');
  // Links — markdown [title](url). Only allow http(s).
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#2563eb" rel="noopener">$1</a>');
  // Unordered lists
  s = s.replace(/^(- .+(?:\n- .+)*)/gm, block => {
    const items = block.split(/\n/).map(l => l.replace(/^- /, '').trim()).filter(Boolean);
    return '<ul style="margin:8px 0 12px 22px;padding:0;line-height:1.6">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });
  // Ordered lists
  s = s.replace(/^(\d+\. .+(?:\n\d+\. .+)*)/gm, block => {
    const items = block.split(/\n/).map(l => l.replace(/^\d+\. /, '').trim()).filter(Boolean);
    return '<ol style="margin:8px 0 12px 22px;padding:0;line-height:1.6">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
  });
  // Paragraphs — wrap loose lines
  s = s.split(/\n{2,}/).map(block => {
    if (/^<(h1|h2|h3|ul|ol|pre)/.test(block.trim())) return block;
    if (!block.trim()) return '';
    return '<p style="margin:10px 0;line-height:1.65">' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
  return s;
}

// GET /projects/artifact/:token/:idx — public artifact viewer
router.get('/:token/:idx', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const idx = parseInt(req.params.idx, 10);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return res.status(400).type('html').send(renderError('Invalid link', 'This artifact link is malformed.'));
  }
  if (!Number.isInteger(idx) || idx < 0 || idx > 50) {
    return res.status(400).type('html').send(renderError('Invalid link', 'This artifact link is malformed.'));
  }
  try {
    const task = await Task.findOne({ where: { agent_share_token: token } });
    if (!task) return res.status(404).type('html').send(renderError('Not found', 'This artifact link is no longer valid. It may have been revoked.'));
    // Read from agent_artifacts (persistent, survives agent switches);
    // fall back to agent_structured.artifacts for older tasks created
    // before the dedicated column was added.
    const artifacts = (Array.isArray(task.agent_artifacts) && task.agent_artifacts.length)
      ? task.agent_artifacts
      : ((task.agent_structured && Array.isArray(task.agent_structured.artifacts)) ? task.agent_structured.artifacts : []);
    const artifact = artifacts[idx];
    if (!artifact) return res.status(404).type('html').send(renderError('Not found', 'This artifact does not exist for this link.'));
    res.type('html').send(renderArtifactPage({ artifact, task, idx, total: artifacts.length }));
  } catch (err) {
    console.error('[agentArtifactShare] error:', err);
    res.status(500).type('html').send(renderError('Server error', 'Something went wrong loading this artifact.'));
  }
});

// JSON variant for the dashboard's preview pane
router.get('/:token/:idx.json', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const idx = parseInt(req.params.idx, 10);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return res.status(400).json({ success: false, error: 'invalid_token' });
  }
  try {
    const task = await Task.findOne({ where: { agent_share_token: token } });
    if (!task) return res.status(404).json({ success: false, error: 'not_found' });
    const artifacts = (Array.isArray(task.agent_artifacts) && task.agent_artifacts.length)
      ? task.agent_artifacts
      : ((task.agent_structured && Array.isArray(task.agent_structured.artifacts)) ? task.agent_structured.artifacts : []);
    const artifact = artifacts[idx];
    if (!artifact) return res.status(404).json({ success: false, error: 'artifact_not_found' });
    res.json({ success: true, data: artifact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function renderArtifactPage({ artifact, task, idx, total }) {
  const title = escapeHtml(artifact.title || 'Artifact');
  const audience = escapeHtml(artifact.audience || '');
  const format = escapeHtml(artifact.format_hint || '');
  const type = escapeHtml(String(artifact.type || '').replace(/_/g, ' '));
  const bodyHtml = mdToHtml(artifact.content_md || '');
  const taskTitle = escapeHtml(task.title || '');
  const printBtnId = 'print-btn-' + Math.random().toString(36).slice(2, 8);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Digit2AI</title>
<style>
  *, *::before, *::after { box-sizing: border-box }
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background:#f8fafc; color:#0f172a; line-height:1.55 }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px 80px }
  .header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:24px; padding-bottom:18px; border-bottom:2px solid #e2e8f0 }
  .header h1 { margin:0 0 4px; font-size:1.5rem }
  .meta { color:#64748b; font-size:13px }
  .meta b { color:#334155 }
  .actions { display:flex; gap:8px }
  .btn { background:#2563eb; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:13px; cursor:pointer; font-weight:500 }
  .btn:hover { background:#1d4ed8 }
  .footer { margin-top:48px; padding-top:18px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; text-align:center }
  @media print { .actions { display:none } .footer { display:none } body { background:#fff } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <h1>${title}</h1>
        <div class="meta">
          ${type ? `<b>${type}</b>` : ''}
          ${format ? ` · ${format}` : ''}
          ${audience ? ` · Audience: ${audience}` : ''}
        </div>
        <div class="meta" style="margin-top:6px">From task: <i>${taskTitle}</i> · Artifact ${idx + 1} of ${total}</div>
      </div>
      <div class="actions">
        <button id="${printBtnId}" class="btn">🖨 Print / Save as PDF</button>
      </div>
    </div>
    <article>${bodyHtml}</article>
    <div class="footer">
      Shared via Digit2AI Projects · This is a private link.
    </div>
  </div>
  <script>
    document.getElementById('${printBtnId}').addEventListener('click', () => window.print());
  </script>
</body>
</html>`;
}

function renderError(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:-apple-system,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#fff;padding:32px 36px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);max-width:480px;text-align:center}
    h1{margin:0 0 12px;font-size:1.4rem}
    p{color:#64748b;margin:0;line-height:1.6}
  </style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

module.exports = router;

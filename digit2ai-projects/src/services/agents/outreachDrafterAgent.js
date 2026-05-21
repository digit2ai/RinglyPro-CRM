'use strict';

// Agent #2 — Outreach Drafter
// Detects language (es for Latin/Iberia, en otherwise), pulls related
// activity (recent meetings + minutes + project updates), drafts an
// email + WhatsApp variant. Never sends. Output surfaces in UI with the
// existing Gmail chooser + WhatsApp modal buttons.

const { CalendarEvent, MeetingMinute, ProjectUpdate, Op } = (() => {
  const m = require('../../models');
  return { ...m, Op: require('sequelize').Op };
})();

const SONNET_MODEL = 'claude-sonnet-4-6';
const SONNET_IN = 3 / 1e6, SONNET_OUT = 15 / 1e6;

const SPANISH_COUNTRIES = new Set([
  'colombia', 'mexico', 'méxico', 'argentina', 'chile', 'peru', 'perú', 'spain', 'españa',
  'venezuela', 'ecuador', 'bolivia', 'paraguay', 'uruguay', 'dominican republic',
  'guatemala', 'honduras', 'nicaragua', 'costa rica', 'panama', 'panamá', 'cuba',
  'puerto rico', 'el salvador'
]);

function detectLang(project) {
  const c = String(project?.country || '').trim().toLowerCase();
  return SPANISH_COUNTRIES.has(c) ? 'es' : 'en';
}

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

async function gatherContext(project) {
  const ctx = { meetings: [], minutes: [], updates: [], stakeholders: [] };
  if (!project) return ctx;
  try {
    ctx.meetings = await CalendarEvent.findAll({
      where: { workspace_id: 1, project_id: project.id },
      order: [['start_time', 'DESC']],
      limit: 3
    });
  } catch (_) {}
  try {
    ctx.minutes = await MeetingMinute.findAll({
      where: { workspace_id: 1, project_id: project.id },
      order: [['meeting_date', 'DESC']],
      limit: 2
    });
  } catch (_) {}
  try {
    ctx.updates = await ProjectUpdate.findAll({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']],
      limit: 5
    });
  } catch (_) {}
  // Stakeholders: submitter + team_members[*]
  const seen = new Set();
  if (project.submitter_email) {
    const e = project.submitter_email.toLowerCase();
    if (!seen.has(e)) { seen.add(e); ctx.stakeholders.push({ name: project.submitter_name || '', email: e, role: 'requestor' }); }
  }
  (Array.isArray(project.team_members) ? project.team_members : []).forEach(m => {
    if (!m || !m.email) return;
    const e = String(m.email).toLowerCase();
    if (!seen.has(e)) { seen.add(e); ctx.stakeholders.push({ name: m.name || '', email: e, role: m.role || 'stakeholder' }); }
  });
  return ctx;
}

function renderMarkdown(task, parsed) {
  const lines = [];
  lines.push(`# Outreach Draft: ${task.title || ''}`);
  lines.push(`*Language: ${parsed.language || 'en'}*`);
  lines.push('');
  lines.push('## Email');
  lines.push(`**Subject:** ${parsed.subject || '(no subject)'}`);
  lines.push('');
  lines.push('```');
  lines.push(parsed.body_text || '(no body)');
  lines.push('```');
  lines.push('');
  if (parsed.whatsapp_short) {
    lines.push('## WhatsApp Version');
    lines.push('```');
    lines.push(parsed.whatsapp_short);
    lines.push('```');
    lines.push('');
  }
  if (Array.isArray(parsed.suggested_recipients) && parsed.suggested_recipients.length) {
    lines.push('## Suggested Recipients');
    parsed.suggested_recipients.forEach(r => {
      lines.push(`- **${r.name || r.email}** (${r.email}) — ${r.reason || ''}`);
    });
    lines.push('');
  }
  if (parsed.tone_notes) {
    lines.push('## Tone Notes');
    lines.push(parsed.tone_notes);
  }
  return lines.join('\n');
}

async function run({ task, project }) {
  if (!task || !task.title) {
    return { ok: false, error: 'missing_task', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'no_api_key', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    return { ok: false, error: 'sdk_missing', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const lang = detectLang(project);
  const ctx = await gatherContext(project);

  const meetingsBlock = ctx.meetings.map(m => `- ${m.title || 'Meeting'} (${m.start_time ? new Date(m.start_time).toISOString().slice(0, 10) : 'no date'})`).join('\n') || '(no recent meetings)';
  const minutesBlock = ctx.minutes.map(m => `- ${m.subject || 'Minutes'}: ${(m.ai_summary || m.notes || '').toString().slice(0, 250).replace(/\s+/g, ' ')}`).join('\n') || '(no recent minutes)';
  const updatesBlock = ctx.updates.map(u => `- ${(u.content || u.body || '').toString().slice(0, 200).replace(/\s+/g, ' ')}`).join('\n') || '(no recent updates)';
  const stakeholdersBlock = ctx.stakeholders.map(s => `${s.name ? s.name + ' <' + s.email + '>' : s.email} (${s.role})`).join(', ') || '(none on file)';

  const prompt = `You are drafting outreach on behalf of Manuel Stagg (Digit2AI).
Target language: ${lang}.
Tone: professional, warm, concrete. Avoid corporate fluff. Spanish: usted form. English: friendly-professional.

TASK
${task.title}
${task.description || '(no description)'}

PROJECT
${project?.name || '(unattached)'} — ${project?.description || '(no description)'}
Stakeholders: ${stakeholdersBlock}

RELATED ACTIVITY
Recent meetings:
${meetingsBlock}

Recent minutes:
${minutesBlock}

Recent project updates:
${updatesBlock}

Produce JSON:
{
  "language": "${lang}",
  "subject": "...",
  "body_text": "plain text email body",
  "body_html": "minimal HTML email body, paragraphs only, no inline styles",
  "whatsapp_short": "WhatsApp version, max 3 short paragraphs, can use *bold*",
  "suggested_recipients": [{"email": "...", "name": "...", "reason": "why include"}],
  "tone_notes": "any tone choices the user should know about"
}

The user will review before sending. Do NOT send. Output only valid JSON.`;

  try {
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp?.content?.[0]?.text || '';
    const cost = (resp?.usage?.input_tokens || 0) * SONNET_IN + (resp?.usage?.output_tokens || 0) * SONNET_OUT;
    const parsed = safeParseJson(text);
    if (!parsed || !parsed.subject || !parsed.body_text) {
      return { ok: false, error: 'parse_failed', output_md: '', structured: { raw: text.slice(0, 2000) }, cost_estimate_usd: Number(cost.toFixed(4)), model: SONNET_MODEL };
    }
    parsed.language = parsed.language || lang;
    if (!Array.isArray(parsed.suggested_recipients) || !parsed.suggested_recipients.length) {
      parsed.suggested_recipients = ctx.stakeholders.map(s => ({ email: s.email, name: s.name, reason: s.role }));
    }
    return {
      ok: true,
      output_md: renderMarkdown(task, parsed),
      structured: parsed,
      cost_estimate_usd: Number(cost.toFixed(4)),
      model: SONNET_MODEL
    };
  } catch (err) {
    console.error('[outreachDrafterAgent] Sonnet call failed:', err.message);
    return { ok: false, error: err.message, output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
}

module.exports = { run, SONNET_MODEL, detectLang };

'use strict';

// Action item extraction service. Reads raw meeting-minute notes (a Zoom
// transcript paste, freeform notes, etc.) and returns a structured list
// of actionable tasks + a one-paragraph executive summary. Phase 1
// drives auto-task creation under the linked project so the team does
// not have to manually re-type the action items they just discussed.
//
// Returns: { summary: string, action_items: [{ title, description,
// priority, assignee_hint, due_in_days }] }
// Falls back to a safe empty result if Anthropic SDK is unreachable or
// the API key is unset — meeting minutes still save, just without AI.

const SYSTEM_PROMPT = `You read meeting minutes (transcripts or notes) from a Digit2AI project meeting and produce:
1. A concise executive summary (3-5 sentences) covering key decisions and outcomes.
2. A list of concrete action items captured during the meeting, each pre-classified for downstream AI agent routing.

Output schema (strict JSON, no prose, no markdown fences):
{
  "summary": string,
  "action_items": [
    {
      "title": string,
      "description": string,
      "priority": "low" | "medium" | "high" | "critical",
      "assignee_hint": string,
      "due_in_days": number,
      "agent_type": "research" | "draft" | "none"
    }
  ]
}

Rules for action_items:
- Return between 0 and 12 items. Quality over quantity. Do not invent items not implied by the notes.
- title: a short imperative phrase under 80 chars (e.g. "Draft architecture diagram for ingest pipeline"). Bilingual notes are fine — keep titles in the original language.
- description: one or two sentences with the relevant context.
- priority defaults to "medium" unless the notes make urgency clear.
- assignee_hint is a role or name mentioned in the notes (e.g. "Manuel", "AI Engineering Lead", "Reddi team"). Empty string if unclear.
- due_in_days is a non-negative integer (0 = today, 7 = one week from today). Default to 7 if no due date is implied. Use 3 for items flagged urgent, 14-21 for larger deliverables.

Rules for agent_type (this is what makes the loop automatic — pick carefully):
- "research" — the item requires web research, competitive analysis, market sizing, benchmarking, fact-finding, or sourcing data BEFORE the work can be done. Examples: "Research AcuityMD pricing", "Compare biodiesel suppliers in Florida", "Investigar la regulación Superfinanciera", "Find similar platforms in LATAM".
- "draft" — the item is unambiguously about producing communication (email, proposal, presentation, follow-up, message) that the user will review before sending. The verb must clearly imply WRITING TO SOMEONE. Examples: "Send proposal to Eduardo about wedge", "Draft kickoff email to stakeholders", "Prepare presentation deck for Sr. Falcón", "Redactar resumen ejecutivo para Juan", "Follow up with Greg about da Vinci connection".
- "none" — operational / manual work that no AI agent can usefully draft or research. Examples: "Share MVP access credentials with advisor", "Pay invoice 1234", "Schedule kickoff meeting", "Update DNS records", "Sign NDA", "Review the legal document".

Be conservative — when in doubt between "research" and "none", or between "draft" and "none", pick "none". An over-classified item wastes Claude tokens later; an under-classified item simply stays in the user's hands which is the current default anyway. Never invent agent fit: if the item is "Document MVP architecture", that is "none" (documentation is not research and not outreach).

- Output ONLY valid JSON. No prose. No markdown fences. No leading/trailing whitespace outside the JSON.`;

const MODEL = 'claude-sonnet-4-5-20250929';

function safeParse(text) {
  let raw = String(text || '').trim();
  // Strip markdown code fences if Claude returned them anyway.
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

async function extractActionItems({ subject, notes, projectName, projectDescription }) {
  const empty = { summary: '', action_items: [] };
  const trimmed = String(notes || '').trim();
  if (!trimmed) return empty;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[D2AI-ActionItems] ANTHROPIC_API_KEY missing — extraction skipped');
    return empty;
  }

  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    console.log('[D2AI-ActionItems] @anthropic-ai/sdk not installed:', e.message);
    return empty;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = new Date().toISOString().slice(0, 10);

  const userMsg = `Today is ${today}.

PROJECT: ${projectName || '(unattached)'}
PROJECT CONTEXT: ${projectDescription || '(no description on file)'}

MEETING SUBJECT: ${subject || '(no subject)'}

MEETING NOTES / TRANSCRIPT:
${trimmed.length > 20000 ? trimmed.slice(0, 20000) + '\n\n[truncated]' : trimmed}

Return the JSON described in the system prompt.`;

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    });
    const text = resp?.content?.[0]?.text || '';
    const parsed = safeParse(text);
    if (!parsed) {
      console.log('[D2AI-ActionItems] Could not parse Claude response, returning empty');
      return empty;
    }
    const items = Array.isArray(parsed.action_items) ? parsed.action_items : [];
    const VALID_AGENT_TYPES = new Set(['research', 'draft', 'none']);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      action_items: items.slice(0, 12).map(it => ({
        title: String(it.title || '').trim().slice(0, 500),
        description: String(it.description || '').trim(),
        priority: ['low', 'medium', 'high', 'critical'].includes(it.priority) ? it.priority : 'medium',
        assignee_hint: String(it.assignee_hint || '').trim(),
        due_in_days: Number.isFinite(Number(it.due_in_days)) ? Math.max(0, Math.min(180, Math.round(Number(it.due_in_days)))) : 7,
        // Coerce missing/invalid -> 'none' so downstream code can rely on the field
        agent_type: VALID_AGENT_TYPES.has(it.agent_type) ? it.agent_type : 'none'
      })).filter(it => it.title)
    };
  } catch (err) {
    console.error('[D2AI-ActionItems] Anthropic call failed:', err.message);
    return empty;
  }
}

module.exports = { extractActionItems };

'use strict';

/**
 * CoachTrack — AI coach brain.
 * Provider-agnostic Claude wrapper (reuses ANTHROPIC_API_KEY).
 *  - finalizeSession(transcript)  -> { subject, summary, action_items[] }
 *  - guidance(actionItem, sessionContext, question, thread) -> coaching answer
 *
 * If no ANTHROPIC_API_KEY is present, both fall back to a deterministic,
 * zero-key heuristic so the app still works end-to-end for a demo.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.COACHTRACK_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function transcriptToText(turns) {
  return (turns || [])
    .map(t => `${t.role === 'coach' ? 'COACH' : 'ME'}: ${t.text}`)
    .join('\n');
}

// ── Extract subject + summary + action items from the full transcript ──────
async function finalizeSession(turns) {
  const text = transcriptToText(turns);

  if (!anthropic || !text.trim()) {
    return heuristicFinalize(turns);
  }

  const prompt = `You are an executive coaching assistant. Below is the full transcript of a 1:1 coaching session (roles: ME = the person being coached, COACH = the coach).

Return ONLY a JSON object, no prose, with this exact shape:
{
  "subject": "a short title (max 8 words) capturing the main subject of the day",
  "summary": "3-5 sentence summary of what was discussed and decided",
  "action_items": [ { "text": "a concrete, single next action the person committed to", "due_date": "YYYY-MM-DD or null" } ]
}

Rules: action_items must be concrete commitments the person will DO, phrased as imperatives. 1-6 items. Only include due_date if a timeframe was clearly stated; otherwise null. Match the language of the transcript (Spanish or English).

TRANSCRIPT:
${text}`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json);
    return {
      subject: String(parsed.subject || 'Sesión de coaching').slice(0, 120),
      summary: String(parsed.summary || ''),
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items
            .filter(a => a && a.text)
            .slice(0, 6)
            .map(a => ({ text: String(a.text).slice(0, 500), due_date: a.due_date || null }))
        : []
    };
  } catch (e) {
    console.error('CoachTrack finalize error:', e.message);
    return heuristicFinalize(turns);
  }
}

// Zero-key fallback: subject = first "me" line, action items = lines that look
// like commitments ("voy a", "will", "need to", "tengo que"...).
function heuristicFinalize(turns) {
  const mine = (turns || []).filter(t => t.role !== 'coach').map(t => t.text);
  const first = mine[0] || 'Sesión de coaching';
  const cues = /(voy a|tengo que|debo|me comprometo|will |i'?ll |need to|have to|going to)/i;
  const items = [];
  for (const line of mine) {
    line.split(/[.!?\n]/).forEach(s => {
      const seg = s.trim();
      if (seg.length > 8 && cues.test(seg) && items.length < 6) items.push({ text: seg.slice(0, 500), due_date: null });
    });
  }
  return {
    subject: first.split(/[.!?\n]/)[0].slice(0, 80) || 'Sesión de coaching',
    summary: mine.slice(0, 4).join(' ').slice(0, 600),
    action_items: items
  };
}

// ── Coaching guidance scoped to a single action item ───────────────────────
async function guidance(actionItem, sessionContext, question, thread) {
  if (!anthropic) {
    return heuristicGuidance(actionItem, question);
  }

  const history = (thread || [])
    .map(g => `Q: ${g.question}\nA: ${g.ai_response}`)
    .join('\n\n');

  const system = `You are Lala, the warm, bilingual AI coach for Visionarium — a creativity and leadership incubator for young Latin American talent. You help the person make progress on ONE specific action item they committed to during a coaching session. Be motivational but concrete: give steps, remove friction, anticipate obstacles, and end with a small next move they can do today. Keep it under 200 words. Match the person's language (Spanish or English). No emojis.`;

  const userMsg = `SESSION SUBJECT: ${sessionContext.subject || '(sin asunto)'}
SESSION SUMMARY: ${sessionContext.summary || ''}

ACTION ITEM I'M WORKING ON: "${actionItem.text}"${actionItem.due_date ? ` (due ${actionItem.due_date})` : ''}
CURRENT STATUS: ${actionItem.status}
${actionItem.notes ? `MY NOTES: ${actionItem.notes}` : ''}
${history ? `\nEARLIER IN THIS THREAD:\n${history}\n` : ''}
MY QUESTION: ${question}`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: userMsg }]
    });
    return (resp.content || []).map(b => b.text || '').join('').trim() || heuristicGuidance(actionItem, question);
  } catch (e) {
    console.error('CoachTrack guidance error:', e.message);
    return heuristicGuidance(actionItem, question);
  }
}

function heuristicGuidance(actionItem, question) {
  return `Soy Lala. Enfoquémonos en: "${actionItem.text}". Divídelo en el paso más pequeño posible que puedas hacer hoy en menos de 15 minutos, agéndalo en tu calendario, y elimina de antemano el obstáculo más probable. ¿Cuál es ese primer paso mínimo? (Configura ANTHROPIC_API_KEY para respuestas de coaching completas.)`;
}

module.exports = { finalizeSession, guidance, activeModel: () => (anthropic ? MODEL : 'heuristic-fallback') };

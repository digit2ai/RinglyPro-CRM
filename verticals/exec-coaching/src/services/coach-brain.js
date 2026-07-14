'use strict';

/**
 * Executive English Coaching — AI coach brain.
 * Provider-agnostic Claude wrapper (reuses ANTHROPIC_API_KEY).
 *
 *  - finalizeSession(turns, ctx)  -> { subject, summary, fortalezas[],
 *        aspectos_mejorar[], expresiones[], vocabulario[], ejercicio,
 *        correcciones[] }   (the 5 post-session deliverables from the program)
 *  - suggestAssignments(report, ctx) -> [ { kind, title, detail } ]  (entre sesiones)
 *  - guidance(...) -> a coaching answer scoped to one report/topic
 *
 * If no ANTHROPIC_API_KEY is present, everything falls back to a deterministic,
 * zero-key heuristic so the app still works end-to-end for a demo.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.EXEC_COACHING_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function transcriptToText(turns) {
  return (turns || [])
    .map(t => `${t.role === 'coach' ? 'COACH' : 'STUDENT'}: ${t.text}`)
    .join('\n');
}

// ── Post-session report: the 5 deliverables from the coaching program ───────
async function finalizeSession(turns, ctx = {}) {
  const text = transcriptToText(turns);

  if (!anthropic || !text.trim()) {
    return heuristicFinalize(turns);
  }

  const prompt = `You are the assistant to an executive English coach. The STUDENT is ${ctx.role_title || 'a senior executive'} being trained for high-level international communication in English (trade, investment, diplomacy, press). Below is the full transcript of a 1:1 session (STUDENT speaks English; COACH corrects).

Analyze the STUDENT's English and return ONLY a JSON object, no prose, with this exact shape:
{
  "subject": "short title (max 8 words) of the session focus",
  "summary": "3-5 sentence summary of what was practiced and how the student performed",
  "fortalezas": ["principales fortalezas — 2-4 concrete strengths the student showed"],
  "aspectos_mejorar": ["aspectos a mejorar — 2-4 concrete areas to improve"],
  "expresiones": ["nuevas expresiones de alto impacto — 3-6 high-impact executive/diplomatic English expressions the student should adopt"],
  "vocabulario": ["vocabulario estratégico — 4-8 strategic English words/terms relevant to the session topic"],
  "ejercicio": "one concrete practice exercise for the next day (2-3 sentences)",
  "correcciones": [ { "error": "what the student said (grammar/pronunciation/word choice)", "correccion": "the corrected version" } ]
}

Rules: The report is written FOR a Spanish-speaking coach and student, so section CONTENT/labels prose is in Spanish, but the English expressions/vocabulary/corrections stay in English (they are what the student must learn). Be specific to THIS transcript — never generic. Proper Spanish orthography (tildes, ñ). No emojis. correcciones: 0-6 real corrections drawn from the transcript.

TRANSCRIPT:
${text}`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const p = JSON.parse(json);
    const arr = (v, n) => Array.isArray(v) ? v.filter(Boolean).map(x => String(x).slice(0, 400)).slice(0, n) : [];
    return {
      subject: String(p.subject || 'Sesión de coaching ejecutivo').slice(0, 120),
      summary: String(p.summary || ''),
      fortalezas: arr(p.fortalezas, 4),
      aspectos_mejorar: arr(p.aspectos_mejorar, 4),
      expresiones: arr(p.expresiones, 6),
      vocabulario: arr(p.vocabulario, 8),
      ejercicio: String(p.ejercicio || '').slice(0, 800),
      correcciones: Array.isArray(p.correcciones)
        ? p.correcciones.filter(c => c && c.correccion).slice(0, 6)
            .map(c => ({ error: String(c.error || '').slice(0, 300), correccion: String(c.correccion).slice(0, 300) }))
        : []
    };
  } catch (e) {
    console.error('ExecCoaching finalize error:', e.message);
    return heuristicFinalize(turns);
  }
}

function heuristicFinalize(turns) {
  const student = (turns || []).filter(t => t.role !== 'coach').map(t => t.text);
  const first = (student[0] || 'Sesión de coaching ejecutivo').split(/[.!?\n]/)[0].slice(0, 80);
  return {
    subject: first || 'Sesión de coaching ejecutivo',
    summary: student.slice(0, 4).join(' ').slice(0, 600),
    fortalezas: ['Participación activa en inglés durante la sesión.'],
    aspectos_mejorar: ['Ampliar vocabulario ejecutivo y fluidez en respuestas largas.'],
    expresiones: ['"Let me walk you through the key points."', '"That said, our priority remains..."', '"I would be happy to elaborate on that."'],
    vocabulario: ['leverage', 'stakeholder', 'framework', 'foreign direct investment', 'supply chain', 'trade balance'],
    ejercicio: 'Prepare un discurso de dos minutos presentando una oportunidad de inversión en Colombia y grábelo en audio para revisar mañana.',
    correcciones: []
  };
}

// ── Suggested "entre sesiones" immersion tasks derived from the report ──────
async function suggestAssignments(report, ctx = {}) {
  if (!anthropic) return heuristicAssignments(report);

  const prompt = `You are an executive English coach planning the "between sessions" daily immersion for ${ctx.role_title || 'a senior executive'}. Based on today's session report, propose 4 short daily tasks (each doable in under 15 minutes). Return ONLY JSON:
[ { "kind": "audio|articulo|podcast|expresion|vocabulario|ejercicio", "title": "short title in Spanish", "detail": "1-2 sentence instruction in Spanish (English content stays English)" } ]

Session subject: ${report.subject || ''}
Aspectos a mejorar: ${(report.aspectos_mejorar || []).join('; ')}
Vocabulario objetivo: ${(report.vocabulario || []).join(', ')}
No emojis. Proper Spanish orthography.`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
    const p = JSON.parse(json);
    const kinds = ['audio', 'articulo', 'podcast', 'expresion', 'vocabulario', 'ejercicio'];
    return (Array.isArray(p) ? p : []).slice(0, 6).map(t => ({
      kind: kinds.includes(t.kind) ? t.kind : 'ejercicio',
      title: String(t.title || 'Tarea').slice(0, 160),
      detail: String(t.detail || '').slice(0, 600)
    }));
  } catch (e) {
    console.error('ExecCoaching suggestAssignments error:', e.message);
    return heuristicAssignments(report);
  }
}

function heuristicAssignments(report) {
  const vocab = (report && report.vocabulario || []).slice(0, 5).join(', ') || 'leverage, stakeholder, framework';
  return [
    { kind: 'expresion', title: 'Expresión diplomática del día', detail: 'Use en voz alta la expresión: "That said, our priority remains..." en tres frases distintas.' },
    { kind: 'vocabulario', title: 'Vocabulario ejecutivo', detail: `Memorice y use en una frase cada término: ${vocab}.` },
    { kind: 'articulo', title: 'Lectura de un artículo (10 minutos)', detail: 'Lea un artículo de The Economist sobre comercio internacional y subraye cinco términos nuevos.' },
    { kind: 'audio', title: 'Audio corto por WhatsApp', detail: 'Grabe un audio de un minuto en inglés resumiendo el artículo leído.' }
  ];
}

// ── Coaching guidance scoped to a session's improvement plan ────────────────
async function guidance(ctx, question, thread) {
  if (!anthropic) return heuristicGuidance(question);

  const history = (thread || []).map(g => `Q: ${g.question}\nA: ${g.ai_response}`).join('\n\n');
  const system = `You are the AI executive English coach for Digit2AI's Executive English Coaching program. You help a Spanish-speaking coach and student improve the student's high-level English for international leadership (trade, investment, diplomacy, press). Be concrete: give model phrases in English, correct errors, and end with one small practice move. Under 200 words. Reply in Spanish, but keep English model phrases in English. No emojis.`;
  const userMsg = `SESSION SUBJECT: ${ctx.subject || ''}
SUMMARY: ${ctx.summary || ''}
ASPECTOS A MEJORAR: ${(ctx.aspectos_mejorar || []).join('; ')}
${history ? `\nEARLIER IN THIS THREAD:\n${history}\n` : ''}
QUESTION: ${question}`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 700, system,
      messages: [{ role: 'user', content: userMsg }]
    });
    return (resp.content || []).map(b => b.text || '').join('').trim() || heuristicGuidance(question);
  } catch (e) {
    console.error('ExecCoaching guidance error:', e.message);
    return heuristicGuidance(question);
  }
}

function heuristicGuidance(question) {
  return `Enfoquémonos en su pregunta: "${question}". Practique una respuesta modelo en inglés en voz alta, grábela, y compárela con una expresión de alto impacto como "Let me put that in context...". Configure ANTHROPIC_API_KEY para respuestas completas del coach.`;
}

module.exports = {
  finalizeSession,
  suggestAssignments,
  guidance,
  activeModel: () => (anthropic ? MODEL : 'heuristic-fallback')
};

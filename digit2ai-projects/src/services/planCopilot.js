'use strict';

// planCopilot — the ChatGPT/Claude-style brain behind the OrbUp / Torna Studio.
//
// A prospect chats with their OWN feasibility plan and refines it before booking
// a call: "make it a 2-week MVP", "add a mobile app", "why 4 weeks?". The model
// either ANSWERS (plan unchanged), EDITS (patches the client-safe plan), or asks
// to CLARIFY.
//
// SAFETY: the model's ONLY context is the client-safe plan + the prospect's own
// request. It never sees monetization, the verdict, or the internal triage, so it
// cannot leak them. It may only touch a fixed set of client-facing fields; the
// analysis-derived fields (feasibility score, gate, risks, mitigations) are frozen
// and re-attached from the server copy after every turn. Every returned plan is
// run through findLeaks() before it leaves the process.

const { findLeaks } = require('./clientPlanFromTriage');

const HAIKU_MODEL = process.env.ORBUP_PLAN_CHAT_MODEL || 'claude-haiku-4-5-20251001';
const HAIKU_IN = 1 / 1e6, HAIKU_OUT = 5 / 1e6;

// Fields the Copilot is allowed to change. Everything else on the plan is frozen.
const EDITABLE = ['problem', 'why', 'v1', 'build_includes', 'timeline_weeks', 'considerations', 'landscape', 'need_from_you'];

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

function clampWeeks(n, fallback) {
  n = parseInt(n, 10);
  if (isNaN(n)) return fallback;
  return Math.max(1, Math.min(12, n));
}
function strArr(x, cap) {
  if (!Array.isArray(x)) return null;
  return x.map(s => String(s == null ? '' : s).slice(0, 400)).filter(Boolean).slice(0, cap || 12);
}

// Merge only the whitelisted, type-checked editable fields from the model's plan
// onto the authoritative current plan. Frozen fields survive untouched.
function applyEdit(current, proposed) {
  const next = JSON.parse(JSON.stringify(current));
  if (!proposed || typeof proposed !== 'object') return next;
  if (typeof proposed.problem === 'string') next.problem = proposed.problem.slice(0, 1200);
  if (typeof proposed.why === 'string') next.why = proposed.why.slice(0, 1200);
  if (typeof proposed.v1 === 'string') next.v1 = proposed.v1.slice(0, 1200);
  if ('timeline_weeks' in proposed) next.timeline_weeks = clampWeeks(proposed.timeline_weeks, current.timeline_weeks);
  const bi = strArr(proposed.build_includes, 10); if (bi) next.build_includes = bi;
  const co = strArr(proposed.considerations, 10); if (co) next.considerations = co;
  const la = strArr(proposed.landscape, 10); if (la) next.landscape = la;
  const nf = strArr(proposed.need_from_you, 8); if (nf) next.need_from_you = nf;
  return next;
}

function heuristicReply(lang) {
  const es = String(lang || 'en').startsWith('es');
  return {
    ok: true, mode: 'answer', is_simulated: true,
    reply: es
      ? 'Puedo responder preguntas sobre este plan y ajustarlo (por ejemplo: "hazlo un MVP de 2 semanas" o "agrega una app móvil"). El asistente de IA no está disponible en este momento, pero tu plan sigue aquí y puedes agendar una llamada cuando quieras.'
      : 'I can answer questions about this plan and adjust it (e.g. "make it a 2-week MVP" or "add a mobile app"). The AI assistant is unavailable right now, but your plan is still here and you can book a call whenever you like.',
    plan: null, diff: null, cost_estimate_usd: 0, model: HAIKU_MODEL
  };
}

/**
 * @param {object} args { plan, request, message, history, lang }
 *   plan    = the current client-safe working plan (authoritative)
 *   request = { description, target_users, current_process, timeline } (prospect's own words)
 *   message = the user's chat message
 *   history = [{role:'user'|'assistant', text}] recent turns (capped by caller)
 * @returns {object} { ok, mode, reply, plan?, diff?, cost_estimate_usd, model }
 */
async function chat({ plan, request, message, history, lang }) {
  const es = String(lang || plan && plan.lang || 'en').startsWith('es');
  const msg = String(message || '').slice(0, 2000).trim();
  if (!msg) return { ok: false, error: 'empty_message', mode: 'answer', reply: '', model: HAIKU_MODEL };
  if (!process.env.ANTHROPIC_API_KEY) return heuristicReply(lang);

  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { return heuristicReply(lang); }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const req = request || {};
  const hist = Array.isArray(history) ? history.slice(-8).map(h => `${h.role === 'assistant' ? 'Copilot' : 'User'}: ${String(h.text || '').slice(0, 600)}`).join('\n') : '';

  // The model sees ONLY the client-safe plan + the prospect's own request.
  const planForModel = {
    problem: plan.problem, why: plan.why, v1: plan.v1,
    build_includes: plan.build_includes, timeline_weeks: plan.timeline_weeks,
    considerations: plan.considerations, landscape: plan.landscape, need_from_you: plan.need_from_you,
    feasibility_label: plan.feasibility && plan.feasibility.label
  };

  const sys = `You are the Plan Copilot for Digit2AI — a warm, concise product co-designer helping a prospect refine the build plan for THEIR OWN software idea, before they book a call. ${es ? 'Reply in Spanish (proper orthography, tildes/ñ).' : 'Reply in English.'} No emojis.

You can do exactly one of three things each turn:
- "answer": explain, summarize, or answer a question. The plan does NOT change.
- "edit": change the plan whenever the user asks to add/remove/resize scope, change the timeline, or reword a section.
- "clarify": ONLY when the request is truly impossible to interpret.

BIAS STRONGLY TOWARD "edit" on any change request. Do NOT ask a clarifying question when you can make a sensible change and state your assumption in the reply. Example: "make it a 2-week MVP" -> set timeline_weeks to 2, trim build_includes to the smallest viable scope, and in the reply say what you cut and that they can add anything back. "add a mobile app" -> add it to build_includes and nudge timeline_weeks up, then say so. Only "clarify" if you genuinely cannot act at all.

You may ONLY edit these fields: ${EDITABLE.join(', ')}. You cannot see or change pricing, internal verdicts, the feasibility score, or the risk analysis — do not invent them or discuss cost of our services. If asked about price, say a human will cover pricing on the call.

When editing timeline_weeks, keep it realistic (a small PoC is 2-4 weeks); when adding a feature, add it to build_includes and adjust timeline_weeks if it is materially bigger.

Return ONLY valid JSON:
{"mode":"answer|edit|clarify","reply":"<what you say to the user, 1-3 sentences>","plan":{<ONLY the edited fields, omit if mode!=edit>},"diff":"<one short human sentence naming what changed, only if mode==edit>"}`;

  const user = `PROSPECT'S ORIGINAL REQUEST
${req.description || '(none)'}
Target users: ${req.target_users || '(unknown)'}
Current process: ${req.current_process || '(unknown)'}

CURRENT PLAN (JSON)
${JSON.stringify(planForModel)}

${hist ? 'RECENT CONVERSATION\n' + hist + '\n' : ''}USER MESSAGE
${msg}`;

  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1400,
      system: sys,
      messages: [{ role: 'user', content: user }]
    });
    const text = resp?.content?.[0]?.text || '';
    const cost = Number(((resp?.usage?.input_tokens || 0) * HAIKU_IN + (resp?.usage?.output_tokens || 0) * HAIKU_OUT).toFixed(5));
    const parsed = safeParseJson(text);
    if (!parsed) {
      return { ok: true, mode: 'answer', reply: es ? 'Perdona, no entendí bien. ¿Puedes reformularlo?' : 'Sorry, I didn\'t quite catch that — could you rephrase?', plan: null, diff: null, cost_estimate_usd: cost, model: HAIKU_MODEL };
    }
    const mode = ['answer', 'edit', 'clarify'].includes(parsed.mode) ? parsed.mode : 'answer';
    const reply = String(parsed.reply || '').slice(0, 1200);

    if (mode === 'edit' && parsed.plan) {
      const nextPlan = applyEdit(plan, parsed.plan);
      const leaks = findLeaks(nextPlan);
      if (leaks.length) {
        console.error('[planCopilot] edit blocked, leaks: %j', leaks);
        return { ok: true, mode: 'answer', reply: es ? 'No pude aplicar ese cambio. ¿Intentamos de otra forma?' : 'I couldn\'t apply that change — want to try it another way?', plan: null, diff: null, cost_estimate_usd: cost, model: HAIKU_MODEL };
      }
      return { ok: true, mode: 'edit', reply, plan: nextPlan, diff: String(parsed.diff || '').slice(0, 300), cost_estimate_usd: cost, model: HAIKU_MODEL };
    }
    return { ok: true, mode, reply, plan: null, diff: null, cost_estimate_usd: cost, model: HAIKU_MODEL };
  } catch (err) {
    console.error('[planCopilot] chat failed:', err.message);
    return { ok: false, error: err.message, mode: 'answer', reply: es ? 'Hubo un problema al conectar. Inténtalo de nuevo.' : 'There was a problem connecting. Please try again.', plan: null, diff: null, cost_estimate_usd: 0, model: HAIKU_MODEL };
  }
}

module.exports = { chat, EDITABLE, HAIKU_MODEL };

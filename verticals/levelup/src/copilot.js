'use strict';

/**
 * THE DASHBOARD COPILOT — write what you want, it runs the dashboard.
 *
 * "Add three ideas about budgeting and schedule the first one for Friday",
 * "what is waiting on me?", "teach the scripts agent never to say hack" —
 * the creator types it and the copilot performs the real work.
 *
 * It is NOT a second product surface. It calls the SAME Brain tools the
 * buttons call (brain.callTool), on channel 'copilot', so tenancy, the audit
 * row, the daily model cap and every honesty guard apply unchanged.
 *
 * WHAT IT MAY NOT DO, BY CONSTRUCTION: the human_only actions — approving a
 * brand reply, marking one sent, marking a post posted, publishing a public
 * page, changing the rate card. The Brain refuses them off the app channel, so
 * the copilot cannot perform them however it is asked. Instead it hands the
 * creator a labelled button: the tap is the human act, and it goes through the
 * ordinary app channel. That refusal is not a message in a prompt; it is the
 * Brain returning 403.
 *
 * With no model the copilot says so plainly and does nothing — it never
 * pretends to have understood.
 */

const brain = require('./brain');
const llm = require('./llm');
const C = require('./corpus');

const MAX_TURNS = () => Math.max(1, Number(process.env.LEVELUP_COPILOT_TURNS) || 6);
const MAX_CALLS = () => Math.max(1, Number(process.env.LEVELUP_COPILOT_CALLS) || 10);

// Anthropic tool names allow letters, numbers, _ and - only; ours carry a dot.
const wire = (name) => name.replace(/\./g, '__');
const unwire = (name) => String(name || '').replace(/__/g, '.');

function toolsFor(ctx) {
  // Everything the app can do. The human_only ones are OFFERED so the copilot
  // can prepare them, but the Brain refuses to execute them here and they come
  // back to the creator as a button.
  return [...brain.TOOLS.values()].map((t) => ({
    name: wire(t.name),
    description: t.description + (t.human_only ? ' NOTE: this one needs the creator\'s own tap; calling it offers them a button.' : ''),
    input_schema: t.input_schema || { type: 'object', properties: {} }
  }));
}

function systemPrompt(ctx, brief) {
  const es = ctx.lang === 'es';
  return (es
    ? `Eres Líder, la gerente del equipo de IA de LevelUp Media Marketing, dentro del panel de una creadora. Ella te escribe en lenguaje natural y tú HACES el trabajo llamando a las herramientas.`
    : `You are Líder, the manager of the creator's AI team inside the LevelUp Media Marketing dashboard. The creator writes to you in plain language and you DO the work by calling tools.`) + `

Rules you never break:
- Use the tools to actually do the work. Do not describe what you would do; do it, then report.
- Never invent a number, a price, a follower count or a result. Every figure you say must come from a tool result.
- Never claim anything was sent, posted or published. You cannot do those: they need the creator's own tap, and calling such a tool only offers them a button.
- If a request is ambiguous in a way that matters (which post, which list), ask ONE short question instead of guessing.
- Answer in ${es ? 'Spanish with correct orthography (tildes, ñ)' : 'English'}, in 1 to 3 short sentences, saying what you did. No emojis.

The creator's current state (real counts): ${JSON.stringify(brief)}
The agents on the team: ${C.AGENTS.map((a) => a.id).join(', ')}.
Post statuses, in order: ${C.POST_STATUSES.join(' > ')}.
Today is ${new Date().toISOString().slice(0, 10)}.`;
}

/**
 * run({ message, history, ctx }) -> { reply, actions, proposals, composed_by, is_simulated }
 *   ctx = { tenantId, actorId, lang, isPlatformAdmin }
 * history = [{ role:'user'|'assistant', content:'...' }] (plain text, last few turns)
 */
async function run({ message, history = [], ctx }) {
  const text = String(message || '').trim().slice(0, 4000);
  if (!text) throw Object.assign(new Error('Write what you need'), { status: 400 });

  const callCtx = { tenantId: ctx.tenantId, actorId: ctx.actorId, channel: 'copilot', lang: ctx.lang, isPlatformAdmin: false };
  const briefRes = await brain.callTool('lider.brief', {}, callCtx);
  const brief = briefRes.ok ? { by_status: briefRes.result.by_status, today: briefRes.result.today.length, deals_waiting_approval: briefRes.result.deals_waiting_approval, edit_jobs_waiting: briefRes.result.edit_jobs_waiting } : {};

  if (!llm.configured()) {
    return {
      reply: ctx.lang === 'es'
        ? 'Ahora mismo no hay un modelo disponible, así que no puedo interpretar lo que escribiste. Usa los botones del panel: hacen exactamente lo mismo.'
        : 'No model is available right now, so I cannot read what you wrote. Use the dashboard buttons: they do exactly the same work.',
      actions: [], proposals: [], composed_by: 'offline', is_simulated: true, no_model: true
    };
  }

  const messages = history.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }))
    .filter((m) => m.content);
  messages.push({ role: 'user', content: text });

  const tools = toolsFor(callCtx);
  const system = systemPrompt(ctx, brief);
  const actions = []; const proposals = [];
  let calls = 0; let reply = ''; let model = null;

  for (let turn = 0; turn < MAX_TURNS(); turn++) {
    const r = await llm.toolTurn({ system, messages, tools, max_tokens: 1400 });
    if (!r) break;
    model = r.model;
    const said = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (said) reply = said;
    const uses = (r.content || []).filter((b) => b.type === 'tool_use');
    if (!uses.length) break;

    messages.push({ role: 'assistant', content: r.content });
    const results = [];
    for (const u of uses) {
      const name = unwire(u.name);
      if (calls >= MAX_CALLS()) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Stopped: too many actions in one request. Tell the creator what is done and what is left.' });
        continue;
      }
      calls++;
      const out = await brain.callTool(name, u.input || {}, callCtx);
      if (out.ok) {
        actions.push({ tool: name, ok: true });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out.result).slice(0, 6000) });
      } else if (out.status === 403 && brain.TOOLS.get(name) && brain.TOOLS.get(name).human_only) {
        // Prepared, never performed: the creator taps it themselves.
        proposals.push({ tool: name, args: u.input || {}, label: name });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Not done: this action is the creator\'s own. A button has been offered to them. Say so plainly and do not claim it happened.' });
      } else {
        actions.push({ tool: name, ok: false, error: out.error });
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: String(out.error || 'failed').slice(0, 500) });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  if (!reply) {
    reply = ctx.lang === 'es'
      ? (actions.length ? 'Listo.' : 'No pude completar eso. Intenta decirlo de otra forma o usa los botones del panel.')
      : (actions.length ? 'Done.' : 'I could not complete that. Try saying it another way, or use the dashboard buttons.');
  }
  return { reply, actions, proposals, composed_by: model ? 'model' : 'offline', is_simulated: !model, model };
}

module.exports = { run, wire, unwire, toolsFor };

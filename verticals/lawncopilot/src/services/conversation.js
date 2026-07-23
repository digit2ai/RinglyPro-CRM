'use strict';

/**
 * Lawn Co-Pilot — conversation engine
 *
 * The typed path and the voice path are the SAME conversation. Both land here,
 * both call the same Brain tools, both produce the same numbers.
 *
 * Two drivers, one behavior contract:
 *   llm       — Claude with the Brain's tools bound (when ANTHROPIC_API_KEY is set)
 *   scripted  — a deterministic state machine, zero keys, fully functional
 *
 * The scripted driver is not a degraded stub. A visitor with no API keys
 * anywhere still gets a complete measured estimate, a price for every
 * frequency, and a booking. Voice is an enhancement; this is the floor.
 */

const brain = require('../mcp/brain');
const { AgentSession } = require('../models');

const MODEL = () => process.env.LAWNCOPILOT_VOICE_MODEL || 'claude-haiku-4-5-20251001';
const hasLLM = () => !!process.env.ANTHROPIC_API_KEY;

// ── Session state ──────────────────────────────────────────────────────────
async function loadSession(tenant_id, session_id) {
  const s = await AgentSession.findOne({ where: { tenant_id, session_id } });
  return s;
}

async function appendTurn(session, role, text, meta) {
  const t = Array.isArray(session.transcript) ? session.transcript.slice() : [];
  t.push({ role, text, at: new Date().toISOString(), ...(meta || {}) });
  session.transcript = t.slice(-60);
  session.updated_at = new Date();
  await session.save();
  return t;
}

function stateOf(session) {
  return (session.identity && session.identity.__state) || {};
}
async function setState(session, patch) {
  const identity = { ...(session.identity || {}) };
  identity.__state = { ...(identity.__state || {}), ...patch };
  session.identity = identity;
  session.updated_at = new Date();
  await session.save();
}

// ── Address detection ──────────────────────────────────────────────────────
function looksLikeAddress(text) {
  const s = String(text || '');
  if (/\d{1,6}\s+[A-Za-z]/.test(s) && s.length > 8) return true;
  if (/\b\d{5}\b/.test(s) && /[A-Za-z]{3,}/.test(s)) return true;
  return false;
}

const FREQ_WORDS = {
  weekly: /\bweek(ly)?\b|every week/i,
  biweekly: /\bbi-?week(ly)?\b|every (other|two) week|two weeks|fortnight/i,
  monthly: /\bmonth(ly)?\b|once a month/i,
  one_time: /\bone[- ]?time\b|just once|single|one cut|once only/i
};
function detectFrequency(text) {
  for (const [k, re] of Object.entries(FREQ_WORDS)) if (re.test(String(text || ''))) return k;
  return null;
}

function n(v) { return Number(v || 0).toLocaleString('en-US'); }

// ── The scripted driver (zero keys, fully functional) ──────────────────────
async function scriptedTurn({ session, text, ctx }) {
  const st = stateOf(session);
  const identity = session.identity || {};
  const firstName = String(identity.name || '').split(' ')[0] || 'there';
  const msg = String(text || '').trim();

  // Greeting / opening turn.
  if (!msg && !st.stage) {
    await setState(session, { stage: 'await_address' });
    return {
      reply: `Hi ${firstName}, I am the Lawn Co-Pilot receptionist. I am an AI, and I can measure your lawn and give you a real price right now. What is the service address?`,
      stage: 'await_address'
    };
  }

  // FAQ interception — answered at any stage without losing the thread.
  if (msg && !looksLikeAddress(msg)) {
    const faq = await brain.callTool('receptionist.answer_faq', { question: msg }, ctx);
    if (faq.matched) {
      const tail = st.property_id
        ? ' Anything else, or shall we get you on the schedule?'
        : ' What is the service address?';
      return { reply: faq.answer + tail, stage: st.stage || 'await_address' };
    }
  }

  // Stage: waiting for an address.
  if (!st.property_id) {
    if (!looksLikeAddress(msg)) {
      return {
        reply: `I need the street address to measure the lawn. Something like "1240 Palm Grove Drive, Orlando FL 32801".`,
        stage: 'await_address'
      };
    }

    const measured = await brain.callTool('estimator.measure_property', { address: msg }, ctx);
    if (!measured.success) {
      return { reply: `I could not measure that one: ${measured.error} Try the address again with the city and ZIP?`, stage: 'await_address' };
    }

    const priced = await brain.callTool('estimator.price_quote', { property_id: measured.property_id }, ctx);
    if (!priced.success) {
      return { reply: `I measured the property but could not price it: ${priced.error} Let me take your details and have someone follow up.`, stage: 'await_address' };
    }

    await setState(session, {
      stage: 'await_frequency',
      property_id: measured.property_id,
      address: measured.normalized_address,
      serviceable_sqft: measured.serviceable_sqft
    });

    const o = priced.options;
    const lines = [
      `Got it — ${measured.normalized_address}.`,
      measured.spoken_summary,
      '',
      `Weekly: ${o.weekly.price_display} a visit.`,
      `Every two weeks: ${o.biweekly.price_display} a visit.`,
      `Monthly: ${o.monthly.price_display} a visit.`,
      `One-time cut: ${o.one_time.price_display}.`,
      '',
      measured.needs_review
        ? 'One note: this property needs a quick human check before anything is charged, and someone will do that today.'
        : 'Most people in Florida go with every two weeks. Which one do you want?'
    ];
    return {
      reply: lines.filter(l => l !== undefined).join('\n'),
      stage: 'await_frequency',
      data: {
        property_id: measured.property_id,
        measurement: {
          lot_sqft: measured.lot_sqft,
          building_footprint_sqft: measured.building_footprint_sqft,
          excluded_sqft: measured.excluded_sqft,
          excluded_breakdown: measured.excluded_breakdown,
          serviceable_sqft: measured.serviceable_sqft,
          confidence: measured.confidence,
          is_estimate: measured.is_estimate,
          needs_review: measured.needs_review,
          imagery_url: measured.imagery_url,
          geometry: measured.geometry,
          normalized_address: measured.normalized_address,
          sources: measured.sources
        },
        pricing: priced.options
      }
    };
  }

  // Stage: choosing a frequency.
  if (st.stage === 'await_frequency') {
    const freq = detectFrequency(msg);
    if (/why|how|explain|breakdown|come up with/i.test(msg)) {
      const ex = await brain.callTool('estimator.explain_price', { property_id: st.property_id, frequency: 'biweekly' }, ctx);
      if (ex.success) return { reply: ex.explanation + ' Which frequency do you want?', stage: 'await_frequency' };
    }
    if (/wrong|too (big|small|high)|not right|inaccurate|dispute/i.test(msg)) {
      const f = await brain.callTool('estimator.flag_for_review', { property_id: st.property_id, reason: msg }, ctx);
      return { reply: `${f.message} In the meantime, do you want me to hold a spot on the schedule?`, stage: 'await_frequency' };
    }
    if (!freq) {
      return { reply: 'Weekly, every two weeks, monthly, or a one-time cut — which works for you?', stage: 'await_frequency' };
    }

    const quote = await brain.callTool('estimator.issue_quote', { property_id: st.property_id, frequency: freq }, ctx);
    if (!quote.success) {
      return { reply: `I could not lock that quote in: ${quote.error}`, stage: 'await_frequency' };
    }

    const avail = await brain.callTool('dispatcher.check_availability', {}, ctx);
    await setState(session, { stage: 'await_date', frequency: freq, quote_id: quote.quote_id, quote_token: quote.token });

    if (!avail.success || !avail.slots.length) {
      return {
        reply: `Locked in: ${quote.price_display} ${freq === 'one_time' ? 'for a one-time cut' : 'per visit'}. I do not have open dates showing right now — let me take your details and the office will call with the first opening.`,
        stage: 'await_date',
        data: { quote }
      };
    }

    const options = avail.slots.slice(0, 4)
      .map((s, i) => `${i + 1}. ${s.display}, ${s.window_label}`)
      .join('\n');
    return {
      reply: `Locked in: ${quote.price_display} ${freq === 'one_time' ? 'for a one-time cut' : 'per visit'}${quote.is_estimate ? ', preliminary until we verify the property' : ''}.\n\nHere is what is open:\n${options}\n\nWhich one do you want? Reply with the number.`,
      stage: 'await_date',
      data: { quote, slots: avail.slots.slice(0, 4) }
    };
  }

  // Stage: picking a date.
  if (st.stage === 'await_date') {
    const avail = await brain.callTool('dispatcher.check_availability', {}, ctx);
    const slots = (avail.slots || []).slice(0, 4);
    let chosen = null;
    const num = msg.match(/\b([1-4])\b/);
    if (num) chosen = slots[Number(num[1]) - 1];
    if (!chosen) {
      chosen = slots.find(s => msg.toLowerCase().includes(String(s.day_name || '').toLowerCase()));
    }
    if (!chosen) {
      const d = msg.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (d) chosen = slots.find(s => s.date === d[1]);
    }
    if (!chosen) {
      const options = slots.map((s, i) => `${i + 1}. ${s.display}, ${s.window_label}`).join('\n');
      return { reply: `Pick one of these by number:\n${options}`, stage: 'await_date', data: { slots } };
    }

    await setState(session, { stage: 'ready_to_book', chosen_date: chosen.date, chosen_window: [chosen.window_start, chosen.window_end] });
    return {
      reply: `${chosen.display}, ${chosen.window_label}. To lock that in I need to set up your account and a payment method — it takes about a minute and nothing is charged until after your first service. Ready?`,
      stage: 'ready_to_book',
      data: { chosen, quote_token: st.quote_token, checkout: true }
    };
  }

  // Stage: ready to hand off to checkout.
  if (st.stage === 'ready_to_book') {
    if (/no|not now|later|wait|think/i.test(msg)) {
      return {
        reply: `No problem. Your quote is saved and good for 30 days — I emailed it to ${identity.email}. Anything else you want to know?`,
        stage: 'ready_to_book'
      };
    }
    return {
      reply: 'Opening the setup now. Your quote and date carry straight over.',
      stage: 'checkout',
      data: { checkout: true, quote_token: st.quote_token, chosen_date: st.chosen_date }
    };
  }

  return { reply: 'I did not catch that. Can you say it another way?', stage: st.stage || 'await_address' };
}

// ── The LLM driver ─────────────────────────────────────────────────────────
async function llmTurn({ session, text, ctx }) {
  const employee = brain.getEmployee('receptionist');
  // Pass the session's verified identity, or every identified-trust tool
  // (measure_property, price_quote, book_appointment) is silently withheld.
  const tools = brain.listTools({ channel: ctx.channel, identity_verified: ctx.identity_verified })
    .map(t => ({
      name: t.name.replace('.', '__'),
      description: `[${t.employee_name}] ${t.description}`,
      input_schema: t.parameters || { type: 'object', properties: {} }
    }));

  const identity = session.identity || {};
  const history = (session.transcript || []).slice(-14).map(t => ({
    role: t.role === 'agent' ? 'assistant' : 'user',
    content: t.text
  }));

  const system = `${employee.system_prompt}

Session facts you already have (do not ask for them again):
- Name: ${identity.name || 'unknown'}
- Phone: ${identity.phone || 'unknown'}
- Email: ${identity.email || 'unknown'}

You are on the ${ctx.channel} channel. Keep replies under 90 words. Speak like a person on the phone, not like a document. Never use bullet characters or markdown.`;

  const messages = [...history, { role: 'user', content: text || 'Hello' }];
  const collected = {};

  for (let hop = 0; hop < 6; hop++) {
    const res = await anthropic({
      model: MODEL(),
      max_tokens: 700,
      system,
      tools,
      messages
    });
    if (!res.ok) return { reply: null, error: res.error };

    const body = res.data;
    const toolUses = (body.content || []).filter(c => c.type === 'tool_use');
    const textOut = (body.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim();

    if (!toolUses.length) {
      return { reply: textOut || 'Sorry, could you say that again?', stage: 'llm', data: collected };
    }

    messages.push({ role: 'assistant', content: body.content });
    const results = [];
    for (const tu of toolUses) {
      const toolName = tu.name.replace('__', '.');
      const out = await brain.callTool(toolName, tu.input || {}, ctx);
      if (toolName === 'estimator.measure_property' && out.success) collected.measurement = out;
      if (toolName === 'estimator.price_quote' && out.success) collected.pricing = out.options;
      if (toolName === 'estimator.issue_quote' && out.success) collected.quote = out;
      if (toolName === 'dispatcher.check_availability' && out.success) collected.slots = out.slots;
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 6000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Let me get a person on this with you.', stage: 'llm', data: collected };
}

async function anthropic(payload) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: (data.error && data.error.message) || `http_${r.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * One conversational turn. Typed or spoken, this is the entry point.
 */
async function turn({ tenant_id, session_id, text, channel }) {
  const session = await loadSession(tenant_id, session_id);
  if (!session) return { success: false, error: 'Session not found. Start a session first.' };

  const identity = session.identity || {};
  const identityComplete = !!(identity.name && identity.phone && identity.email);
  if (!identityComplete) {
    return {
      success: false, gate_required: true,
      error: 'Name, phone, and email are required before any request.'
    };
  }

  const ctx = {
    tenant_id,
    channel: channel || session.channel || 'web_chat',
    session_id,
    actor: `lead:${identity.email}`,
    customer_id: session.customer_id || null,
    identity_verified: true
  };

  if (text) await appendTurn(session, 'user', text);

  let out;
  if (hasLLM()) {
    out = await llmTurn({ session, text, ctx });

    // The LLM makes it sound human; the scripted driver guarantees progress.
    //
    // A chatty model will happily answer "let me measure that now" WITHOUT
    // emitting the tool call, leaving the customer with narration instead of a
    // price. So whenever the visitor has handed us something address-shaped and
    // the turn produced no measurement, we run the deterministic path — same
    // Brain, same tools, same numbers — and the customer always ends the turn
    // holding real figures.
    const st = stateOf(session);
    const stalled = !out.reply
      || (looksLikeAddress(text) && !st.property_id && !(out.data && out.data.measurement));

    if (stalled) out = await scriptedTurn({ session, text, ctx });
  } else {
    out = await scriptedTurn({ session, text, ctx });
  }

  await appendTurn(session, 'agent', out.reply);

  return {
    success: true,
    reply: out.reply,
    stage: out.stage || null,
    data: out.data || null,
    driver: hasLLM() ? 'llm' : 'scripted'
  };
}

module.exports = { turn, scriptedTurn, looksLikeAddress, detectFrequency, hasLLM };

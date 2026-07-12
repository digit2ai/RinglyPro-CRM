'use strict';

/**
 * RinglyPro Lite voice brain — adapted from full RinglyPro's
 * conversationRelayAgent.js (Twilio ConversationRelay + Claude Haiku + Polly).
 * Differences for Lite:
 *   - TWO intents only: take a message OR book an appointment. Anything else
 *     → take a message. No CRM/pipeline tools.
 *   - Tools call the in-process booking service directly (no loopback HTTP).
 *   - Bilingual per tenant locale; short prompts; capped turns (< 90s target).
 *   - Booking + LLM client are injectable so the flow is unit-testable.
 */

const Anthropic = require('@anthropic-ai/sdk');
const bookingSvc = require('./booking');
const { t } = require('./i18n');

const MODEL = process.env.LITE_VOICE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TURNS = parseInt(process.env.LITE_MAX_TURNS || '10', 10);

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    const apiKey = process.env.LITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

const TOOL_DEFS = [
  {
    name: 'check_availability',
    description: 'List open appointment slots. Call before offering times.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD for a specific day (optional)' },
        days_ahead: { type: 'integer', description: 'How many days out to search (default 7)' }
      }
    }
  },
  {
    name: 'book_appointment',
    description: 'Book a specific open slot. Only call after the caller picks a time you offered.',
    input_schema: {
      type: 'object',
      properties: {
        caller_name: { type: 'string' },
        callback_number: { type: 'string', description: 'Digits confirmed with the caller' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24h local' }
      },
      required: ['date', 'time']
    }
  },
  {
    name: 'take_message',
    description: 'Save a message for the business. Use when the caller does not want to book and does not need a live person.',
    input_schema: {
      type: 'object',
      properties: {
        caller_name: { type: 'string' },
        callback_number: { type: 'string' },
        body: { type: 'string', description: 'What the caller wants the business to know' }
      },
      required: ['body']
    }
  },
  {
    name: 'transfer_to_human',
    description: 'Immediately connect the caller to a live person at the business (the owner). Use when the caller asks for a live person, a representative, or a specific person such as a family member (husband, wife, son, daughter).',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Who or what they asked for' }
      }
    }
  }
];

function dateRefTable(tz, locale) {
  // 14-day weekday→YYYY-MM-DD table so the model never does date math.
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
    const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : parts.weekday;
    rows.push(`${label}: ${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`);
  }
  return rows.join('\n');
}

function buildSystemPrompt(ctx) {
  const es = ctx.locale === 'es';
  const lang = es ? 'Spanish (natural, warm, neutral Latin-American)' : 'English';
  const biz = ctx.businessName;
  const known = !!ctx.callerName;
  const whoIsThis = known
    ? `This is a RETURNING caller: ${ctx.callerName}. Greet them warmly by name. You ALREADY have their name and phone number on file — do NOT ask for either again.`
    : `This may be a NEW caller. Treat them with warmth and respect, and reassure them that ${biz} will take good care of them.`;

  const langLock = `\nLANGUAGE: Speak ONLY ${lang} for the entire call. Do not switch languages even if the caller uses another one — stay in ${lang}.\n`;

  return `You are Lina, the friendly front-desk receptionist for "${biz}". You are a warm, caring, REAL person answering the phone. You speak ${lang}.${langLock}

NEVER say or imply you are an AI, a bot, a virtual assistant, an automated system, or a computer. If asked, you're Lina, part of the ${biz} team. Open by introducing yourself: "Hi, this is Lina with ${biz}."

You help the caller with ONE of these:
1) Book an appointment,
2) Take a message for ${biz}, or
3) Connect them to a live person (transfer).

HOW YOU SOUND — like a real, kind human receptionist:
- Warm, calm, natural. Smile in your voice. Vary your wording so you never sound scripted or robotic.
- Use light, genuine acknowledgements ("Of course", "Happy to help", "Absolutely", "Got it").
- Emotional intelligence: if they sound upset, worried, rushed, or sad, acknowledge it kindly first ("I'm so sorry to hear that — let me help you right away").
- Courtesy: please, thank you, "my pleasure". One question at a time. Keep it under ~90 seconds. Never rattle off a long list.

WHO YOU'RE TALKING TO:
${whoIsThis}

BOOKING AN APPOINTMENT:
- Call check_availability, then warmly offer TWO or THREE of the returned times in a natural, varied way (e.g. "I have Tuesday at 10:30, or Thursday afternoon at 2 — would either of those work?"). Never invent a time that wasn't returned.
- Once they pick one, confirm the day and time back warmly. ${known ? 'You already have their name and number — do not re-ask.' : 'Ask their first name. Only ask for a callback number if you do not already have it.'}
- Then call book_appointment. Never say it's booked until book_appointment returns success.

TAKING A MESSAGE:
- Be professional and caring. Ask what they'd like ${biz} to know.
- ${known ? `You already know this is ${ctx.callerName} and you have their number — do NOT ask for their name or number.` : 'Ask their first name. Do NOT ask for a phone number unless you truly don\'t have their number on file.'}
- Then call take_message. Reassure them warmly: "I'll make sure ${biz} gets your message and gets back to you soon." ALWAYS say "${biz}" — NEVER say "the owner".

CONNECTING TO A LIVE PERSON (transfer):
- If the caller asks for a live person, a representative, or a SPECIFIC person (for example a family member — "I need to speak with my husband / my wife / my son / my daughter", or "put me through to someone"), do NOT take a message. Warmly tell them you'll connect them right now and immediately call transfer_to_human.
- If the transfer can't be completed, apologize gently and offer to take a message instead.

TRUTHFULNESS (critical): Never say something is done unless the matching tool returned success in THIS turn. If a slot is taken, apologize briefly and offer another. If a tool fails, offer to take a message.

TIMEZONE: ${ctx.timezone}. Use this reference so you never miscalculate a date:
${dateRefTable(ctx.timezone, ctx.locale)}

Close warmly and personally once you've helped them.`;
}

class RelaySession {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;                       // { tenantId, businessName, locale, timezone, from, to, callSid, callerName, callId }
    this.booking = opts.booking || bookingSvc;
    this.createMessage = opts.createMessage || ((args) => anthropic().messages.create(args));
    this.onTurn = opts.onTurn || (() => {});   // (role, text, toolName) -> logging hook
    this.system = buildSystemPrompt(ctx);
    this.messages = [];
    this.busy = false;
    this.disposition = null;              // 'message' | 'appointment'
    this.tokensIn = 0;
    this.tokensOut = 0;
    this.turns = 0;
    this.lastToolResults = {};
    this.events = [];   // {type:'appointment'|'message', data} — consumed by the telephony layer for SMS
  }

  openingGreeting() {
    const tt = t(this.ctx.locale);
    const line = this.ctx.callerName
      ? tt.greetingKnown(this.ctx.businessName, this.ctx.callerName)
      : tt.greeting(this.ctx.businessName);
    this.messages.push({ role: 'assistant', content: line });
    this.onTurn('agent', line);
    return line;
  }

  async execTool(name, input) {
    const base = { tenantId: this.ctx.tenantId, call_id: this.ctx.callId };
    // Default the callback number to caller ID if the model didn't capture it.
    if ((name === 'book_appointment' || name === 'take_message') && !input.callback_number) {
      input.callback_number = this.ctx.from;
    }
    let result;
    if (name === 'check_availability') result = await this.booking.checkAvailability({ ...base, ...input });
    else if (name === 'book_appointment') {
      result = await this.booking.bookAppointment({ ...base, ...input });
      if (result.success) { this.disposition = 'appointment'; this.events.push({ type: 'appointment', data: { ...input, ...result } }); }
    } else if (name === 'take_message') {
      result = await this.booking.takeMessage({ ...base, ...input });
      if (result.success) { this.disposition = 'message'; this.events.push({ type: 'message', data: { ...input, ...result } }); }
    } else if (name === 'transfer_to_human') {
      const number = this.ctx.transferNumber || this.ctx.ownerPhone;
      if (!number) {
        result = { success: false, error: 'no_transfer_number' };
      } else {
        this.disposition = 'transferred';
        this.events.push({ type: 'transfer', data: { number, reason: input.reason } });
        result = { success: true, transferring: true };
      }
    }
    else result = { success: false, error: 'unknown_tool' };
    this.lastToolResults[name] = result;
    this.onTurn('tool', JSON.stringify(result), name);
    return result;
  }

  /** think → tool → speak loop; returns the text to speak. */
  async handlePrompt(userText) {
    this.busy = true;
    this.turns++;
    this.messages.push({ role: 'user', content: userText });
    this.onTurn('caller', userText);
    try {
      let reply = '';
      for (let hop = 0; hop < 6; hop++) {
        const resp = await this.createMessage({
          model: MODEL,
          max_tokens: 320,
          system: this.system,
          tools: TOOL_DEFS,
          messages: this.messages
        });
        if (resp.usage) { this.tokensIn += resp.usage.input_tokens || 0; this.tokensOut += resp.usage.output_tokens || 0; }
        this.messages.push({ role: 'assistant', content: resp.content });

        if (resp.stop_reason === 'tool_use') {
          const toolResults = [];
          for (const block of resp.content) {
            if (block.type === 'tool_use') {
              const out = await this.execTool(block.name, block.input || {});
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
            }
          }
          this.messages.push({ role: 'user', content: toolResults });
          continue; // let the model speak after seeing tool results
        }
        // plain text turn
        reply = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
        break;
      }
      if (reply) this.onTurn('agent', reply);
      return reply || (this.ctx.locale === 'es' ? 'Perdón, ¿me lo repite?' : 'Sorry, could you say that again?');
    } finally {
      this.busy = false;
    }
  }
}

/** Setup-time context resolution: tenant by DID + returning-caller lookup. */
async function resolveContext({ to, from, callSid, booking = bookingSvc }) {
  const info = await booking.getBusinessInfo({ did: to });
  if (!info.success) return { resolved: false };
  let callerName = null;
  try {
    const id = await booking.identifyCaller({ tenantId: info.tenant_id, phone: from });
    if (id.found) callerName = id.caller_name;
  } catch (_) { /* ignore */ }
  return {
    resolved: true,
    tenantId: info.tenant_id,
    businessName: info.business_name,
    locale: info.locale || 'en',
    country: info.country || 'US',
    timezone: info.timezone || 'America/New_York',
    transferNumber: info.transfer_number,
    ownerPhone: info.owner_phone,
    suspended: info.suspended,
    is_demo: !!info.is_demo,
    from, to, callSid, callerName
  };
}

module.exports = { RelaySession, resolveContext, buildSystemPrompt, MODEL, TOOL_DEFS };

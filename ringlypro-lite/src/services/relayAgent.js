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
    description: 'Save a message for the business owner. Use when the caller does not want to book.',
    input_schema: {
      type: 'object',
      properties: {
        caller_name: { type: 'string' },
        callback_number: { type: 'string' },
        body: { type: 'string', description: 'What the caller wants the owner to know' }
      },
      required: ['body']
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
  const lang = es ? 'Spanish (natural, neutral Latin-American)' : 'English';
  const knownCaller = ctx.callerName
    ? (es ? `El llamante es cliente conocido: ${ctx.callerName}. Salúdalo por su nombre.`
          : `Caller is a known customer: ${ctx.callerName}. Greet them by name.`)
    : '';
  return `You are the AI phone receptionist for "${ctx.businessName}". You speak ${lang}.

You do EXACTLY TWO things:
1) BOOK AN APPOINTMENT, or
2) TAKE A MESSAGE for the owner.
If the caller wants anything else, take a message. Do not promise anything else.

STYLE: Warm but brief. No small talk. One question at a time. Keep the whole call under 90 seconds. Never read long lists — offer at most 2-3 times.

BOOKING RULES:
- Call check_availability, then offer the nearest 2-3 times in plain language.
- After the caller picks one, confirm their name and read back their callback number digit by digit, THEN call book_appointment.
- Never invent a time that wasn't returned by check_availability.

MESSAGE RULES:
- Collect: caller name, callback number (read digits back to confirm), and the message.
- Then call take_message.

TRUTHFULNESS (critical): NEVER say an appointment is booked or a message is saved unless the matching tool returned success:true in THIS turn. If a slot is taken, apologize briefly and offer another. If a tool fails, offer to take a message instead.

TIMEZONE: ${ctx.timezone}. Use this date reference so you never miscalculate a date:
${dateRefTable(ctx.timezone, ctx.locale)}

${knownCaller}
End the call politely once the task is done.`;
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
    from, to, callSid, callerName
  };
}

module.exports = { RelaySession, resolveContext, buildSystemPrompt, MODEL, TOOL_DEFS };

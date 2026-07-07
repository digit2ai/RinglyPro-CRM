'use strict';
/**
 * ConversationRelay Agent — POC brain for the Twilio ConversationRelay voice path.
 *
 * Replaces the ElevenLabs Conversational-AI bundle with an unbundled, cheaper stack:
 *   Twilio ConversationRelay  (STT + TTS + turn-taking)
 *      ↕ websocket
 *   THIS FILE — Claude Haiku   (understands + decides + calls tools)
 *      ↕ localhost HTTP
 *   /api/elevenlabs/tools      (EXISTING booking backend — UNCHANGED)
 *      → RinglyPro calendar (appointments / d2_calendar_events)
 *
 * The booking tools are vendor-agnostic HTTP endpoints, so appointments land in the
 * exact same calendar/table as the ElevenLabs path — nothing downstream can tell the
 * difference. This module only swaps the "brain + voice".
 */

const Anthropic = require('@anthropic-ai/sdk');
let transcript = { log: () => {} };
try { transcript = require('./voiceTranscript'); } catch (e) { /* logging optional */ }

// Haiku 4.5 — cheapest capable tier, good enough for scripted booking dialog.
const MODEL = process.env.VOICE_RELAY_MODEL || 'claude-haiku-4-5-20251001';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
});

// Same booking backend ElevenLabs calls today. Loopback so we never leave the box.
function toolsEndpoint() {
  return `http://127.0.0.1:${process.env.PORT || 3000}/api/elevenlabs/tools`;
}

// Tool schemas exposed to Claude. Names match the existing /api/elevenlabs/tools router.
const TOOL_DEFS = [
  {
    name: 'check_availability',
    description: 'Check open appointment slots on the business calendar. ALWAYS call this before offering specific times to the caller.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD) to start searching from. Optional; omit for today.' },
        days_ahead: { type: 'integer', description: 'How many days forward to search. Default 7.' }
      }
    }
  },
  {
    name: 'book_appointment',
    description: 'Book the appointment. Only call once you have the caller\'s full name, a phone number, and a specific date and time that you confirmed is available.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Caller full name' },
        customer_phone: { type: 'string', description: 'Caller phone number in E.164 if known' },
        customer_email: { type: 'string', description: 'Caller email if provided' },
        appointment_date: { type: 'string', description: 'YYYY-MM-DD' },
        appointment_time: { type: 'string', description: 'HH:MM in 24-hour time' }
      },
      required: ['customer_name', 'appointment_date', 'appointment_time']
    }
  },
  {
    name: 'find_appointment',
    description: "Look up the caller's existing upcoming appointment(s) by phone number. Call this before rescheduling or cancelling so you have the appointment_id.",
    input_schema: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string', description: "Phone number to search. Defaults to the caller's own number." }
      }
    }
  },
  {
    name: 'reschedule_appointment',
    description: 'Move an existing appointment to a new date/time. Requires the appointment_id from find_appointment, plus the new date and time (which you should confirm is available with check_availability first).',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'integer', description: 'The id from find_appointment' },
        new_date: { type: 'string', description: 'YYYY-MM-DD (from the date reference table)' },
        new_time: { type: 'string', description: 'HH:MM 24-hour' }
      },
      required: ['appointment_id', 'new_date', 'new_time']
    }
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment. Requires the appointment_id from find_appointment. Confirm with the caller before cancelling.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'integer', description: 'The id from find_appointment' }
      },
      required: ['appointment_id']
    }
  },
  {
    name: 'take_message',
    description: "Save a message or lead when you cannot fully help — e.g. the caller wants a callback, has a question you can't answer, or asks to leave a message. Saves to the business inbox.",
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Caller name' },
        customer_phone: { type: 'string', description: "Callback number. Defaults to the caller's own number." },
        reason: { type: 'string', description: 'What the message/request is about, in one sentence.' }
      },
      required: ['reason']
    }
  },
  {
    name: 'transfer_to_human',
    description: "Hand the call to a live person. Use when the caller explicitly asks for a human/representative, or when you genuinely cannot help. After you call this the call is transferred and you do not need to say anything else.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Brief reason for the transfer (for logging).' }
      }
    }
  }
];

function buildSystemPrompt(ctx) {
  return [
    `You are ${ctx.agentName || 'the AI receptionist'} for ${ctx.businessName || 'this business'}, answering the phone.`,
    `Today is ${ctx.todayHuman} (${ctx.todayISO}), timezone ${ctx.timezone}.`,
    '',
    'DATE REFERENCE — the caller will name days like "Monday" or "tomorrow". Convert them using ONLY this table.',
    'NEVER calculate a date yourself; always copy the exact YYYY-MM-DD from the row whose weekday the caller said:',
    ctx.dateRef,
    '',
    ctx.callerName
      ? `The caller is ${ctx.callerName}, a returning customer (number ${ctx.from}). Greet them by name and do NOT ask their name again.`
      : `The caller is phoning from ${ctx.from || 'an unknown number'} — offer to use that number so they don't have to repeat it.`,
    ctx.upcomingText ? `Their upcoming appointment(s) on file:\n${ctx.upcomingText}` : '',
    '',
    'You are a full receptionist. You can BOOK, RESCHEDULE, and CANCEL appointments, TAKE A MESSAGE, and TRANSFER to a person.',
    'Rules:',
    '- Keep every reply short and natural — this is spoken out loud. One or two sentences, one question at a time.',
    '- Never read out IDs, URLs, or code. Speak like a person.',
    '- To turn a spoken day into a date, look it up in the DATE REFERENCE table above. Do not do the math in your head.',
    '',
    'BOOK: collect name + phone + preferred day/time. ALWAYS call check_availability first; only offer/book times it returned, using that slot\'s exact date. Confirm the day, date, and time out loud BEFORE calling book_appointment.',
    'RESCHEDULE / CANCEL: call find_appointment (defaults to the caller\'s number) to pull up their appointment. Read back which appointment you found and confirm before you change it. For a reschedule, check_availability for the new time, then call reschedule_appointment with the appointment_id. For a cancel, confirm, then call cancel_appointment with the appointment_id.',
    'TAKE A MESSAGE: if you cannot help, or the caller wants a callback or to leave a message, call take_message with their name, callback number, and the reason. Then tell them it has been passed along.',
    'TRANSFER: if the caller asks for a person/human/representative, or you truly cannot help, call transfer_to_human. After that the call is being handed off — you are done.',
    '',
    'TRUTHFULNESS — this is critical for every action:',
    '- Never tell the caller something is booked, rescheduled, cancelled, transferred, or that a message was taken UNLESS the matching tool call returned success true. Do not assume or pretend.',
    '- When you confirm a booking or reschedule, read the date and time back EXACTLY as they appear in the tool result, not from memory.',
    '- If a tool returns success false or an error, tell the caller it did NOT go through, then fix the missing detail or offer another option and try again. Never claim a failed action succeeded.'
  ].filter(Boolean).join('\n');
}

// Maps a "the action is done" claim in the agent's speech to the tool that must have
// succeeded for that claim to be true. Used by the anti-hallucination guardrail.
const ACTION_CLAIMS = [
  { tool: 'book_appointment', label: 'booking',
    re: /\b(booked|reserved|you'?re all set|your appointment (is|'?s) (set|booked|confirmed|scheduled)|scheduled you|got you (in|down) for)\b/i },
  { tool: 'reschedule_appointment', label: 'reschedule',
    re: /\b(rescheduled|moved your appointment|changed your appointment|moved you to)\b/i },
  { tool: 'cancel_appointment', label: 'cancellation',
    re: /\b(cancell?ed|called off)\b/i },
  { tool: 'take_message', label: 'message',
    re: /\b(passed (it|this|that|your message|along)|took (down )?your message|message (has been|'?s been|is|was) (saved|passed|recorded|noted|taken|delivered)|i'?ve (got|taken|recorded|saved|noted) (your|the) message|i'?ll (pass|make sure|let them know)|make sure (they|someone) (gets?|see))\b/i }
];

function detectUnbackedClaim(text, succeeded) {
  if (!text) return null;
  for (const c of ACTION_CLAIMS) {
    if (c.re.test(text) && !succeeded.has(c.tool)) return c;
  }
  return null;
}

class RelaySession {
  constructor(ctx) {
    this.ctx = ctx;                 // { clientId, businessName, from, to, callSid, transferNumber, callerName, ... }
    this.clientId = ctx.clientId;
    this.from = ctx.from;
    this.system = buildSystemPrompt(ctx);
    this.messages = [];             // Anthropic message history
    this.busy = false;
    this.transferred = false;
  }

  // Fire-and-forget transcript line for this call.
  logTurn(role, text, toolName) {
    transcript.log({
      callSid: this.ctx.callSid,
      clientId: this.clientId,
      from: this.from,
      role, text, toolName
    });
  }

  /**
   * First thing the caller hears — personalized if we recognized their number.
   * Records it as an assistant turn so the model has continuity.
   */
  openingGreeting() {
    const b = this.ctx.businessName || 'our office';
    const text = this.ctx.callerName
      ? `Hi ${this.ctx.callerName}, welcome back to ${b}. How can I help you today?`
      : `Hi, thanks for calling ${b}. I can book, reschedule, or cancel an appointment, take a message, or connect you with someone. How can I help?`;
    this.messages.push({ role: 'assistant', content: text });
    this.logTurn('agent', text);
    return text;
  }

  /**
   * Feed one caller utterance, run the think→tool→speak loop, return the text to speak.
   */
  async handlePrompt(userText) {
    if (!userText || !userText.trim()) return null;
    this.messages.push({ role: 'user', content: userText.trim() });
    this.logTurn('caller', userText.trim());

    const succeeded = new Set(); // tools that returned success THIS turn
    let corrections = 0;
    let guard = 0;
    while (guard++ < 9) {
      let resp;
      try {
        resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 320,
          system: this.system,
          tools: TOOL_DEFS,
          messages: this.messages
        });
      } catch (err) {
        console.error('[VoiceRelay] Claude error:', err.message);
        return 'Sorry, I had a little trouble there. Could you say that again?';
      }

      this.messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            const out = await this.execTool(block.name, block.input || {});
            if (out && out.success) succeeded.add(block.name);
            this.logTurn('tool', `in=${JSON.stringify(block.input || {})} out=${JSON.stringify(out)}`, block.name);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(out)
            });
          }
        }
        this.messages.push({ role: 'user', content: toolResults });
        continue; // let Claude read the tool result and respond
      }

      const text = (resp.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join(' ')
        .trim();
      const reply = text || 'Could you repeat that for me?';

      // GUARDRAIL: block a reply that CLAIMS an action is done when its tool didn't
      // succeed this turn. Force the real tool call instead of a hallucinated confirmation.
      const unbacked = detectUnbackedClaim(reply, succeeded);
      if (unbacked && corrections < 2) {
        corrections++;
        console.warn(`[VoiceRelay] blocked unbacked "${unbacked.label}" claim; forcing ${unbacked.tool}`);
        this.messages.push({
          role: 'user',
          content: `SYSTEM CORRECTION: You just told the caller their ${unbacked.label} was done, but you did NOT successfully call the ${unbacked.tool} tool this turn, so it did NOT happen. Do not confirm it. Call ${unbacked.tool} now with the details you have. If a required detail is missing, ask the caller for it instead of confirming.`
        });
        continue;
      }

      this.logTurn('agent', reply);
      return reply;
    }
    return 'Let me get someone to help you with that.';
  }

  async execTool(name, input) {
    // Transfer is handled here (needs the live callSid + Twilio REST), not the tools endpoint.
    if (name === 'transfer_to_human') return this.transferToHuman(input);

    const body = { tool_name: name, client_id: this.clientId, ...input };
    // Default the phone to the caller ID when the model didn't capture one.
    if (['book_appointment', 'find_appointment', 'take_message'].includes(name) && !body.customer_phone && this.from) {
      body.customer_phone = this.from;
    }
    try {
      const r = await fetch(toolsEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      console.log(`[VoiceRelay] tool ${name} ->`, JSON.stringify(json).slice(0, 300));
      return json;
    } catch (err) {
      console.error(`[VoiceRelay] tool ${name} failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Live transfer: redirect the in-progress call to <Dial> a human. Twilio ending the
   * ConversationRelay session is expected. The <Say> covers the caller experience, so we
   * don't depend on the model's follow-up text (which won't play once the call is redirected).
   */
  async transferToHuman(input) {
    const target = this.ctx.transferNumber;
    if (!target) return { success: false, error: 'No transfer number is configured. Offer to take a message instead.' };
    if (!this.ctx.callSid) return { success: false, error: 'Cannot transfer this call right now.' };
    try {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response><Say>Okay, connecting you to a team member now. Please hold.</Say>' +
        `<Dial>${target}</Dial></Response>`;
      await client.calls(this.ctx.callSid).update({ twiml });
      this.transferred = true;
      console.log(`[VoiceRelay] transfer_to_human -> dialing ${target} (call ${this.ctx.callSid})`);
      return { success: true, transferring: true };
    } catch (err) {
      console.error('[VoiceRelay] transfer failed:', err.message);
      return { success: false, error: err.message };
    }
  }
}

/**
 * Resolve which RinglyPro client owns the dialed number, via the existing
 * get_business_info tool (same source of truth ElevenLabs uses).
 * Falls back to VOICE_RELAY_CLIENT_ID env, then null.
 */
async function resolveClientContext({ to, from, callSid }) {
  let info = null;
  try {
    const r = await fetch(toolsEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'get_business_info', called_number: to })
    });
    info = await r.json();
  } catch (err) {
    console.error('[VoiceRelay] get_business_info failed:', err.message);
  }

  let clientId = info && info.success ? info.client_id : null;
  if (!clientId && process.env.VOICE_RELAY_CLIENT_ID) {
    clientId = parseInt(process.env.VOICE_RELAY_CLIENT_ID, 10);
  }
  const transferNumber = (info && info.transfer_number) || process.env.VOICE_RELAY_TRANSFER_NUMBER || null;

  // Caller identity: recognize returning customers by number (name from ANY past/future
  // appointment) + pull their upcoming appts.
  let callerName = null;
  let upcoming = [];
  if (clientId && from) {
    try {
      const r2 = await fetch(toolsEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: 'identify_caller', client_id: clientId, customer_phone: from })
      });
      const found = await r2.json();
      if (found && found.success) {
        callerName = found.customer_name || null;
        upcoming = Array.isArray(found.appointments) ? found.appointments : [];
      }
    } catch (err) {
      console.error('[VoiceRelay] caller lookup failed:', err.message);
    }
  }

  const timezone = (info && info.timezone) || 'America/New_York';
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const todayHuman = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).format(now);

  // Precompute a weekday -> date table for the next 14 days so the LLM never does date math.
  // Anchor on the business-timezone calendar date (todayISO) and increment by whole days,
  // formatting in UTC to avoid any timezone drift on the weekday labels.
  const [ty, tm, td] = todayISO.split('-').map(Number);
  const dateRef = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(ty, tm - 1, td + i, 12, 0, 0));
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(d);
    const human = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' }).format(d);
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d);
    const tag = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '';
    dateRef.push(`  ${wd}, ${human} = ${iso}${tag}`);
  }

  const upcomingText = upcoming.length
    ? upcoming.map(a => `  - id ${a.appointment_id}: ${a.date} at ${a.time}`).join('\n')
    : '';

  return {
    clientId,
    businessName: (info && info.business_name) || 'our office',
    agentName: 'Rachel',
    timezone,
    from,
    to,
    callSid: callSid || null,
    transferNumber,
    callerName,
    upcomingText,
    todayISO,
    todayHuman,
    dateRef: dateRef.join('\n')
  };
}

module.exports = { RelaySession, resolveClientContext, MODEL };

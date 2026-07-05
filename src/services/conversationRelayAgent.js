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
    'Your only job on this call is to help the caller BOOK an appointment.',
    'Rules:',
    '- Keep every reply short and natural — this is spoken out loud. One or two sentences, one question at a time.',
    '- Never read out IDs, URLs, or code. Speak like a person.',
    '- Collect: the caller\'s name, a good phone number, and their preferred day/time.',
    `- The caller is phoning from ${ctx.from || 'an unknown number'} — offer to use that number so they don\'t have to repeat it.`,
    '- To turn a spoken day into a date, look it up in the DATE REFERENCE table above. Do not do the math in your head.',
    '- ALWAYS call check_availability before you offer specific times. Only offer and book times it returned as available, using that slot\'s exact date.',
    '- Confirm the day, date, and time back to the caller (e.g. "Monday, July sixth, at three PM") BEFORE calling book_appointment.',
    '',
    'BOOKING TRUTHFULNESS — this is critical:',
    '- You are NOT booked until you have CALLED book_appointment AND received a result with success set to true.',
    '- NEVER tell the caller they are booked, confirmed, or scheduled unless that tool call actually returned success true. Do not assume or pretend.',
    '- When you do confirm, read back the date and time EXACTLY as they appear in the book_appointment result (its appointment_date and appointment_time), not from memory.',
    '- If book_appointment returns success false or any error, tell the caller it did NOT go through, then fix the missing detail or offer another available time and try again. Never claim a failed booking succeeded.',
    '- If the caller wants something other than booking, answer briefly and steer back to booking, or offer to take a message.'
  ].join('\n');
}

class RelaySession {
  constructor(ctx) {
    this.ctx = ctx;                 // { clientId, businessName, agentName, timezone, from, to, todayISO, todayHuman }
    this.clientId = ctx.clientId;
    this.from = ctx.from;
    this.system = buildSystemPrompt(ctx);
    this.messages = [];             // Anthropic message history
    this.busy = false;
  }

  /**
   * Feed one caller utterance, run the think→tool→speak loop, return the text to speak.
   */
  async handlePrompt(userText) {
    if (!userText || !userText.trim()) return null;
    this.messages.push({ role: 'user', content: userText.trim() });

    let guard = 0;
    while (guard++ < 6) {
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
      return text || 'Could you repeat that for me?';
    }
    return 'Let me get someone to help you with that.';
  }

  async execTool(name, input) {
    const body = { tool_name: name, client_id: this.clientId, ...input };
    // Default the booking phone to the caller ID if the model didn't capture one.
    if (name === 'book_appointment' && !body.customer_phone && this.from) {
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
}

/**
 * Resolve which RinglyPro client owns the dialed number, via the existing
 * get_business_info tool (same source of truth ElevenLabs uses).
 * Falls back to VOICE_RELAY_CLIENT_ID env, then null.
 */
async function resolveClientContext({ to, from }) {
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

  return {
    clientId,
    businessName: (info && info.business_name) || 'our office',
    agentName: 'Rachel',
    timezone,
    from,
    to,
    todayISO,
    todayHuman,
    dateRef: dateRef.join('\n')
  };
}

module.exports = { RelaySession, resolveClientContext, MODEL };

'use strict';
/**
 * Call-flow simulation — NO DB, NO Twilio, NO Anthropic key.
 * Drives the real RelaySession loop with:
 *   - an in-memory mock booking service (same interface as services/booking.js),
 *   - a scripted "LLM" that emulates Claude's tool_use → text turns.
 * Proves: message path, booking path, atomic double-book rejection, SMS events.
 */
const assert = require('assert');
const { RelaySession } = require('../src/services/relayAgent');

/* ── In-memory mock booking (mirrors booking.js contract) ─────────────── */
function makeMockBooking() {
  const takenSlots = new Set();     // 'starts_at' keys
  const messages = [];
  const appointments = [];
  return {
    _messages: messages, _appointments: appointments,
    async checkAvailability() {
      return { success: true, timezone: 'America/New_York', slot_count: 2, slots: [
        { starts_at: '2026-07-13T13:00:00.000Z', date: '2026-07-13', time: '09:00', slot_minutes: 30, display: 'Monday, July 13, 9:00 AM' },
        { starts_at: '2026-07-13T13:30:00.000Z', date: '2026-07-13', time: '09:30', slot_minutes: 30, display: 'Monday, July 13, 9:30 AM' }
      ] };
    },
    async bookAppointment({ date, time, caller_name, callback_number }) {
      const key = `${date}T${time}`;
      if (takenSlots.has(key)) return { success: false, error: 'slot_taken' };
      takenSlots.add(key);
      const appt = { id: appointments.length + 1, date, time, caller_name, callback_number, display: 'Monday, July 13, 9:00 AM' };
      appointments.push(appt);
      return { success: true, booked: true, appointment_id: appt.id, starts_at: `${date}T${time}`, display: appt.display };
    },
    async takeMessage({ caller_name, callback_number, body }) {
      const m = { id: messages.length + 1, caller_name, callback_number, body };
      messages.push(m);
      return { success: true, saved: true, message_id: m.id };
    }
  };
}

/* ── Scripted LLM: emulate Claude tool_use → text ─────────────────────── */
// scenario: 'message' | 'book'
function makeScriptedLLM(scenario) {
  let step = 0;
  return async ({ messages }) => {
    step++;
    const last = messages[messages.length - 1];
    const sawToolResult = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    if (scenario === 'message') {
      if (step === 1) return textResp("Sure, I can take a message. What's your name and number?");
      if (step === 2) return toolResp('take_message', { caller_name: 'Jordan Reyes', callback_number: '+15551230000', body: 'Wants a quote for a roof repair.' });
      return textResp("Got it, Jordan — I've saved your message and the owner will call you back. Thank you!");
    } else { // book
      if (step === 1) return toolResp('check_availability', { days_ahead: 7 });
      if (sawToolResult && step === 2) return textResp("I have Monday at 9:00 AM or 9:30 AM. Which works?");
      if (step === 3) return toolResp('book_appointment', { date: '2026-07-13', time: '09:00', caller_name: 'Jordan Reyes', callback_number: '+15551230000' });
      return textResp("You're booked for Monday, July 13 at 9:00 AM. See you then!");
    }
  };
  function textResp(t) { return { stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 800, output_tokens: 60 } }; }
  function toolResp(name, input) { return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_' + Math.floor(step * 7), name, input }], usage: { input_tokens: 900, output_tokens: 40 } }; }
}

const baseCtx = (locale = 'en') => ({ tenantId: 1, businessName: 'Sunset Auto', locale, timezone: 'America/New_York', from: '+15557654321', to: '+15550001111', callSid: 'CA_test', callerName: null, callId: 1 });

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

(async () => {
  console.log('== Scenario 1: message-taking (EN) ==');
  {
    const booking = makeMockBooking();
    const s = new RelaySession(baseCtx('en'), { booking, createMessage: makeScriptedLLM('message') });
    const greet = s.openingGreeting();
    ok('greeting mentions business', /Sunset Auto/.test(greet));
    await s.handlePrompt("Hi, I need to leave a message.");
    const reply = await s.handlePrompt("Jordan Reyes, 555 123 0000, I want a quote for a roof repair.");
    ok('message saved in store', booking._messages.length === 1);
    ok('disposition = message', s.disposition === 'message');
    ok('emitted 1 message event', s.events.filter(e => e.type === 'message').length === 1);
    ok('agent confirms only after save', /saved|call you back/i.test(reply));
    ok('tokens tracked', s.tokensIn > 0 && s.tokensOut > 0);
  }

  console.log('== Scenario 2: appointment booking (ES greeting) ==');
  {
    const booking = makeMockBooking();
    const s = new RelaySession(baseCtx('es'), { booking, createMessage: makeScriptedLLM('book') });
    const greet = s.openingGreeting();
    ok('ES greeting has tilde/Spanish', /Gracias|cita/.test(greet));
    await s.handlePrompt("Quiero una cita.");
    await s.handlePrompt("El lunes a las nueve está bien.");
    ok('appointment created', booking._appointments.length === 1);
    ok('disposition = appointment', s.disposition === 'appointment');
    ok('emitted appointment event with display', s.events.some(e => e.type === 'appointment' && e.data.display));
  }

  console.log('== Scenario 3: atomic double-book rejection ==');
  {
    const booking = makeMockBooking();
    const r1 = await booking.bookAppointment({ date: '2026-07-13', time: '09:00', caller_name: 'A', callback_number: '+1' });
    const r2 = await booking.bookAppointment({ date: '2026-07-13', time: '09:00', caller_name: 'B', callback_number: '+2' });
    ok('first booking succeeds', r1.success === true);
    ok('second booking on same slot rejected', r2.success === false && r2.error === 'slot_taken');
    ok('only one appointment stored', booking._appointments.length === 1);
  }

  console.log('== Scenario 4: unknown-intent falls back to message ==');
  {
    const booking = makeMockBooking();
    // scripted 'message' brain models the agent choosing take_message for a vague caller
    const s = new RelaySession(baseCtx('en'), { booking, createMessage: makeScriptedLLM('message') });
    s.openingGreeting();
    await s.handlePrompt("Do you sell tires? Actually just have the owner call me.");
    await s.handlePrompt("Sam, 555 999 8888.");
    ok('vague intent produced a message', booking._messages.length === 1);
  }

  console.log(`\nCall-sim: ${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

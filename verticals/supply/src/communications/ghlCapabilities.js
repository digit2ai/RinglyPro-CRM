'use strict';

/**
 * Every GoHighLevel requirement, classified. Rendered on the GoHighLevel
 * screen and in /health so nobody has to guess which parts are automatic.
 * Checked against HighLevel's public docs (marketplace.gohighlevel.com/docs
 * and help.gohighlevel.com) on 2026-09-23. Nothing here is marked automated
 * unless an endpoint for it is called in GoHighLevelProvider.js.
 */

const API = 'API_AUTOMATED';
const HOOK = 'WEBHOOK_DRIVEN';
const MANUAL = 'MANUAL_GHL_CONFIGURATION';
const NO = 'NOT_CURRENTLY_SUPPORTED';

const CAPABILITIES = [
  { need: 'Contacts (create / update / dedupe by phone)', class: API, how: 'POST /contacts/upsert' },
  { need: 'Context the voice agent reads (offer, history, rep)', class: API, how: 'PUT /contacts/{id} custom fields rps_context, rps_offer, rps_rep, rps_campaign (created automatically on first sync)' },
  { need: 'Start an outbound AI call', class: API, how: 'POST /contacts/{id}/workflow/{workflowId} enrolls the contractor in the campaign workflow; the workflow\'s "Voice AI Outbound Call" action dials. There is no direct "dial now" endpoint.' },
  { need: 'Outbound workflow itself (trigger + Voice AI Outbound Call action + From number)', class: MANUAL, how: 'Build once per campaign type in GHL Automation; paste its workflow id into the campaign.' },
  { need: 'Voice AI agents (inbound receptionist + outbound sales)', class: MANUAL, how: 'Create in GHL AI Agents > Voice AI. Prompt must reference {{contact.rps_context}} and {{contact.rps_offer}}.' },
  { need: 'Data the agent extracts (outcome, interest, product, quantity, timeframe, transfer)', class: MANUAL, how: 'Add extraction fields rps_outcome, rps_interest, rps_product, rps_quantity, rps_timeframe, rps_wants_transfer, rps_price_discussed, rps_notes in the agent settings.' },
  { need: 'Call results (summary, transcript, extracted data, actions)', class: API, how: 'GET /voice-ai/dashboard/call-logs (Version v3), polled; also pulled on every webhook signal.' },
  { need: 'Call-ended signal', class: HOOK, how: 'Workflow trigger on Voice AI call end -> Webhook action to the tenant webhook URL with event=call.completed.' },
  { need: 'Inbound call signal (callback recognition)', class: HOOK, how: 'Workflow on inbound call -> Webhook action with event=call.inbound. Context is ALREADY on the contact from the last call, so the agent has it even if this webhook is late.' },
  { need: 'Human transfer to a sales rep', class: MANUAL, how: 'Add the Call Transfer action to the Voice AI agent with the rep\'s number. We record the transfer from the call log actions / rps_wants_transfer.' },
  { need: 'Opportunities / pipeline mirror', class: API, how: 'POST /opportunities/, PUT /opportunities/{id}. Pipeline and stage ids are mapped on the GoHighLevel screen (pipelines are created in GHL).' },
  { need: 'Phone numbers (buy / assign)', class: MANUAL, how: 'Bought and A2P-registered inside GHL. We never buy numbers.' },
  { need: 'Calendars / appointments', class: MANUAL, how: 'Not used by the Supply sales flow yet; an appointment booked by the agent arrives through the contact webhook.' },
  { need: 'Webhook signatures', class: NO, how: 'Workflow webhooks are not signed. Each tenant gets a secret URL token plus an optional X-Supply-Token header, compared in constant time.' },
  { need: 'Placing a call with no workflow (pure API dial)', class: NO, how: 'Not offered by HighLevel\'s public API as of 2026-09-23.' }
];

module.exports = { CAPABILITIES, API, HOOK, MANUAL, NO };

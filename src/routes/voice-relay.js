'use strict';
/**
 * Twilio ConversationRelay — TwiML entry point for the POC voice agent.
 *
 * Point a TEST Twilio number's Voice webhook at:  POST /voice/relay/incoming
 * Twilio then opens a websocket to /voice-relay/ws (handled in src/server.js),
 * where Claude Haiku drives the conversation and books via /api/elevenlabs/tools.
 *
 * TTS = Amazon Polly Neural (cheap). STT + turn-taking = Twilio ConversationRelay.
 *
 * NOTE: the twilio SDK on this repo (4.x) has no conversationRelay() TwiML builder,
 * so we emit the XML directly — version-independent and exactly what Twilio expects.
 */

const express = require('express');
const router = express.Router();

const WELCOME_EN = 'Hi, thanks for calling. I can book an appointment for you. What would you like to schedule?';
// ConversationRelay Amazon voice = VoiceId-Engine, no provider prefix (Twilio's own example is Joanna-Generative).
const POLLY_VOICE = process.env.VOICE_RELAY_POLLY_VOICE || 'Joanna-Generative';

// Resolve the public wss:// host for ConversationRelay to call back into.
function wssHost(req) {
  const base = process.env.WEBHOOK_BASE_URL || `https://${req.headers.host}`;
  return base.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function relayTwiml(req) {
  const wss = `wss://${wssHost(req)}/voice-relay/ws`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Connect>',
    `    <ConversationRelay url="${xmlEscape(wss)}"`,
    `      welcomeGreeting="${xmlEscape(WELCOME_EN)}"`,
    '      ttsProvider="Amazon"',
    `      voice="${xmlEscape(POLLY_VOICE)}"`,
    '      transcriptionProvider="Google"',
    '      language="en-US"',
    '      interruptible="true" />',
    '  </Connect>',
    '</Response>'
  ].join('\n');
}

// Twilio Voice webhook for the test number (accept POST + GET for console testing).
router.post('/incoming', (req, res) => res.type('text/xml').send(relayTwiml(req)));
router.get('/incoming', (req, res) => res.type('text/xml').send(relayTwiml(req)));

// GET /voice/relay/health — quick config check
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'conversationrelay-poc',
    model: (process.env.VOICE_RELAY_MODEL || 'claude-haiku-4-5-20251001'),
    tts: { provider: 'Amazon', voice: POLLY_VOICE },
    wss: `wss://${wssHost(req)}/voice-relay/ws`,
    incoming_webhook: `${process.env.WEBHOOK_BASE_URL || ('https://' + req.headers.host)}/voice/relay/incoming`,
    anthropic_key: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    client_override: process.env.VOICE_RELAY_CLIENT_ID || null
  });
});

module.exports = router;

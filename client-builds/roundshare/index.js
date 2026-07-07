// =====================================================
// RoundShare — Ride. Improve. Share. — Express sub-app
//
// Auto-mounted by src/app.js at /roundshare (client-builds auto-mount loop).
//   GET  /health      -> public health check
//   GET  /            -> marketing landing page (What / Why / How + Lina voice AI)
//   GET  /simulator   -> interactive in-browser app mockup simulator (40 screens)
//   GET  /app         -> alias for /simulator
//
// RoundShare is the community / social layer of the EquiMind "Jump Coach"
// ecosystem: riders record a round, get AI feedback, then SHARE it with
// friends, trainers and their barn circles to improve together.
//
// Same brand DNA as EquiMind (purple identity, horse-jumper mark). The Lina
// voice orb reuses the existing zero-key /api/tts/edge route on the parent CRM
// (same origin), so this build ships NO new TTS backend.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');

const VERSION = '1.0.0';
const SERVICE = 'roundshare';

const app = express();

// Health (public, no auth).
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION, ts: new Date().toISOString() });
});

// Landing page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Interactive app mockup simulator.
app.get(['/simulator', '/app'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// Static assets (logo svg, etc). Never let it serve index.html directly.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Catch-all: any other GET (e.g. roundshare.app/login from a stale redirect)
// renders the landing so the bare domain never dead-ends on a 404.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

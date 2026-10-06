#!/usr/bin/env node
'use strict';
/**
 * Proves the per-vertical Anthropic soft switch (src/config/anthropic-flags.js):
 *   1. every DISABLED vertical makes no Anthropic call, even with a key present;
 *   2. a vertical NOT in the registry still calls Anthropic exactly as before;
 *   3. each switch reactivates with ANTHROPIC_ENABLED_<KEY>=true;
 *   4. every gated call site still carries its guard, and the Anthropic code is intact.
 * Zero real keys: the SDK is replaced by a trap that records every construction/call.
 *   node scripts/test-anthropic-flags.js
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);

process.env.ANTHROPIC_API_KEY = 'sk-ant-FAKE-test';
for (const k of Object.keys(process.env)) if (k.startsWith('ANTHROPIC_ENABLED_')) delete process.env[k];
delete process.env.INCENTIVA_AI; delete process.env.VOICE_AGENT_MODEL_OFF;

const calls = [];
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === '@anthropic-ai/sdk') {
    const F = function () {
      return { messages: {
        create: async (b) => { calls.push(b && b.model || 'create'); return { content: [{ type: 'text', text: 'model reply' }], usage: {} }; },
        stream: () => { calls.push('stream'); throw new Error('trap'); },
      } };
    };
    F.default = F; F.Anthropic = F;
    return F;
  }
  return orig.call(this, req, ...a);
};
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.anthropic.com')) { calls.push('fetch'); throw new Error('trap'); }
  return realFetch(url, opts);
};

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n); };
const flags = require('../src/config/anthropic-flags');

(async () => {
  // ---- 1. registry ----------------------------------------------------------
  const reg = flags.registry();
  const off = reg.filter((r) => r.effective === 'disabled').map((r) => r.key);
  ok(off.length === 17, '17 verticals are switched off (' + off.length + ')'); // speakup enabled 2026-10-06
  ok(reg.find((r) => r.key === 'planea').status === 'skipped' && flags.anthropicEnabled('planea'), 'Planea is skipped and untouched');
  ok(flags.anthropicEnabled('veritas') && flags.anthropicEnabled('ringlypro_lite'), 'a vertical not in the registry is unchanged');
  for (const k of off) {
    process.env['ANTHROPIC_ENABLED_' + k.toUpperCase()] = 'true';
    const on = flags.anthropicEnabled(k);
    delete process.env['ANTHROPIC_ENABLED_' + k.toUpperCase()];
    if (!on || flags.anthropicEnabled(k)) { ok(false, 'env reactivates ' + k); }
  }
  ok(true, 'every switch reactivates with ANTHROPIC_ENABLED_<KEY>=true and returns off without it');
  let threw = false; try { flags.assertAnthropic('intuitive'); } catch (e) { threw = e.code === 'ANTHROPIC_DISABLED'; }
  ok(threw, 'assertAnthropic throws ANTHROPIC_DISABLED for a disabled vertical');

  // ---- 2. runtime: shared voice route ---------------------------------------
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use('/v', require('../src/routes/voice-agent'));
  app.use('/ana', require('../src/routes/ana-chat'));
  const srv = app.listen(0); const port = srv.address().port;
  const post = async (u, b) => (await realFetch('http://127.0.0.1:' + port + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
  const msg = { lang: 'es', messages: [{ role: 'user', content: 'hola' }], context: 'pagina de prueba' };
  for (const p of ['buyersline', 'camaravirtual', 'pacccfl', 'pcci', 'enruta', 'ronin', 'surgicalmind', 'levelup']) {
    const before = calls.length; const r = await post('/v/chat', { agent: p, ...msg });
    ok(calls.length === before && r.source === 'heuristic', 'voice persona ' + p + ' answers without Anthropic');
  }
  { const before = calls.length; const r = await post('/v/chat', { agent: 'veritas', ...msg });
    ok(calls.length === before + 1 && r.source === 'model', 'non-target persona veritas STILL calls Anthropic (unchanged)'); }
  { const before = calls.length; const r = await post('/ana/chat', { messages: [{ role: 'user', content: 'hola' }] });
    ok(calls.length === before && r.source === 'heuristic', 'Abelardo /api/ana/chat answers without Anthropic'); }
  srv.close();

  // ---- 3. runtime: module gates ----------------------------------------------
  const n0 = calls.length;
  const cg = require('../verticals/caseguard/src/services/case-brain.js');
  ok(cg.hasAI && !cg.hasAI(), 'Case Guard has no model client');
  const lu = require('../verticals/levelup/src/llm.js');
  ok((await lu.text({ system: 's', user: 'u' }).catch(() => null)) == null, 'LevelUp llm returns no model answer');
  const inc = require('../verticals/incentiva/src/services/llm.js');
  ok(!inc.aiEnabled(), 'BuyersLine llm is off');
  const ed = require('../verticals/speakup/src/services/ai-editor.js');
  // SpeakUp follows the registry: enabled 2026-10-06, so its paths are asserted OFF only while the key is off.
  const sub = require('../verticals/speakup/src/factory/claude-subscription.js');
  if (flags.anthropicEnabled('speakup')) {
    ok(ed.activeModel() !== 'heuristic-fallback', 'SpeakUp ai-editor has a model (speakup is enabled)');
    ok(!flags.switchedOff('speakup'), 'SpeakUp subscription CLI path is not switched off');
  } else {
    ok(ed.activeModel() === 'heuristic-fallback', 'SpeakUp ai-editor is on its heuristic path');
    ok(!sub.available(), 'SpeakUp subscription CLI path is off');
  }
  const irs = require('../src/routes/unified-chamber/lib/project-irs-scorer.js');
  const scored = await irs.scoreProject({ plan_json: { title: 't', team_roles_required: [] } }, [], { useAi: true });
  ok(scored && scored.ai && scored.ai.used === false, 'CamaraVirtual IRS scorer keeps the deterministic score, no AI');
  ok(calls.length === n0, 'no Anthropic call from any gated module (' + (calls.length - n0) + ')');

  // ---- 4. static: guards present, Anthropic code intact ----------------------
  const guarded = {
    'verticals/cw_carriers/backend/services/nlp.cw.js': 'cw_carriers',
    'verticals/cw_carriers/backend/routes/crm-agent.js': 'cw_carriers',
    'verticals/cw_carriers/backend/services/collector.cw.js': 'cw_carriers',
    'verticals/cw_carriers/backend/services/agent-framework.cw.js': 'cw_carriers',
    'src/routes/unified-chamber/lib/trust-verifier.js': 'camaravirtual',
    'src/routes/unified-chamber/lib/project-irs-scorer.js': 'camaravirtual',
    'src/routes/unified-chamber/projects.js': 'camaravirtual',
    'chamber-template/routes/projects.js': 'camaravirtual',
    'src/services/hispanotec/assistant.js': 'hispatec',
    'src/services/hispanotec/enriquecer.js': 'hispatec',
    'verticals/intuitive/src/routes/chat.js': 'intuitive',
    'verticals/intuitive/src/services/hospital-research-agent.js': 'intuitive',
    'verticals/intuitive/src/services/annual-report-ingester.js': 'intuitive',
    'verticals/msk_intelligence/backend/routes/imaging.js': 'msk_intelligence',
    'verticals/msk_intelligence/backend/routes/copilot.js': 'msk_intelligence',
    'verticals/jobmd/src/services/architect.js': 'jobmd',
    'src/routes/ordergopro.js': 'ordergopro',
    'verticals/lawncopilot/src/services/conversation.js': 'lawncopilot',
    'src/routes/ana-chat.js': 'abelardo',
    'verticals/caseguard/src/services/case-brain.js': 'caseguard',
    'verticals/levelup/src/llm.js': 'levelup',
    'verticals/speakup/src/factory/llm.js': 'speakup',
  };
  for (const [f, k] of Object.entries(guarded)) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const hasGuard = src.includes("'" + k + "'") && /anthropic-flags/.test(src);
    const intact = /@anthropic-ai\/sdk|api\.anthropic\.com|planGenerator|scoreProject|verifyTrust|require\(/.test(src);
    ok(hasGuard && intact, 'guard present, code intact: ' + f);
  }
  const pg = fs.readFileSync(path.join(ROOT, 'chamber-template/lib/plan-generator.js'), 'utf8');
  ok(!/anthropic-flags/.test(pg) && /messages\.create/.test(pg), 'shared plan-generator (also used by digit2ai-projects) is NOT gated');
  const lite = fs.readFileSync(path.join(ROOT, 'src/services/conversationRelayAgent.js'), 'utf8');
  ok(!/anthropic-flags/.test(lite), 'shared phone engine (RinglyPro) is NOT gated');
  ok(!/anthropic-flags/.test(fs.readFileSync(path.join(ROOT, 'verticals/planea/server.cjs'), 'utf8')), 'Planea (planea.vip) is NOT gated');

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });

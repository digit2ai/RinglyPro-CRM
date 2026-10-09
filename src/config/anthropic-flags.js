'use strict';
/**
 * ANTHROPIC STATUS REGISTRY — per-vertical soft switch (owner decision 2026-10-01).
 *
 * This file is the single place that says whether a given vertical may call
 * Anthropic. It is a SOFT disable: no Anthropic code, prompt, SDK, key or model
 * mapping was removed anywhere. Each gated call site asks
 * `anthropicEnabled('<key>')` and, when it is false, takes the code path it
 * already had for "no ANTHROPIC_API_KEY" (a labelled heuristic answer, a
 * template, or an honest "not available" message).
 *
 * TO REACTIVATE ONE VERTICAL ("activate Anthropic on JobMD"), either:
 *   1. change its `status` below from 'disabled' to 'enabled' and deploy, or
 *   2. set ANTHROPIC_ENABLED_<KEY>=true on Render (no deploy). The env var,
 *      when set to true/false, always wins over the default here.
 *
 * Scope is deliberately narrow: a key covers only the call sites listed under
 * `sites`. Verticals NOT in this registry are untouched and keep calling
 * Anthropic exactly as before (anthropicEnabled() returns true for an unknown
 * key whenever ANTHROPIC_API_KEY is set).
 */

const D = '2026-10-01';
const REGISTRY = {
  // ---- DISABLED (soft): the switch covers exactly these call sites ----------
  abelardo:         { status: 'disabled', names: ['Abelardo'], disabled_on: D,
    sites: ['src/routes/ana-chat.js (/api/ana/chat, "Ana")'], off_behaviour: 'labelled heuristic reply' },
  buyersline:       { status: 'disabled', names: ['BuyersLine'], disabled_on: D,
    sites: ['verticals/incentiva/src/services/llm.js aiEnabled() (research, morning/weekly refresh, extractor, advisor, follow-up, hand-off)', 'voice persona buyersline'],
    off_behaviour: 'registry/no-model paths; INCENTIVA_AI=on also re-enables' },
  camaravirtual:    { status: 'disabled', names: ['CamaraVirtual'], disabled_on: D,
    sites: ['unified-chamber POST /:slug/api/projects/draft', 'chamber-template POST /chamber/<slug>/api/projects/draft', 'unified-chamber/lib/trust-verifier.js', 'unified-chamber/lib/project-irs-scorer.js', 'voice persona camaravirtual'],
    off_behaviour: 'draft: 503 "IA pausada"; trust/IRS: deterministic score (ai_used:false); orb: heuristic',
    note: 'Platform code shared by every cv-*/vc-* chamber (cv-1 HispaMind, cv-2 PACCCFL, cv-3 PCCI, cv-105 Hispanotec...). plan-generator.js itself is NOT gated because digit2ai-projects (not a target) also uses it.' },
  caseguard:        { status: 'disabled', names: ['Case Guard'], disabled_on: D,
    sites: ['verticals/caseguard/src/services/case-brain.js'], off_behaviour: 'labelled heuristic (is_simulated)' },
  cw_carriers:      { status: 'disabled', names: ['CW_Carriers', 'FreightMind AI'], disabled_on: D,
    sites: ['backend/services/nlp.cw.js', 'backend/routes/crm-agent.js', 'backend/services/collector.cw.js (x2)', 'backend/services/agent-framework.cw.js run() (also reached via /freight_broker/api/agents)'],
    off_behaviour: 'existing error paths: help intent / basic info / HTTP 400 on agent run' },
  enruta:           { status: 'disabled', names: ['ENRUTA'], disabled_on: D,
    sites: ['voice persona enruta (Laura)'], off_behaviour: 'canned "no puedo consultar" reply' },
  hispatec:         { status: 'disabled', names: ['Hispatec'], disabled_on: D,
    sites: ['src/services/hispanotec/assistant.js', 'src/services/hispanotec/enriquecer.js'],
    off_behaviour: 'labelled extractive heuristic / sin_modelo', note: 'Its chamber (cv-1, cv-105) platform AI follows camaravirtual. /hispatec/api has no Anthropic.' },
  intuitive:        { status: 'disabled', names: ['Intuitive'], disabled_on: D,
    sites: ['verticals/intuitive/src/routes/chat.js (x2)', 'services/hospital-research-agent.js (x3, Opus)', 'services/annual-report-ingester.js'],
    off_behaviour: 'chat: SSE error; research: labelled low-confidence fallback profile; ingester: empty extraction' },
  jobmd:            { status: 'disabled', names: ['JobMD'], disabled_on: D,
    sites: ['verticals/jobmd/src/services/architect.js (legacy /jobmd-legacy)'], off_behaviour: 'deterministic plan',
    note: 'LIVE jobmd.io runs on the JobUp engine (verticals/jobup/src/services/brain.js), shared with jobup.dev/tornajobs/coljobs and already paused separately by JOBUP_AI. Reactivating JobMD live = the JobUp switch.' },
  lawncopilot:      { status: 'disabled', names: ['LawnCoPilot'], disabled_on: D,
    sites: ['verticals/lawncopilot/src/services/conversation.js hasLLM() (web orb + typed chat)'], off_behaviour: 'scripted driver (quotes and bookings still work)',
    note: 'Phone calls use the shared ConversationRelay engine (also RinglyPro) and were NOT touched.' },
  levelup:          { status: 'disabled', names: ['LevelUp'], disabled_on: D,
    sites: ['verticals/levelup/src/llm.js getClient()', 'voice persona levelup (Andrea)'], off_behaviour: 'labelled heuristic / copilot "no model"' },
  msk_intelligence: { status: 'disabled', names: ['MSK Intelligence', 'ImagingMindAI'], disabled_on: D,
    sites: ['backend/routes/imaging.js (Claude Vision)', 'backend/routes/copilot.js'], off_behaviour: 'copilot: existing error path (500); imaging analyze: 500 "Analysis failed"' },
  ordergopro:       { status: 'disabled', names: ['OrderGoPro'], disabled_on: D,
    sites: ['src/routes/ordergopro.js POST /api/ordergopro/chat'], off_behaviour: 'existing 500 "Failed to process chat message" (route appears unused)' },
  pacccfl:          { status: 'disabled', names: ['PACCCFL'], disabled_on: D,
    sites: ['voice persona pacccfl'], off_behaviour: 'heuristic', note: 'Its chamber (cv-2) platform AI follows camaravirtual.' },
  pcci:             { status: 'disabled', names: ['PCCI'], disabled_on: D,
    sites: ['voice persona pcci'], off_behaviour: 'heuristic', note: 'Its chamber (cv-3) platform AI follows camaravirtual.' },
  ronin:            { status: 'disabled', names: ['Ronin Brotherhood'], disabled_on: D,
    sites: ['voice persona ronin'], off_behaviour: 'heuristic', note: 'Own code has no Anthropic; its ElevenLabs widget is configured in ElevenLabs.' },
  // ENABLED 2026-10-06 (owner request): AutoDev runs on the Claude subscription token, not the API account.
  vallemilagro:     { status: 'enabled', names: ['Valle Milagro'], disabled_on: null,
    sites: ['verticals/vallemilagro/src/llm.js (agente Valle y agente Scout con búsqueda web)'],
    off_behaviour: 'Valle responde por la ruta sin modelo, marcada; el Scout no corre y lo dice',
    note: 'Los tokens y las búsquedas los cubre la Asociación. El Scout programado solo corre con VALLEMILAGRO_SCOUT=on.' },
  speakup:          { status: 'enabled', names: ['SpeakUp'], disabled_on: D,
    sites: ['src/factory/llm.js (API client)', 'src/factory/claude-subscription.js available() (subscription CLI: chat, research, planner)', 'src/services/ai-editor.js', 'src/claudecode/runner.js (Claude Code tab)'],
    off_behaviour: 'labelled heuristic/offline replies; Claude Code runs fail with the reason',
    note: 'The GitHub Actions build job (.github/speakup) runs only when the owner approves a plan; it is not gated here.' },
  surgicalmind:     { status: 'disabled', names: ['SurgicalMind'], disabled_on: D,
    sites: ['voice persona surgicalmind'], off_behaviour: 'heuristic', note: 'Its app code is verticals/intuitive (see intuitive).' },

  // ---- NO ANTHROPIC USAGE FOUND (nothing to switch) -------------------------
  aihoteltalent:    { status: 'none', names: ['AIHotelTalent'], note: 'Catalog link to external site only.' },
  bdt:              { status: 'none', names: ['BDT', 'ComplianceMind'], note: 'Static deck public/ComplianceMind_Demo_BDT.html.' },
  cali_citylab:     { status: 'none', names: ['Cali CityLab'], note: 'Static presentation.' },
  calcareos:        { status: 'none', names: ['Calcáreos'], note: 'Static simulator; Edge TTS only.' },
  deportivo_cali:   { status: 'none', names: ['Deportivo Cali'], note: 'Static pages.' },
  doctor_picante:   { status: 'none', names: ['Doctor Picante'], note: 'Unserved root HTML file.' },
  hit_promotional:  { status: 'none', names: ['Hit Promotional'], note: 'verticals/imprint_iq: ElevenLabs + rules.' },
  horacio_serpa:    { status: 'none', names: ['Horacio José Serpa'], note: 'Unserved root HTML file.' },
  jumpcoach:        { status: 'none', names: ['JumpCoach'], note: 'MediaPipe + rubric engine.' },
  kancho:           { status: 'none', names: ['Kancho AI'], note: 'Rules + ElevenLabs (Gemini inside ElevenLabs).' },
  maramed:          { status: 'none', names: ['MaraMed'], note: 'rPPG demo + Edge TTS; maramed.app is another repo.' },
  pinaxis:          { status: 'none', names: ['PINAXIS'], note: 'Templates + ElevenLabs.' },
  roundshare:       { status: 'none', names: ['RoundShare'], note: 'Edge TTS only.' },
  spark_ai:         { status: 'none', names: ['Spark AI'], note: 'ElevenLabs.' },
  store_health_ai:  { status: 'none', names: ['Store Health AI'], note: 'VAPI with OpenAI models.' },
  tunjoracing:      { status: 'none', names: ['TunjoRacing', '2026 IMSA VP Racing SportsCar Challenge'], note: 'No AI calls; IMSA is TunjoRacing content.' },

  // ---- SKIPPED: needs owner confirmation -------------------------------------
  planea:           { status: 'skipped', names: ['Planea'], note: 'verticals/planea IS planea.vip (live). Task rule: skip Planea.vip unless confirmed. Untouched.' },
};

function envOverride(key) {
  const v = process.env['ANTHROPIC_ENABLED_' + String(key).toUpperCase().replace(/[^A-Z0-9]/g, '_')];
  if (v == null || v === '') return null;
  return /^(1|true|on|yes)$/i.test(String(v).trim());
}

/** May this vertical call Anthropic right now? */
function anthropicEnabled(key) {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const o = envOverride(key);
  if (o !== null) return o;
  const entry = REGISTRY[key];
  if (!entry || (entry.status !== 'enabled' && entry.status !== 'disabled')) return true; // not a switch: unchanged
  return entry.status === 'enabled';
}

/**
 * Is this vertical switched OFF, regardless of whether an API key is present?
 * For paths that reach Anthropic WITHOUT the API key (e.g. a Claude subscription
 * token), where "no key" must not be read as "disabled".
 */
function switchedOff(key) {
  const o = envOverride(key);
  if (o !== null) return !o;
  const entry = REGISTRY[key];
  return !!entry && entry.status === 'disabled';
}

/**
 * Throw a recognisable error when the vertical is disabled. Call it right
 * before a model call: the call site's EXISTING error handling then runs
 * (its heuristic, template, 4xx/5xx or "not available" path), so nothing new
 * has to be invented per vertical.
 */
function assertAnthropic(key) {
  if (anthropicEnabled(key)) return;
  const e = new Error('Anthropic is disabled for ' + key + ' (soft switch: src/config/anthropic-flags.js)');
  e.code = 'ANTHROPIC_DISABLED';
  throw e;
}

/** Registry snapshot for health/admin pages (no secrets). */
function registry() {
  return Object.keys(REGISTRY).map((k) => {
    const e = REGISTRY[k];
    const isSwitch = e.status === 'enabled' || e.status === 'disabled';
    return { key: k, ...e, effective: isSwitch ? (anthropicEnabled(k) ? 'enabled' : 'disabled') : e.status, env_override: envOverride(k) };
  });
}

module.exports = { anthropicEnabled, assertAnthropic, switchedOff, registry, REGISTRY };

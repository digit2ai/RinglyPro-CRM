// =====================================================
// lib/i18n.js — single string dictionary.
//
// The sprint is English-first (data ops / content strategists, US-centric
// tooling). Spanish is deliberately skipped THIS sprint, but every UI string
// lives here behind a language key so `?lang=es` is a dictionary fill, not a
// rewrite. The `es` stub intentionally holds only the keys already translated;
// `t()` falls back to `en` per key, so a partial Spanish dictionary renders a
// mixed page rather than blank labels.
// =====================================================

'use strict';

const en = {
  app_title: 'AI Agent Prompt Builder',
  app_subtitle: 'Define a data-writing agent. Export a valid JSON prompt in under ten minutes.',

  nav_wizard: 'Wizard',
  nav_gallery: 'Templates',

  step_identity: 'Identity',
  step_context: 'Context',
  step_behavior: 'Behavior',
  step_output: 'Output',

  f_name: 'Agent name',
  f_name_hint: 'What this agent is called in your pipeline.',
  f_role: 'Role / persona',
  f_role_hint: 'Who the agent is. One line.',
  f_goal: 'Goal',
  f_goal_hint: 'The single outcome this agent is responsible for.',
  f_description: 'Description (optional)',
  f_data_sources: 'Data sources',
  f_data_sources_hint: 'One per line. Table, file, API, or feed the agent reads.',
  f_instructions: 'Instructions',
  f_instructions_hint: 'One step per line. Ordered — they become a numbered list.',
  f_constraints: 'Constraints',
  f_constraints_hint: 'One per line. What the agent must never do.',
  f_output_schema: 'Output schema (JSON)',
  f_output_schema_hint: 'The exact JSON shape the agent must return.',
  f_model: 'Target model (optional)',
  f_temperature: 'Temperature (optional)',

  preview_title: 'Live JSON prompt',
  preview_valid: 'Valid JSON',
  preview_invalid: 'Schema is not valid JSON',

  btn_copy: 'Copy JSON',
  btn_copied: 'Copied',
  btn_download: 'Download .json',
  btn_save: 'Save agent',
  btn_saved: 'Saved',
  btn_reset: 'Clear form',
  btn_load_template: 'Load into wizard',
  btn_open_gallery: 'Browse templates',
  btn_back_wizard: 'Back to wizard',

  saved_agents: 'Saved agents',
  saved_none: 'No saved agents yet.',
  saved_needs_auth: 'Sign in to the CRM to save agents to your tenant.',

  gallery_title: 'Template gallery',
  gallery_subtitle: 'Six pre-built data-writing agents. Load one and edit from there.',

  err_name_required: 'Agent name is required before saving.',
  err_save_failed: 'Save failed',
  err_auth_required: 'A CRM session is required to save. Copy or download instead.',

  toast_loaded: 'Template loaded into the wizard.'
};

// Spanish stub — deliberately partial. Fill it to enable ?lang=es.
const es = {
  app_title: 'Constructor de Prompts para Agentes de IA',
  nav_wizard: 'Asistente',
  nav_gallery: 'Plantillas',
  btn_copy: 'Copiar JSON',
  btn_download: 'Descargar .json',
  btn_save: 'Guardar agente'
};

const dict = { en, es };

/** Per-key fallback to English so a partial dictionary never blanks a label. */
function t(lang, key) {
  const l = dict[lang] || {};
  if (Object.prototype.hasOwnProperty.call(l, key)) return l[key];
  return Object.prototype.hasOwnProperty.call(en, key) ? en[key] : key;
}

/** Full merged dictionary for a language — what the browser bundle receives. */
function bundle(lang) {
  return Object.assign({}, en, dict[lang] || {});
}

function languages() {
  return Object.keys(dict);
}

module.exports = { en, es, dict, t, bundle, languages };

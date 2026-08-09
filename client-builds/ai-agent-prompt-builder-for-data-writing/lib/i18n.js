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

  box_subtitle: 'Say what the agent should do. Get back a JSON spec and one command to paste into VS Code.',
  box_label: 'Describe the agent',
  box_placeholder: "Read the invoice PDFs that land in raw_documents and pull out the vendor, invoice number, date and total into a row per invoice. Copy the numbers exactly as printed, and if a field isn't on the page leave it null — never guess.",
  box_hint: 'Plain language is enough. Name the source and the fields if you know them; anything you leave out comes back listed as an assumption to confirm.',

  btn_compose: 'Build the prompt',
  btn_clear: 'Clear',
  btn_advanced: 'Advanced editor',
  btn_back_box: 'Back to the box',
  btn_edit: 'Edit the fields',
  composing: 'Writing the spec…',

  mic_listening: 'Listening — tap the mic again to stop.',
  mic_unsupported: 'Dictation needs Chrome, Edge or Safari. Typing works everywhere.',
  mic_denied: 'Microphone blocked. Allow it in the address bar, or just type.',
  mic_failed: 'Dictation stopped. You can keep typing.',

  tab_command: 'VS Code command',
  tab_json: 'JSON',
  tab_prompt: 'System prompt',

  assumptions_title: 'Confirm before you build',
  unverified_prefix: 'Not in your description — confirm this name exists: ',

  howto_title: 'Run it',
  howto_1: 'Copy the command above.',
  howto_2: 'Open the RinglyPro-CRM repo in VS Code and start Claude Code.',
  howto_3: 'Paste and press enter. The architect builds, tests and deploys the agent.',

  adv_title: 'Advanced editor',
  adv_subtitle: 'Field-by-field control. Everything the composer wrote lands here, editable.',

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
  preview_heuristic: 'Written without a model',
  source_model: 'Composed by ',
  source_heuristic: 'No model key is configured, so this was assembled from your own sentences. Read it before you run it.',

  btn_copy: 'Copy JSON',
  btn_copy_command: 'Copy VS Code command',
  btn_copy_prompt: 'Copy system prompt',
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
  err_empty: 'Describe the agent first.',
  err_compose: 'Could not build the prompt',
  err_rate: 'Too many compositions this hour. Try again later.',

  toast_loaded: 'Template loaded into the wizard.'
};

// Spanish stub — deliberately partial. Fill it to enable ?lang=es.
const es = {
  app_title: 'Constructor de Prompts para Agentes de IA',
  box_subtitle: 'Di qué debe hacer el agente. Recibe una especificación JSON y un comando para pegar en VS Code.',
  box_label: 'Describe el agente',
  box_placeholder: 'Lee los PDF de facturas que llegan a raw_documents y extrae el proveedor, el número de factura, la fecha y el total, una fila por factura. Copia las cifras tal como aparecen impresas y, si un campo no está en la página, déjalo en null — nunca lo adivines.',
  box_hint: 'Basta con lenguaje natural. Nombra la fuente y los campos si los conoces; todo lo que omitas vuelve listado como un supuesto por confirmar.',

  btn_compose: 'Construir el prompt',
  btn_clear: 'Limpiar',
  btn_advanced: 'Editor avanzado',
  btn_back_box: 'Volver a la caja',
  btn_edit: 'Editar los campos',
  composing: 'Escribiendo la especificación…',

  mic_listening: 'Escuchando — toca el micrófono otra vez para detener.',
  mic_unsupported: 'El dictado requiere Chrome, Edge o Safari. Escribir funciona en todos.',
  mic_denied: 'Micrófono bloqueado. Permítelo en la barra de direcciones, o simplemente escribe.',
  mic_failed: 'El dictado se detuvo. Puedes seguir escribiendo.',

  tab_command: 'Comando VS Code',
  tab_json: 'JSON',
  tab_prompt: 'Prompt de sistema',

  assumptions_title: 'Confirma antes de construir',
  unverified_prefix: 'No está en tu descripción — confirma que este nombre existe: ',

  howto_title: 'Ejecútalo',
  howto_1: 'Copia el comando de arriba.',
  howto_2: 'Abre el repositorio RinglyPro-CRM en VS Code e inicia Claude Code.',
  howto_3: 'Pega y presiona enter. El arquitecto construye, prueba y despliega el agente.',

  adv_title: 'Editor avanzado',
  adv_subtitle: 'Control campo por campo. Todo lo que escribió el compositor llega aquí, editable.',

  preview_valid: 'JSON válido',
  preview_invalid: 'El esquema no es JSON válido',
  preview_heuristic: 'Escrito sin modelo',
  source_model: 'Compuesto por ',
  source_heuristic: 'No hay clave de modelo configurada, así que esto se armó con tus propias frases. Léelo antes de ejecutarlo.',

  nav_wizard: 'Asistente',
  nav_gallery: 'Plantillas',
  btn_copy: 'Copiar JSON',
  btn_copy_command: 'Copiar comando VS Code',
  btn_copy_prompt: 'Copiar prompt de sistema',
  btn_copied: 'Copiado',
  btn_download: 'Descargar .json',
  btn_save: 'Guardar agente',
  btn_open_gallery: 'Ver plantillas',

  err_empty: 'Describe el agente primero.',
  err_compose: 'No se pudo construir el prompt',
  err_rate: 'Demasiadas composiciones esta hora. Inténtalo más tarde.'
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

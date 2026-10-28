'use strict';
/**
 * Lina (Synthex SAI) end to end, with NO real model and NO database:
 *  - a fake Anthropic SDK plays the conversation (asks for slots, then books),
 *  - a fake calendar stands in for d2_calendar_events,
 *  - the real voice-agent route runs the real tools by HTTP over loopback.
 * Run: node scripts/test-synthex-lina.js
 */
const path = require('path');
const http = require('http');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL', m); } };

// ── fake calendar (replaces mcp-checkout._booking) ─────────────────────────
const events = [];
const now = Date.now();
const slotA = new Date(Math.ceil((now + 3 * 86400000) / 3600000) * 3600000);
const slotB = new Date(slotA.getTime() + 3600000);
const fakeDb = {
  transaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
  query: async (sql, o = {}) => {
    const r = o.replacements || {};
    if (/pg_advisory_xact_lock/.test(sql)) return [];
    if (/CREATE TABLE/.test(sql)) return [];
    if (/SELECT start_time FROM d2_calendar_events/.test(sql)) return events.filter((e) => e.description.includes(r.m.replace(/%/g, '')));
    if (/COUNT\(\*\)/.test(sql)) return [{ n: events.length }];
    if (/INSERT INTO d2_calendar_events/.test(sql)) { events.push({ title: r.title, description: r.description, start_time: r.s }); return []; }
    if (/FROM synthex_lina_kb/.test(sql)) return [{ titulo: 'Facturación electrónica', contenido: 'Sí, se conecta con el SENIAT por medio del sistema administrativo del cliente.' }];
    return [];
  }
};
const mcpPath = require.resolve(path.join(__dirname, '../src/routes/mcp-checkout'));
require.cache[mcpPath] = { id: mcpPath, filename: mcpPath, loaded: true, exports: { _booking: {
  db: () => fakeDb, BOOK_MIN: 60, BOOK_TZ: 'America/New_York',
  freeSlots: async () => [slotA, slotB].filter((s) => !events.some((e) => new Date(e.start_time).getTime() === s.getTime())),
  threeByThree: (slots) => [{ day: 'x', slots: slots.map((s) => s.toISOString()) }]
} } };

// ── fake model ─────────────────────────────────────────────────────────────
const seen = [];
let script = [];
const sdkPath = require.resolve('@anthropic-ai/sdk');
function FakeAnthropic() {}
FakeAnthropic.prototype.messages = { create: async (req) => { seen.push(JSON.parse(JSON.stringify(req))); return script.shift() || { content: [{ type: 'text', text: 'Listo.' }] }; } };
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeAnthropic };

(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const app = express();
  app.use(express.json());
  app.use('/api/voice-agent', require('../src/routes/voice-agent'));
  app.use('/api/synthex-lina', require('../src/routes/synthex-lina'));
  const srv = http.createServer(app).listen(0);
  process.env.PORT = String(srv.address().port);
  const base = 'http://127.0.0.1:' + process.env.PORT;
  const post = (u, b, h) => fetch(base + u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(b) });

  // persona
  const { agentConfig, getAgent } = require('../src/config/voice-agents');
  const cfg = agentConfig('synthex', 'es');
  ok(cfg.name === 'Lina' && /\{saludo\}/.test(cfg.greeting) && /Lina, la asistente virtual de Synthex SAI/.test(cfg.greeting) && /con quién tengo el gusto/i.test(cfg.greeting), 'greeting');
  ok(agentConfig('synthex', 'en').name === 'Ava', 'english persona');
  const ag = getAgent('synthex');
  ok(!/USD|685/.test(JSON.stringify(cfg)), 'config leaks no prompt');
  ok(ag.tools.definiciones.map((d) => d.name).join() === 'horarios_disponibles,agendar_reunion', 'tools');
  ok(/NO ERES UNA NARRADORA/.test(ag.persona.es) && /agendar una reunión/.test(ag.persona.es), 'persona is conversational and sells');

  // the orb fills {saludo} from the visitor clock
  const orb = require('fs').readFileSync(path.join(__dirname, '../public/embed/voice-orb.js'), 'utf8');
  ok(/withSaludo/.test(orb) && /Buenos días/.test(orb) && /Buenas tardes/.test(orb) && /Buenas noches/.test(orb), 'time-of-day greeting');
  ok(/send: function \(text\)/.test(orb), 'orb exposes send()');

  // knowledge reaches the system prompt (base + owner training)
  script = [{ content: [{ type: 'text', text: 'Mucho gusto, Carlos. ¿Te explico el ecosistema o tienes una pregunta?' }] }];
  let r = await (await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'pagina', messages: [{ role: 'user', content: 'Carlos' }] })).json();
  ok(r.source === 'model' && /Carlos/.test(r.reply), 'model reply');
  const sys = seen[seen.length - 1].system;
  ok(/CONOCIMIENTO/.test(sys) && /685/.test(sys) && /388/.test(sys) && /245/.test(sys), 'base knowledge in prompt');
  ok(/Hypercare/.test(sys) && /Stripe y PayPal/.test(sys), 'FAQ in prompt');
  ok(/ENTRENAMIENTO DEL DUEÑO/.test(sys) && /SENIAT/.test(sys), 'owner training in prompt');
  ok(/Tus ÚNICAS fuentes son el CONOCIMIENTO/.test(sys), 'rules allow knowledge');

  // the tools are closed to the internet
  let d = await post('/api/synthex-lina/book', { nombre: 'X', email: 'a@b.co', telefono: '5551234567', start: slotA.toISOString(), confirmado: true }, { 'X-Forwarded-For': '8.8.8.8' });
  ok(d.status === 404, 'book refused from outside');
  d = await fetch(base + '/api/synthex-lina/slots', { headers: { 'X-Forwarded-For': '8.8.8.8' } });
  ok(d.status === 404, 'slots refused from outside');
  ok(events.length === 0, 'nothing booked from outside');

  // a full booking conversation through the real tool loop
  script = [
    { content: [{ type: 'tool_use', id: 't1', name: 'horarios_disponibles', input: {} }] },
    { content: [{ type: 'tool_use', id: 't2', name: 'agendar_reunion', input: { nombre: 'Carlos Pérez', email: 'carlos@ejemplo.com', telefono: '+58 412 555 1234', empresa: 'Ferretería Pérez', tema: 'Facturas', start: slotA.toISOString(), confirmado: true } }] },
    { content: [{ type: 'text', text: 'Listo Carlos, quedó agendada.' }] }
  ];
  r = await (await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'Sí, confírmalo' }] })).json();
  ok(r.tools_used && r.tools_used.join() === 'horarios_disponibles,agendar_reunion', 'both tools ran');
  ok(events.length === 1 && /Synthex SAI: Carlos Pérez \(Ferretería Pérez\)/.test(events[0].title), 'event in calendar');
  ok(/carlos@ejemplo.com/.test(events[0].description) && /\+58 412 555 1234/.test(events[0].description) && /synthex_lina:/.test(events[0].description), 'event carries contact');
  const toolResults = seen.slice(-2).map((q) => JSON.stringify(q.messages[q.messages.length - 1]));
  ok(/opciones/.test(toolResults[0]) && /texto/.test(toolResults[0]), 'slots reached the model');
  ok(/booked\\":true/.test(toolResults[1]), 'booking result reached the model');

  // same email again: no second meeting
  script = [{ content: [{ type: 'tool_use', id: 't3', name: 'agendar_reunion', input: { nombre: 'Carlos Pérez', email: 'CARLOS@ejemplo.com', telefono: '4125551234', start: slotB.toISOString(), confirmado: true } }] }, { content: [{ type: 'text', text: 'Ya tenías una.' }] }];
  await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'otra' }] });
  ok(events.length === 1 && /already/.test(JSON.stringify(seen[seen.length - 1].messages.slice(-1))), 'one upcoming meeting per email');

  // validation: no confirmation, bad email, injected name, taken slot
  const { validate } = require('../src/routes/synthex-lina')._test;
  ok(validate({ nombre: 'Ana', email: 'a@b.co', telefono: '4125551234' }).errores.includes('confirmado'), 'needs confirmation');
  ok(validate({ nombre: 'Ana', email: 'nope', telefono: '4125551234', confirmado: true }).errores.includes('email'), 'bad email');
  ok(!/[<>]/.test(validate({ nombre: '<script>x', email: 'a@b.co', telefono: '4125551234', confirmado: true }).nombre), 'markup stripped from name');
  ok(validate({ nombre: '1234', email: 'a@b.co', telefono: '4125551234', confirmado: true }).errores.includes('nombre'), 'bad name');
  ok(validate({ nombre: 'Ana', email: 'a@b.co', telefono: '12', confirmado: true }).errores.includes('telefono'), 'bad phone');
  script = [{ content: [{ type: 'tool_use', id: 't4', name: 'agendar_reunion', input: { nombre: 'Luisa Gómez', email: 'luisa@ejemplo.com', telefono: '4125551234', start: slotA.toISOString(), confirmado: true } }] }, { content: [{ type: 'text', text: 'Esa hora ya no está.' }] }];
  await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'a las diez' }] });
  ok(events.length === 1 && /ya no está libre/.test(JSON.stringify(seen[seen.length - 1].messages.slice(-1))), 'taken slot refused');

  // no model: Lina says so in her own words, not ENRUTA's
  delete process.env.ANTHROPIC_API_KEY;
  r = await (await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'hola' }] })).json();
  ok(/formulario/.test(r.reply) && !/seis cero dos/.test(r.reply), 'own offline reply');

  // training page fails shut without the credential
  delete process.env.ARCHITECT_USER; delete process.env.ARCHITECT_PASSWORD;
  d = await fetch(base + '/api/synthex-lina/entrenar');
  ok(d.status === 503, 'training closed without credential');
  process.env.ARCHITECT_USER = 'owner@x.com'; process.env.ARCHITECT_PASSWORD = 'secret-pass-123';
  d = await fetch(base + '/api/synthex-lina/entrenar');
  ok(d.status === 401, 'training asks to sign in');
  d = await fetch(base + '/api/synthex-lina/entrenar', { headers: { Authorization: 'Basic ' + Buffer.from('owner@x.com:wrong').toString('base64') } });
  ok(d.status === 401, 'wrong password refused');
  d = await fetch(base + '/api/synthex-lina/entrenar', { headers: { Authorization: 'Basic ' + Buffer.from('OWNER@x.com:secret-pass-123').toString('base64') } });
  ok(d.status === 200 && /Entrenar a Lina/.test(await d.text()), 'owner gets the page');

  // landing: no narrator left, orb wired
  const page = require('fs').readFileSync(path.join(__dirname, '../public/synthexai/index.html'), 'utf8');
  ok(/data-agent="synthex"/.test(page) && /\/embed\/voice-orb\.js/.test(page), 'landing uses Lina');
  ok(!/var SEG=/.test(page) && !/niva-panel/.test(page), 'narrator removed');
  ok(/D2AIVoiceOrb\.send\(q\)/.test(page), 'FAQ box goes to Lina');
  const appSrc = require('fs').readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  ok(/'\/api\/voice-agent\/chat'/.test(appSrc) && /'\/embed\/voice-orb\.js'/.test(appSrc), 'synthexsai.com passes Lina through');
  ok(!/'\/api\/synthex-lina/.test(appSrc.split('SYNTHEX_PASS_THROUGH')[1].split(']);')[0]), 'tools not exposed on the domain');

  srv.close();
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

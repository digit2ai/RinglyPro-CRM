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
const slotC = new Date(slotA.getTime() + 2 * 3600000);
const slotD = new Date(slotA.getTime() + 3 * 3600000);
const fakeDb = {
  transaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
  query: async (sql, o = {}) => {
    const r = o.replacements || {};
    if (/pg_advisory_xact_lock/.test(sql)) return [];
    if (/CREATE TABLE/.test(sql)) return [];
    if (/SELECT start_time FROM d2_calendar_events/.test(sql)) return events.filter((e) => e.description.includes(r.m.replace(/%/g, '')));
    if (/COUNT\(\*\)/.test(sql)) return [{ n: events.filter((e) => e.description.includes(String(r.tag || '').replace(/%/g, ''))).length }];
    if (/INSERT INTO d2_calendar_events/.test(sql)) { events.push({ title: r.title, description: r.description, start_time: r.s }); return []; }
    if (/FROM synthex_lina_kb/.test(sql)) return [{ titulo: 'Facturación electrónica', contenido: 'Sí, se conecta con el SENIAT por medio del sistema administrativo del cliente.' }];
    return [];
  }
};
const mcpPath = require.resolve(path.join(__dirname, '../src/routes/mcp-checkout'));
require.cache[mcpPath] = { id: mcpPath, filename: mcpPath, loaded: true, exports: { _booking: {
  db: () => fakeDb, BOOK_MIN: 60, BOOK_TZ: 'America/New_York',
  freeSlots: async () => [slotA, slotB, slotC, slotD].filter((s) => !events.some((e) => new Date(e.start_time).getTime() === s.getTime())),
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
  const sent = [];
  require('../src/services/synthexNotify')._test.setSender({ send: async (m) => { sent.push(m); return [{ statusCode: 202 }]; } });
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
  ok(ag.tools.definiciones.map((d) => d.name).join() === 'horarios_disponibles,calcular_ahorro,agendar_reunion', 'tools');
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
  ok(/Hypercare/.test(sys) && /Stripe o PayPal/.test(sys), 'core facts in prompt');
  ok(/ENTRENAMIENTO DEL DUEÑO/.test(sys) && /SENIAT/.test(sys), 'owner training in prompt');
  ok(/Tus ÚNICAS fuentes son el CONOCIMIENTO/.test(sys), 'rules allow knowledge');

  // savings estimate = the landing calculator's formula (10 people, 20 h, $3, 50% -> 433 h, $2,600, $1,300, +$912)
  const { estimate } = require('../src/routes/synthex-lina')._test;
  let e = estimate({ personas: 10, horas_semana: 20, costo_hora: 3, porcentaje_automatizado: 50 });
  ok(e.ok && e.horas_liberadas_mes === 433 && e.costo_manual_mes_usd === 2600 && e.valor_horas_liberadas_mes_usd === 1300 && e.diferencia_mes_usd === 912, 'same numbers as the page calculator');
  e = estimate({ personas: 5, horas_semana: 20, costo_hora: 3 });
  ok(e.ok && e.datos.porcentaje_es_supuesto && e.datos.porcentaje_automatizado === 50, 'missing percentage = 50% assumption, flagged');
  ok(estimate({ personas: 5, horas_semana: 20, costo_hora: 3, porcentaje_automatizado: 0.4 }).datos.porcentaje_automatizado === 40, '0.4 read as 40%');
  ok(!estimate({ personas: 0, horas_semana: 20, costo_hora: 3 }).ok, 'bad input refused');
  const dc = await post('/api/synthex-lina/calc', { personas: 1, horas_semana: 1, costo_hora: 1 }, { 'X-Forwarded-For': '8.8.8.8' });
  ok(dc.status === 404, 'calc refused from outside');
  const pageSrc = require('fs').readFileSync(path.join(__dirname, '../public/synthexai/index.html'), 'utf8');
  ok(/hrsMes = p \* h \* 52 \/ 12/.test(pageSrc) && /dif = val - 388/.test(pageSrc), 'page calculator still uses the formula Lina copies');

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

  // Lina's booking sends the branded confirmation + owner alert
  const conf = sent.find((m) => m.to === 'carlos@ejemplo.com');
  ok(conf && conf.from.name === 'Synthex SAI' && /confirmada/.test(conf.subject), 'Lina booking emails the client as Synthex SAI');
  ok(conf && /#0B0F17/.test(conf.html) && /#00F2FE/.test(conf.html) && /Geist/.test(conf.html) && /Synthex <span[^>]*>SAI/.test(conf.html), 'email uses the Synthex theme');
  ok(conf && conf.attachments && /BEGIN:VCALENDAR/.test(Buffer.from(conf.attachments[0].content, 'base64').toString()), 'calendar invite attached');
  ok(sent.some((m) => /Nueva reunión Synthex SAI/.test(m.subject)), 'owner alerted');

  // the demo form books publicly (the click is the confirmation)
  const sl = await (await fetch(base + '/api/synthex-lina/public/slots')).json();
  ok(sl.ok && sl.days.length && sl.days[0].slots.length, 'public slots');
  const freeIso = sl.days[0].slots[0];
  let pb = await post('/api/synthex-lina/public/book', { nombre: 'María Rojas', email: 'maria@ejemplo.com', telefono: '+58 414 555 0000', empresa: 'Distribuidora Rojas', start: freeIso, lang: 'es', tz: 'America/Caracas' });
  let pj = await pb.json();
  ok(pb.status === 200 && pj.booked && pj.email_sent, 'form booking works and emails');
  const mm = sent.find((m) => m.to === 'maria@ejemplo.com');
  ok(mm && /María/.test(mm.html), 'form confirmation sent to the visitor');
  ok(!/<b>X/.test(require('../src/services/synthexNotify')._test.html({ nombre: '<b>X</b>', start: freeIso, lang: 'es', minutes: 60 })), 'visitor text is escaped in the email');
  ok(events.some((e) => /formulario/.test(e.description) && /maria@ejemplo.com/.test(e.description)), 'form meeting in calendar');
  pb = await post('/api/synthex-lina/public/book', { nombre: 'Pedro Gil', email: 'pedro@ejemplo.com', telefono: '4145550000', start: freeIso, lang: 'es' });
  ok(pb.status === 409, 'a taken time is refused on the form');
  pb = await post('/api/synthex-lina/public/book', { nombre: 'Pedro Gil', email: 'nope', telefono: '4145550000', start: freeIso });
  ok(pb.status === 400, 'bad email refused on the form');

  // same email again: no second meeting
  script = [{ content: [{ type: 'tool_use', id: 't3', name: 'agendar_reunion', input: { nombre: 'Carlos Pérez', email: 'CARLOS@ejemplo.com', telefono: '4125551234', start: slotB.toISOString(), confirmado: true } }] }, { content: [{ type: 'text', text: 'Ya tenías una.' }] }];
  await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'otra' }] });
  ok(events.length === 2 && /already/.test(JSON.stringify(seen[seen.length - 1].messages.slice(-1))), 'one upcoming meeting per email');

  // validation: no confirmation, bad email, injected name, taken slot
  const { validate } = require('../src/routes/synthex-lina')._test;
  ok(validate({ nombre: 'Ana', email: 'a@b.co', telefono: '4125551234' }).errores.includes('confirmado'), 'needs confirmation');
  ok(validate({ nombre: 'Ana', email: 'nope', telefono: '4125551234', confirmado: true }).errores.includes('email'), 'bad email');
  ok(!/[<>]/.test(validate({ nombre: '<script>x', email: 'a@b.co', telefono: '4125551234', confirmado: true }).nombre), 'markup stripped from name');
  ok(validate({ nombre: '1234', email: 'a@b.co', telefono: '4125551234', confirmado: true }).errores.includes('nombre'), 'bad name');
  ok(validate({ nombre: 'Ana', email: 'a@b.co', telefono: '12', confirmado: true }).errores.includes('telefono'), 'bad phone');
  script = [{ content: [{ type: 'tool_use', id: 't4', name: 'agendar_reunion', input: { nombre: 'Luisa Gómez', email: 'luisa@ejemplo.com', telefono: '4125551234', start: slotA.toISOString(), confirmado: true } }] }, { content: [{ type: 'text', text: 'Esa hora ya no está.' }] }];
  await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'a las diez' }] });
  ok(events.length === 2 && /ya no está libre/.test(JSON.stringify(seen[seen.length - 1].messages.slice(-1))), 'taken slot refused');

  // no model: Lina says so in her own words, not ENRUTA's
  delete process.env.ANTHROPIC_API_KEY;
  r = await (await post('/api/voice-agent/chat', { agent: 'synthex', lang: 'es', context: 'p', messages: [{ role: 'user', content: 'hola' }] })).json();
  ok(/formulario/.test(r.reply) && !/seis cero dos/.test(r.reply), 'own offline reply');

  // training page: the owner's Projects login, owner emails only
  const bc = require('bcryptjs'); const hash = await bc.hash('projects-pass-1', 4);
  require('../src/routes/synthex-lina')._test.setCrmLookup(async (e) => (e === 'mstagg@digit2ai.com' || e === 'other@x.com') ? hash : null);
  const basic = (u, pw) => ({ Authorization: 'Basic ' + Buffer.from(u + ':' + pw).toString('base64') });
  d = await fetch(base + '/api/synthex-lina/entrenar');
  ok(d.status === 401 && /Basic/.test(d.headers.get('www-authenticate') || ''), 'training asks to sign in');
  d = await fetch(base + '/api/synthex-lina/entrenar', { headers: basic('mstagg@digit2ai.com', 'wrong') });
  ok(d.status === 401, 'wrong password refused');
  d = await fetch(base + '/api/synthex-lina/entrenar', { headers: basic('other@x.com', 'projects-pass-1') });
  ok(d.status === 401, 'a CRM user who is not the owner is refused');
  d = await fetch(base + '/api/synthex-lina/entrenar', { headers: basic('MStagg@digit2ai.com', 'projects-pass-1') });
  ok(d.status === 200 && /Entrenar a Lina/.test(await d.text()), 'owner gets the page with the Projects password');

  // landing: no narrator left, orb wired
  const page = require('fs').readFileSync(path.join(__dirname, '../public/synthexai/index.html'), 'utf8');
  ok(/data-agent="synthex"/.test(page) && /\/embed\/voice-orb\.js/.test(page), 'landing uses Lina');
  ok(!/var SEG=/.test(page) && !/niva-panel/.test(page), 'narrator removed');
  ok(/D2AIVoiceOrb\.send\(q\)/.test(page), 'FAQ box goes to Lina');
  const appSrc = require('fs').readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  ok(/'\/api\/synthex-lina\/public\/book'/.test(appSrc) && /'\/api\/voice-agent\/chat'/.test(appSrc) && /'\/embed\/voice-orb\.js'/.test(appSrc), 'synthexsai.com passes Lina through');
  ok(!/'\/api\/synthex-lina\/(book|slots|calc|entrenar)/.test(appSrc.split('SYNTHEX_PASS_THROUGH')[1].split(']);')[0]), 'tools not exposed on the domain');

  // digit2ai.com/presentacion: same booking route, Digit2AI brand on calendar + email
  sent.length = 0;
  pb = await post('/api/synthex-lina/public/book', { brand: 'digit2ai', nombre: 'Laura Méndez', email: 'laura@ejemplo.com', telefono: '+1 813 555 0101', empresa: 'Méndez Corp', start: slotC.toISOString(), lang: 'es', tz: 'America/New_York' });
  pj = await pb.json();
  ok(pb.status === 200 && pj.booked && pj.email_sent, 'deck booking works');
  const dEv = events.find((e) => /laura@ejemplo.com/.test(e.description));
  ok(dEv && /^Digit2AI: Laura/.test(dEv.title) && /d2ai_deck:/.test(dEv.description) && !/synthex_lina:/.test(dEv.description) && /presentación narrada/.test(dEv.description), 'deck meeting in calendar with Digit2AI wording');
  const dm = sent.find((m) => m.to === 'laura@ejemplo.com');
  ok(dm && dm.from.name === 'Digit2AI' && /Digit2AI/.test(dm.subject) && !/Synthex/.test(dm.html + dm.text + dm.subject), 'deck email is Digit2AI, no Synthex');
  ok(dm && /#22d3ee/.test(dm.html) && /mcp\/logo\.png/.test(dm.html) && /Su reunión está confirmada/.test(dm.html), 'deck email uses the Digit2AI look');
  ok(dm && /digit2ai\.ics/.test(dm.attachments[0].filename) && /Digit2AI: reunión/.test(Buffer.from(dm.attachments[0].content, 'base64').toString()), 'deck calendar invite');
  ok(sent.some((m) => /Nueva reunión Digit2AI/.test(m.subject) && /presentación narrada/.test(m.text)), 'owner alerted for the deck');
  pb = await post('/api/synthex-lina/public/book', { brand: 'evil', nombre: 'Otro Nombre', email: 'otro@ejemplo.com', telefono: '4145550000', start: slotC.toISOString() });
  ok(pb.status === 409, 'unknown brand falls back and a taken time is still refused');
  const deck = require('fs').readFileSync(path.join(__dirname, '../public/mcp/presentacion/index.html'), 'utf8');
  const last = deck.split('id="lastSlide"')[1].split('</section>')[0];
  ok(/data-book-demo/.test(last) && /brand: 'digit2ai'/.test(deck) && /\/api\/synthex-lina\/public\/slots/.test(deck), 'last slide carries the booking button');
  ok(/window\.D2BOOK_OPEN\) return;/.test(deck) && /D2BOOK_OPEN\) \{ x0 = null/.test(deck), 'arrows and swipes do not flip slides while booking');
  ok(/Agendar una reunión/.test(deck.split('var NARR')[1].split('];')[0].split("',").pop()), 'Lina mentions the button on the last slide');

  // embed: one drop-in for any page (integrate booking)
  const emb = require('fs').readFileSync(path.join(__dirname, '../public/embed/book-meeting.js'), 'utf8');
  ok(/\/api\/synthex-lina\/public\/slots/.test(emb) && /\/api\/synthex-lina\/public\/book/.test(emb) && /\[data-d2-book\]/.test(emb), 'embed calls the public booking route');
  ok(/getAttribute\('lang'\)/.test(emb) && /attributeFilter: \['lang'\]/.test(emb) && /Agendar una reunión/.test(emb) && /Book a meeting/.test(emb), 'embed follows the page language live');
  ok(!/innerHTML\s*=\s*[^'"]/.test(emb.replace(/body\.innerHTML = ''/g, '')), 'embed never writes visitor text as HTML');
  sent.length = 0;
  pb = await post('/api/synthex-lina/public/book', { brand: 'digit2ai', source: 'digit2ai.com/<script>x', nombre: 'Rosa Díaz', email: 'rosa@ejemplo.com', telefono: '4145550001', start: slotD.toISOString() }, { 'cf-connecting-ip': '203.0.113.9' });
  ok(pb.status === 200, 'embed booking works');
  const rEv = events.find((e) => /rosa@ejemplo.com/.test(e.description));
  ok(rEv && /agendada desde digit2ai\.com\/scriptx\./.test(rEv.description) && !/</.test(rEv.description), 'source label is stripped to URL characters');
  ok(sent.some((m) => /Nueva reunión Digit2AI/.test(m.subject) && /digit2ai\.com\/scriptx/.test(m.text)), 'owner alert names the page');
  const home = require('fs').readFileSync(path.join(__dirname, '../public/neural-intelligence.html'), 'utf8');
  ok(/data-d2-book/.test(home.split('id="s1"')[1].split('</section>')[0]) && /book-meeting\.js/.test(home), 'digit2ai.com first section carries the button');

  const pym = require('fs').readFileSync(path.join(__dirname, '../public/synthexai/pymes/index.html'), 'utf8');
  const pLast = pym.split('id="lastSlide"')[1].split('</section>')[0];
  ok(/data-d2-book data-brand="synthex"/.test(pLast) && /https:\/\/aiagent\.ringlypro\.com\/embed\/book-meeting\.js/.test(pym), 'pymes last slide carries the Synthex booking button (absolute embed src)');
  ok(/D2BOOK_OPEN\) return;/.test(pym) && /d2book:open/.test(pym), 'pymes deck pauses and stops paging while booking');

  const calc = require('fs').readFileSync(path.join(__dirname, '../public/calcareos/presentacion/index.html'), 'utf8');
  ok((calc.match(/data-d2-book data-brand="digit2ai"/g) || []).length === 2 && /book-meeting\.js/.test(calc) && /D2BOOK_OPEN\) return;/.test(calc) && /d2book:open/.test(calc), 'calcareos deck: booking on cover + last slide, paging paused');

  // afternoons only: the REAL shared rule (not the stub above) never offers a morning
  const stubMcp = require.cache[mcpPath]; delete require.cache[mcpPath];
  const realB = require(mcpPath)._booking; require.cache[mcpPath] = stubMcp;
  const nyHour = (d) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(d));
  const cands = realB.candidateSlots(new Date());
  ok(cands.length > 20 && cands.every((d) => nyHour(d) >= 12 && nyHour(d) <= 16), 'only afternoon times (12:00-16:00 NY starts) are offered');
  ok(realB.threeByThree(cands, 'x').length === 3 && realB.threeByThree(cands, 'x').every((d) => d.slots.every((iso) => nyHour(new Date(iso)) >= 12)), 'three afternoon choices per day still fill three days');

  // regular 12-hour time everywhere a booking time is shown (owner rule 2026-10-31)
  const fs2 = require('fs');
  const timeFiles = ['public/embed/book-meeting.js', 'public/mcp/presentacion/index.html', 'public/synthexai/index.html', 'src/services/synthexNotify.js', 'src/routes/synthex-lina.js'];
  ok(timeFiles.every((f) => { const src = fs2.readFileSync(path.join(__dirname, '..', f), 'utf8'); const m = src.match(/hour: ?'numeric', minute: ?'2-digit'[^}]*/g) || []; return m.length && m.every((x) => /hour12: true/.test(x)); }), 'every booking time is 12-hour (a. m. / p. m.)');
  ok(/p\. m\./.test(require('../src/services/synthexNotify')._test.html({ nombre: 'Ana', start: '2026-11-02T20:00:00Z', lang: 'es', tz: 'America/New_York', minutes: 60, brand: 'digit2ai' })), 'email shows p. m.');

  srv.close();
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

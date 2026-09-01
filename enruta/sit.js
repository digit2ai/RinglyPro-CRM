/**
 * ENRUTA - SIT
 *
 * Sin argumentos monta el router en proceso (necesita un DATABASE_URL con las
 * tablas enruta_*). Con una URL base prueba un despliegue vivo:
 *
 *   node enruta/sit.js https://aiagent.ringlypro.com/enruta
 *
 * Es de solo lectura: nunca envía la clave administrativa ni confirma una
 * operación destructiva.
 */
require('dotenv').config();
const express = require('express');
const http = require('http');

const REMOTO = process.argv[2] || process.env.ENRUTA_SIT_BASE || null;

const T = '00000000-0000-0000-0000-000000000001';
let pasa = 0, falla = 0;
function ok(n, c, extra='') { c ? (pasa++, console.log('  ok   ', n, extra)) : (falla++, console.log('  FALLA', n, extra)); }

(async () => {
  let srv = null;
  let base = REMOTO ? REMOTO.replace(/\/$/, '') : null;
  if (!base) {
    const app = express();
    app.use('/enruta', require('./src/index'));
    srv = http.createServer(app);
    await new Promise(r => srv.listen(0, r));
    base = `http://127.0.0.1:${srv.address().port}/enruta`;
  }
  console.log('base:', base);
  const get = async (p) => { const r = await fetch(base + p); return { s: r.status, j: await r.json().catch(() => null) }; };
  const post = async (p, body, headers={}) => {
    const r = await fetch(base + p, { method:'POST', headers:{'Content-Type':'application/json',...headers}, body: JSON.stringify(body||{}) });
    return { s: r.status, j: await r.json().catch(() => null) };
  };

  console.log('\n== 1. Endpoints administrativos cerrados ==');
  for (const p of ['/health/sync', '/health/seed', '/health/seed-test-data']) {
    ok(`GET ${p} ya no existe`, (await get(p)).s === 404);
  }
  // 404 = hay clave configurada y la nuestra no sirve. 503 = no hay clave y la
  // operación está deshabilitada. Cualquiera de los dos es "cerrado".
  const sinClave = await post('/admin/sync', { confirmar: true });
  ok('POST /admin/sync sin clave rechaza', [404, 503].includes(sinClave.s), `-> ${sinClave.s}`);
  ok('POST /admin/seed-sedes sin clave rechaza', [404, 503].includes((await post('/admin/seed-sedes', { confirmar: true })).s));
  ok('POST /admin/seed-demo sin clave rechaza', [404, 503].includes((await post('/admin/seed-demo', { confirmar: true })).s));
  ok('clave equivocada no confirma que la ruta existe',
     (await post('/admin/sync', { confirmar: true }, { 'x-enruta-admin-key': 'clave-equivocada' })).s === 404);

  console.log('\n== 2. Cola de llamadas de Laura ==');
  const cola = await get(`/voice/laura/cola?tenant_id=${T}&limit=5`);
  ok('/voice/laura/cola responde 200', cola.s === 200, `-> ${cola.s} ${cola.j && cola.j.error || ''}`);
  ok('cola devuelve filas', cola.j && cola.j.success && Array.isArray(cola.j.data), `count=${cola.j && cola.j.count}`);
  if (cola.j && cola.j.data && cola.j.data.length) {
    const orden = cola.j.data.map(d => d.dias_para_vencer);
    ok('cola ordenada por urgencia real', orden.every((v, i) => i === 0 || v >= orden[i-1] || orden[i-1] < 0), JSON.stringify(orden));
  }

  console.log('\n== 3. Estado derivado, no almacenado ==');
  const stats = await get(`/api/dashboard/stats?tenant_id=${T}`);
  const porVencer = await get(`/api/documentos/por-vencer?tenant_id=${T}&limit=500`);
  const vencidos = await get(`/api/documentos/vencidos?tenant_id=${T}&limit=500`);
  console.log('   stats:', JSON.stringify(stats.j.stats));
  console.log('   por-vencer devuelve:', porVencer.j.data.length, '| vencidos devuelve:', vencidos.j.data.length);
  ok('contador "por vencer" coincide con la lista',
     stats.j.stats.documentos_por_vencer === porVencer.j.data.length,
     `${stats.j.stats.documentos_por_vencer} vs ${porVencer.j.data.length}`);
  ok('contador "vencidos" coincide con la lista',
     stats.j.stats.documentos_vencidos === vencidos.j.data.length,
     `${stats.j.stats.documentos_vencidos} vs ${vencidos.j.data.length}`);
  ok('ningún documento "por vencer" tiene fecha pasada',
     porVencer.j.data.every(d => d.dias_para_vencer >= 0));
  ok('todo "vencido" tiene fecha pasada',
     vencidos.j.data.every(d => d.dias_para_vencer < 0 && d.estado === 'vencido'));

  const est = await get(`/api/documentos/estadisticas?tenant_id=${T}`);
  const dist = {}; est.j.data.forEach(r => dist[r.estado] = (dist[r.estado]||0) + Number(r.count));
  console.log('   distribución derivada:', JSON.stringify(dist));
  ok('estadísticas coinciden con el contador de vencidos',
     (dist.vencido||0) === stats.j.stats.documentos_vencidos, `${dist.vencido} vs ${stats.j.stats.documentos_vencidos}`);
  const derivPorVencer = (dist.por_vencer_7_dias||0)+(dist.por_vencer_15_dias||0)+(dist.por_vencer_30_dias||0);
  ok('estadísticas coinciden con el contador por vencer',
     derivPorVencer === stats.j.stats.documentos_por_vencer, `${derivPorVencer} vs ${stats.j.stats.documentos_por_vencer}`);

  const filtrado = await get(`/api/documentos?tenant_id=${T}&estado=vencido&limit=100`);
  ok('filtro ?estado=vencido solo devuelve vencidos',
     filtrado.j.data.length > 0 && filtrado.j.data.every(d => d.estado === 'vencido'));
  const deriva = filtrado.j.data.filter(d => d.estado !== d.estado_almacenado).length;
  console.log(`   ${deriva}/${filtrado.j.data.length} filas tenían la columna desactualizada (ahora corregidas en lectura)`);

  console.log('\n== 4. Resto de la API sigue en pie ==');
  for (const p of ['/health', `/api/clientes?tenant_id=${T}&limit=2`, `/api/sedes?tenant_id=${T}`,
                   `/api/campanas?tenant_id=${T}`, `/api/comparendos?tenant_id=${T}`,
                   `/api/plantillas?tenant_id=${T}`, `/api/renovaciones?tenant_id=${T}`,
                   `/api/contactos?tenant_id=${T}`, `/api/dashboard/vencimientos-proximos?tenant_id=${T}`,
                   `/api/dashboard/llamadas-por-dia?tenant_id=${T}`, '/voice/laura/prompt', '/voice/laura/tools-schema', '/']) {
    const r = await fetch(base + p);
    ok(`GET ${p.split('?')[0]}`, r.status === 200, `-> ${r.status}`);
  }
  const rHead = await fetch(base + '/');
  ok('cabecera X-Robots-Tag: noindex', (rHead.headers.get('x-robots-tag')||'').includes('noindex'));

  console.log('\n== 5. Voz: orbe propio con Dalia, sin ElevenLabs ==');
  const html = await (await fetch(base + '/')).text();
  ok('el tablero no carga ningún SDK de ElevenLabs',
     !/elevenlabs|11labs|livekit|convai/i.test(html));
  ok('no queda un agent id de ElevenLabs en el cliente', !/agent_[0-9a-z]{20,}/i.test(html));
  ok('el tablero monta el orbe propio', html.includes('data-voice-orb') && html.includes('/embed/voice-orb.js'));
  ok('el orbe usa la persona enruta', /data-agent="enruta"/.test(html));
  ok('el orbe usa la voz Dalia', /data-voice="dalia"/.test(html));

  // La persona: Laura, español, Dalia. Se comprueba en la fuente para que valga
  // igual en local que contra el despliegue.
  const { agentConfig } = require('../src/config/voice-agents');
  const laura = agentConfig('enruta', 'es');
  ok('la persona enruta es Laura', laura.name === 'Laura', laura.name);
  ok('la persona enruta habla con la voz dalia', laura.voice === 'dalia', laura.voice);
  ok('la persona enruta no cae al genérico digit2ai', laura.id === 'enruta', laura.id);

  const ctx = await get(`/voice/laura/contexto?tenant_id=${T}`);
  ok('/voice/laura/contexto responde 200', ctx.s === 200, `-> ${ctx.s}`);
  const texto = (ctx.j && ctx.j.contexto) || '';
  ok('el contexto lleva los hechos de trámites', /SOAT/.test(texto) && /Categorías de Licencia/.test(texto));
  ok('el contexto lleva las restricciones de conducta', /NUNCA pedir datos bancarios/.test(texto));
  ok('el contexto lleva la foto en vivo del tablero', /Documentos ya vencidos: \d+/.test(texto));
  ok('el contexto NO lleva los guiones de llamada saliente', !/Flujo de Llamadas Salientes/.test(texto));
  ok('el contexto cabe en el límite del cerebro (9000)', texto.length > 0 && texto.length <= 9000, `${texto.length} chars`);

  console.log('\n== 6. Datos de demostración ==');
  const { sembrarDemo, MARCA_DEMO } = require('./src/services/demo-data');
  const { estadoDesdeFecha, diasParaVencer } = require('./src/utils/estado');

  // Se siembra contra modelos falsos: se juzga el generador, no la base.
  const bolsa = {};
  const falso = (n) => (bolsa[n] = [], {
    async create(r) { const x = { id: 'id' + bolsa[n].length + n, ...r }; bolsa[n].push(x); return x; },
    async bulkCreate(rs) { rs.forEach((r, i) => bolsa[n].push({ id: 'b' + i + n, ...r })); return bolsa[n]; },
    async findOrCreate() { return [null, true]; },
    async destroy() { return 0; }
  });
  const modelosFalsos = {
    EnrutaCliente: falso('clientes'), EnrutaDocumento: falso('documentos'),
    EnrutaRegistroContacto: falso('contactos'), EnrutaRenovacion: falso('renovaciones'),
    EnrutaCampana: falso('campanas'), EnrutaPlantillaMensaje: falso('plantillas'),
    EnrutaComparendo: falso('comparendos')
  };
  const resumen = await sembrarDemo(modelosFalsos, { clientes: 60, semilla: 4242 });
  const CL = bolsa.clientes, DO = bolsa.documentos;

  ok('siembra al menos 50 cédulas', CL.length >= 50, `${CL.length}`);
  ok('todas las cédulas son distintas', new Set(CL.map(c => c.numero_documento)).size === CL.length);
  ok('las cédulas tienen formato colombiano (8 o 10 dígitos)',
     CL.every(c => /^\d{8}$|^1\d{9}$/.test(c.numero_documento)));
  ok('todas las filas quedan marcadas como demostración',
     CL.every(c => c.notas === MARCA_DEMO));

  const reparto = {};
  DO.forEach(d => { const e = estadoDesdeFecha(d.fecha_vencimiento); reparto[e] = (reparto[e] || 0) + 1; });
  console.log('   reparto:', JSON.stringify(reparto));
  ok('hay documentos en las cinco casillas', Object.keys(reparto).length === 5, Object.keys(reparto).join(','));
  // El defecto que se está reparando: una demostración donde la casilla que
  // trabaja el agente está vacía.
  const enVentana = (reparto.por_vencer_7_dias||0)+(reparto.por_vencer_15_dias||0)+(reparto.por_vencer_30_dias||0);
  ok('la casilla "por vencer" tiene volumen real', enVentana >= DO.length * 0.2, `${enVentana}/${DO.length}`);
  ok('la mayoría de documentos NO está vencida', (reparto.vencido||0) < DO.length * 0.4, `${reparto.vencido}/${DO.length}`);

  ok('solo los documentos vencidos llevan multa',
     DO.every(d => (estadoDesdeFecha(d.fecha_vencimiento) === 'vencido') === !!d.valor_multa_cop));
  ok('ningún documento vence antes de expedirse',
     DO.every(d => d.fecha_expedicion < d.fecha_vencimiento));
  ok('las placas no se repiten entre ciudadanos', (() => {
    const p = DO.filter(d => d.placa_vehiculo).map(d => d.placa_vehiculo);
    return new Set(p).size === new Set(DO.filter(d => d.placa_vehiculo).map(d => d.cliente_id)).size;
  })());
  ok('ninguna motocicleta paga impuesto vehicular',
     !DO.some(d => d.tipo_documento === 'impuesto_vehicular' && d.tipo_vehiculo === 'motocicleta'));
  ok('quien pidió no ser llamado no recibe llamadas', (() => {
    const mudos = new Set(CL.filter(c => c.no_llamar).map(c => c.id));
    return mudos.size > 0 && !bolsa.contactos.some(c => mudos.has(c.cliente_id));
  })());
  ok('hay llamadas registradas hoy',
     bolsa.contactos.some(c => diasParaVencer(c.llamada_inicio.toISOString().slice(0, 10)) === 0));
  ok('hay renovaciones en curso',
     bolsa.renovaciones.some(r => !['completada','cancelada','fallida'].includes(r.estado_renovacion)));

  // Misma semilla, mismas personas: quien prepara la demostración se aprende
  // una cédula y sigue sirviendo después de volver a sembrar.
  const bolsa2 = {}; const falso2 = (n) => (bolsa2[n] = [], {
    async create(r) { bolsa2[n].push({ id: 'x' + bolsa2[n].length, ...r }); return bolsa2[n][bolsa2[n].length-1]; },
    async bulkCreate(rs) { rs.forEach(r => bolsa2[n].push(r)); return bolsa2[n]; },
    async findOrCreate() { return [null, true]; }, async destroy() { return 0; }
  });
  await sembrarDemo({
    EnrutaCliente: falso2('clientes'), EnrutaDocumento: falso2('documentos'),
    EnrutaRegistroContacto: falso2('contactos'), EnrutaRenovacion: falso2('renovaciones'),
    EnrutaCampana: falso2('campanas'), EnrutaPlantillaMensaje: falso2('plantillas'),
    EnrutaComparendo: falso2('comparendos')
  }, { clientes: 60, semilla: 4242 });
  ok('la misma semilla produce las mismas cédulas',
     JSON.stringify(bolsa2.clientes.map(c => c.numero_documento)) === JSON.stringify(CL.map(c => c.numero_documento)));
  ok('el resumen trae cédulas de ejemplo para la demostración',
     Array.isArray(resumen.cedulas_de_ejemplo) && resumen.cedulas_de_ejemplo.length === 5);

  const twiml = await (await fetch(base + '/voice/laura/webhook/inicio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=SIT&From=%2B15551234567&To=%2B15550000000&Direction=inbound'
  })).text();
  ok('el TwiML no abre un stream a ElevenLabs', !/elevenlabs/i.test(twiml));
  ok('el TwiML contesta en español con voz neural', /Polly\.Mia-Neural/.test(twiml) && /enRuta/.test(twiml));

  if (srv) srv.close();
  console.log(`\n=== ${pasa} ok, ${falla} fallas ===`);
  process.exit(falla ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

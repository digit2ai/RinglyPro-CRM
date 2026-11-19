/* NeoHaul · Operación — una sola página, sin build. Todas las cifras vienen del servidor. */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const S = { me: null, cat: {}, view: 'tablero' };
  const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const INC = { asistio: 'Asistió', falto: 'Faltó', incapacidad: 'Incapacidad', vacaciones: 'Vacaciones', descanso: 'Descanso' };

  /* ── utilidades ── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (v) => { const n = Number(v); return Number.isFinite(n) ? (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; };
  const qty = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const hoy = () => { const d = new Date(Date.now() - 6 * 3600e3); return d.toISOString().slice(0, 10); };
  const lunes = (f) => { const d = new Date((f || hoy()) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const dias = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtF = (f) => { if (!f) return ''; const [y, m, d] = String(f).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const UN = { tonelada: 't', dia: 'día', viaje: 'viaje' };
  const ERR = {
    invalid_credentials: 'Correo o contraseña incorrectos.', too_many_attempts: 'Demasiados intentos. Espera 15 minutos.', read_only: 'Tu cuenta es de solo lectura.', placa_duplicada: 'Ya hay un camión activo con esa placa.', lista_vacia: 'No encontré ningún nombre con teléfono en la lista.',
    ticket_duplicado: 'Ese número de ticket ya está registrado con esa tarifa.', en_estimacion: 'Ese viaje ya está en una estimación. Borra la estimación (en borrador) para liberarlo.',
    sin_viajes_confirmados: 'No hay viajes confirmados de esa obra en esas fechas.', estimacion_no_aprobada: 'Primero marca la estimación como aprobada por HTR.',
    ya_tiene_requisicion: 'Esa estimación ya tiene requisición.', falta_folio: 'Escribe el folio de la factura.', truck_busy: 'Ese camión ya está asignado a otro pedido ese día.',
    heic: 'La foto está en formato HEIC. En el iPhone: Ajustes > Cámara > Formatos > Más compatible, o envíala por WhatsApp y guárdala de ahí.',
    tipo_no_permitido: 'Solo fotos (JPG, PNG) o PDF.', archivo_muy_grande: 'El archivo es muy grande (máximo 10 MB).', sin_km: 'Escribe los kilómetros de al menos un camión.',
    usa_excel_o_csv: 'Para importar usa el archivo de Excel o CSV, no una foto.', sin_encabezados: 'No encontré las columnas Fecha, Ticket y Toneladas.',
    comision_fuera_de_rango: 'La comisión debe estar entre 0% y 15%.', semana_cerrada: 'Esa semana ya está cerrada.', password_too_short: 'Mínimo 10 caracteres.',
    wrong_current_password: 'La contraseña actual no es correcta.', solo_borrador: 'Solo se puede borrar una estimación en borrador.', transicion_invalida: 'Ese cambio de estado no es posible.',
    monto_invalido: 'El monto no puede ser mayor que el saldo.', telefono_invalido: 'Teléfono inválido. 10 dígitos para México; otro país con su lada, por ejemplo +1 813 641 4177.',
    vale_duplicado: 'Ese número de vale ya está registrado: sería el mismo viaje cobrado dos veces.', no_cuadra: 'Las cargas de la factura no suman su total: no la importé.',
    factura_ya_importada: 'Esa factura de combustible ya está importada.', folio_con_otro_total: 'Ya existe una factura con ese folio pero con otro total. Revísala antes de importar.',
    usa_pdf_o_xml_del_cfdi: 'Sube el PDF o el XML de la factura (CFDI) de la gasolinera.', no_es_factura_de_combustible: 'Ese PDF no parece una factura de combustible con cargas.',
    no_es_pps: 'No encontré las columnas NUM FACT y PROVEEDOR de la propuesta de pagos.', tiene_cargas: 'Esa factura ya tiene sus cargas: asígnalas por camión en lugar de repartir por km.',
    sin_cargas: 'No encontré cargas en la factura.', cargas_repetidas: 'La factura trae folios de despacho repetidos.', saldo_invalido: 'El saldo no puede ser mayor que el total.', faltan_datos: 'Faltan datos obligatorios.'
  };
  const errMsg = (e) => ERR[e && e.error] || (e && e.ayuda) || 'No se pudo completar (' + esc((e && e.error) || 'error') + ').';
  // MISMA regla que el servidor (docs.js waNumero; la SIT compara las dos): 10 dígitos = México (+52); otro país, con +lada.
  function waNumero(tel) {
    const raw = String(tel || '').trim();
    let d = raw.replace(/\D/g, '');
    if (!d) return null;
    if (raw.startsWith('+') || raw.startsWith('00')) { d = d.replace(/^00/, ''); if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3); return d.length >= 11 && d.length <= 15 ? d : null; }
    if (d.length === 10) return '52' + d;
    if (d.length === 12 && d.startsWith('52')) return d;
    if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
    if (d.length === 11 && d.startsWith('1')) return d;
    return null;
  }
  const waNum = (tel) => waNumero(tel) || '';
  const waLink = (tel, text) => 'https://wa.me/' + waNum(tel) + '?text=' + encodeURIComponent(text);

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: { 'X-NeoHaul': '1' }, credentials: 'same-origin' };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
    const r = await fetch('api/v1/' + path, o);
    let j = null; try { j = await r.json(); } catch (_) {}
    if (r.status === 401 && path !== 'auth/login') { S.me = null; renderLogin(); throw { error: 'not_signed_in' }; }
    if (!r.ok) throw j || { error: 'http_' + r.status };
    return j;
  }
  const canEdit = () => S.me && ['owner', 'director', 'capturista'].includes(S.me.user.role);
  const canAdmin = () => S.me && ['owner', 'director'].includes(S.me.user.role);
  async function loadCat(force) {
    if (!force && S.cat.trucks) return;
    const [trucks, drivers, clients, obras, tarifas] = await Promise.all(['trucks', 'drivers', 'clients', 'obras', 'tarifas'].map((c) => api(c)));
    Object.assign(S.cat, { trucks, drivers, clients, obras, tarifas });
  }
  const opts = (rows, label, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    rows.map((r) => `<option value="${r.id}"${String(sel) === String(r.id) ? ' selected' : ''}>${esc(label(r))}</option>`).join('');
  const activos = (k) => (S.cat[k] || []).filter((r) => r.active);
  const tarifaLbl = (t) => `${t.nombre} · ${pesos(t.precio)}/${UN[t.unidad]}${t.por_confirmar ? ' (por confirmar)' : ''}`;
  const truckLbl = (t) => `${t.unidad}${t.placas ? ' · ' + t.placas : ''}`;
  const val = (root, n) => { const el = root.querySelector(`[name="${n}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  function formData(root) { const o = {}; root.querySelectorAll('[name]').forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); return o; }
  /** Arrastrar y soltar: cualquier <input type=file> dentro de un .drop recibe el archivo soltado. */
  document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('.drop'); if (!z) return;
    e.preventDefault(); z.classList.remove('over');
    const inp = z.querySelector('input[type=file]'); if (!inp || !e.dataTransfer.files.length) return;
    const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]); inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('change', (e) => { const z = e.target.closest && e.target.closest('.drop'); if (z && e.target.files && e.target.files[0]) { z.classList.add('ok'); z.querySelector('span').textContent = e.target.files[0].name; } });
  const dropBox = (name, accept, texto) => `<label class="drop"><input type="file" name="${name}" accept="${accept}"><span>${texto}</span></label>`;
  function modal(html) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m); return m;
  }
  const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn) btn.disabled = false; } };

  /* ── sesión ── */
  function renderLogin(msg) {
    $app.innerHTML = `<div class="login"><div class="card"><img class="logo-login" src="logo.png" alt="NeoHaul" width="160" height="130"><h1>NeoHaul · Operación</h1><p class="sub">Grupo NeoHaul · plataforma de Digit2AI</p>
      <form id="f" class="form" style="grid-template-columns:1fr"><div><label>Correo</label><input name="email" type="email" autocomplete="username" required></div>
      <div><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary">Entrar</button><div class="err">${esc(msg || '')}</div></form></div></div>`;
    $app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('auth/login', { method: 'POST', body: formData(e.target) }); boot(); } catch (er) { e.target.querySelector('.err').textContent = errMsg(er); }
    };
  }
  function renderChangePassword() {
    $app.innerHTML = `<div class="login"><div class="card"><img class="logo-login" src="logo.png" alt="NeoHaul" width="160" height="130"><h1>Cambia tu contraseña</h1><p class="sub">Es tu primer ingreso. Elige una contraseña de al menos 10 caracteres.</p>
      <form id="f" class="form" style="grid-template-columns:1fr"><div><label>Contraseña temporal</label><input name="current" type="password" required></div>
      <div><label>Nueva contraseña</label><input name="new" type="password" minlength="10" required></div><button class="btn primary">Guardar</button><div class="err"></div></form></div></div>`;
    $app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('auth/password', { method: 'POST', body: formData(e.target) }); boot(); } catch (er) { e.target.querySelector('.err').textContent = errMsg(er); }
    };
  }
  async function boot() {
    try { S.me = await api('auth/me'); } catch (e) { if (e && e.error === 'not_signed_in') return; return renderLogin(); }
    if (S.me.user.must_change) return renderChangePassword();
    await loadCat(true);
    shell();
    mountDalia();
    go(location.hash.slice(1) || 'tablero');
  }

  const VIEWS = [
    ['grp', 'Semana'], ['tablero', 'Tablero'], ['pedidos', 'Pedidos'], ['viajes', 'Viajes'],
    ['grp', 'Cobro'], ['estimaciones', 'Estimaciones'], ['facturas', 'Facturas'],
    ['grp', 'Costos'], ['gastos', 'Gastos y diésel'], ['nomina', 'Nómina'], ['taller', 'Taller'],
    ['grp', 'Ajustes'], ['catalogos', 'Catálogos'], ['usuarios', 'Usuarios'], ['cuenta', 'Mi cuenta']
  ];
  function shell() {
    $app.innerHTML = `<header class="top"><button class="burger" id="burger" aria-label="Menú" aria-expanded="false">☰</button>
      <div class="brand"><img src="logo-blanco.png" alt="NeoHaul" width="49" height="40"><small>Operación</small></div><div class="sp"></div>
      <span class="muted" style="color:#cbd5e1;font-size:13px">${esc(S.me.user.name || S.me.user.email)}</span></header>
      <div class="layout"><nav class="side" id="side">${VIEWS.map(([k, l]) => (k === 'grp' ? `<div class="grp">${l}</div>`
        : (k === 'usuarios' && !canAdmin() ? '' : `<a href="#${k}" data-v="${k}">${l}</a>`))).join('')}
        <a href="#" id="salir">Salir</a></nav><main id="main"></main></div>`;
    const side = document.getElementById('side'), b = document.getElementById('burger');
    b.onclick = () => { side.classList.toggle('open'); b.setAttribute('aria-expanded', side.classList.contains('open')); };
    side.onclick = (e) => { if (e.target.closest('a')) side.classList.remove('open'); };
    document.getElementById('salir').onclick = async (e) => { e.preventDefault(); await api('auth/logout', { method: 'POST' }).catch(() => {}); S.me = null; document.body.classList.add('nh-out'); renderLogin(); };
  }
  window.addEventListener('hashchange', () => { if (S.me) go(location.hash.slice(1)); });
  const main = () => document.getElementById('main');
  async function go(v) {
    if (!R[v]) v = 'tablero';
    S.view = v;
    document.querySelectorAll('nav.side a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
    main().innerHTML = '<p class="muted">Cargando…</p>';
    try { await R[v](); } catch (e) { if (e && e.error !== 'not_signed_in') main().innerHTML = `<div class="err">${errMsg(e)}</div>`; }
  }
  const R = {};

  /* ── salud de la operación en gráficas (mismo método que Forzza Capital) ── */
  const INK = '#14213d', VERDE = '#047857', AMBAR = '#b45309', ROJO = '#b91c1c', NARANJA = '#c2410c';
  const c$ = (c) => pesos(Number(c) / 100);
  const k$ = (c) => { const v = Number(c) / 100, a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}k` : `${s}$${Math.round(a)}`; };
  const pc = (x, d) => (x == null ? '—' : (x * 100).toFixed(d == null ? 0 : d) + '%');
  const NIVEL = { sana: ['Sana', VERDE], atencion: ['Atención', AMBAR], riesgo: ['En riesgo', ROJO], sin_datos: ['Sin datos', '#64748b'] };
  // Notas del Tablero: al pasar el mouse (o tocar en el teléfono) sobre la "i" se abre la explicación.
  const TIPS = {
    alertas: ['Lo que hay que atender', 'Avisos que salen de la base de datos con reglas fijas: viajes viejos sin confirmar, requisiciones sin folio, facturas vencidas, diésel sin camión y camiones parados. Cada aviso trae su número.', 'Atiende primero los marcados "riesgo".'],
    calif: ['Calificación de la operación', 'Un número de 0 a 100 que resume seis cosas: el margen, la probabilidad de ir en pérdida, las facturas vencidas, el trabajo hecho sin facturar, la dependencia de una sola obra y los viajes confirmados con ticket. 75 o más es sana, de 50 a 74 pide atención y menos de 50 está en riesgo. Se calcula con reglas fijas, no con un modelo.', 'Una parte sin dato no cuenta y su peso se reparte entre las demás.'],
    p_margen: ['Margen (hasta 25 puntos)', 'Lo que queda de cada peso que entra, en las últimas 8 semanas: ingresos de viajes menos todos los costos capturados. Perder 10% da 0 puntos; ganar 25% o más da los 25.', ''],
    p_riesgo: ['Probabilidad de ir en pérdida (hasta 20 puntos)', 'De 2,000 futuros simulados con tus semanas reales, en cuántos la operación acumula pérdida en 8 semanas. 0% da los 20 puntos; 50% o más da 0.', ''],
    p_cartera: ['Facturas vencidas (hasta 20 puntos)', 'Qué parte de las facturas emitidas a HTR ya pasó los días de crédito. Nada vencido da los 20 puntos.', ''],
    p_ciclo: ['Trabajo hecho sin facturar (hasta 15 puntos)', 'Cuántas semanas de ingreso están detenidas entre el viaje y la factura (viajes sin confirmar, sin estimación o requisiciones sin folio). Una semana o menos da los 15.', ''],
    p_concentracion: ['Dependencia de una obra (hasta 10 puntos)', 'Qué parte del ingreso viene de la obra más grande. Si una obra pesa 90% o más, da 0; si pesa 40% o menos, da los 10.', ''],
    p_captura: ['Viajes confirmados con ticket (hasta 10 puntos)', 'De los viajes de las últimas 4 semanas, cuántos ya están confirmados y tienen ticket o vale. Sin ticket, HTR puede rechazar el viaje en la estimación.', ''],
    ingresos8: ['Ingresos últimas 8 semanas', 'La suma del importe de los viajes de las últimas 8 semanas completas, antes de IVA (cantidad por tarifa).', ''],
    resultado8: ['Resultado últimas 8 semanas', 'Ingresos de viajes menos todos los costos capturados en esas semanas: proveedores, diésel por carga, nómina y taller propio. Si falta capturar costos, el resultado se ve mejor de lo real.', ''],
    detenido: ['Trabajado sin facturar', 'Dinero de viajes ya hechos que todavía no tiene factura: viajes sin confirmar, confirmados sin estimación, estimaciones sin facturar y requisiciones sin folio. Se compara contra el ingreso de una semana normal.', 'Mientras más rápido pase de viaje a factura, antes se cobra.'],
    dsodpo: ['Días para cobrar · para pagar', 'Primero: cuántos días tarda HTR en pagar una factura desde que se emite. Segundo: cuántos días tarda NeoHaul en pagar a sus proveedores. Si cobras más lento de lo que pagas, la caja se aprieta.', ''],
    montecarlo: ['¿Qué tan probable es ir en pérdida?', 'Se arman 2,000 futuros posibles: cada semana futura repite al azar una semana real del pasado, con sus viajes y sus costos juntos. Los anillos dicen en qué parte de esos futuros la utilidad acumulada queda en negativo a 4, 8 y 13 semanas. La línea es lo más probable; las bandas, el rango normal (50%) y el amplio (90%).', 'Con pocas semanas de historia el rango real puede ser más amplio. Es una estimación, no un dato.'],
    semanas: ['Semana por semana', 'Ingresos de viajes (verde) contra costos capturados (rojo) de cada semana, y abajo lo que quedó. Las semanas con resultado negativo suelen ser semanas con pocos viajes o con un pago grande.', ''],
    embudo: ['Del viaje al cobro', 'Dónde está hoy el dinero que ya se trabajó: viajes sin confirmar, confirmados sin estimación, estimado sin facturar, requisición sin folio, facturado por cobrar y lo cobrado en 30 días.', 'Lo que se atora arriba tarda más en llegar al banco.'],
    cartera: ['Facturas por cobrar', 'Las facturas emitidas que HTR no ha pagado, agrupadas por días de atraso contra el plazo de crédito.', 'Lo vencido se cobra primero.'],
    pordia: ['¿Qué días se trabaja más?', 'Viajes e ingreso por día de la semana en las últimas 12 semanas. Un día flojo puede ser el día para mantenimiento.', ''],
    conc: ['¿Dependes de una sola obra?', 'Qué tanto del ingreso viene de pocas obras. El índice Gini va de 0 (todas pesan parecido) a 1 (una sola lo es todo). La curva muestra lo mismo en dibujo.', 'Cuando la obra mayor termina, el ingreso cae: pide a HTR su calendario de obras.'],
    camiones: ['Uso de cada camión', 'Por unidad, en las últimas 4 semanas: viajes, días con viaje (de 24 hábiles), ingreso, diésel cargado, litros por viaje y qué parte del ingreso se va en diésel.', 'Un camión con pocos días o mucho diésel por viaje merece revisión.'],
    proveedores: ['A quién se le debe más', 'Saldo por pagar de cada proveedor, de las facturas capturadas o importadas del PPS.', ''],
    hallazgos: ['Neural Findings', 'Cada hallazgo sale de reglas fijas sobre los viajes, facturas, gastos, diésel y la simulación. Diagnóstico: qué está pasando y con qué cifras. Prescripción: qué hacer. Crítico va primero, luego Atención y luego Oportunidad.', 'No lo escribe un modelo: si falta un dato, el hallazgo lo pide.'],
    semana: ['La semana', 'Las cifras de la semana elegida: viajes, facturado, cobrado, lo que falta facturar y los pagos propuestos. Cambia la semana con las flechas.', ''],
    porcamion: ['Cuánto deja cada camión propio', 'Por camión en la semana: ingreso de sus viajes menos su diésel, sus gastos asignados y el taller propio. La nómina todavía no se carga por camión.', ''],
    pagos: ['Pagos propuestos esta semana', 'Los gastos programados para pagarse esta semana, con el monto propuesto.', 'Se programan en Gastos y diésel.']
  };
  const tip = (k) => TIPS[k] ? `<button type="button" class="tip noprint" data-tip="${k}" aria-label="Qué significa">i</button>` : '';
  (function () {
    let box = null;
    const hide = () => { if (box) box.style.display = 'none'; };
    const show = (b) => {
      const t = TIPS[b.dataset.tip]; if (!t) return;
      if (!box) { box = document.createElement('div'); box.className = 'tipbox'; box.setAttribute('role', 'tooltip'); document.body.appendChild(box); }
      box.innerHTML = `<b>${t[0]}</b><p>${t[1]}</p>${t[2] ? `<p class="tip-do">${t[2]}</p>` : ''}`;
      box.style.display = 'block';
      const r = b.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
      let y = r.bottom + 8; if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.tip'); if (b) show(b); });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest && e.target.closest('.tip'); if (b && !b.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', (e) => { const b = e.target.closest && e.target.closest('.tip'); if (b) show(b); });
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.tip'); if (b) { e.preventDefault(); show(b); } else if (!(box && box.contains(e.target))) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    addEventListener('scroll', hide, true); addEventListener('hashchange', hide);
  })();
  // Neural Findings: hallazgo -> diagnóstico -> prescripción. Reglas fijas del servidor (src/hallazgos.js).
  function hallazgosHtml(list) {
    if (!list) return '';
    const SEVL = { critico: ['bad', 'Crítico'], atencion: ['warn', 'Atención'], oportunidad: ['acc', 'Oportunidad'] };
    const n = (k) => list.filter((h) => h.severidad === k).length;
    return `<div class="card nf"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Neural Findings · Diagnóstico y prescripción ${tip('hallazgos')}</h2>
      <span class="muted" style="font-size:13px">${list.length ? `${n('critico')} críticos · ${n('atencion')} de atención · ${n('oportunidad')} oportunidades` : ''}</span></div>
      ${list.length ? list.map((h) => { const [c, l] = SEVL[h.severidad] || ['', h.severidad]; return `<div class="nf-item nf-${esc(h.severidad)}">
        <div class="row" style="justify-content:space-between"><div><span class="pill ${c}">${l}</span> <b>${esc(h.titulo)}</b></div>${h.impacto ? `<span class="nf-imp">${c$(h.impacto)}</span>` : ''}</div>
        <p><span class="nf-k">Diagnóstico</span>${esc(h.diagnostico)}</p>
        <p><span class="nf-k">Prescripción</span>${esc(h.prescripcion)}</p>
        <p class="muted" style="font-size:12px;margin:0">Dato: ${esc(h.evidencia)}${h.enlace ? ` · <a href="${esc(h.enlace.href)}">${esc(h.enlace.label)}</a>` : ''}</p></div>`; }).join('')
      : '<p class="empty">Sin hallazgos: con los datos cargados no hay nada que corregir.</p>'}
      <p class="muted" style="font-size:12px;margin:8px 0 0">Cada hallazgo sale de reglas fijas sobre los datos de NeoHaul. No lo escribe un modelo.</p></div>`;
  }
  const kpi = (l, v, n, cls) => `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="l">${l}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ''}</div>`;
  function gauge(puntos, nivel) {
    const W = 260, H = 160, cx = 130, cy = 130, r = 104, w = 22;
    const pt = (v, rr) => { const a = Math.PI * (1 - v / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arc = (a, b, col) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}" fill="none"/>`; };
    const v = puntos == null ? 0 : puntos, [mx, my] = pt(v, r);
    return `<svg viewBox="0 0 ${W} ${H}" class="gauge" role="img" aria-label="Calificación ${puntos == null ? 'sin datos' : puntos + ' de 100'}">
      ${arc(0, 49.5, '#f3c2c2')}${arc(50.5, 74.5, '#f0d7a6')}${arc(75.5, 100, '#b7e2cd')}${puntos == null ? '' : arc(0, Math.max(0.5, v), NIVEL[nivel][1])}
      ${puntos == null ? '' : `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="13" fill="#fff" stroke="${INK}" stroke-width="3"/>`}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" style="font-size:46px;font-weight:800;fill:${INK}">${puntos == null ? '—' : puntos}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" style="font-size:12px;fill:#4b5563">de 100</text>
      <text x="22" y="${H - 2}" style="font-size:11px;fill:#4b5563">0</text><text x="${W - 22}" y="${H - 2}" text-anchor="end" style="font-size:11px;fill:#4b5563">100</text></svg>`;
  }
  function anillo(p, label) {
    const r = 30, C = 2 * Math.PI * r, v = p == null ? 0 : Math.max(0, Math.min(1, p)), col = p == null ? '#94a3b8' : v >= 0.3 ? ROJO : v >= 0.1 ? AMBAR : VERDE;
    return `<div class="ring"><svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="${r}" stroke="#e2e6ee" stroke-width="9" fill="none"/>
      <circle cx="40" cy="40" r="${r}" stroke="${col}" stroke-width="9" fill="none" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 40 40)" stroke-linecap="round"/>
      <text x="40" y="45" text-anchor="middle" style="font-size:16px;font-weight:800;fill:${INK}">${pc(p)}</text></svg><div class="muted" style="font-size:12px">${label}</div></div>`;
  }
  function escala(lo, hi) {
    const raw = (hi - lo) / 5 || 1, pow = Math.pow(10, Math.floor(Math.log10(Math.abs(raw)))), step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw);
    return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step];
  }
  function abanico(mc) {
    const W = 760, H = 280, L = 70, R = 30, T = 14, B = 30, b = mc.bandas;
    const [lo, hi, step] = escala(Math.min(0, ...b.map((d) => d.p5)), Math.max(0, ...b.map((d) => d.p95)));
    const x = (i) => L + (i * (W - L - R)) / b.length, y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
    const pts = [[0, 0, 0, 0, 0, 0]].concat(b.map((d, i) => [i + 1, d.p5, d.p25, d.p50, d.p75, d.p95]));
    const band = (a, c) => 'M' + pts.map((p) => `${x(p[0]).toFixed(1)} ${y(p[a]).toFixed(1)}`).join('L') + 'L' + pts.slice().reverse().map((p) => `${x(p[0]).toFixed(1)} ${y(p[c]).toFixed(1)}`).join('L') + 'Z';
    const line = (a) => 'M' + pts.map((p) => `${x(p[0]).toFixed(1)} ${y(p[a]).toFixed(1)}`).join('L');
    const grid = []; for (let v = lo; v <= hi + step / 2; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e6ee"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${k$(v)}</text>`);
    const xt = [0, 4, 8, 13].filter((i) => i <= b.length).map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${i ? 'semana ' + i : 'hoy'}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Utilidad acumulada posible en ${b.length} semanas">${grid.join('')}
      ${y(0) > T && y(0) < H - B ? `<rect x="${L}" y="${y(0)}" width="${W - L - R}" height="${H - B - y(0)}" fill="#fdeaea" opacity=".55"/>` : ''}
      <path d="${band(1, 5)}" fill="${INK}" opacity=".12"/><path d="${band(2, 4)}" fill="${INK}" opacity=".22"/>
      <path d="${line(3)}" fill="none" stroke="${INK}" stroke-width="2.6"/>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="${ROJO}" stroke-width="1.4"/>${xt}</svg>
      <div class="legend"><span><i style="background:${INK}"></i>Lo más probable</span><span><i style="background:${INK};opacity:.35;height:8px"></i>Rango normal (50% de los casos)</span><span><i style="background:${INK};opacity:.15;height:8px"></i>Rango amplio (90%)</span><span><i style="background:${ROJO};height:2px"></i>Cero: abajo es pérdida</span></div>`;
  }
  function barrasSem(ws) {
    if (!ws.length) return '<p class="empty">Aún no hay semanas completas con viajes o costos.</p>';
    const W = 380, H = 210, L = 8, B = 34, T = 18, max = Math.max(...ws.map((w) => Math.max(w.ingresos, w.costos))) || 1;
    const g = (W - L * 2) / ws.length, bw = Math.max(3, Math.min(14, g / 3)), y = (v) => T + (H - T - B) * (1 - v / max);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y costos por semana">${ws.map((w, i) => {
      const cx = L + g * i + g / 2, etq = fmtF(w.semana).slice(0, 5);
      return `<rect x="${cx - bw - 1}" y="${y(w.ingresos)}" width="${bw}" height="${H - B - y(w.ingresos)}" rx="2" fill="${VERDE}"/>
        <rect x="${cx + 1}" y="${y(w.costos)}" width="${bw}" height="${H - B - y(w.costos)}" rx="2" fill="${ROJO}" opacity=".85"/>
        ${ws.length <= 8 || i % 2 === ws.length % 2 ? `<text x="${cx}" y="${H - 18}" text-anchor="middle">${esc(etq)}</text>` : ''}
        <text x="${cx}" y="${H - 4}" text-anchor="middle" style="font-size:${ws.length > 8 ? 8 : 10}px;font-weight:700;fill:${w.neto >= 0 ? VERDE : ROJO}">${ws.length <= 8 || i % 2 === ws.length % 2 ? k$(w.neto) : ''}</text>`;
    }).join('')}</svg><div class="legend"><span><i style="background:${VERDE}"></i>Ingresos de viajes</span><span><i style="background:${ROJO}"></i>Costos capturados</span><span>abajo: lo que quedó</span></div>`;
  }
  function barrasH(items, color) {
    if (!items.length) return '<p class="empty">Sin datos.</p>';
    const max = Math.max(...items.map((i) => i.v)) || 1;
    return items.map((i) => `<div class="hb"><div class="hb-l">${esc(i.l)}</div><div class="hb-t"><i style="width:${Math.max(1, (i.v / max) * 100).toFixed(1)}%;background:${i.c || color}"></i></div><div class="hb-v">${k$(i.v)}${i.n ? ` <span class="muted">${esc(i.n)}</span>` : ''}</div></div>`).join('');
  }
  function lorenz(c) {
    const S = 220, P = 26, z = (v) => P + v * (S - P * 2);
    const d = 'M' + c.lorenz.map(([a, b]) => `${z(a).toFixed(1)} ${(S - z(b)).toFixed(1)}`).join('L');
    return `<svg viewBox="0 0 ${S} ${S}" style="width:100%;max-width:240px" role="img" aria-label="Curva de Lorenz por obra">
      <rect x="${P}" y="${P}" width="${S - 2 * P}" height="${S - 2 * P}" fill="#f6f8fc" stroke="#e2e6ee"/>
      <path d="${d}L${z(1)} ${S - z(0)}Z" fill="${INK}" opacity=".12"/>
      <line x1="${z(0)}" y1="${S - z(0)}" x2="${z(1)}" y2="${S - z(1)}" stroke="#94a3b8" stroke-dasharray="5 4"/>
      <path d="${d}" fill="none" stroke="${INK}" stroke-width="2.4"/>
      <text x="${S / 2}" y="${S - 6}" text-anchor="middle" style="font-size:10px;fill:#4b5563">% de obras →</text>
      <text x="10" y="${S / 2}" transform="rotate(-90 10 ${S / 2})" text-anchor="middle" style="font-size:10px;fill:#4b5563">% del ingreso →</text></svg>`;
  }
  function aging(cart) {
    const T = [['por_vencer', 'Al corriente', INK], ['d1_30', '1–30 vencido', '#d97706'], ['d31_60', '31–60', AMBAR], ['d61_90', '61–90', NARANJA], ['d90_mas', '+90', ROJO]];
    if (!cart.total) return '<p class="empty">No hay facturas emitidas sin cobrar.</p>';
    return `<div class="stack">${T.map(([k, , c]) => (cart[k].monto ? `<i style="width:${(cart[k].monto / cart.total * 100).toFixed(1)}%;background:${c}"></i>` : '')).join('')}</div>
      <div class="legend">${T.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l}: ${k$(cart[k].monto)}</span>`).join('')}</div>`;
  }
  function porDia(arr) {
    const max = Math.max(...arr.map((d) => d.monto)) || 1, N = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return `<div class="heat">${arr.map((d, i) => { const a = Math.min(1, d.monto / max);
      return `<div class="hc" style="background:rgba(20,33,61,${(0.08 + 0.85 * a).toFixed(2)});color:${a > 0.45 ? '#fff' : INK}" title="${N[i]}: ${d.viajes} viajes"><b>${N[i]}</b><span>${d.viajes} viajes</span><span>${k$(d.monto)}</span></div>`; }).join('')}</div>`;
  }
  const valParte = (p) => (p.clave === 'ciclo' ? p.valor.toFixed(1) + ' semanas' : pc(p.valor, 1));
  function saludHtml(s) {
    const cal = s.calificacion, niv = NIVEL[cal.nivel || 'sin_datos'], mc = s.montecarlo, conc = s.concentracion;
    const ALN = { riesgo: 'bad', atencion: 'warn' };
    return `${s.alertas.length ? `<div class="card"><h2 style="margin-top:0">Lo que hay que atender ${tip('alertas')}</h2>${s.alertas.map((a) => `<div class="alerta"><span class="pill ${ALN[a.nivel] || ''}">${a.nivel === 'riesgo' ? 'riesgo' : 'atención'}</span> ${esc(a.texto)}</div>`).join('')}</div>` : ''}
      <div class="card hero">
        <div class="hero-g">${gauge(cal.puntos, cal.nivel || 'sin_datos')}<div class="nivel" style="background:${niv[1]}">${niv[0]}</div>
          <div class="muted" style="font-size:12px;text-align:center;margin-top:6px">Salud de la operación, de 0 a 100</div></div>
        <div class="hero-p"><h2 style="margin-top:0">¿De dónde sale la calificación? ${tip('calif')}</h2>
          ${cal.partes.map((p) => `<div class="part"><div class="part-h"><span>${esc(p.nombre)} ${tip('p_' + p.clave)}</span><b>${p.calificada ? p.puntos + ' / ' + p.peso : 'sin dato'}</b></div>
            <div class="hb-t"><i style="width:${p.calificada ? (p.puntos / p.peso * 100).toFixed(0) : 0}%;background:${!p.calificada ? '#94a3b8' : p.puntos / p.peso >= 0.75 ? VERDE : p.puntos / p.peso >= 0.5 ? AMBAR : ROJO}"></i></div>
            <div class="muted" style="font-size:12px">${p.calificada ? 'Hoy: ' + esc(valParte(p)) + ' · ' : ''}${esc(p.regla)}</div></div>`).join('')}
          ${cal.puntos == null ? '<p class="muted" style="font-size:13px">Aún no hay datos para calificar. Se llena sola al capturar viajes, gastos y facturas.</p>' : cal.peso_calificado < 100 ? '<p class="muted" style="font-size:12px;margin:6px 0 0">Las partes "sin dato" no cuentan; su peso se reparte entre las demás.</p>' : ''}</div>
      </div>
      <div class="grid kpis">
        ${kpi('Ingresos últimas 8 semanas ' + tip('ingresos8'), c$(s.ultimas_8.ingresos), `Costos capturados: ${c$(s.ultimas_8.costos)}`)}
        ${kpi('Resultado últimas 8 semanas ' + tip('resultado8'), s.ultimas_8.costos ? c$(s.ultimas_8.neto) : '—', s.ultimas_8.costos ? (s.ultimas_8.ingresos ? 'Margen ' + pc(s.ultimas_8.neto / s.ultimas_8.ingresos, 1) : '') : 'Sin costos capturados', s.ultimas_8.costos && s.ultimas_8.neto < 0 ? 'bad' : '')}
        ${kpi('Trabajado sin facturar ' + tip('detenido'), c$(s.detenido), s.promedio_semanal_ingresos ? `${(s.detenido / s.promedio_semanal_ingresos).toFixed(1)} semanas de ingreso detenidas` : 'Viajes, estimaciones y requisiciones')}
        ${kpi('Días para cobrar · para pagar ' + tip('dsodpo'), `${s.dso == null ? '—' : s.dso} · ${s.dpo == null ? '—' : s.dpo}`, `Promedio de lo cerrado en 180 días (${s.dso_n} cobradas, ${s.dpo_n} pagadas)`)}
      </div>
      ${hallazgosHtml(s.hallazgos)}
      <div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin-top:0">¿Qué tan probable es ir en pérdida? ${tip('montecarlo')}</h2>
        <p class="muted" style="margin:0;font-size:13px">${mc ? `${mc.caminos.toLocaleString('es-MX')} futuros posibles armados con ${mc.semanas_historia} semanas reales (del ${fmtF(mc.desde)} al ${fmtF(mc.hasta)}): cada semana futura repite una semana del pasado, con sus viajes y sus costos juntos. Es una estimación.` : 'Se calcula con al menos 4 semanas completas con viajes capturados (y sus costos). Con solo costos no se calcula: daría pérdida segura sin serlo.'}</p></div>
        ${mc ? `<div class="rings">${anillo(mc.prob_perdida_en[4], 'en 4 semanas')}${anillo(mc.prob_perdida_en[8], 'en 8 semanas')}${anillo(mc.prob_perdida_en[13], 'en 13 semanas')}</div>` : ''}</div>
        ${mc ? abanico(mc) + `<p class="muted" style="font-size:12px;margin:6px 0 0">Utilidad acumulada en 13 semanas: lo más probable ${c$(mc.final.p50)}; en un mal caso (1 de 20) ${c$(mc.final.p5)}; en un buen caso ${c$(mc.final.p95)}.</p>` : ''}</div>
      <div class="grid two">
        <div class="card"><h2 style="margin-top:0">Semana por semana ${tip('semanas')}</h2>${barrasSem(s.semanas)}</div>
        <div class="card"><h2 style="margin-top:0">Del viaje al cobro ${tip('embudo')}</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Dónde está hoy el dinero que ya se trabajó.</p>
          ${s.embudo.some((e) => e.monto) ? barrasH(s.embudo.map((e, i) => ({ l: e.nombre, v: e.monto, n: e.n ? String(e.n) : '', c: i < 4 ? AMBAR : i === 4 ? INK : VERDE })), INK) : '<p class="empty">Aún no hay viajes ni facturas.</p>'}</div>
      </div>
      <div class="grid two">
        <div class="card"><h2 style="margin-top:0">Facturas por cobrar ${tip('cartera')}</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Antigüedad contra un plazo de ${s.cartera.plazo} días desde la emisión.</p>${aging(s.cartera)}</div>
        <div class="card"><h2 style="margin-top:0">¿Qué días se trabaja más? ${tip('pordia')}</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Viajes de las últimas 12 semanas por día.</p>${porDia(s.por_dia)}</div>
      </div>
      <div class="card"><h2 style="margin-top:0">¿Dependes de una sola obra? ${tip('conc')}</h2>${conc ? `<div class="conc">
        <div>${lorenz(conc)}</div>
        <div><div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
          ${kpi('La obra mayor', pc(conc.mayor), 'del ingreso', conc.mayor >= 0.7 ? 'bad' : '')}${kpi('Índice Gini', conc.gini == null ? '—' : conc.gini.toFixed(2), '0 = parejo · 1 = una sola')}${kpi('Obras', String(conc.n), 'con viajes')}</div>
          ${barrasH(conc.mayores.map((m) => ({ l: m.nombre, v: m.monto, n: pc(m.parte) })), INK)}
          <p class="muted" style="font-size:12px;margin:8px 0 0">Últimas 12 semanas de viajes, antes de IVA. Todas son obras de HTR: el cliente es uno solo.</p></div></div>` : '<p class="empty">Aún no hay viajes en las últimas 12 semanas.</p>'}</div>
      <div class="card tbl"><h2 style="margin-top:0">Uso de cada camión (4 semanas) ${tip('camiones')}</h2><table class="cards"><thead><tr><th>Camión</th><th class="n">Viajes</th><th class="n">Días con viaje</th><th>Uso</th><th class="n">Ingresos</th><th class="n">Diésel</th><th class="n">L por viaje</th><th class="n">Diésel / ingreso</th></tr></thead><tbody>
        ${s.camiones.map((c) => `<tr><td data-l="Camión">${esc(c.unidad)}<div class="muted">${esc(c.empresa)}${c.ultimo_viaje ? ' · último ' + fmtF(c.ultimo_viaje) : ''}</div></td><td class="n" data-l="Viajes">${c.viajes}</td><td class="n" data-l="Días">${c.dias} de 24</td>
          <td data-l="Uso"><div class="hb-t" style="min-width:70px"><i style="width:${(c.uso * 100).toFixed(0)}%;background:${c.uso >= 0.7 ? VERDE : c.uso >= 0.4 ? AMBAR : ROJO}"></i></div></td>
          <td class="n" data-l="Ingresos">${c$(c.ingresos)}</td><td class="n" data-l="Diésel">${c.diesel ? c$(c.diesel) : '—'}</td><td class="n" data-l="L por viaje">${c.litros_por_viaje == null ? '—' : c.litros_por_viaje}</td><td class="n" data-l="Diésel / ingreso">${pc(c.diesel_sobre_ingreso, 1)}</td></tr>`).join('')}
      </tbody></table></div>
      ${s.por_pagar.proveedores.length ? `<div class="card"><h2 style="margin-top:0">A quién se le debe más ${tip('proveedores')}</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Saldo por proveedor: ${c$(s.por_pagar.total)} en ${s.por_pagar.n} facturas.</p>${barrasH(s.por_pagar.proveedores.map((p) => ({ l: p.nombre, v: p.monto, n: String(p.n) })), ROJO)}</div>` : ''}
      ${s.notas.map((n) => `<div class="note">${esc(n)}</div>`).join('')}`;
  }

  /* Dalia: el orbe de Digit2AI. Se escribe la pregunta y responde con los datos de NeoHaul (solo lectura). */
  function mountDalia() {
    document.body.classList.remove('nh-out');
    if (document.getElementById('dalia-orb')) return;
    const h = document.createElement('div');
    h.id = 'dalia-orb';
    h.setAttribute('data-voice-orb', '');
    h.setAttribute('data-mode', 'reply');
    h.setAttribute('data-voice-default', 'off');
    h.setAttribute('data-agent', 'neohaul');
    h.setAttribute('data-lang', 'es');
    h.setAttribute('data-label', 'Pregúntale a Dalia');
    h.setAttribute('data-chat', new URL('api/v1/dalia/chat', location.href).pathname);
    h.setAttribute('data-chat-header', 'X-NeoHaul: 1');
    h.setAttribute('data-accent', '#f0a35e');
    h.setAttribute('data-accent2', '#14213d');
    document.body.appendChild(h);
    const sc = document.createElement('script');
    sc.src = '/embed/voice-orb.js?v=3'; sc.defer = true;
    document.body.appendChild(sc);
  }

  /* ── tablero ── */
  R.tablero = async function (desde) {
    const [t, s] = await Promise.all([api('tablero?desde=' + (desde || lunes())), desde && S.salud ? Promise.resolve(S.salud) : api('salud').catch(() => null)]);
    if (s) S.salud = s;
    const k = (l, v, n) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ''}</div>`;
    const resumen = `Resumen semana ${fmtF(t.desde)} a ${fmtF(t.hasta)}\nViajes: ${t.viajes.n} (${pesos(t.viajes.importe)})\nFacturado: ${pesos(t.facturado.total)}\nCobrado: ${pesos(t.cobrado.total)}\nPor cobrar: ${pesos(t.por_cobrar_total)}\nPagos propuestos esta semana: ${pesos(t.pagos_semana_total)}\n` +
      t.pagos_semana.map((g) => `- ${g.proveedor}${g.folio ? ' ' + g.folio : ''}: ${pesos(g.monto_propuesto)}`).join('\n');
    main().innerHTML = `<h1>Tablero</h1><p class="sub">Salud de la operación de NeoHaul · hoy ${fmtF(hoy())}</p>
      ${s ? saludHtml(s) : '<div class="note">No se pudo calcular la salud de la operación.</div>'}
      <h2 style="margin-top:26px">La semana ${tip('semana')}</h2><p class="sub">Semana del ${fmtF(t.desde)} al ${fmtF(t.hasta)}</p>
      <div class="row noprint" style="margin-bottom:12px"><input type="date" id="wk" value="${t.desde}" style="max-width:180px"><button class="btn small" id="prev">Semana anterior</button>
      <button class="btn small" id="next">Siguiente</button><a class="btn small wa" target="_blank" rel="noopener" href="${waLink('', resumen)}">Enviar resumen por WhatsApp</a></div>
      <div class="grid">
        ${k('Viajes de la semana', pesos(t.viajes.importe), `${t.viajes.n} viajes · ${t.viajes.sin_confirmar} sin confirmar`)}
        ${k('Facturado en la semana', pesos(t.facturado.total), `${t.facturado.n} facturas emitidas`)}
        ${k('Cobrado en la semana', pesos(t.cobrado.total), `${t.cobrado.n} facturas`)}
        ${k('Por cobrar (todas)', pesos(t.por_cobrar_total), t.por_cobrar.map((p) => `${esc(p.cliente)}: ${pesos(p.s)} (${p.n})`).join('<br>') || 'Nada pendiente')}
        ${k('Estimado sin facturar', pesos(t.estimado_sin_facturar.subtotal), `${t.estimado_sin_facturar.n} estimaciones, antes de IVA`)}
        ${k('Requisiciones sin folio', pesos(t.requisiciones_sin_folio.total), `${t.requisiciones_sin_folio.n} esperando a la auxiliar`)}
        ${k('Pagos propuestos esta semana', pesos(t.pagos_semana_total), `${t.pagos_semana.length} pagos`)}
        ${k('Cuentas por pagar (saldo)', pesos(t.cuentas_por_pagar.saldo), `${t.cuentas_por_pagar.n} facturas de proveedor`)}
        ${k('Taller por cobrar', pesos(t.taller_por_cobrar.total), `${t.taller_por_cobrar.n} servicios a empresas hermanas`)}
      </div>
      <div class="row" style="justify-content:space-between;align-items:center;margin-top:18px"><h2 style="margin:0">Cuánto deja cada camión propio ${tip('porcamion')}</h2>${canEdit() ? '<button class="btn small" id="nuevoCamion">+ Agregar camión</button>' : ''}</div>
      <div class="card tbl"><table class="cards"><thead><tr><th>Camión</th><th class="n">Viajes</th><th class="n">Ingresos</th><th class="n">Diésel</th><th class="n">Costos</th><th class="n">Resultado</th></tr></thead><tbody>
      ${t.camiones.map((c) => `<tr><td data-l="Camión">${esc(c.unidad)}</td><td class="n" data-l="Viajes">${c.viajes}</td><td class="n" data-l="Ingresos">${pesos(c.ingresos)}</td><td class="n" data-l="Diésel">${Number(c.diesel) ? pesos(c.diesel) + '<div class="muted">' + qty(c.litros) + ' L</div>' : '—'}</td>
        <td class="n" data-l="Costos">${c.sin_costos ? '<span class="pill warn">sin costos capturados</span>' : pesos(c.costos)}</td>
        <td class="n" data-l="Resultado">${c.margen == null ? '—' : `<span class="pill ${c.margen < 0 ? 'bad' : 'ok'}">${pesos(c.margen)}</span>`}</td></tr>`).join('')}
      </tbody></table>${t.diesel_sin_asignar && t.diesel_sin_asignar.n ? `<div class="note"><b>${t.diesel_sin_asignar.n} cargas de diésel</b> de esta semana (${pesos(t.diesel_sin_asignar.total)}) aún no tienen camión. Asígnalas en Gastos y diésel.</div>` : ''}${t.notas.map((n) => `<div class="note">${esc(n)}</div>`).join('')}</div>
      <h2>Pagos propuestos esta semana ${tip('pagos')}</h2>
      <div class="card tbl">${t.pagos_semana.length ? `<table class="cards"><thead><tr><th>Proveedor</th><th>Folio</th><th>Camión</th><th class="n">Monto</th></tr></thead><tbody>
        ${t.pagos_semana.map((g) => `<tr><td data-l="Proveedor">${esc(g.proveedor)}</td><td data-l="Folio">${esc(g.folio || '')}</td><td data-l="Camión">${esc(g.camion || 'General')}</td><td class="n" data-l="Monto">${pesos(g.monto_propuesto)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Ninguno programado. Prográmalos en Gastos y diésel.</p>'}</div>`;
    const nc = document.getElementById('nuevoCamion'); if (nc) nc.onclick = () => { S.catTab = 'trucks'; location.hash = 'catalogos'; };
    document.getElementById('wk').onchange = (e) => R.tablero(lunes(e.target.value));
    document.getElementById('prev').onclick = () => R.tablero(dias(t.desde, -7));
    document.getElementById('next').onclick = () => R.tablero(dias(t.desde, 7));
  };

  /* ── pedidos ── */
  R.pedidos = async function () {
    const ps = await api('pedidos');
    main().innerHTML = `<h1>Pedidos</h1><p class="sub">El ingeniero pide por WhatsApp; aquí se anota y se asignan camiones.</p>
      ${canEdit() ? `<div class="card"><h2 style="margin-top:0">Nuevo pedido</h2><form id="np" class="form">
        <div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"></div>
        <div><label>Obra</label><select name="obra_id" required>${opts(activos('obras'), (o) => o.nombre, '', 'Elige la obra')}</select></div>
        <div><label>Tarifa / ruta</label><select name="tarifa_id">${opts(activos('tarifas'), tarifaLbl, '', 'Sin tarifa')}</select></div>
        <div><label>Camiones</label><input type="number" name="camiones" min="1" max="60" value="1"></div>
        <div><label>Quién pide</label><input name="solicitante" placeholder="Ingeniero de HTR"></div>
        <div class="wide"><label>Notas</label><input name="notas"></div>
        <div><button class="btn primary">Guardar pedido</button></div><div class="err wide"></div></form></div>` : ''}
      <div id="lst"></div>`;
    const f = document.getElementById('np');
    if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await api('pedidos', { method: 'POST', body: formData(f) }); R.pedidos(); } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
    document.getElementById('lst').innerHTML = ps.length ? ps.map((p) => {
      const est = { abierto: 'warn', asignado: 'ok', cerrado: '', cancelado: 'bad' }[p.estado];
      return `<div class="card"><div class="row" style="justify-content:space-between"><div><b>${esc(p.obra)}</b> · ${fmtF(p.fecha)} · ${p.camiones} camión(es)
        ${p.material ? ' · ' + esc(p.material) : ''} <span class="pill ${est}">${p.estado}</span><div class="muted" style="font-size:13px">${esc(p.solicitante || '')} ${esc(p.notas || '')}</div></div>
        ${canEdit() && ['abierto', 'asignado'].includes(p.estado) ? `<div class="row"><button class="btn small" data-asig="${p.id}">Asignar camión</button>
          <button class="btn small" data-cerrar="${p.id}">Cerrar</button></div>` : ''}</div>
        ${p.asignaciones.length ? `<table style="margin-top:8px"><tbody>${p.asignaciones.map((a) => {
          const txt = `Hola ${a.chofer || ''}. Viaje para ${p.obra} el ${fmtF(p.fecha)}${p.material ? ', material: ' + p.material : ''}. Camión ${a.unidad}. Al terminar mándame la foto del ticket y del vale. Gracias.`;
          return `<tr><td>${esc(a.unidad)} <span class="muted">${esc(a.empresa)}</span></td><td>${esc(a.chofer || 'sin chofer')}</td>
            <td class="right">${a.telefono ? `<a class="btn small wa" target="_blank" rel="noopener" data-avisar="${p.id}:${a.truck_id}" href="${waLink(a.telefono, txt)}">${a.avisado_at ? 'Avisado' : 'Avisar'}</a>` : '<span class="muted">sin teléfono</span>'}
            ${canEdit() ? `<button class="btn small danger" data-quitar="${p.id}:${a.truck_id}">Quitar</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : ''}</div>`;
    }).join('') : '<p class="muted">Sin pedidos en las últimas dos semanas.</p>';
    main().onclick = async (e) => {
      const b = e.target.closest('[data-asig],[data-cerrar],[data-quitar],[data-avisar]'); if (!b) return;
      if (b.dataset.avisar) { const [p, k] = b.dataset.avisar.split(':'); api(`pedidos/${p}/avisado`, { method: 'POST', body: { truck_id: k } }).catch(() => {}); return; }
      if (b.dataset.cerrar) { await api('pedidos/' + b.dataset.cerrar, { method: 'PATCH', body: { estado: 'cerrado' } }); return R.pedidos(); }
      if (b.dataset.quitar) { const [p, k] = b.dataset.quitar.split(':'); await api(`pedidos/${p}/asignar/${k}`, { method: 'DELETE' }); return R.pedidos(); }
      const p = ps.find((x) => String(x.id) === b.dataset.asig);
      const libres = await api('disponibles?fecha=' + String(p.fecha).slice(0, 10));
      const m = modal(`<h2 style="margin-top:0">Asignar a ${esc(p.obra)} · ${fmtF(p.fecha)}</h2><p class="muted">Camiones libres ese día, primero los propios, luego TTS, SEMAQSA y externos.</p>
        <div class="form"><div class="wide"><label>Camión</label><select name="truck_id">${opts(libres, (t) => `${t.empresa} · ${truckLbl(t)}${t.chofer ? ' · ' + t.chofer : ''}`)}</select></div>
        <div class="wide"><label>Chofer</label><select name="driver_id">${opts(activos('drivers').filter((d) => d.puesto === 'chofer'), (d) => `${d.nombre} (${d.empresa})`, '', 'El chofer del camión / sin chofer')}</select></div>
        <div class="row"><button class="btn primary" id="ok">Asignar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
      m.querySelector('#ok').onclick = async () => {
        const truck = val(m, 'truck_id'); const t = libres.find((x) => String(x.id) === truck);
        try { await api(`pedidos/${p.id}/asignar`, { method: 'POST', body: { truck_id: truck, driver_id: val(m, 'driver_id') || (t && t.chofer_id) || null } }); m.remove(); R.pedidos(); }
        catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      };
    };
  };

  /* ── viajes ── */
  function viajeForm(v, prop, sug) {
    v = v || {}; prop = prop || {}; sug = sug || {};
    const pick = (k) => (v[k] != null ? v[k] : sug[k]);
    const tr = activos('trucks'), ch = activos('drivers').filter((d) => d.puesto === 'chofer');
    return `<div class="form">
      <div><label>Fecha</label><input type="date" name="fecha" value="${esc(String(v.fecha || prop.fecha || hoy()).slice(0, 10))}"></div>
      <div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, pick('obra_id'), 'Elige la obra')}</select></div>
      <div class="wide"><label>Tarifa / ruta</label><select name="tarifa_id">${opts(activos('tarifas'), tarifaLbl, pick('tarifa_id'), 'Elige la tarifa')}</select></div>
      <div><label>Camión</label><select name="truck_id">${opts(tr, (t) => `${t.empresa} · ${truckLbl(t)}`, pick('truck_id'), 'Sin camión')}</select></div>
      <div><label>Chofer</label><select name="driver_id">${opts(ch, (d) => d.nombre, pick('driver_id'), 'Sin chofer')}</select></div>
      <div><label>No. de ticket / folio báscula</label><input name="ticket_no" value="${esc(v.ticket_no || prop.ticket_no || '')}"></div>
      <div><label>No. de vale</label><input name="vale_no" value="${esc(v.vale_no || prop.vale_no || '')}"></div>
      <div><label>Cantidad (t, días o viajes)</label><input name="cantidad" inputmode="decimal" value="${esc(v.cantidad != null ? Number(v.cantidad) : prop.toneladas != null ? prop.toneladas : '')}"></div>
      <div><label>Importe estimado</label><div class="kpi"><div class="v" id="imp">—</div></div></div>
      <div class="wide"><label>Notas</label><input name="notas" value="${esc(v.notas || '')}"></div></div>`;
  }
  function bindImporte(root) {
    const upd = () => {
      const t = S.cat.tarifas.find((x) => String(x.id) === val(root, 'tarifa_id')); const q = Number(String(val(root, 'cantidad')).replace(/,/g, ''));
      root.querySelector('#imp').textContent = t && q > 0 ? pesos(Math.round(q * Math.round(t.precio * 100)) / 100) : '—';
    };
    root.addEventListener('input', upd); root.addEventListener('change', upd); upd();
    const tk = root.querySelector('[name=truck_id]');
    tk.addEventListener('change', () => { const t = S.cat.trucks.find((x) => String(x.id) === tk.value); if (t && t.chofer_id) root.querySelector('[name=driver_id]').value = t.chofer_id; });
  }
  const AVISO = { fecha_escrita_distinta: 'La fecha escrita a mano no coincide con la impresa por la báscula: se usó la impresa.', neto_no_cuadra: 'Bruto menos tara no da el neto impreso: revisa el peso.',
    tara_manual: 'La tara se capturó a mano en la báscula.', placas_distintas: 'Las placas escritas no coinciden con las impresas.', otro_transportista: 'El sello no dice Grupo NeoHaul como transportista.',
    peso_fuera_de_rango: 'El peso leído no es razonable: escríbelo.' };
  function lecturaHtml(p, sug) {
    const row = (l, x) => (x ? `<tr><td class="muted">${l}</td><td>${esc(x)}</td></tr>` : '');
    const tk = sug && sug.truck_id ? (S.cat.trucks.find((t) => t.id === sug.truck_id) || {}).unidad : null;
    return `<details class="card" open><summary><b>Lo que leyó la app</b></summary><table style="margin-top:6px">${row('Vale No.', p.vale_no)}${row('Folio báscula', p.folio)}${row('Pedido', p.pedido)}
      ${row('Fecha impresa', [p.fecha_impresa, p.hora].filter(Boolean).join(' '))}${row('Fecha escrita', p.fecha_escrita)}${row('Placas', [p.placas, p.placas_escritas].filter(Boolean).join(' / '))}
      ${row('Cliente', p.cliente)}${row('Producto', p.producto)}${row('Destino', p.destino)}${row('Operador', p.operador)}${row('Temperatura', p.temperatura)}
      ${row('Bruto / tara / neto', [p.peso_bruto, p.peso_tara, p.peso_neto].filter(Boolean).join(' · '))}
      ${row('Toneladas', p.toneladas != null ? qty(p.toneladas) + ' t' + (p.origen_toneladas === 'kg_a_t' ? ' (neto en kg ÷ 1000)' : '') : null)}</table>
      ${(p.avisos || []).map((a) => `<div class="note">${esc(AVISO[a] || a)}</div>`).join('')}
      ${p.placas && !tk ? '<div class="note">Ningún camión tiene esas placas en Catálogos: agrégalas y la próxima vez se elige solo.</div>' : ''}</details>`;
  }
  async function abrirViaje(v, prop, fileId, leido, sug) {
    const m = modal(`<h2 style="margin-top:0">${v ? 'Editar viaje' : 'Registrar viaje'}</h2>
      ${fileId ? `<img class="ticket-img" src="api/v1/files/${fileId}" alt="Foto del ticket">` : ''}
      ${leido === 'modelo' ? `<div class="note">La app leyó el ticket${prop && prop.fecha_impresa ? ' (fecha impresa: ' + esc(prop.fecha_impresa) + ')' : ''}. Revisa cada dato contra la foto antes de confirmar.${prop && prop.toneladas == null ? ' No pude leer el peso neto: escríbelo.' : ''}</div>`
        : fileId ? '<div class="note">No pude leer el ticket automáticamente. Captura los datos viendo la foto.</div>' : ''}
      ${prop && leido === 'modelo' ? lecturaHtml(prop, sug) : ''}${viajeForm(v, prop, sug)}<div class="row" style="margin-top:12px">${v ? '<button class="btn primary" id="g">Guardar cambios</button>' : '<button class="btn primary" id="gc">Guardar y confirmar</button><button class="btn" id="g">Guardar sin confirmar</button>'}
      <button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
    bindImporte(m.querySelector('.box'));
    const save = (confirmar) => busy(null, async () => {
      const body = formData(m.querySelector('.box'));
      if (fileId) body.ticket_file_id = fileId;
      if (prop && !v) body.ocr = prop;
      body.confirmar = confirmar;
      try {
        if (v) await api('viajes/' + v.id, { method: 'PATCH', body }); else await api('viajes', { method: 'POST', body });
        m.remove(); go('viajes');
      } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
    });
    m.querySelector('#g').onclick = () => save(false);
    if (m.querySelector('#gc')) m.querySelector('#gc').onclick = () => save(true);
  }
  R.viajes = async function () {
    const desde = S.vDesde || lunes(), obra = S.vObra || '';
    const vs = await api(`viajes?desde=${desde}&hasta=${dias(desde, 6)}${obra ? '&obra_id=' + obra : ''}`);
    const tot = vs.reduce((a, v) => a + Math.round(Number(v.importe) * 100), 0) / 100;
    main().innerHTML = `<h1>Viajes</h1><p class="sub">Cada viaje se captura una sola vez: foto del ticket, revisar, confirmar.</p>
      ${canEdit() ? `<div class="card row"><label class="btn primary" style="margin:0">Subir foto del ticket<input type="file" id="foto" accept="image/*" capture="environment" hidden></label>
        <button class="btn" id="manual">Capturar sin foto</button><button class="btn" id="imp">Importar Excel de planta</button>
        ${S.me.ticket_reader ? '' : '<span class="muted" style="font-size:13px">Lectura automática apagada: se captura a mano.</span>'}</div>` : ''}
      <div class="row noprint" style="margin-bottom:10px"><input type="date" id="wk" value="${desde}" style="max-width:170px"><span class="muted">a ${fmtF(dias(desde, 6))}</span>
        <select id="ob" style="max-width:240px">${opts(S.cat.obras, (o) => o.nombre, obra, 'Todas las obras')}</select>
        <span><b>${vs.length}</b> viajes · <b>${pesos(tot)}</b></span>${canEdit() ? '<button class="btn small" id="conf">Confirmar seleccionados</button>' : ''}</div>
      <div class="card tbl"><table class="cards"><thead><tr><th></th><th>Fecha</th><th>Obra</th><th>Camión</th><th>Chofer</th><th>Ticket</th><th class="n">Cantidad</th><th class="n">Importe</th><th>Estado</th><th></th></tr></thead><tbody>
      ${vs.map((v) => `<tr><td data-l="">${v.estado === 'capturado' && canEdit() ? `<input type="checkbox" data-sel="${v.id}" style="width:auto">` : ''}</td>
        <td data-l="Fecha">${fmtF(v.fecha)}</td><td data-l="Obra">${esc(v.obra)}</td><td data-l="Camión">${esc(v.camion || '—')}</td><td data-l="Chofer">${esc(v.chofer || '—')}</td>
        <td data-l="Ticket">${esc(v.ticket_no || '—')}${v.ticket_file_id ? ` <a href="api/v1/files/${v.ticket_file_id}" target="_blank" rel="noopener">foto</a>` : ''}</td>
        <td class="n" data-l="Cantidad">${qty(v.cantidad)} ${UN[v.unidad]}</td><td class="n" data-l="Importe">${pesos(v.importe)}</td>
        <td data-l="Estado"><span class="pill ${v.estado === 'confirmado' ? 'ok' : 'warn'}">${v.estado}</span>${v.estimacion_id ? ' <span class="pill acc">en estimación</span>' : ''}</td>
        <td data-l="">${canEdit() && !v.estimacion_id ? `<button class="btn small" data-ed="${v.id}">Editar</button> <button class="btn small danger" data-del="${v.id}">Borrar</button>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="10" class="muted">Sin viajes esta semana.</td></tr>'}</tbody></table></div>`;
    document.getElementById('wk').onchange = (e) => { S.vDesde = lunes(e.target.value); R.viajes(); };
    document.getElementById('ob').onchange = (e) => { S.vObra = e.target.value; R.viajes(); };
    if (!canEdit()) return;
    document.getElementById('manual').onclick = () => abrirViaje(null, null, null, null);
    document.getElementById('foto').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('foto', file);
      const m = modal('<p>Leyendo el ticket…</p>');
      try { const r = await api('viajes/leer-ticket', { method: 'POST', body: fd }); m.remove(); abrirViaje(null, r.propuesta || {}, r.file_id, r.leido_por, r.sugerencias); }
      catch (er) { m.querySelector('.box').innerHTML = `<div class="err">${errMsg(er)}</div><button class="btn" data-close>Cerrar</button>`; }
    };
    document.getElementById('imp').onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Importar tickets de Excel</h2><p class="muted">El archivo debe tener columnas <b>Fecha</b>, <b>Ticket</b> y <b>Toneladas</b> (como el Excel «PLANTA SANT»). Todos quedan sin confirmar.</p>
        <div class="form"><div class="wide">${dropBox('archivo', '.xlsx,.csv', 'Arrastra aquí el Excel o CSV de planta, o toca para elegirlo')}</div>
        <div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, '', 'Elige')}</select></div>
        <div><label>Tarifa</label><select name="tarifa_id">${opts(activos('tarifas'), tarifaLbl, '', 'Elige')}</select></div>
        <div><label>Camión (opcional)</label><select name="truck_id">${opts(activos('trucks'), truckLbl, '', 'Sin camión')}</select></div>
        <div class="row wide"><button class="btn primary" id="go">Importar</button><button class="btn" data-close>Cerrar</button></div><div class="err wide"></div><div class="wide" id="res"></div></div>`);
      m.querySelector('#go').onclick = async () => {
        const fd = new FormData(); const f = m.querySelector('[name=archivo]').files[0]; if (!f) return;
        fd.append('archivo', f); ['obra_id', 'tarifa_id', 'truck_id'].forEach((k) => fd.append(k, val(m, k)));
        try {
          const r = await api('viajes/importar', { method: 'POST', body: fd });
          m.querySelector('#res').innerHTML = `<div class="okmsg">${r.creados} viajes creados, ${r.rechazados} rechazados.</div>` +
            r.resultados.filter((x) => !x.ok).map((x) => `<div class="muted">Renglón ${x.renglon}: ${esc(x.motivo)}${x.ticket ? ' (' + esc(x.ticket) + ')' : ''}</div>`).join('');
        } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      };
      m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) R.viajes(); });
    };
    document.getElementById('conf').onclick = async () => {
      const ids = [...main().querySelectorAll('[data-sel]:checked')].map((c) => c.dataset.sel); if (!ids.length) return;
      await api('viajes/confirmar', { method: 'POST', body: { ids } }); R.viajes();
    };
    main().onclick = async (e) => {
      const ed = e.target.closest('[data-ed]'), del = e.target.closest('[data-del]');
      if (ed) { const v = vs.find((x) => String(x.id) === ed.dataset.ed); abrirViaje(v, null, v.ticket_file_id, null); }
      if (del && confirm('¿Borrar este viaje?')) { try { await api('viajes/' + del.dataset.del, { method: 'DELETE' }); R.viajes(); } catch (er) { alert(errMsg(er)); } }
    };
  };

  /* ── estimaciones ── */
  R.estimaciones = async function () {
    const es = await api('estimaciones');
    const pasado = dias(lunes(), -7);
    main().innerHTML = `<h1>Estimaciones</h1><p class="sub">Se arman solas con los viajes confirmados de la semana, una por obra.</p>
      ${canEdit() ? `<div class="card"><form id="ne" class="form"><div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, '', 'Elige la obra')}</select></div>
        <div><label>Desde</label><input type="date" name="desde" value="${pasado}"></div><div><label>Hasta</label><input type="date" name="hasta" value="${dias(pasado, 6)}"></div>
        <div><button class="btn primary">Armar estimación</button></div><div class="err wide"></div></form></div>` : ''}
      <div class="card tbl"><table class="cards"><thead><tr><th>Obra</th><th>Periodo</th><th class="n">Viajes</th><th class="n">Subtotal</th><th>Estado</th><th></th></tr></thead><tbody>
      ${es.map((e) => {
        const txt = `Hola ${e.ingeniero || ''}. Te envío la estimación de ${e.obra} del ${fmtF(e.desde)} al ${fmtF(e.hasta)}: ${e.viajes} viajes, ${pesos(e.subtotal)} antes de IVA. Te adjunto el Excel y los vales. Saludos, Grupo NeoHaul.`;
        return `<tr><td data-l="Obra">${esc(e.obra)}</td><td data-l="Periodo">${fmtF(e.desde)} a ${fmtF(e.hasta)}</td><td class="n" data-l="Viajes">${e.viajes}</td><td class="n" data-l="Subtotal">${pesos(e.subtotal)}</td>
        <td data-l="Estado"><span class="pill ${{ borrador: 'warn', enviada: 'acc', aprobada: 'ok', facturada: '' }[e.estado]}">${e.estado}</span></td>
        <td data-l=""><div class="row"><button class="btn small" data-ver="${e.id}">Ver</button><a class="btn small" href="api/v1/estimaciones/${e.id}/excel">Excel</a>
          ${canEdit() && e.estado === 'borrador' ? `${e.ingeniero_tel ? `<a class="btn small wa" target="_blank" rel="noopener" data-env="${e.id}" href="${waLink(e.ingeniero_tel, txt)}">Enviar por WhatsApp</a>` : `<button class="btn small" data-env="${e.id}">Marcar enviada</button>`}<button class="btn small danger" data-del="${e.id}">Borrar</button>` : ''}
          ${canEdit() && e.estado === 'enviada' ? `<button class="btn small" data-apr="${e.id}">HTR aprobó</button>` : ''}
          ${canEdit() && e.estado === 'aprobada' && !e.factura_id ? `<button class="btn small primary" data-req="${e.id}">Pedir factura</button>` : ''}</div></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">Sin estimaciones.</td></tr>'}</tbody></table></div>`;
    const f = document.getElementById('ne');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api('estimaciones', { method: 'POST', body: formData(f) }); R.estimaciones(); }
      catch (er) { f.querySelector('.err').textContent = errMsg(er) + (er.capturados_sin_confirmar ? ` Hay ${er.capturados_sin_confirmar} viajes capturados sin confirmar en Viajes.` : ''); }
    };
    main().onclick = async (ev) => {
      const b = ev.target.closest('[data-ver],[data-env],[data-apr],[data-req],[data-del]'); if (!b) return;
      try {
        if (b.dataset.ver) {
          const e = await api('estimaciones/' + b.dataset.ver);
          modal(`<h2 style="margin-top:0">${esc(e.obra)} · ${fmtF(e.desde)} a ${fmtF(e.hasta)}</h2><p class="muted">${esc(e.cliente)} · ${esc(e.ingeniero || '')}</p>
            <div class="tbl"><table><thead><tr><th>Fecha</th><th>Ticket</th><th>Camión</th><th class="n">Cantidad</th><th class="n">Importe</th></tr></thead><tbody>
            ${e.viajes.map((v) => `<tr><td>${fmtF(v.fecha)}</td><td>${esc(v.ticket_no || '')}${v.ticket_file_id ? ` <a href="api/v1/files/${v.ticket_file_id}" target="_blank" rel="noopener">foto</a>` : ''}</td><td>${esc(v.camion || '')}</td>
              <td class="n">${qty(v.cantidad)} ${UN[v.unidad]}</td><td class="n">${pesos(v.importe)}</td></tr>`).join('')}
            <tr><td colspan="4" class="right"><b>Subtotal</b></td><td class="n"><b>${pesos(e.subtotal)}</b></td></tr></tbody></table></div>
            <div class="row" style="margin-top:10px"><button class="btn" onclick="window.print()">Imprimir</button><button class="btn" data-close>Cerrar</button></div>`);
          return;
        }
        if (b.dataset.env) await api('estimaciones/' + b.dataset.env, { method: 'PATCH', body: { estado: 'enviada' } });
        if (b.dataset.apr) await api('estimaciones/' + b.dataset.apr, { method: 'PATCH', body: { estado: 'aprobada' } });
        if (b.dataset.req) { await api(`estimaciones/${b.dataset.req}/requisicion`, { method: 'POST', body: {} }); location.hash = 'facturas'; return; }
        if (b.dataset.del) { if (!confirm('¿Borrar la estimación? Sus viajes quedan libres.')) return; await api('estimaciones/' + b.dataset.del, { method: 'DELETE' }); }
        setTimeout(R.estimaciones, b.dataset.env ? 400 : 0);
      } catch (er) { alert(errMsg(er)); }
    };
  };

  /* ── facturas ── */
  function requisicionHtml(f) {
    return `<h2 style="margin-top:0">Requisición de factura FOR-FYC-01</h2><table><tbody>
      <tr><th>Cliente</th><td>${esc(f.cliente)}</td></tr><tr><th>Obra</th><td>${esc(f.obra || '')} ${f.clave ? '(' + esc(f.clave) + ')' : ''}</td></tr>
      <tr><th>Fecha</th><td>${fmtF(f.fecha_requisicion)}</td></tr><tr><th>Solicitante</th><td>${esc(f.solicitante || '')}</td></tr><tr><th>Departamento</th><td>${esc(f.departamento || '')}</td></tr>
      <tr><th>Concepto</th><td>${esc(f.concepto)}</td></tr><tr><th>Cantidad</th><td>${qty(f.cantidad)} ${esc(f.unidad || '')}</td></tr>
      <tr><th>Precio unitario</th><td class="n">${pesos(f.precio_unitario)}</td></tr><tr><th>Subtotal</th><td class="n">${pesos(f.subtotal)}</td></tr>
      <tr><th>IVA 16%</th><td class="n">${pesos(f.iva)}</td></tr><tr><th>Retención 4%</th><td class="n">-${pesos(f.retencion)}</td></tr>
      <tr><th>Total</th><td class="n"><b>${pesos(f.total)}</b></td></tr></tbody></table>`;
  }
  R.facturas = async function () {
    const fs = await api('facturas');
    main().innerHTML = `<h1>Facturas</h1><p class="sub">Requisición con IVA y retención calculados → la auxiliar emite el CFDI → se anota el folio → se marca cobrada.</p>
      ${canEdit() ? `<details class="card"><summary><b>Requisición suelta</b> (renta diaria, servicio a empresa hermana…)</summary><form id="nf" class="form" style="margin-top:10px">
        <div><label>Cliente</label><select name="client_id">${opts(activos('clients'), (c) => c.nombre)}</select></div>
        <div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, '', 'Sin obra')}</select></div>
        <div class="wide"><label>Concepto</label><input name="concepto" placeholder="Renta diaria de camión de volteo"></div>
        <div><label>Cantidad</label><input name="cantidad" inputmode="decimal" value="1"></div><div><label>Unidad</label><input name="unidad" value="día"></div>
        <div><label>Precio unitario</label><input name="precio_unitario" inputmode="decimal"></div>
        <div><label>Solicitante</label><input name="solicitante"></div><div><label>Departamento</label><input name="departamento"></div>
        <div><label><input type="checkbox" name="aplica_retencion" checked style="width:auto"> Retención 4% por acarreo</label></div>
        <div><button class="btn primary">Crear requisición</button></div><div class="err wide"></div></form></details>` : ''}
      <div class="card tbl"><table class="cards"><thead><tr><th>Fecha</th><th>Cliente / obra</th><th>Concepto</th><th class="n">Subtotal</th><th class="n">Total</th><th>Folio</th><th>Estado</th><th></th></tr></thead><tbody>
      ${fs.map((f) => `<tr><td data-l="Fecha">${fmtF(f.fecha_requisicion)}</td><td data-l="Cliente">${esc(f.cliente)}<div class="muted">${esc(f.obra || '')}</div></td><td data-l="Concepto">${esc(f.concepto)}</td>
        <td class="n" data-l="Subtotal">${pesos(f.subtotal)}</td><td class="n" data-l="Total">${pesos(f.total)}</td><td data-l="Folio">${esc(f.folio || '—')}</td>
        <td data-l="Estado"><span class="pill ${{ requisicion: 'warn', emitida: 'acc', cobrada: 'ok', cancelada: 'bad' }[f.estado]}">${f.estado}</span></td>
        <td data-l=""><div class="row"><button class="btn small" data-req="${f.id}">Requisición</button>
          ${canEdit() && f.estado === 'requisicion' ? `<button class="btn small primary" data-folio="${f.id}">Anotar folio</button>` : ''}
          ${canEdit() && f.estado === 'emitida' ? `<button class="btn small primary" data-cob="${f.id}">Cobrada</button>` : ''}
          ${canEdit() && ['requisicion', 'emitida'].includes(f.estado) ? `<button class="btn small danger" data-can="${f.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')
      || '<tr><td colspan="8" class="muted">Sin facturas.</td></tr>'}</tbody></table></div>`;
    const f = document.getElementById('nf');
    if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await api('facturas', { method: 'POST', body: formData(f) }); R.facturas(); } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
    main().onclick = async (e) => {
      const b = e.target.closest('[data-req],[data-folio],[data-cob],[data-can]'); if (!b) return;
      const fa = fs.find((x) => String(x.id) === (b.dataset.req || b.dataset.folio || b.dataset.cob || b.dataset.can));
      try {
        if (b.dataset.req) return void modal(requisicionHtml(fa) + '<div class="row noprint" style="margin-top:10px"><button class="btn" onclick="window.print()">Imprimir</button><button class="btn" data-close>Cerrar</button></div>');
        if (b.dataset.folio) {
          const m = modal(`<h2 style="margin-top:0">Folio de la factura</h2><div class="form"><div><label>Folio CFDI</label><input name="folio"></div><div><label>Fecha de emisión</label><input type="date" name="fecha_emision" value="${hoy()}"></div>
            <div class="row wide"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
          m.querySelector('#ok').onclick = async () => { try { await api('facturas/' + fa.id, { method: 'PATCH', body: { estado: 'emitida', folio: val(m, 'folio'), fecha_emision: val(m, 'fecha_emision') } }); m.remove(); R.facturas(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
          return;
        }
        if (b.dataset.cob) await api('facturas/' + fa.id, { method: 'PATCH', body: { estado: 'cobrada' } });
        if (b.dataset.can) { if (!confirm('¿Cancelar esta factura?')) return; await api('facturas/' + fa.id, { method: 'PATCH', body: { estado: 'cancelada' } }); }
        R.facturas();
      } catch (er) { alert(errMsg(er)); }
    };
  };

  /* ── gastos y diésel ── */
  async function abrirCargas(gastoId) {
    const d = await api('diesel/' + gastoId);
    const tr = activos('trucks');
    const resumen = (x) => Object.entries(x.por_camion).map(([k, v]) => `<div>${esc(k)}: ${v.cargas} cargas · ${qty(v.litros)} L · <b>${pesos(v.total)}</b></div>`).join('');
    const m = modal(`<h2 style="margin-top:0">${esc(d.gasto.proveedor)} ${esc(d.gasto.folio || '')} · ${pesos(d.total)}</h2>
      <p class="muted">Elige el camión de cada carga. La gasolina premium suele ser de camionetas: déjala sin camión si no es de uno de la lista (cuenta como gasto general).</p>
      ${canEdit() ? `<div class="row" style="margin-bottom:8px"><select id="bulk" style="max-width:260px">${opts(tr, (t) => t.empresa + ' · ' + truckLbl(t), '', 'Camión para las marcadas')}</select><button class="btn small" id="bulkgo">Aplicar a las marcadas</button></div>` : ''}
      <div class="tbl"><table class="cards"><thead><tr><th></th><th>Fecha</th><th>Hora</th><th>Despacho</th><th>Producto</th><th class="n">Litros</th><th class="n">Total</th><th>Camión</th></tr></thead><tbody>
      ${d.cargas.map((c) => `<tr><td data-l="">${canEdit() ? `<input type="checkbox" data-mk="${c.id}" style="width:auto">` : ''}</td><td data-l="Fecha">${fmtF(c.fecha)}</td><td data-l="Hora">${esc(c.hora || '')}</td>
        <td data-l="Despacho">${esc(c.folio_despacho)}</td><td data-l="Producto">${esc(c.producto)}</td><td class="n" data-l="Litros">${qty(c.litros)}</td><td class="n" data-l="Total">${pesos(c.total)}</td>
        <td data-l="Camión">${canEdit() ? `<select data-ct="${c.id}">${opts(tr, truckLbl, c.truck_id, 'Sin camión')}</select>` : esc(c.camion || 'Sin camión')}</td></tr>`).join('')}</tbody></table></div>
      <div id="res" style="margin-top:8px">${resumen(d)}</div>
      <div class="row" style="margin-top:10px">${canEdit() ? '<button class="btn primary" id="ok">Guardar</button>' : ''}<button class="btn" data-close>Cerrar</button></div><div class="err"></div>`);
    const bg = m.querySelector('#bulkgo');
    if (bg) bg.onclick = () => { const k = m.querySelector('#bulk').value; m.querySelectorAll('[data-mk]:checked').forEach((cb) => { m.querySelector(`[data-ct="${cb.dataset.mk}"]`).value = k; cb.checked = false; }); };
    const ok = m.querySelector('#ok');
    if (ok) ok.onclick = () => busy(null, async () => {
      const asignaciones = [...m.querySelectorAll('[data-ct]')].map((sl) => ({ id: sl.dataset.ct, truck_id: sl.value || null }));
      try { const r = await api(`diesel/${gastoId}/cargas`, { method: 'PUT', body: { asignaciones } }); m.querySelector('#res').innerHTML = resumen(r) + '<div class="okmsg">Guardado.</div>'; }
      catch (er) { m.querySelector('.err').textContent = errMsg(er); }
    });
    m.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]') && S.view === 'gastos') R.gastos(); });
  }
  R.gastos = async function () {
    const est = S.gEstado || '';
    const gs = await api('gastos' + (est ? '?estado=' + est : ''));
    const tr = activos('trucks');
    main().innerHTML = `<h1>Gastos y diésel</h1><p class="sub">Cada factura de proveedor va a un camión u obra. La factura de la gasolinera se sube completa y cada carga se asigna a su camión.</p>
      <div class="card row noprint">${canEdit() ? '<button class="btn primary" id="gdiesel">Subir factura de diésel (PDF o XML)</button><button class="btn" id="gpps">Cargar PPS (Excel)</button>' : ''}<a class="btn" href="api/v1/gastos/pps.xlsx?semana=${lunes()}">Descargar PPS de esta semana</a></div>
      ${canEdit() ? `<details class="card"><summary><b>Nuevo gasto</b></summary><form id="ng" class="form" style="margin-top:10px">
        <div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"></div><div><label>Proveedor</label><input name="proveedor" required></div>
        <div><label>Folio</label><input name="folio"></div><div><label>Categoría</label><select name="categoria">${['diesel', 'refacciones', 'taller', 'llantas', 'casetas', 'otros'].map((c) => `<option>${c}</option>`).join('')}</select></div>
        <div><label>Total</label><input name="total" inputmode="decimal" required></div><div><label>Saldo (si ya se abonó)</label><input name="saldo" inputmode="decimal" placeholder="igual al total"></div>
        <div><label>Camión</label><select name="truck_id">${opts(tr, truckLbl, '', 'General / repartir después')}</select></div>
        <div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, '', 'Sin obra')}</select></div>
        <div class="wide"><label>Concepto</label><input name="concepto"></div><div class="wide"><label>Factura (foto o PDF, opcional)</label><input type="file" name="archivo" accept="image/*,application/pdf"></div>
        <div><button class="btn primary">Guardar gasto</button></div><div class="err wide"></div></form></details>` : ''}
      <div class="row" style="margin-bottom:10px"><select id="fe" style="max-width:200px">${['', 'pendiente', 'programado', 'pagado'].map((s) => `<option value="${s}"${s === est ? ' selected' : ''}>${s || 'Todos'}</option>`).join('')}</select></div>
      <div class="card tbl"><table class="cards"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Categoría</th><th>A qué va</th><th class="n">Total</th><th class="n">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${gs.map((g) => `<tr><td data-l="Fecha">${fmtF(g.fecha)}</td><td data-l="Proveedor">${esc(g.proveedor)}<div class="muted">${esc(g.folio || '')} ${esc(g.concepto || '')}</div></td><td data-l="Categoría">${esc(g.categoria)}</td>
        <td data-l="A qué va">${g.cargas ? (g.cargas_sin_camion ? `<span class="pill warn">${g.cargas_sin_camion} de ${g.cargas} cargas sin camión</span>` : `<span class="pill ok">${g.cargas} cargas asignadas</span>`) : g.camion ? esc(g.camion) : g.reparto.length ? `Repartido en ${g.reparto.length} camiones` : g.obra ? esc(g.obra) : '<span class="pill warn">General</span>'}${g.cc && g.cc !== 'GENERAL' ? `<div class="muted">CC ${esc(g.cc)}</div>` : ''}</td>
        <td class="n" data-l="Total">${pesos(g.total)}</td><td class="n" data-l="Saldo">${pesos(g.saldo)}</td>
        <td data-l="Estado"><span class="pill ${{ pendiente: 'warn', programado: 'acc', pagado: 'ok' }[g.estado]}">${g.estado}</span>${g.estado === 'programado' ? `<div class="muted">${pesos(g.monto_propuesto)} sem. ${fmtF(g.semana_pago)}</div>` : ''}</td>
        <td data-l=""><div class="row">${g.file_id ? `<a class="btn small" href="api/v1/files/${g.file_id}" target="_blank" rel="noopener">Factura</a>` : ''}
          ${g.cargas ? `<button class="btn small${g.cargas_sin_camion ? ' primary' : ''}" data-car="${g.id}">Cargas por camión</button>` : canEdit() && !g.truck_id ? `<button class="btn small" data-rep="${g.id}">Repartir por km</button>` : ''}
          ${canEdit() && g.estado === 'pendiente' ? `<button class="btn small" data-prog="${g.id}">Programar pago</button>` : ''}
          ${canEdit() && g.estado === 'programado' ? `<button class="btn small primary" data-pag="${g.id}">Pagado</button>` : ''}</div></td></tr>`).join('')
      || '<tr><td colspan="8" class="muted">Sin gastos.</td></tr>'}</tbody></table></div>`;
    document.getElementById('fe').onchange = (e) => { S.gEstado = e.target.value; R.gastos(); };
    const f = document.getElementById('ng');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const body = formData(f); delete body.archivo;
        const file = f.querySelector('[name=archivo]').files[0];
        if (file) { const fd = new FormData(); fd.append('archivo', file); fd.append('kind', 'factura'); body.file_id = (await api('archivos', { method: 'POST', body: fd })).file_id; }
        await api('gastos', { method: 'POST', body }); R.gastos();
      } catch (er) { f.querySelector('.err').textContent = errMsg(er); }
    };
    const gd = document.getElementById('gdiesel'), gp = document.getElementById('gpps');
    if (gd) gd.onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Factura de la gasolinera</h2><p class="muted">El PDF o XML del CFDI (como el de Estación de Servicio J6). Cada carga entra con su folio de despacho, fecha, hora y litros. Si la factura ya está en el PPS, se le agregan las cargas en vez de duplicarla.</p>
        ${dropBox('archivo', '.pdf,.xml,application/pdf,text/xml', 'Arrastra aquí el PDF o XML, o toca para elegirlo')}<div class="row" style="margin-top:10px"><button class="btn primary" id="go">Importar</button><button class="btn" data-close>Cerrar</button></div><div class="err"></div><div id="res"></div>`);
      m.querySelector('#go').onclick = () => busy(null, async () => {
        const f = m.querySelector('[name=archivo]').files[0]; if (!f) return;
        const fd = new FormData(); fd.append('archivo', f);
        try {
          const r = await api('diesel/importar', { method: 'POST', body: fd });
          m.querySelector('#res').innerHTML = `<div class="okmsg">${esc(r.proveedor || '')} ${esc(r.folio || '')}: ${r.cargas} cargas, ${qty(r.litros)} L, ${pesos(r.total)}. Cuadra con el total de la factura.</div>
            ${r.adjuntado_a_existente ? '<div class="note">Se agregó a la factura que ya estaba en cuentas por pagar.</div>' : ''}${r.reparto_km_reemplazado ? '<div class="note">Reemplazó el reparto por km que tenía.</div>' : ''}
            ${!r.placas_tarjeta ? `<div class="note">La factura no dice qué camión hizo cada carga${r.tarjeta ? ' (tarjeta ' + esc(r.tarjeta) + ' es de toda la empresa)' : ''}. Asígnalas ahora.</div>` : ''}
            <button class="btn primary" data-car="${r.gasto_id}">Asignar cargas a camiones</button>`;
        } catch (er) { m.querySelector('.err').textContent = errMsg(er) + (er && er.calculado ? ` Factura ${pesos(er.factura.total)}, cargas ${pesos(er.calculado.total)}.` : ''); }
      });
      m.addEventListener('click', (ev) => { const c = ev.target.closest('[data-car]'); if (c) { m.remove(); abrirCargas(Number(c.dataset.car)); } else if (ev.target.closest('[data-close]')) R.gastos(); });
    };
    if (gp) gp.onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Cargar la propuesta de pagos (PPS)</h2><p class="muted">El Excel de la semana con sus 16 columnas (ORDEN … PROPUESTA). Las facturas nuevas se agregan, las que ya están se actualizan con su saldo. Lo que ya asignaste a un camión u obra no se toca.</p>
        ${dropBox('archivo', '.xlsx,.csv', 'Arrastra aquí el Excel del PPS, o toca para elegirlo')}<div class="row" style="margin-top:10px"><button class="btn primary" id="go">Cargar</button><button class="btn" data-close>Cerrar</button></div><div class="err"></div><div id="res"></div>`);
      m.querySelector('#go').onclick = () => busy(null, async () => {
        const f = m.querySelector('[name=archivo]').files[0]; if (!f) return;
        const fd = new FormData(); fd.append('archivo', f);
        try {
          const r = await api('gastos/importar-pps', { method: 'POST', body: fd });
          m.querySelector('#res').innerHTML = `<div class="okmsg">${r.creadas} nuevas, ${r.actualizadas} actualizadas. Saldo: ${pesos(r.resumen.saldo)} en ${r.resumen.facturas} facturas.</div>
            ${r.control ? (r.control.cuadra ? '<div class="okmsg">Cuadra con el renglón de totales de su hoja.</div>' : `<div class="err">No cuadra con su renglón de totales (${pesos(r.control.saldo)}).</div>`) : ''}
            ${r.rechazadas.map((x) => `<div class="muted">Renglón ${x.renglon} (${esc(x.folio || '')}): ${esc(x.motivo)}</div>`).join('')}
            ${r.no_vienen.length ? `<div class="note">${r.no_vienen.length} facturas del PPS anterior ya no vienen (¿pagadas?): ${r.no_vienen.slice(0, 12).map((x) => esc(x.proveedor + ' ' + (x.folio || ''))).join(', ')}. Márcalas tú; no se cambian solas.</div>` : ''}`;
        } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      });
      m.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) R.gastos(); });
    };
    main().onclick = async (e) => {
      const car = e.target.closest('[data-car]'); if (car) return abrirCargas(Number(car.dataset.car));
      const b = e.target.closest('[data-rep],[data-prog],[data-pag]'); if (!b) return;
      const g = gs.find((x) => String(x.id) === (b.dataset.rep || b.dataset.prog || b.dataset.pag));
      if (b.dataset.rep) {
        const propios = activos('trucks').filter((t) => t.propio);
        const m = modal(`<h2 style="margin-top:0">Repartir ${pesos(g.total)} · ${esc(g.proveedor)}</h2><div class="note">Escribe los kilómetros de cada camión en el periodo de la factura. Mientras el GPS no esté conectado, los km se capturan a mano.</div>
          <div class="form">${propios.map((t) => { const r = g.reparto.find((x) => x.truck_id === t.id); return `<div><label>${esc(t.unidad)}</label><input data-km="${t.id}" inputmode="decimal" value="${r ? Number(r.km) : ''}"></div>`; }).join('')}
          <div class="row wide"><button class="btn primary" id="ok">Repartir</button><button class="btn" data-close>Cerrar</button></div><div class="err wide"></div><div class="wide" id="res"></div></div>`);
        m.querySelector('#ok').onclick = async () => {
          const filas = [...m.querySelectorAll('[data-km]')].map((i) => ({ truck_id: i.dataset.km, km: i.value })).filter((x) => x.km);
          try {
            const r = await api(`gastos/${g.id}/reparto`, { method: 'PUT', body: { filas } });
            m.querySelector('#res').innerHTML = r.reparto.map((p) => `<div>${esc((S.cat.trucks.find((t) => t.id === p.truck_id) || {}).unidad)}: ${qty(p.km)} km → <b>${pesos(p.monto)}</b></div>`).join('') + `<div class="okmsg">Total repartido: ${pesos(r.total)}</div>`;
          } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
        };
        m.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) R.gastos(); });
        return;
      }
      if (b.dataset.prog) {
        const m = modal(`<h2 style="margin-top:0">Programar pago · ${esc(g.proveedor)}</h2><div class="form"><div><label>Monto (saldo ${pesos(g.saldo)})</label><input name="monto_propuesto" inputmode="decimal" value="${Number(g.saldo)}"></div>
          <div><label>Semana de pago</label><input type="date" name="semana_pago" value="${lunes()}"></div><div class="row wide"><button class="btn primary" id="ok">Programar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
        m.querySelector('#ok').onclick = async () => { try { await api('gastos/' + g.id, { method: 'PATCH', body: { estado: 'programado', monto_propuesto: val(m, 'monto_propuesto'), semana_pago: val(m, 'semana_pago') } }); m.remove(); R.gastos(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
        return;
      }
      if (b.dataset.pag) { try { await api('gastos/' + g.id, { method: 'PATCH', body: { estado: 'pagado' } }); R.gastos(); } catch (er) { alert(errMsg(er)); } }
    };
  };

  /* ── nómina ── */
  R.nomina = async function () {
    const n = await api('nomina?semana=' + (S.nSemana || lunes()));
    main().innerHTML = `<h1>Nómina</h1><p class="sub">Semana del ${fmtF(n.semana)} al ${fmtF(n.hasta)}. La comisión sale de los viajes confirmados de cada chofer.</p>
      <div class="note">La regla exacta del 8% al 10% (según cuántos viajes hace el chofer ese día en esa obra) está por confirmar con NeoHaul. Por ahora el porcentaje se elige por chofer.</div>
      <div class="row" style="margin-bottom:10px"><input type="date" id="wk" value="${n.semana}" style="max-width:180px">${canEdit() ? '<button class="btn" id="cerrar">Cerrar semana</button>' : ''}</div>
      ${n.filas.length ? n.filas.map((r) => `<div class="card" data-row="${r.driver_id}"><div class="row" style="justify-content:space-between"><b>${esc(r.nombre)}</b><span class="muted">${r.puesto} · ${r.viajes} viajes · base ${pesos(r.base_actual)}</span>
        ${r.cerrada ? '<span class="pill ok">cerrada</span>' : r.nuevo ? '<span class="pill warn">sin guardar</span>' : ''}</div>
        <div class="form" style="margin-top:8px">${DIAS.map((d) => `<div><label>${d}</label><select name="d_${d}" ${r.cerrada ? 'disabled' : ''}><option value="">—</option>${Object.entries(INC).map(([k, l]) => `<option value="${k}"${(r.dias || {})[d] === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}
          <div><label>Salario semanal</label><input name="salario" inputmode="decimal" value="${r.salario == null ? '' : Number(r.salario)}" ${r.cerrada ? 'disabled' : ''}></div>
          <div><label>Bonos</label><input name="bonos" inputmode="decimal" value="${Number(r.bonos || 0)}" ${r.cerrada ? 'disabled' : ''}></div>
          <div><label>Nota del bono</label><input name="bonos_nota" value="${esc(r.bonos_nota || '')}" placeholder="foráneo, transporte…" ${r.cerrada ? 'disabled' : ''}></div>
          ${r.puesto === 'chofer' ? `<div><label>Comisión %</label><select name="comision_pct" ${r.cerrada ? 'disabled' : ''}>${[8, 9, 10].map((p) => `<option${Number(r.comision_pct) === p ? ' selected' : ''}>${p}</option>`).join('')}</select></div>
          <div><label>Comisión</label><div class="kpi"><div class="v">${pesos(r.comision)}</div></div></div>` : ''}
          <div><label>Total</label><div class="kpi"><div class="v">${pesos(r.total)}</div></div></div>
          ${canEdit() && !r.cerrada ? '<div><button class="btn primary" data-save>Guardar</button></div>' : ''}</div></div>`).join('')
      : '<p class="muted">No hay personal de NeoHaul en Catálogos > Choferes.</p>'}`;
    document.getElementById('wk').onchange = (e) => { S.nSemana = lunes(e.target.value); R.nomina(); };
    const c = document.getElementById('cerrar');
    if (c) c.onclick = async () => { if (!confirm('¿Cerrar la semana? Ya no se podrá editar.')) return; await api('nomina/cerrar', { method: 'POST', body: { semana: n.semana } }); R.nomina(); };
    main().onclick = async (e) => {
      if (!e.target.closest('[data-save]')) return;
      const card = e.target.closest('[data-row]'); const body = { driver_id: card.dataset.row, semana: n.semana, dias: {} };
      DIAS.forEach((d) => { body.dias[d] = val(card, 'd_' + d); });
      ['salario', 'bonos', 'bonos_nota', 'comision_pct'].forEach((k) => { const v = val(card, k); if (v !== undefined) body[k] = v; });
      try { await api('nomina', { method: 'PUT', body }); R.nomina(); } catch (er) { alert(errMsg(er)); }
    };
  };

  /* ── taller ── */
  R.taller = async function () {
    const ss = await api('taller');
    main().innerHTML = `<h1>Taller</h1><p class="sub">Cada servicio queda en el camión con horas, refacciones y costo. Si es de una empresa hermana, queda por cobrar.</p>
      ${canEdit() ? `<details class="card"><summary><b>Nuevo servicio</b></summary><form id="ns" class="form" style="margin-top:10px">
        <div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"></div><div><label>Cliente</label><input name="cliente" value="NeoHaul"></div>
        <div><label>Camión de la flota</label><select name="truck_id">${opts(activos('trucks'), (t) => `${t.empresa} · ${truckLbl(t)}`, '', 'Otra unidad')}</select></div>
        <div><label>Otra unidad</label><input name="unidad_externa" placeholder="Pipa HPA 03"></div><div><label>Mecánico</label><input name="mecanico" value="Emilio Salazar"></div>
        <div><label>Supervisor</label><input name="supervisor"></div><div class="wide"><label>Trabajos realizados</label><textarea name="trabajos" required></textarea></div>
        <div><label>Horas</label><input name="horas" inputmode="decimal"></div><div><label>Km</label><input name="km" inputmode="decimal"></div>
        <div><label>Refacciones $</label><input name="refacciones" inputmode="decimal"></div><div><label>Mano de obra $</label><input name="mano_obra" inputmode="decimal"></div>
        <div><button class="btn primary">Guardar</button></div><div class="err wide"></div></form></details>` : ''}
      <div class="card tbl"><table class="cards"><thead><tr><th>Fecha</th><th>Cliente</th><th>Unidad</th><th>Trabajos</th><th class="n">Horas</th><th class="n">Total</th><th>Estado</th><th></th></tr></thead><tbody>
      ${ss.map((s) => `<tr><td data-l="Fecha">${fmtF(s.fecha)}</td><td data-l="Cliente">${esc(s.cliente)}</td><td data-l="Unidad">${esc(s.camion || s.unidad_externa || '—')}</td><td data-l="Trabajos">${esc(s.trabajos)}</td>
        <td class="n" data-l="Horas">${s.horas == null ? '—' : qty(s.horas)}</td><td class="n" data-l="Total">${pesos(s.total)}</td>
        <td data-l="Estado"><span class="pill ${{ registrado: '', por_cobrar: 'warn', cobrado: 'ok' }[s.estado]}">${s.estado.replace('_', ' ')}</span></td>
        <td data-l="">${canEdit() && s.estado === 'por_cobrar' ? `<button class="btn small" data-cob="${s.id}">Cobrado</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin servicios.</td></tr>'}</tbody></table></div>`;
    const f = document.getElementById('ns');
    if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await api('taller', { method: 'POST', body: formData(f) }); R.taller(); } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
    main().onclick = async (e) => { const b = e.target.closest('[data-cob]'); if (b) { await api('taller/' + b.dataset.cob, { method: 'PATCH', body: { estado: 'cobrado' } }); R.taller(); } };
  };

  /* ── catálogos ── */
  const CATS = {
    trucks: ['Camiones', [['empresa', 'Empresa', 'sel', ['NeoHaul', 'TTS', 'SEMAQSA', 'Externo']], ['unidad', 'Número económico (ej. 07)'], ['tipo', 'Tipo'], ['capacidad_m3', 'm³'], ['placas', 'Placas'], ['chofer_id', 'Chofer habitual', 'driver'], ['notas', 'Notas'], ['active', 'Activo', 'chk']]],
    drivers: ['Choferes y mecánicos', [['nombre', 'Nombre'], ['telefono', 'WhatsApp (10 dígitos = México; otro país con +lada)'], ['empresa', 'Empresa', 'sel', ['NeoHaul', 'TTS', 'SEMAQSA', 'Externo']], ['puesto', 'Puesto', 'sel', ['chofer', 'mecanico']], ['salario_semanal', 'Salario semanal'], ['active', 'Activo', 'chk']]],
    obras: ['Obras', [['nombre', 'Nombre'], ['clave', 'Clave'], ['client_id', 'Cliente', 'client'], ['ingeniero', 'Ingeniero'], ['ingeniero_tel', 'WhatsApp del ingeniero (10 dígitos = México)'], ['active', 'Activa', 'chk']]],
    tarifas: ['Tarifas', [['nombre', 'Nombre'], ['material', 'Material'], ['origen', 'Origen'], ['destino', 'Destino'], ['unidad', 'Cobro por', 'sel', ['tonelada', 'dia', 'viaje']], ['precio', 'Precio'], ['por_confirmar', 'Por confirmar', 'chk'], ['nota', 'Nota'], ['active', 'Activa', 'chk']]],
    clients: ['Clientes', [['nombre', 'Nombre'], ['rfc', 'RFC'], ['active', 'Activo', 'chk']]]
  };
  function field([k, l, t, o], r) {
    const v = r ? r[k] : (t === 'chk' ? true : '');
    if (t === 'chk') return `<div><label><input type="checkbox" name="${k}" style="width:auto"${v ? ' checked' : ''}> ${l}</label></div>`;
    if (t === 'sel') return `<div><label>${l}</label><select name="${k}">${o.map((x) => `<option${String(v) === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`;
    if (t === 'driver') return `<div><label>${l}</label><select name="${k}">${opts(S.cat.drivers, (d) => d.nombre, v, 'Ninguno')}</select></div>`;
    if (t === 'client') return `<div><label>${l}</label><select name="${k}">${opts(S.cat.clients, (c) => c.nombre, v)}</select></div>`;
    return `<div><label>${l}</label><input name="${k}" value="${esc(v == null ? '' : v)}"></div>`;
  }
  R.catalogos = async function () {
    await loadCat(true);
    const tab = S.catTab || 'trucks', [titulo, fields] = CATS[tab];
    const rows = S.cat[tab];
    main().innerHTML = `<h1>Catálogos</h1><div class="row" style="margin-bottom:12px">${Object.entries(CATS).map(([k, [l]]) => `<button class="btn small${k === tab ? ' primary' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      ${canEdit() && tab === 'drivers' ? `<div class="card"><h2 style="margin-top:0">Pegar una lista de choferes</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Un nombre y su WhatsApp por persona (el número puede ir en la misma línea o abajo). 10 dígitos = México. Primero se revisa; no se duplica a nadie.</p>
        <textarea id="lst" rows="6" style="width:100%" placeholder="Juan Pérez López 8112345678"></textarea>
        <div class="row" style="margin-top:8px"><select id="lstEmp">${['NeoHaul', 'TTS', 'SEMAQSA', 'Externo'].map((e) => `<option>${e}</option>`).join('')}</select><button class="btn" id="lstVer">Revisar</button><button class="btn primary" id="lstOk" disabled>Agregar los nuevos</button></div><div id="lstRes"></div></div>` : ''}
      ${canEdit() ? `<div class="card"><h2 style="margin-top:0" id="ftit">Agregar a ${titulo.toLowerCase()}</h2><form id="cf" class="form">${fields.map((f) => field(f)).join('')}
        <div class="row"><button class="btn primary">Guardar</button><button type="button" class="btn" id="limpiar">Nuevo</button></div><div class="err wide"></div></form></div>` : ''}
      <div class="card tbl"><table class="cards"><thead><tr>${fields.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${fields.map(([k, l, t]) => `<td data-l="${l}">${t === 'chk' ? (r[k] ? 'Sí' : 'No') : t === 'driver' ? esc((S.cat.drivers.find((d) => d.id === r[k]) || {}).nombre || '—')
        : t === 'client' ? esc((S.cat.clients.find((c) => c.id === r[k]) || {}).nombre || '') : k === 'precio' ? pesos(r[k]) : esc(r[k] == null ? '' : r[k])}</td>`).join('')}
        <td>${canEdit() ? `<button class="btn small" data-ed="${r.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    let editing = null;
    main().onclick = (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { S.catTab = t.dataset.tab; return R.catalogos(); }
      const ed = e.target.closest('[data-ed]');
      if (ed) {
        editing = rows.find((r) => String(r.id) === ed.dataset.ed);
        document.getElementById('cf').innerHTML = fields.map((f) => field(f, editing)).join('') + '<div class="row"><button class="btn primary">Guardar cambios</button><button type="button" class="btn" id="limpiar">Nuevo</button></div><div class="err wide"></div>';
        document.getElementById('ftit').textContent = 'Editar';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (e.target.id === 'limpiar') { editing = null; R.catalogos(); }
      if (e.target.id === 'lstVer' || e.target.id === 'lstOk') lista(e.target.id === 'lstOk');
    };
    async function lista(aplicar) {
      const out = document.getElementById('lstRes'), EST = { nuevo: ['ok', 'nuevo'], ya_existe: ['', 'ya existe'], repetido: ['', 'repetido en la lista'], telefono_invalido: ['bad', 'teléfono inválido'] };
      try {
        const r = await api('drivers/importar', { method: 'POST', body: { texto: document.getElementById('lst').value, empresa: document.getElementById('lstEmp').value, aplicar } });
        out.innerHTML = `<table class="cards" style="margin-top:8px"><thead><tr><th>Nombre</th><th>WhatsApp</th><th></th></tr></thead><tbody>${r.filas.map((f) => `<tr><td data-l="Nombre">${esc(f.nombre)}</td><td data-l="WhatsApp">${esc(f.telefono || f.telefono_crudo)}</td><td><span class="pill ${EST[f.estado][0]}">${EST[f.estado][1]}</span></td></tr>`).join('')}</tbody></table>
          ${r.sin_pareja.length ? `<div class="note">No entendí: ${esc(r.sin_pareja.join(' · '))}</div>` : ''}${aplicar ? `<div class="note">Se agregaron ${r.creados}.</div>` : ''}`;
        document.getElementById('lstOk').disabled = aplicar || !r.filas.some((f) => f.estado === 'nuevo');
        if (aplicar) { await loadCat(true); setTimeout(() => R.catalogos(), 1200); }
      } catch (er) { out.innerHTML = `<div class="err">${errMsg(er)}</div>`; }
    }
    const f = document.getElementById('cf');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api(editing ? `${tab}/${editing.id}` : tab, { method: editing ? 'PATCH' : 'POST', body: formData(f) }); await loadCat(true); editing = null; R.catalogos(); }
      catch (er) { f.querySelector('.err').textContent = errMsg(er); }
    };
  };

  /* ── usuarios y cuenta ── */
  R.usuarios = async function () {
    if (!canAdmin()) return go('tablero');
    const us = await api('usuarios');
    const RL = { owner: 'Digit2AI', director: 'Director', capturista: 'Captura', contador: 'Contador (solo lectura)' };
    main().innerHTML = `<h1>Usuarios</h1><p class="sub">Cada persona entra con su propia cuenta. La contraseña temporal se muestra una sola vez.</p>
      <div class="card"><form id="nu" class="form"><div><label>Correo</label><input name="email" type="email" required></div><div><label>Nombre</label><input name="name"></div>
        <div><label>WhatsApp</label><input name="phone"></div><div><label>Rol</label><select name="role"><option value="capturista">Captura (Andrés)</option><option value="director">Director (Osbaldo)</option><option value="contador">Contador (solo lectura)</option></select></div>
        <div><button class="btn primary">Crear cuenta</button></div><div class="err wide"></div><div class="wide" id="pw"></div></form></div>
      <div class="card tbl"><table class="cards"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último ingreso</th><th></th></tr></thead><tbody>
      ${us.map((u) => `<tr><td data-l="Nombre">${esc(u.name || '')}</td><td data-l="Correo">${esc(u.email)}</td><td data-l="Rol">${RL[u.role]}${u.active ? '' : ' <span class="pill bad">inactivo</span>'}</td>
        <td data-l="Último ingreso">${u.last_login ? new Date(u.last_login).toLocaleString('es-MX') : '—'}</td>
        <td data-l="">${u.role !== 'owner' && u.id !== S.me.user.id ? `<button class="btn small" data-reset="${u.id}">Nueva contraseña</button> <button class="btn small danger" data-act="${u.id}:${u.active ? 0 : 1}">${u.active ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const f = document.getElementById('nu');
    const showPw = (email, pw) => { document.getElementById('pw').innerHTML = `<div class="note">Contraseña temporal de <b>${esc(email)}</b>: <code style="font-size:16px">${esc(pw)}</code>. Dásela en persona o por WhatsApp; al entrar tendrá que cambiarla. No se vuelve a mostrar.</div>`; };
    f.onsubmit = async (e) => { e.preventDefault(); try { const r = await api('usuarios', { method: 'POST', body: formData(f) }); await R.usuarios(); showPw(r.email, r.password_temporal); } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
    main().onclick = async (e) => {
      const r = e.target.closest('[data-reset]'), a = e.target.closest('[data-act]');
      if (r) { const res = await api('usuarios/' + r.dataset.reset, { method: 'PATCH', body: { reset: true } }); const u = us.find((x) => String(x.id) === r.dataset.reset); showPw(u.email, res.password_temporal); }
      if (a) { const [id, on] = a.dataset.act.split(':'); await api('usuarios/' + id, { method: 'PATCH', body: { active: on === '1' } }); R.usuarios(); }
    };
  };
  R.cuenta = async function () {
    main().innerHTML = `<h1>Mi cuenta</h1><div class="card"><p><b>${esc(S.me.user.name || '')}</b> · ${esc(S.me.user.email)} · ${esc(S.me.user.role)}</p>
      ${S.me.user.role === 'owner' ? '<p class="muted">Tu contraseña es la del CRM de RinglyPro.</p>' : `<form id="pf" class="form"><div><label>Contraseña actual</label><input type="password" name="current"></div>
      <div><label>Nueva contraseña</label><input type="password" name="new" minlength="10"></div><div><button class="btn primary">Cambiar</button></div><div class="err wide"></div></form>`}</div>`;
    const f = document.getElementById('pf');
    if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await api('auth/password', { method: 'POST', body: formData(f) }); f.querySelector('.err').innerHTML = '<span class="okmsg">Contraseña cambiada.</span>'; } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
  };

  boot();
})();

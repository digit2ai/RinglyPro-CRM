/* Forzza · Capital — una sola página, sin build. Toda cifra viene del servidor (engine.js). */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const S = { me: null, cat: {}, view: 'tablero', proy: { horizonte: '', vencido: 'excluir', retraso: 0 } };

  /* ── utilidades ── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const c$ = (c) => (Number.isFinite(Number(c)) ? fmt(Number(c) / 100) : '—'); // centavos (motor)
  const p$ = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? fmt(Number(v)) : '—'); // pesos (filas)
  const hoy = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const addD = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtF = (f) => { if (!f) return ''; const [y, m, d] = String(f).slice(0, 10).split('-'); return `${Number(d)} ${MES[Number(m) - 1]} ${y}`; };
  const fmtC = (f) => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-'); return `${Number(d)} ${MES[Number(m) - 1]}`; };
  const CAT_LBL = { sin_categoria: 'Sin categoría', cliente: 'Cobro de cliente', proveedor: 'Pago a proveedor', nomina: 'Nómina', imss: 'IMSS', impuestos: 'Impuestos', renta: 'Renta',
    combustible: 'Combustible', vehiculo: 'Vehículos', financiamiento: 'Financiamiento', retiro_socios: 'Retiro de socios', aportacion_socios: 'Aportación de socios', prestamo: 'Préstamo',
    factoraje: 'Factoraje', comision_bancaria: 'Comisión bancaria', traspaso: 'Traspaso entre cuentas', servicios: 'Servicios', otro: 'Otro' };
  const FREC = { semanal: 'Semanal', quincenal: 'Quincenal (15 y fin de mes)', mensual: 'Mensual' };
  const DIAS_SEM = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const EST = { abierta: ['Abierta', 'warn'], programada: ['Programada', 'acc'], aprobada: ['Aprobada', 'ok'], pagada: ['Pagada', 'ok'], cancelada: ['Cancelada', ''] };
  const ERR = {
    invalid_credentials: 'Correo o contraseña incorrectos.', too_many_attempts: 'Demasiados intentos. Espera 15 minutos.', read_only: 'Tu cuenta es de solo lectura.',
    password_too_short: 'Mínimo 10 caracteres.', wrong_current_password: 'La contraseña actual no es correcta.', total_invalido: 'Escribe un total mayor que cero.',
    falta_cliente: 'Escribe o elige el cliente.', falta_proveedor: 'Escribe o elige el proveedor.', folio_duplicado: 'Ese folio ya está registrado para esa persona.',
    vence_antes_de_fecha: 'El vencimiento no puede ser antes de la fecha.', monto_invalido: 'Escribe un monto mayor que cero.', monto_mayor_al_saldo: 'El monto es mayor que lo pendiente.',
    documento_cerrado: 'Ese documento ya está pagado o cancelado.', pago_no_aprobado: 'Ese pago aún no está aprobado. Prográmalo y pide la aprobación.', no_aprueba: 'Tu cuenta no aprueba pagos.',
    primero_programar: 'Primero programa la fecha de pago.', fecha_pasada: 'La fecha de pago no puede ser en el pasado.', fecha_futura: 'La fecha no puede ser futura.',
    total_menor_que_pagado: 'El total no puede ser menor que lo ya pagado.', telefono_invalido: 'Teléfono inválido. 10 dígitos para México; otro país con su lada (+1 ...).',
    ya_existe: 'Ya existe con ese nombre.', usa_excel_o_csv: 'Usa un archivo de Excel (.xlsx) o CSV.', sin_encabezados: 'No encontré las columnas que necesito.',
    no_se_borra: 'Solo se borran movimientos capturados a mano que aún no se concilian con el banco.', ya_pagado: 'Esa fecha ya está marcada como pagada.',
    no_toca_ese_dia: 'Ese gasto no cae en esa fecha.', reserva_invalida: 'Escribe la reserva como un monto, o déjala vacía.', aprobador_invalido: 'Esa persona no puede aprobar.',
    terminacion_invalida: 'La terminación son los últimos 4 dígitos.', saldo_invalido: 'Escribe el saldo como un número.', archivo_muy_grande: 'El archivo es muy grande.',
    precio_invalido: 'Escribe el precio de venta.', falta_archivo: 'Elige el reporte de SICAR.', pdf_ilegible: 'No pude leer ese PDF.', archivo_ilegible: 'No pude leer ese archivo.', solo_director: 'Solo el director cambia esto.', cuenta_not_found: 'Elige una cuenta.', faltan_datos: 'Faltan datos.'
  };
  const errMsg = (e) => ERR[e && e.error] || (e && e.ayuda) || 'No se pudo completar (' + esc((e && e.error) || 'error') + ').';
  function waNumero(tel) { // MISMA regla que el servidor
    const raw = String(tel || '').trim(); let d = raw.replace(/\D/g, '');
    if (!d) return null;
    if (raw.startsWith('+') || raw.startsWith('00')) { d = d.replace(/^00/, ''); if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3); return d.length >= 11 && d.length <= 15 ? d : null; }
    if (d.length === 10) return '52' + d;
    if (d.length === 12 && d.startsWith('52')) return d;
    if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
    if (d.length === 11 && d.startsWith('1')) return d;
    return null;
  }
  const waLink = (tel, text) => 'https://wa.me/' + (waNumero(tel) || '') + '?text=' + encodeURIComponent(text);

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: { 'X-Forzza': '1' }, credentials: 'same-origin' };
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
  async function loadCat() {
    const [clientes, proveedores, cuentas] = await Promise.all(['clientes', 'proveedores', 'cuentas'].map((c) => api(c)));
    Object.assign(S.cat, { clientes, proveedores, cuentas });
  }
  const opts = (rows, label, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    rows.map((r) => `<option value="${r.id}"${String(sel) === String(r.id) ? ' selected' : ''}>${esc(label(r))}</option>`).join('');
  const activos = (k) => (S.cat[k] || []).filter((r) => r.active);
  function formData(root) { const o = {}; root.querySelectorAll('[name]').forEach((el) => { if (el.type !== 'file') o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); return o; }
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
  const dropBox = (name, texto) => `<label class="drop"><input type="file" name="${name}" accept=".xlsx,.csv"><span>${texto}</span></label>`;
  function modal(html) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m); return m;
  }
  const kpi = (l, v, n, cls) => `<div class="card kpi ${cls || ''}"><div class="l">${l}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ''}</div>`;

  /** Gráfica del saldo proyectado: línea, cero, reserva y punto más bajo. Valores en centavos. */
  function chart(serie, reserva, extra) {
    const W = 900, H = 260, L = 70, R = 12, T = 14, B = 26;
    const vals = serie.map((d) => d.saldo).concat(extra ? extra : []).concat(reserva != null ? [reserva] : []).concat([0]);
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 100;
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, serie.length - 1);
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    let min = 0; serie.forEach((d, i) => { if (d.saldo < serie[min].saldo) min = i; });
    // Marcas redondas (1, 2, 2.5 o 5 por potencia de 10), no cifras sueltas como $145,651.
    const raw = (hi - lo) / 4, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const grid = [];
    for (let v = lo; v <= hi + step / 2; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(c$(v).replace('.00', ''))}</text>`);
    const xt = [0, Math.floor(serie.length / 3), Math.floor((2 * serie.length) / 3), serie.length - 1].map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(fmtC(serie[i].fecha))}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo proyectado por día"><g class="grid">${grid.join('')}</g>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1.2"/>
      ${reserva != null ? `<line x1="${L}" x2="${W - R}" y1="${y(reserva)}" y2="${y(reserva)}" stroke="#b45309" stroke-dasharray="6 4" stroke-width="1.5"/>` : ''}
      ${extra ? `<path d="${path(extra)}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
      <path d="${path(serie.map((d) => d.saldo))}" fill="none" stroke="#005dab" stroke-width="2.4"/>
      <circle cx="${x(min)}" cy="${y(serie[min].saldo)}" r="5" fill="${serie[min].saldo < 0 ? '#b91c1c' : '#005dab'}"/>${xt}</svg>
      <div class="legend"><span><i style="background:#005dab"></i>Saldo proyectado</span>${extra ? '<span><i style="background:#7c3aed"></i>Con el pedido simulado</span>' : ''}
      ${reserva != null ? '<span><i style="background:#b45309"></i>Reserva mínima</span>' : ''}<span><i style="background:#94a3b8"></i>Cero</span><span>● Punto más bajo</span></div>`;
  }
  function alertasHtml(a) { return (a || []).map((x) => `<div class="al ${x.nivel}">${esc(x.texto)}</div>`).join(''); }
  const sentido = (m) => `<span class="${m > 0 ? 'amt-in' : 'amt-out'}">${c$(m)}</span>`;

  /* ── sesión ── */
  function renderLogin(msg) {
    $app.innerHTML = `<div class="login"><div class="card"><h1>Forzza · Capital</h1><p class="sub">Efectivo, cuentas por cobrar y pagos · plataforma de Digit2AI</p>
      <form id="f" class="form" style="grid-template-columns:1fr"><div><label>Correo</label><input name="email" type="email" autocomplete="username" required></div>
      <div><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary">Entrar</button><div class="err">${esc(msg || '')}</div></form></div></div>`;
    $app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('auth/login', { method: 'POST', body: formData(e.target) }); boot(); } catch (er) { e.target.querySelector('.err').textContent = errMsg(er); }
    };
  }
  function renderChangePassword() {
    $app.innerHTML = `<div class="login"><div class="card"><h1>Cambia tu contraseña</h1><p class="sub">Es tu primer ingreso. Elige una contraseña de al menos 10 caracteres.</p>
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
    await loadCat();
    shell();
    go(location.hash.slice(1) || 'tablero');
  }

  const VIEWS = [
    ['grp', 'Capital'], ['tablero', 'Tablero'], ['simulador', 'Simulador'], ['proyeccion', 'Proyección'], ['simular', 'Simular venta a crédito'],
    ['grp', 'Cuentas'], ['cxc', 'Por cobrar'], ['cxp', 'Por pagar'], ['bancos', 'Bancos'], ['fijos', 'Gastos fijos'],
    ['grp', 'SICAR'], ['sicar', 'Importar de SICAR'], ['sicar_resumen', 'Compras y ventas'],
    ['grp', 'Catálogos'], ['clientes', 'Clientes'], ['proveedores', 'Proveedores'],
    ['grp', 'Ajustes'], ['ajustes', 'Reserva y aprobación'], ['usuarios', 'Usuarios'], ['cuenta', 'Mi cuenta']
  ];
  function shell() {
    $app.innerHTML = `<header class="top"><button class="burger" id="burger" aria-label="Menú" aria-expanded="false">☰</button>
      <div class="brand"><i></i>Forzza<small>Capital</small></div><span class="sicar-badge">Compatible con SICAR</span><div class="sp"></div>
      <span class="muted" style="font-size:13px">${esc(S.me.user.name || S.me.user.email)}</span></header>
      <div class="layout"><nav class="side" id="side">${VIEWS.map(([k, l]) => (k === 'grp' ? `<div class="grp">${l}</div>`
        : (k === 'usuarios' && !canAdmin() ? '' : `<a href="#${k}" data-v="${k}">${l}</a>`))).join('')}
        <a href="#" id="salir">Salir</a></nav><main id="main"></main></div>`;
    const side = document.getElementById('side'), b = document.getElementById('burger');
    b.onclick = () => { side.classList.toggle('open'); b.setAttribute('aria-expanded', side.classList.contains('open')); };
    side.onclick = (e) => { if (e.target.closest('a')) { side.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); } };
    document.getElementById('salir').onclick = async (e) => { e.preventDefault(); await api('auth/logout', { method: 'POST' }).catch(() => {}); S.me = null; renderLogin(); };
  }
  window.addEventListener('hashchange', () => { if (S.me) go(location.hash.slice(1)); });
  const main = () => document.getElementById('main');
  async function go(v) {
    if (!R[v]) v = 'tablero';
    S.view = v;
    document.querySelectorAll('nav.side a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
    main().innerHTML = '<p class="muted">Cargando…</p>';
    main().onclick = null; main().oninput = null; main().onchange = null;
    try { await R[v](); } catch (e) { if (e && e.error !== 'not_signed_in') main().innerHTML = `<div class="err">${errMsg(e)}</div>`; }
  }
  const R = {};

  /* ── tablero ── */
  R.tablero = async function () {
    const t = await api('tablero');
    const bajo = t.minimo.saldo < 0 ? 'bad' : t.reserva != null && t.minimo.saldo < t.reserva ? 'bad' : 'ok';
    main().innerHTML = `<h1>Tablero</h1><p class="sub">Hoy ${fmtF(t.hoy)} · proyección a ${t.horizonte} días (hasta ${fmtF(t.hasta)})</p>
      ${t.sin_datos ? `<div class="note">Aún no hay datos cargados. Empieza por <a href="#bancos">Bancos</a> (saldo de cada cuenta), luego <a href="#cxc">Por cobrar</a>, <a href="#cxp">Por pagar</a> y <a href="#fijos">Gastos fijos</a>. Se pueden importar de Excel.</div>` : ''}
      ${alertasHtml(t.alertas)}
      <div class="grid">
        ${kpi('Efectivo hoy', c$(t.efectivo), t.cuentas.filter((c) => c.incluir).map((c) => `${esc(c.nombre)}: ${c$(c.saldo)}`).join('<br>'))}
        ${kpi('Te deben (por cobrar)', c$(t.cartera.total), `${t.cartera.n} documentos · vencido ${c$(t.cartera.vencido)}`)}
        ${kpi('Debes (por pagar)', c$(t.por_pagar_total), `${c$(t.por_pagar_30)} en los próximos 30 días${t.cxp_vencido ? ' · vencido ' + c$(t.cxp_vencido) : ''}`)}
        ${kpi('Punto más bajo', c$(t.minimo.saldo), `el ${fmtF(t.minimo.fecha)}`, bajo)}
        ${kpi('Reserva mínima', t.reserva == null ? 'Sin definir' : c$(t.reserva), t.reserva == null ? '<a href="#ajustes">Definirla</a>' : t.falta_para_reserva ? `Faltan ${c$(t.falta_para_reserva)}` : 'Se cumple todo el periodo')}
        ${kpi('Saldo al ' + fmtC(t.hasta), c$(t.final), 'si todo se cobra y paga en su fecha')}
        ${kpi('SICAR', t.sicar_ultima ? 'Importado' : 'Sin importar', t.sicar_ultima ? 'última vez ' + fmtF(String(t.sicar_ultima).slice(0, 10)) + ' · <a href="#sicar">importar</a>' : '<a href="#sicar">Importar reportes de SICAR</a>')}
      </div>
      <div class="card">${chart(t.serie, t.reserva)}</div>
      <h2>Próximos 14 días</h2>
      <div class="card tbl">${t.proximos.length ? `<table class="cards"><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="n">Monto</th></tr></thead><tbody>
        ${t.proximos.map((e) => `<tr><td data-l="Fecha">${fmtF(e.fecha)}${e.vencido ? ' <span class="pill bad">vencido</span>' : ''}</td><td data-l="Concepto">${esc(e.concepto)}</td>
          <td data-l="Tipo">${{ cobro: 'Cobro', pago: 'Pago a proveedor', fijo: 'Gasto fijo' }[e.tipo] || esc(e.tipo)}</td><td class="n" data-l="Monto">${sentido(e.monto)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">Nada en los próximos 14 días.</p>'}</div>
      <h2>Antigüedad de lo que te deben</h2>
      <div class="grid">${[['por_vencer', 'Por vencer'], ['d1_30', '1 a 30 días vencido'], ['d31_60', '31 a 60'], ['d61_90', '61 a 90'], ['d90_mas', 'Más de 90']]
        .map(([k, l]) => kpi(l, c$(t.cartera[k].monto), `${t.cartera[k].n} documentos`, k === 'por_vencer' ? '' : t.cartera[k].monto ? 'bad' : '')).join('')}</div>
      <h2>Este mes en los bancos (desde ${fmtF(t.mes.desde)})</h2>
      <div class="card tbl">${t.mes.por_categoria.length ? `<table class="cards"><thead><tr><th>Categoría</th><th class="n">Entró</th><th class="n">Salió</th><th class="n">Movimientos</th></tr></thead><tbody>
        ${t.mes.por_categoria.map((r) => `<tr><td data-l="Categoría"><a href="#bancos" data-cat="${esc(r.categoria)}">${esc(CAT_LBL[r.categoria] || r.categoria)}</a></td>
          <td class="n" data-l="Entró">${r.entradas ? c$(r.entradas) : '—'}</td><td class="n" data-l="Salió">${r.salidas ? c$(r.salidas) : '—'}</td><td class="n" data-l="Movimientos">${r.n}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">Sin movimientos este mes. Importa el estado de cuenta en Bancos.</p>'}</div>`;
    main().onclick = (e) => { const a = e.target.closest('[data-cat]'); if (a) S.bCat = a.dataset.cat; };
  };

  /* ── proyección ── */
  R.proyeccion = async function () {
    const q = S.proy;
    const p = await api(`proyeccion?horizonte=${q.horizonte}&vencido=${q.vencido}&retraso=${q.retraso}`);
    const porDia = {};
    p.eventos.forEach((e) => { (porDia[e.fecha] = porDia[e.fecha] || []).push(e); });
    const dias = p.serie.filter((d) => porDia[d.fecha]);
    main().innerHTML = `<h1>Proyección</h1><p class="sub">Saldo de cada día si todo se cobra y se paga en su fecha. Solo cuenta lo pendiente.</p>
      <div class="card form noprint">
        <div><label>Horizonte</label><select id="h">${[30, 60, 90, 120, 180].map((h) => `<option value="${h}"${h === p.horizonte ? ' selected' : ''}>${h} días</option>`).join('')}</select></div>
        <div><label>Cobros vencidos</label><select id="v"><option value="excluir"${p.opciones.vencido === 'excluir' ? ' selected' : ''}>No contarlos (no hay fecha)</option><option value="hoy"${p.opciones.vencido === 'hoy' ? ' selected' : ''}>Contarlos hoy</option></select></div>
        <div><label>Si los clientes pagan tarde (días)</label><input id="r" type="number" min="0" max="180" value="${p.opciones.retraso}"></div>
      </div>
      ${alertasHtml(E_alertas(p))}
      <div class="grid">${kpi('Efectivo hoy', c$(p.efectivo))}${kpi('Entra', c$(p.entradas), 'en el periodo')}${kpi('Sale', c$(p.salidas), 'en el periodo')}
        ${kpi('Punto más bajo', c$(p.minimo.saldo), 'el ' + fmtF(p.minimo.fecha), p.minimo.saldo < 0 ? 'bad' : 'ok')}${kpi('Saldo final', c$(p.final), fmtF(p.hasta))}</div>
      <div class="card">${chart(p.serie, p.reserva)}</div>
      <h2>Día por día</h2>
      <div class="card tbl">${dias.length ? `<table class="cards"><thead><tr><th>Fecha</th><th>Movimientos</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Saldo</th></tr></thead><tbody>
        ${dias.map((d) => `<tr><td data-l="Fecha">${fmtF(d.fecha)}</td><td data-l="Movimientos">${porDia[d.fecha].map((e) => `${esc(e.concepto)} ${sentido(e.monto)}${e.vencido ? ' <span class="pill bad">vencido</span>' : ''}`).join('<br>')}</td>
          <td class="n" data-l="Entra">${d.entradas ? c$(d.entradas) : '—'}</td><td class="n" data-l="Sale">${d.salidas ? c$(d.salidas) : '—'}</td>
          <td class="n" data-l="Saldo"><b class="${d.saldo < 0 ? 'amt-out' : ''}">${c$(d.saldo)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Sin movimientos en el periodo.</p>'}</div>
      ${p.vencido_no_contado.length ? `<h2>Cobros vencidos que no se cuentan</h2><div class="card tbl"><table class="cards"><tbody>${p.vencido_no_contado.map((e) =>
        `<tr><td data-l="Cliente">${esc(e.concepto)}</td><td data-l="Venció">${fmtF(e.vencimiento)} · ${e.dias_vencido} días</td><td class="n" data-l="Pendiente">${c$(e.monto)}</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="font-size:13px">Pon una fecha de compromiso en Por cobrar y entran a la proyección ese día.</p></div>` : ''}
      ${p.fuera.length ? `<h2>Después del horizonte</h2><div class="card tbl"><table class="cards"><tbody>${p.fuera.map((e) =>
        `<tr><td data-l="Fecha">${fmtF(e.fecha)}</td><td data-l="Concepto">${esc(e.concepto)}</td><td class="n" data-l="Monto">${sentido(e.monto)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    const upd = () => { S.proy = { horizonte: document.getElementById('h').value, vencido: document.getElementById('v').value, retraso: document.getElementById('r').value || 0 }; R.proyeccion(); };
    ['h', 'v'].forEach((id) => { document.getElementById(id).onchange = upd; });
    document.getElementById('r').onchange = upd;
  };
  function E_alertas(p) {
    const a = [];
    if (p.primero_negativo) a.push({ nivel: 'alto', texto: `El saldo queda en negativo el ${fmtF(p.primero_negativo)}. Faltan ${c$(p.falta_para_cero)} para no quedar abajo de cero.` });
    if (p.reserva != null && p.primero_bajo_reserva) a.push({ nivel: p.primero_negativo ? 'medio' : 'alto', texto: `El ${fmtF(p.primero_bajo_reserva)} el saldo baja de la reserva. Faltan ${c$(p.falta_para_reserva)}.` });
    return a;
  }

  /* ── simulador con datos reales ── */
  const diaN = (hoyF, f) => Math.round((Date.parse(f + 'T00:00:00Z') - Date.parse(hoyF + 'T00:00:00Z')) / 86400000);
  function chartSim(r) {
    const mod = r.modificado.serie, ini = r.inicial.serie, ind = r.modificado.indicadores, reserva = ind.reserva;
    const W = 900, H = 300, L = 74, R = 14, T = 22, B = 28;
    const vals = mod.map((d) => d.saldo).concat(ini).concat(reserva != null ? [reserva] : []).concat([0]);
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 100;
    const raw = (hi - lo) / 4, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, mod.length - 1);
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const escal = (arr) => arr.map((v, i) => (i ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `M${x(0)} ${y(v).toFixed(1)}`)).join(''); // escalones, como el banco
    const grid = []; for (let v = lo; v <= hi + step / 2; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(c$(v).replace('.00', ''))}</text>`);
    const ev = Math.max(0, Math.min(mod.length - 1, diaN(r.hoy, ind.fecha_evaluacion)));
    const mi = Math.max(0, diaN(r.hoy, ind.minimo.fecha)), mf = Math.max(mi, diaN(r.hoy, ind.minimo.hasta));
    const xt = [0, Math.floor(mod.length / 3), Math.floor((2 * mod.length) / 3), mod.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtC(mod[i].fecha))}</text>`).join('');
    const neg = ind.minimo.saldo < 0;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo diario proyectado"><g class="grid">${grid.join('')}</g>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1.2"/>
      ${reserva != null ? `<line x1="${L}" x2="${W - R}" y1="${y(reserva)}" y2="${y(reserva)}" stroke="#b45309" stroke-dasharray="7 5" stroke-width="1.6"/><text x="${W - R}" y="${y(reserva) - 5}" text-anchor="end" style="fill:#b45309">Reserva ${esc(c$(reserva).replace('.00', ''))}</text>` : ''}
      <line x1="${x(ev)}" x2="${x(ev)}" y1="${T}" y2="${H - B}" stroke="#64748b" stroke-dasharray="3 4"/><text x="${x(ev) + 5}" y="${T + 10}">evaluación</text>
      <path d="${escal(ini)}" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="6 5"/>
      <path d="${escal(mod.map((d) => d.saldo))}" fill="none" stroke="#005dab" stroke-width="2.6"/>
      <circle cx="${x(mi)}" cy="${y(ind.minimo.saldo)}" r="5.5" fill="${neg ? '#b91c1c' : '#618a05'}"/>
      <text x="${Math.min(x(mi) + 8, W - 200)}" y="${y(ind.minimo.saldo) + (y(ind.minimo.saldo) > H - 60 ? -10 : 18)}" style="fill:#111827;font-weight:700">Mínimo ${esc(c$(ind.minimo.saldo).replace('.00', ''))} · ${mi === mf ? 'día ' + mi : 'días ' + mi + '–' + mf}</text>${xt}</svg>
      <div class="legend"><span><i style="background:#005dab"></i>Escenario modificado</span><span><i style="background:#94a3b8"></i>Escenario inicial (punteado)</span>${reserva != null ? '<span><i style="background:#b45309"></i>Reserva mínima</span>' : ''}<span><i style="background:#94a3b8;height:1px"></i>Cero</span></div>`;
  }
  const SIM0 = () => ({ horizonte: 60, efectivo: '', reserva: undefined, eval_dia: 15, historico: undefined, entradas_pct: 0, salidas_pct: 0, retraso: 0, vencido: 'excluir', mover: {}, venta: null, puntuales: [] });
  const ORIGEN = { cobro: ['Por cobrar', 'ok'], pago: ['Por pagar', 'bad'], fijo: ['Gasto fijo', 'warn'], estimado: ['Estimado', ''], simulado: ['Supuesto', 'acc'] };
  R.simulador = async function () {
    S.sim = S.sim || SIM0();
    const s = S.sim;
    main().innerHTML = `<h1>Simulador</h1><p class="sub">Con el dinero real de Forzza: bancos, lo que te deben, lo que debes y cómo se ha movido el dinero. Cambia el escenario y mira qué pasa. <b>Nada de esto se guarda.</b></p>
      <div class="card"><div class="form">
        <div><label>Efectivo real hoy</label><input id="s_ef" inputmode="decimal" placeholder="el de los bancos" value="${esc(s.efectivo)}"></div>
        <div><label>Reserva mínima</label><input id="s_res" inputmode="decimal" placeholder="la de Ajustes" value="${s.reserva == null ? '' : esc(s.reserva)}"></div>
        <div><label>Horizonte</label><div class="tabs" style="margin:0">${[30, 60, 90].map((h) => `<button class="btn small${s.horizonte === h ? ' on' : ''}" data-h="${h}">${h} días</button>`).join('')}</div></div>
        <div><label>Día de evaluación (desde hoy)</label><input id="s_ev" type="number" min="0" max="180" value="${s.eval_dia}"></div>
        <div><label>Base histórica de los bancos</label><select id="s_hist"><option value="no">No usar (solo documentos)</option><option value="promedio">Mes promedio</option><option value="peor">Como el peor mes</option><option value="mejor">Como el mejor mes</option></select></div>
      </div></div>
      <div id="s_out"><p class="muted">Calculando…</p></div>
      <h2>Cambia el escenario</h2>
      <div class="card"><div class="form">
        <div><label>Los clientes pagan tarde (días)</label><input id="s_ret" type="number" min="0" max="180" value="${s.retraso}"></div>
        <div><label>Cobros ya vencidos</label><select id="s_ven"><option value="excluir">No contarlos (no hay fecha)</option><option value="hoy"${s.vencido === 'hoy' ? ' selected' : ''}>Contarlos hoy</option></select></div>
        <div><label>Entradas estimadas: <b id="s_epv">${s.entradas_pct}%</b></label><input id="s_ep" type="range" min="-50" max="50" step="5" value="${s.entradas_pct}"></div>
        <div><label>Salidas estimadas: <b id="s_spv">${s.salidas_pct}%</b></label><input id="s_sp" type="range" min="-50" max="50" step="5" value="${s.salidas_pct}"></div>
      </div><p class="muted" style="font-size:13px;margin:6px 0 0">Los porcentajes mueven solo lo estimado con la historia de los bancos, no los documentos reales.</p></div>
      <div class="card"><h2 style="margin-top:0">Nueva venta a crédito</h2><div class="form" id="s_venta">
        <div><label>Precio de venta</label><input name="precio" inputmode="decimal" value="${esc((s.venta || {}).precio || '')}"></div>
        <div><label>Costo del material</label><input name="costo" inputmode="decimal" value="${esc((s.venta || {}).costo || '')}"></div>
        <div><label>Gastos de entrega</label><input name="entrega" inputmode="decimal" value="${esc((s.venta || {}).entrega || '')}"></div>
        <div><label>Anticipo</label><input name="anticipo" inputmode="decimal" value="${esc((s.venta || {}).anticipo || '')}"></div>
        <div><label>Entrega en (días)</label><input name="dia_entrega" type="number" min="0" value="${esc((s.venta || {}).dia_entrega ?? 5)}"></div>
        <div><label>Pago al proveedor en (días)</label><input name="dia_proveedor" type="number" min="0" value="${esc((s.venta || {}).dia_proveedor ?? 5)}"></div>
        <div><label>Días de crédito</label><input name="dias_credito" type="number" min="0" value="${esc((s.venta || {}).dias_credito ?? 30)}"></div>
      </div></div>
      <div class="card"><h2 style="margin-top:0">Movimientos supuestos</h2><p class="muted" style="margin-top:0">Un préstamo, un retiro de socios, la compra de un camión: lo que quieras probar.</p>
        <div id="s_punt"></div><div class="form" id="s_np" style="margin-top:8px">
        <div><label>Fecha</label><input type="date" name="fecha" value="${addD(hoy(), 7)}"></div>
        <div><label>Tipo</label><select name="tipo"><option value="salida">Salida</option><option value="entrada">Entrada</option></select></div>
        <div><label>Monto</label><input name="monto" inputmode="decimal"></div><div><label>Concepto</label><input name="concepto"></div>
        <div><button class="btn" id="s_add">Agregar</button></div></div></div>
      <div class="card" id="s_pagos"></div>
      <div class="row"><button class="btn" id="s_reset">Restablecer escenario</button></div>
      <div id="s_det"></div>`;
    const $ = (id) => document.getElementById(id);
    let t = null;
    const correr = () => { clearTimeout(t); t = setTimeout(calcular, 250); };
    const leer = () => {
      s.efectivo = $('s_ef').value.trim(); s.reserva = $('s_res').value.trim() || undefined; // vacío = la de Ajustes
      s.eval_dia = Number($('s_ev').value) || 0; s.historico = $('s_hist').value; s.retraso = Number($('s_ret').value) || 0; s.vencido = $('s_ven').value;
      s.entradas_pct = Number($('s_ep').value); s.salidas_pct = Number($('s_sp').value);
      $('s_epv').textContent = (s.entradas_pct > 0 ? '+' : '') + s.entradas_pct + '%'; $('s_spv').textContent = (s.salidas_pct > 0 ? '+' : '') + s.salidas_pct + '%';
      const v = formData($('s_venta')); s.venta = v.precio ? v : null;
    };
    const pintarPuntuales = () => {
      $('s_punt').innerHTML = s.puntuales.length ? `<table class="cards"><tbody>${s.puntuales.map((p, i) => `<tr><td data-l="Fecha">${fmtF(p.fecha)}</td><td data-l="Concepto">${esc(p.concepto || '')}</td>
        <td class="n" data-l="Monto">${sentido((p.tipo === 'entrada' ? 1 : -1) * Math.round(Number(p.monto) * 100))}</td><td class="right" data-l=""><button class="btn small danger" data-qp="${i}">Quitar</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">Ninguno.</p>';
    };
    async function calcular() {
      const body = { horizonte: s.horizonte, efectivo: s.efectivo, eval_dia: s.eval_dia, historico: s.historico, entradas_pct: s.entradas_pct, salidas_pct: s.salidas_pct,
        retraso: s.retraso, vencido: s.vencido, venta: s.venta, puntuales: s.puntuales, mover: Object.entries(s.mover).map(([id, f]) => ({ cxp_id: id, fecha: f })) };
      if (s.reserva !== undefined) body.reserva = s.reserva;
      let r; try { r = await api('simulador', { method: 'POST', body }); } catch (e) { $('s_out').innerHTML = `<div class="err">${errMsg(e)}</div>`; return; }
      if (s.historico === undefined) { s.historico = r.historico; }
      $('s_hist').value = r.historico;
      const k = r.modificado.indicadores, k0 = r.inicial.indicadores;
      const msg = k.primero_negativo ? ['alto', `Con estos supuestos el saldo queda en negativo el ${fmtF(k.primero_negativo)}. Faltan ${c$(k.falta_para_cero)} para no quedar abajo de cero.`]
        : k.reserva != null && k.primero_bajo_reserva ? ['medio', `Con estos supuestos el saldo baja de la reserva mínima el ${fmtF(k.primero_bajo_reserva)}. Faltan ${c$(k.falta_para_reserva)}.`]
        : ['info', `Con estos supuestos el saldo se mantiene sobre ${k.reserva != null ? 'la reserva mínima' : 'cero'} todo el periodo.`];
      const dif = k.minimo.saldo - k0.minimo.saldo;
      const mi = diaN(r.hoy, k.minimo.fecha), mf = diaN(r.hoy, k.minimo.hasta);
      $('s_out').innerHTML = `${r.avisos.map((a) => `<div class="al ${a.nivel}">${esc(a.texto)}</div>`).join('')}
        <div class="al ${msg[0]}">${esc(msg[1])}${dif ? ` Frente al escenario inicial, el punto más bajo ${dif > 0 ? 'mejora' : 'empeora'} ${c$(Math.abs(dif))}.` : ''}</div>
        <div class="grid">
          ${kpi('Efectivo disponible actual', c$(k.efectivo), s.efectivo ? 'Escrito a mano' : r.datos_hasta ? 'Bancos al ' + fmtF(r.datos_hasta) : 'Efectivo real')}
          ${kpi('Cartera pendiente de cobro', c$(k.cartera), 'Entrada esperada, no es efectivo')}
          ${kpi('Cartera vencida', c$(k.cartera_vencida), 'Al día ' + s.eval_dia + ' · ' + fmtC(k.fecha_evaluacion), k.cartera_vencida ? 'bad' : '')}
          ${kpi('Obligaciones pendientes', c$(k.obligaciones), 'Incluye ' + c$(k.obligaciones_en_horizonte) + ' dentro del horizonte' + (k.salidas_estimadas ? ' · más ' + c$(k.salidas_estimadas) + ' de salidas estimadas' : ''))}
          ${kpi('Saldo final proyectado', c$(k.final), 'Día ' + r.horizonte + ' · ' + fmtC(k.hasta))}
          ${kpi('Menor saldo del periodo', c$(k.minimo.saldo), (mi === mf ? 'Día ' + mi + ' (' + fmtC(k.minimo.fecha) + ')' : 'Días ' + mi + ' a ' + mf + ' (' + fmtC(k.minimo.fecha) + ' a ' + fmtC(k.minimo.hasta) + ')'), k.minimo.saldo < 0 ? 'bad' : '')}
          ${kpi('Faltante respecto a cero', c$(k.falta_para_cero), 'Para no quedar en negativo', k.falta_para_cero ? 'bad' : 'ok')}
          ${kpi('Faltante respecto a la reserva', k.reserva == null ? '—' : c$(k.falta_para_reserva), k.reserva == null ? 'Sin reserva definida' : 'Reserva ' + c$(k.reserva), k.falta_para_reserva ? 'bad' : k.reserva == null ? '' : 'ok')}
        </div>
        ${r.modificado.venta ? `<div class="note">Venta simulada: margen ${c$(r.modificado.venta.margen)}; quedan ${c$(r.modificado.venta.saldo_a_credito)} por cobrar el ${fmtF(r.modificado.venta.fecha_cobro)}.</div>` : ''}
        <div class="card"><h2 style="margin-top:0">Saldo diario proyectado</h2>${chartSim(r)}
          ${r.historico !== 'no' && r.patron ? `<p class="muted" style="font-size:13px;margin:8px 0 0">Lo estimado repite cómo se movieron los bancos de ${fmtF(r.patron.desde)} a ${fmtF(r.patron.hasta)} (${r.patron.n} meses, sin traspasos entre cuentas propias). Es una estimación, no un dato.</p>` : ''}</div>`;
      // pagos a proveedores que se pueden mover
      $('s_pagos').innerHTML = `<h2 style="margin-top:0">Mover pagos a proveedores</h2>${r.pagos.length ? `<p class="muted" style="margin-top:0">Supuesto de negociación con el proveedor, no un acuerdo.</p><div class="tbl"><table class="cards"><tbody>
        ${r.pagos.slice(0, 60).map((p) => `<tr><td data-l="Proveedor">${esc(p.proveedor)} ${esc(p.folio || '')}</td><td data-l="Vence">${fmtF(p.fecha_programada || p.vencimiento)}</td><td class="n" data-l="Pendiente">${c$(p.pendiente)}</td>
          <td data-l="Nueva fecha"><input type="date" data-mv="${p.id}" value="${esc(s.mover[p.id] || '')}" min="${r.hoy}" style="max-width:170px"></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted" style="margin:0">No hay pagos a proveedores cargados. Importa el Reporte de Créditos de Proveedores de SICAR.</p>'}`;
      // detalle
      const porDia = {}; for (const e of r.modificado.eventos) (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
      const saldoDe = Object.fromEntries(r.modificado.serie.map((d) => [d.fecha, d.saldo]));
      const fechas = Object.keys(porDia).sort();
      $('s_det').innerHTML = `<h2>Movimientos del escenario</h2><div class="card tbl">${fechas.length ? `<table class="cards"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Origen</th><th class="n">Monto</th><th class="n">Saldo del día</th></tr></thead><tbody>
        ${fechas.map((f) => porDia[f].map((e, i) => `<tr><td data-l="Fecha">${i ? '' : fmtF(f)}</td><td data-l="Movimiento">${esc(e.concepto)}${e.vencido ? ' <span class="pill bad">vencido</span>' : ''}</td>
          <td data-l="Origen"><span class="pill ${(ORIGEN[e.tipo] || ['', ''])[1]}">${esc((ORIGEN[e.tipo] || [e.tipo])[0])}</span></td><td class="n" data-l="Monto">${sentido(e.monto)}</td>
          <td class="n" data-l="Saldo">${i === porDia[f].length - 1 ? c$(saldoDe[f]) : ''}</td></tr>`).join('')).join('')}</tbody></table>` : '<p class="empty">Sin movimientos en el periodo.</p>'}</div>
        ${r.patron ? `<h2>Así se ha movido el dinero (bancos, ${r.patron.n} meses)</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          <div class="card tbl"><table class="cards"><thead><tr><th>Mes</th><th class="n">Entró</th><th class="n">Salió</th><th class="n">Neto</th></tr></thead><tbody>
          ${r.patron.meses.map((m) => `<tr><td data-l="Mes">${esc(m.mes)}${m.mes === r.patron.peor_mes ? ' <span class="pill bad">peor</span>' : m.mes === r.patron.mejor_mes ? ' <span class="pill ok">mejor</span>' : ''}</td><td class="n" data-l="Entró">${c$(m.entradas)}</td><td class="n" data-l="Salió">${c$(m.salidas)}</td><td class="n" data-l="Neto">${sentido(m.neto)}</td></tr>`).join('')}</tbody></table></div>
          <div class="card tbl"><table class="cards"><thead><tr><th>Categoría (promedio al mes)</th><th class="n">Entra</th><th class="n">Sale</th></tr></thead><tbody>
          ${r.patron.por_categoria.map((c) => `<tr><td data-l="Categoría">${esc(CAT_LBL[c.categoria] || c.categoria)}</td><td class="n" data-l="Entra">${c.entradas ? c$(c.entradas) : '—'}</td><td class="n" data-l="Sale">${c.salidas ? c$(c.salidas) : '—'}</td></tr>`).join('')}</tbody></table>
          <p class="muted" style="font-size:12px">Ajusta las categorías en Bancos para que este cuadro diga más.</p></div></div>` : ''}`;
    }
    main().oninput = (e) => { if (e.target.closest('#s_np')) return; if (e.target.dataset.mv !== undefined) { if (e.target.value) s.mover[e.target.dataset.mv] = e.target.value; else delete s.mover[e.target.dataset.mv]; } leer(); correr(); };
    main().onchange = (e) => { if (e.target.closest('#s_np')) return; leer(); correr(); };
    main().onclick = (e) => {
      const h = e.target.closest('[data-h]');
      if (h) { s.horizonte = Number(h.dataset.h); main().querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('on', b === h)); return correr(); }
      const q = e.target.closest('[data-qp]'); if (q) { s.puntuales.splice(Number(q.dataset.qp), 1); pintarPuntuales(); return correr(); }
      if (e.target.id === 's_add') {
        const p = formData($('s_np')); if (!Number(p.monto)) return; s.puntuales.push(p); $('s_np').querySelector('[name=monto]').value = ''; $('s_np').querySelector('[name=concepto]').value = ''; pintarPuntuales(); return correr();
      }
      if (e.target.id === 's_reset') { S.sim = SIM0(); return R.simulador(); }
    };
    if (s.historico) $('s_hist').value = s.historico;
    pintarPuntuales();
    calcular();
  };

  /* ── simular venta a crédito ── */
  R.simular = async function () {
    main().innerHTML = `<h1>Simular venta a crédito</h1><p class="sub">Antes de aceptar un pedido grande: qué le pasa a tu punto más bajo. No guarda nada y no aprueba crédito.</p>
      <div class="card"><form id="f" class="form">
        <div><label>Precio de venta</label><input name="precio" inputmode="decimal" required></div>
        <div><label>Costo del material</label><input name="costo" inputmode="decimal"></div>
        <div><label>Gastos de entrega</label><input name="entrega" inputmode="decimal"></div>
        <div><label>Anticipo del cliente</label><input name="anticipo" inputmode="decimal" value="0"></div>
        <div><label>Entrega en (días desde hoy)</label><input name="dia_entrega" type="number" min="0" value="5"></div>
        <div><label>Pago al proveedor en (días)</label><input name="dia_proveedor" type="number" min="0" value="5"></div>
        <div><label>Días de crédito al cliente</label><input name="dias_credito" type="number" min="0" value="30"></div>
        <div><button class="btn primary">Simular</button></div><div class="err wide"></div></form></div><div id="res"></div>`;
    const f = document.getElementById('f');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('simular-venta', { method: 'POST', body: formData(f) });
        const p = await api('proyeccion');
        const peor = r.cambio_minimo < 0;
        document.getElementById('res').innerHTML = `<div class="grid">
          ${kpi('Margen del pedido', c$(r.margen), 'antes de impuestos y otros gastos')}${kpi('Sale antes de cobrar', c$(r.salida_antes_de_cobrar), 'material + entrega')}
          ${kpi('Te quedarían debiendo', c$(r.saldo_a_credito), 'se cobra el ' + fmtF(r.fecha_cobro))}
          ${kpi('Punto más bajo sin el pedido', c$(r.sin.minimo.saldo), 'el ' + fmtF(r.sin.minimo.fecha))}
          ${kpi('Punto más bajo con el pedido', c$(r.con.minimo.saldo), 'el ' + fmtF(r.con.minimo.fecha), r.con.minimo.saldo < 0 ? 'bad' : 'ok')}
          ${kpi('Cambio en el punto más bajo', c$(r.cambio_minimo), peor ? 'el pedido aprieta la caja' : 'no aprieta la caja', peor ? 'bad' : 'ok')}</div>
          ${r.con.primero_negativo ? `<div class="al alto">Con este pedido el saldo queda en negativo el ${fmtF(r.con.primero_negativo)}. Pide más anticipo o mueve la fecha del proveedor.</div>` : ''}
          <div class="card">${chart(p.serie, p.reserva, r.serie_con)}</div>`;
      } catch (er) { f.querySelector('.err').textContent = errMsg(er); }
    };
  };

  /* ── por cobrar / por pagar ── */
  function docForm(key, x) {
    x = x || {};
    const cli = key === 'cxc';
    const lista = activos(cli ? 'clientes' : 'proveedores');
    return `<div class="form">
      ${x.id ? '' : `<div class="wide"><label>${cli ? 'Cliente' : 'Proveedor'}</label><input name="${cli ? 'cliente' : 'proveedor'}" list="dl" placeholder="Escribe el nombre (si no existe, se crea)" required>
        <datalist id="dl">${lista.map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist></div>`}
      <div><label>Folio</label><input name="folio" value="${esc(x.folio || '')}"></div>
      ${cli ? `<div><label>Documento</label><select name="tipo_doc"><option value="factura"${x.tipo_doc !== 'remision' ? ' selected' : ''}>Factura</option><option value="remision"${x.tipo_doc === 'remision' ? ' selected' : ''}>Remisión (sin factura)</option></select></div>` : ''}
      <div><label>Fecha</label><input type="date" name="fecha" value="${esc(x.fecha || hoy())}"></div>
      <div><label>Vence</label><input type="date" name="vencimiento" value="${esc(x.vencimiento || '')}"></div>
      ${x.id ? '' : '<div><label>O días de crédito</label><input name="dias_credito" type="number" min="0" placeholder="del catálogo o de Ajustes"></div>'}
      <div><label>Total</label><input name="total" inputmode="decimal" value="${esc(x.total || '')}" required></div>
      <div class="wide"><label>Notas</label><input name="notas" value="${esc(x.notas || '')}"></div></div>`;
  }
  function pagoModal(key, x, after) {
    const cli = key === 'cxc';
    const m = modal(`<h2 style="margin-top:0">${cli ? 'Registrar cobro' : 'Registrar pago'}</h2>
      <p class="muted">${esc(x.cliente || x.proveedor)} · ${esc(x.folio || '#' + x.id)} · pendiente <b>${c$(x.pendiente)}</b></p>
      <div class="form"><div><label>Monto</label><input name="monto" inputmode="decimal" value="${(x.pendiente / 100).toFixed(2)}"></div>
      <div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"></div>
      <div class="wide"><label>${cli ? '¿En qué cuenta entró?' : '¿De qué cuenta salió?'}</label><select name="cuenta_id">${opts(activos('cuentas'), (c) => c.nombre, cli ? (activos('cuentas').find((c) => c.uso === 'cobranza') || {}).id : (activos('cuentas').find((c) => c.uso === 'operacion') || {}).id, 'No anotarlo en un banco (ya está en el estado de cuenta)')}</select></div>
      <div class="wide"><label>Nota</label><input name="nota"></div>
      <div class="row wide"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
    m.querySelector('#ok').onclick = async () => {
      try { await api(`${key}/${x.id}/pagos`, { method: 'POST', body: formData(m.querySelector('.box')) }); m.remove(); after(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
    };
  }
  function importModal(path, titulo, ayuda, extra, after) {
    const m = modal(`<h2 style="margin-top:0">${titulo}</h2><p class="muted">${ayuda}</p><div class="form">${extra || ''}
      <div class="wide">${dropBox('archivo', 'Arrastra aquí el Excel o CSV, o toca para elegirlo')}</div>
      <div class="row wide"><button class="btn primary" id="go">Importar</button><button class="btn" data-close>Cerrar</button></div><div class="err wide"></div><div class="wide" id="res"></div></div>`);
    m.querySelector('#go').onclick = async () => {
      const box = m.querySelector('.box'), fd = new FormData();
      const file = box.querySelector('input[type=file]').files[0];
      if (!file) { m.querySelector('.err').textContent = 'Elige un archivo.'; return; }
      fd.append('archivo', file);
      box.querySelectorAll('[name]').forEach((el) => { if (el.type !== 'file') fd.append(el.name, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value); });
      m.querySelector('#go').disabled = true; m.querySelector('.err').textContent = '';
      try {
        const r = await api(path, { method: 'POST', body: fd });
        const malos = r.resultados.filter((x) => !x.ok);
        m.querySelector('#res').innerHTML = `<div class="okmsg">Listo: ${r.creados} nuevos${r.conciliados != null ? `, ${r.conciliados} conciliados con lo capturado, ${r.duplicados} ya estaban` : ''}.
          ${r.saldo_actualizado ? ` Saldo de la cuenta actualizado a ${p$(r.saldo_actualizado.saldo)} al ${fmtF(r.saldo_actualizado.fecha)}.` : ''}</div>
          ${malos.length ? `<div class="note">${malos.length} renglones no entraron:<br>${malos.slice(0, 40).map((x) => `Renglón ${x.renglon}: ${esc({ fecha: 'fecha ilegible', monto: 'sin monto', total: 'sin total', saldo: 'saldo inválido', ya_pagado: 'ya está pagado', ya_estaba: 'ya estaba importado', folio_duplicado: 'folio repetido' }[x.motivo] || x.motivo)}`).join('<br>')}</div>` : ''}`;
        after();
      } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      m.querySelector('#go').disabled = false;
    };
  }
  async function vistaDocs(key) {
    const cli = key === 'cxc';
    S[key + 'Est'] = S[key + 'Est'] || 'abiertas';
    const rows = await api(`${key}?estado=${S[key + 'Est']}`);
    const tot = rows.reduce((a, x) => a + x.pendiente, 0), venc = rows.filter((x) => x.dias_vencido > 0).reduce((a, x) => a + x.pendiente, 0);
    const aprueba = S.me.puede_aprobar;
    main().innerHTML = `<h1>${cli ? 'Por cobrar' : 'Por pagar'}</h1><p class="sub">${cli ? 'Ventas a crédito: quién te debe, cuánto y desde cuándo.' : 'Facturas de proveedores. Se programan, se aprueban y se pagan.'}</p>
      ${canEdit() ? `<div class="card row"><button class="btn primary" id="nuevo">${cli ? 'Nueva venta a crédito' : 'Nueva factura de proveedor'}</button>
        <button class="btn" id="imp">Importar de Excel (SICAR)</button></div>` : ''}
      <div class="tabs">${[['abiertas', 'Pendientes'], ['cerradas', 'Pagadas y canceladas'], ['todas', 'Todas']].map(([k, l]) => `<button class="btn small${S[key + 'Est'] === k ? ' on' : ''}" data-est="${k}">${l}</button>`).join('')}
        <span class="muted" style="align-self:center">Pendiente <b>${c$(tot)}</b> · vencido <b class="${venc ? 'amt-out' : ''}">${c$(venc)}</b></span></div>
      <div class="card tbl">${rows.length ? `<table class="cards"><thead><tr><th>${cli ? 'Cliente' : 'Proveedor'}</th><th>Folio</th><th>Fecha</th><th>Vence</th><th class="n">Total</th><th class="n">Pendiente</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map((x) => {
        const [el, ec] = EST[x.estado] || [x.estado, ''];
        const msg = cli ? `Hola, ${x.cliente}. Te escribimos de Forzza. Tenemos pendiente ${x.tipo_doc === 'remision' ? 'la remisión' : 'la factura'} ${x.folio || ''} por ${c$(x.pendiente)}, con vencimiento el ${fmtF(x.vencimiento)}. ¿Nos confirmas la fecha de pago? Gracias.` : '';
        const abierto = !['pagada', 'cancelada'].includes(x.estado);
        return `<tr><td data-l="${cli ? 'Cliente' : 'Proveedor'}">${esc(x.cliente || x.proveedor)}</td><td data-l="Folio">${esc(x.folio || '—')}${x.tipo_doc === 'remision' ? ' <span class="pill">remisión</span>' : ''}</td>
          <td data-l="Fecha">${fmtF(x.fecha)}</td><td data-l="Vence">${fmtF(x.vencimiento)}${x.dias_vencido && abierto ? ` <span class="pill bad">${x.dias_vencido} d</span>` : ''}
            ${x.compromiso_fecha ? `<div class="muted" style="font-size:12px">Compromiso: ${fmtF(x.compromiso_fecha)}</div>` : ''}${x.fecha_programada ? `<div class="muted" style="font-size:12px">Pago: ${fmtF(x.fecha_programada)}</div>` : ''}</td>
          <td class="n" data-l="Total">${p$(x.total)}</td><td class="n" data-l="Pendiente"><b>${c$(x.pendiente)}</b></td>
          <td data-l="Estado"><span class="pill ${ec}">${el}</span></td>
          <td data-l="" class="right">${canEdit() && abierto ? `
            ${cli || x.estado === 'aprobada' || aprueba ? `<button class="btn small primary" data-pago="${x.id}">${cli ? 'Cobro' : 'Pagar'}</button>` : ''}
            ${!cli ? `<button class="btn small" data-prog="${x.id}">${x.fecha_programada ? 'Cambiar fecha' : 'Programar'}</button>` : `<button class="btn small" data-comp="${x.id}">Compromiso</button>`}
            ${!cli && x.estado === 'programada' && aprueba ? `<button class="btn small" data-aprob="${x.id}">Aprobar</button>` : ''}
            ${cli && x.telefono ? `<a class="btn small wa" target="_blank" rel="noopener" href="${waLink(x.telefono, msg)}">WhatsApp</a>` : ''}` : ''}
            <button class="btn small" data-ver="${x.id}">Ver</button></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty">Nada aquí.</p>'}</div>`;
    const reload = () => vistaDocs(key);
    main().querySelectorAll('[data-est]').forEach((b) => { b.onclick = () => { S[key + 'Est'] = b.dataset.est; reload(); }; });
    const nuevo = document.getElementById('nuevo');
    if (nuevo) nuevo.onclick = () => {
      const m = modal(`<h2 style="margin-top:0">${cli ? 'Nueva venta a crédito' : 'Nueva factura de proveedor'}</h2>${docForm(key)}
        <div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
      m.querySelector('#ok').onclick = async () => {
        try { await api(key, { method: 'POST', body: formData(m.querySelector('.box')) }); m.remove(); await loadCat(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      };
    };
    const imp = document.getElementById('imp');
    if (imp) imp.onclick = () => importModal(key + '/importar', cli ? 'Importar cuentas por cobrar' : 'Importar cuentas por pagar',
      `Columnas: <b>${cli ? 'Cliente' : 'Proveedor'}</b>, <b>Total</b> y, de preferencia, <b>Folio</b>, <b>Fecha</b>, <b>Vencimiento</b> (o Días de crédito) y <b>Saldo</b>. Quien no exista se crea. Un folio repetido se salta.`,
      '', async () => { await loadCat(); });
    main().onclick = async (e) => {
      const b = e.target.closest('[data-pago],[data-prog],[data-aprob],[data-comp],[data-ver]'); if (!b) return;
      const x = rows.find((r) => String(r.id) === (b.dataset.pago || b.dataset.prog || b.dataset.aprob || b.dataset.comp || b.dataset.ver));
      if (b.dataset.pago) return pagoModal(key, x, reload);
      if (b.dataset.aprob) {
        if (!confirm(`Aprobar el pago de ${c$(x.pendiente)} a ${x.proveedor} el ${fmtF(x.fecha_programada)}?`)) return;
        try { await api(`cxp/${x.id}/aprobar`, { method: 'POST', body: {} }); reload(); } catch (er) { alert(errMsg(er)); }
        return;
      }
      if (b.dataset.prog || b.dataset.comp) {
        const prog = !!b.dataset.prog;
        const m = modal(`<h2 style="margin-top:0">${prog ? 'Programar pago' : 'Fecha de compromiso del cliente'}</h2>
          <p class="muted">${prog ? 'Proponer la fecha no es aprobar el pago: lo aprueba quien está definido en Ajustes.' : 'Si el cliente promete pagar en una fecha, la proyección cuenta el cobro ese día.'}</p>
          <div class="form"><div><label>Fecha</label><input type="date" name="fecha" value="${esc((prog ? x.fecha_programada : x.compromiso_fecha) || '')}" min="${hoy()}"></div>
          <div class="row wide"><button class="btn primary" id="ok">Guardar</button>${(prog ? x.fecha_programada : x.compromiso_fecha) ? '<button class="btn" id="quitar">Quitar fecha</button>' : ''}<button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
        const save = async (quitar) => {
          try {
            const f = quitar ? '' : m.querySelector('[name=fecha]').value;
            if (prog) await api(`cxp/${x.id}/programar`, { method: 'POST', body: quitar ? { quitar: true } : { fecha: f } });
            else await api(`cxc/${x.id}`, { method: 'PATCH', body: { compromiso_fecha: f } });
            m.remove(); reload();
          } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
        };
        m.querySelector('#ok').onclick = () => save(false);
        if (m.querySelector('#quitar')) m.querySelector('#quitar').onclick = () => save(true);
        return;
      }
      const d = await api(`${key}/${x.id}`);
      const abierto = !['pagada', 'cancelada'].includes(d.estado);
      const m = modal(`<h2 style="margin-top:0">${esc(x.cliente || x.proveedor)} · ${esc(d.folio || '#' + d.id)}</h2>
        <div class="grid">${kpi('Total', p$(d.total))}${kpi(cli ? 'Cobrado' : 'Pagado', c$(d.pagado))}${kpi('Pendiente', c$(d.pendiente))}</div>
        <h2>${cli ? 'Cobros' : 'Pagos'}</h2>${d.pagos.length ? `<table><tbody>${d.pagos.map((a) => `<tr><td>${fmtF(a.fecha)}</td><td>${esc(a.cuenta || a.nota || '')}</td><td class="n">${p$(a.monto)}</td>
          <td class="right">${canEdit() && d.estado !== 'cancelada' ? `<button class="btn small danger" data-borrar="${a.id}">Deshacer</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ninguno.</p>'}
        ${canEdit() && abierto ? `<h2>Editar</h2>${docForm(key, d)}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar cambios</button>
          <button class="btn danger" id="cancelar">Cancelar documento</button></div>` : ''}<div class="row" style="margin-top:12px"><button class="btn" data-close>Cerrar</button></div><div class="err"></div>`);
      m.onclick = async (ev) => {
        if (ev.target === m || ev.target.closest('[data-close]')) return m.remove();
        const del = ev.target.closest('[data-borrar]');
        try {
          if (del) { if (!confirm('¿Deshacer este registro?')) return; await api(`${key}/${x.id}/pagos/${del.dataset.borrar}`, { method: 'DELETE' }); m.remove(); return reload(); }
          if (ev.target.id === 'ok') { const body = formData(m.querySelector('.form')); await api(`${key}/${x.id}`, { method: 'PATCH', body }); m.remove(); return reload(); }
          if (ev.target.id === 'cancelar') { if (!confirm('¿Cancelar el documento? Sale de la proyección y queda en el historial.')) return; await api(`${key}/${x.id}/cancelar`, { method: 'POST', body: {} }); m.remove(); return reload(); }
        } catch (er) { m.querySelector('.err').textContent = errMsg(er); }
      };
    };
  }
  R.cxc = () => vistaDocs('cxc');
  R.cxp = () => vistaDocs('cxp');

  /* ── bancos ── */
  R.bancos = async function () {
    const t = await api('tablero');
    S.bDesde = S.bDesde || hoy().slice(0, 7) + '-01';
    const movs = await api(`movimientos?desde=${S.bDesde}&hasta=${hoy()}${S.bCuenta ? '&cuenta_id=' + S.bCuenta : ''}${S.bCat ? '&categoria=' + S.bCat : ''}`);
    const cats = S.me.categorias;
    main().innerHTML = `<h1>Bancos</h1><p class="sub">Saldo de cada cuenta y sus movimientos. Las cuentas marcadas "fuera" no suman al efectivo.</p>
      <div class="grid">${t.cuentas.map((c) => `<div class="card kpi"><div class="l">${esc(c.nombre)}${c.terminacion ? ' ··' + esc(c.terminacion) : ''} ${c.incluir ? '' : '<span class="pill">fuera</span>'}</div>
        <div class="v">${c.fecha_saldo ? c$(c.saldo) : '—'}</div><div class="n">${c.fecha_saldo ? 'corte ' + fmtF(c.fecha_saldo) + ' + movimientos' : 'Saldo por capturar'}</div>
        ${canEdit() ? `<div class="row" style="margin-top:6px"><button class="btn small" data-saldo="${c.id}">Actualizar saldo</button>${canAdmin() ? `<button class="btn small" data-editc="${c.id}">Editar</button>` : ''}</div>` : ''}</div>`).join('')}</div>
      ${canEdit() ? `<div class="card row"><button class="btn primary" id="imp">Importar estado de cuenta (Excel/CSV)</button><button class="btn" id="man">Anotar movimiento</button>
        ${canAdmin() ? '<button class="btn" id="nc">Agregar cuenta</button>' : ''}</div>` : ''}
      <div class="row noprint" style="margin-bottom:10px"><input type="date" id="bd" value="${S.bDesde}" style="max-width:170px"><span class="muted">a hoy</span>
        <select id="bc" style="max-width:220px">${opts(S.cat.cuentas, (c) => c.nombre, S.bCuenta || '', 'Todas las cuentas')}</select>
        <select id="bk" style="max-width:220px"><option value="">Todas las categorías</option>${cats.map((k) => `<option value="${k}"${S.bCat === k ? ' selected' : ''}>${esc(CAT_LBL[k] || k)}</option>`).join('')}</select>
        <span class="muted">${movs.length} movimientos</span></div>
      <div class="card tbl">${movs.length ? `<table class="cards"><thead><tr><th>Fecha</th><th>Cuenta</th><th>Concepto</th><th class="n">Monto</th><th>Categoría</th><th></th></tr></thead><tbody>
        ${movs.map((m) => `<tr><td data-l="Fecha">${fmtF(m.fecha)}</td><td data-l="Cuenta">${esc(m.cuenta)}</td><td data-l="Concepto">${esc(m.concepto)}${m.contraparte ? `<div class="muted" style="font-size:12px">${esc(m.contraparte)}</div>` : ''}
          ${m.origen !== 'importado' ? `<span class="pill ${m.conciliado ? 'ok' : 'warn'}">${m.conciliado ? 'conciliado' : 'sin conciliar'}</span>` : ''}</td>
          <td class="n" data-l="Monto">${sentido(Math.round(Number(m.monto) * 100))}</td>
          <td data-l="Categoría">${canEdit() ? `<select data-cat="${m.id}" style="min-width:150px">${cats.map((k) => `<option value="${k}"${m.categoria === k ? ' selected' : ''}>${esc(CAT_LBL[k] || k)}</option>`).join('')}</select>` : esc(CAT_LBL[m.categoria] || m.categoria)}</td>
          <td data-l="">${canEdit() && m.origen === 'manual' && !m.conciliado ? `<button class="btn small danger" data-delm="${m.id}">Borrar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Sin movimientos con estos filtros.</p>'}</div>`;
    const reload = () => R.bancos();
    document.getElementById('bd').onchange = (e) => { S.bDesde = e.target.value; reload(); };
    document.getElementById('bc').onchange = (e) => { S.bCuenta = e.target.value; reload(); };
    document.getElementById('bk').onchange = (e) => { S.bCat = e.target.value; reload(); };
    const cuentaForm = (c) => { c = c || {}; return `<div class="form"><div><label>Nombre</label><input name="nombre" value="${esc(c.nombre || '')}"></div>
      <div><label>Banco</label><input name="banco" value="${esc(c.banco || '')}"></div><div><label>Últimos 4 dígitos</label><input name="terminacion" maxlength="4" value="${esc(c.terminacion || '')}"></div>
      <div><label>Tipo</label><select name="tipo">${['cheques', 'tarjeta', 'efectivo', 'inversion'].map((k) => `<option${c.tipo === k ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
      <div><label>Uso</label><select name="uso">${[['cobranza', 'Cobranza (aquí pagan los clientes)'], ['operacion', 'Operación'], ['personal', 'Personal'], ['otro', 'Otro']].map(([k, l]) => `<option value="${k}"${c.uso === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label><input type="checkbox" name="incluir" style="width:auto"${c.incluir !== false ? ' checked' : ''}> Suma al efectivo de la empresa</label></div>
      <div class="wide"><label>Notas</label><input name="notas" value="${esc(c.notas || '')}"></div></div>`; };
    main().onclick = async (e) => {
      const b = e.target.closest('[data-saldo],[data-editc],[data-delm]'); if (!b) return;
      if (b.dataset.delm) { if (!confirm('¿Borrar este movimiento?')) return; try { await api('movimientos/' + b.dataset.delm, { method: 'DELETE' }); reload(); } catch (er) { alert(errMsg(er)); } return; }
      const c = S.cat.cuentas.find((x) => String(x.id) === (b.dataset.saldo || b.dataset.editc));
      if (b.dataset.saldo) {
        const m = modal(`<h2 style="margin-top:0">Saldo de ${esc(c.nombre)}</h2><p class="muted">Lo que dice el banco al cierre de un día. Los movimientos posteriores se suman solos.</p>
          <div class="form"><div><label>Saldo</label><input name="saldo" inputmode="decimal"></div><div><label>Al cierre del día</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}"></div>
          <div class="row wide"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
        m.querySelector('#ok').onclick = async () => { try { await api(`cuentas/${c.id}/saldo`, { method: 'POST', body: formData(m.querySelector('.box')) }); m.remove(); await loadCat(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
        return;
      }
      const m = modal(`<h2 style="margin-top:0">Editar cuenta</h2>${cuentaForm(c)}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
      m.querySelector('#ok').onclick = async () => { try { await api('cuentas/' + c.id, { method: 'PATCH', body: formData(m.querySelector('.form')) }); m.remove(); await loadCat(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
    };
    main().onchange = async (e) => {
      const s = e.target.closest('[data-cat]'); if (!s || s.tagName !== 'SELECT') return;
      const m = movs.find((x) => String(x.id) === s.dataset.cat);
      const todos = m.contraparte && confirm(`¿Aplicar "${CAT_LBL[s.value]}" a todos los movimientos de ${m.contraparte}?`);
      try { await api('movimientos/' + m.id, { method: 'PATCH', body: { categoria: s.value, aplicar_a_todos: !!todos } }); if (todos) reload(); } catch (er) { alert(errMsg(er)); }
    };
    if (!canEdit()) return;
    document.getElementById('imp').onclick = () => importModal('movimientos/importar', 'Importar estado de cuenta',
      'Exporta el estado de cuenta en Excel o CSV desde la banca en línea. Columnas: <b>Fecha</b>, <b>Concepto</b>, <b>Cargo</b> y <b>Abono</b> (o un <b>Monto</b> con signo) y, si viene, <b>Saldo</b>. Importar dos veces el mismo archivo no duplica nada.',
      `<div class="wide"><label>Cuenta</label><select name="cuenta_id">${opts(activos('cuentas'), (c) => c.nombre)}</select></div>
       <div class="wide"><label><input type="checkbox" name="actualizar_saldo" style="width:auto" checked> Tomar el saldo del último renglón como saldo de la cuenta</label></div>`, async () => { await loadCat(); });
    document.getElementById('man').onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Anotar movimiento</h2><div class="form">
        <div><label>Cuenta</label><select name="cuenta_id">${opts(activos('cuentas'), (c) => c.nombre)}</select></div>
        <div><label>Tipo</label><select name="tipo"><option value="salida">Salida</option><option value="entrada">Entrada</option></select></div>
        <div><label>Monto</label><input name="monto" inputmode="decimal"></div><div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}"></div>
        <div class="wide"><label>Concepto</label><input name="concepto"></div><div><label>A quién / de quién</label><input name="contraparte"></div>
        <div><label>Categoría</label><select name="categoria">${cats.map((k) => `<option value="${k}">${esc(CAT_LBL[k] || k)}</option>`).join('')}</select></div>
        <div class="row wide"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
      m.querySelector('#ok').onclick = async () => { try { await api('movimientos', { method: 'POST', body: formData(m.querySelector('.box')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
    };
    const nc = document.getElementById('nc');
    if (nc) nc.onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Agregar cuenta</h2>${cuentaForm()}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
      m.querySelector('#ok').onclick = async () => { try { await api('cuentas', { method: 'POST', body: formData(m.querySelector('.form')) }); m.remove(); await loadCat(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
    };
  };

  /* ── gastos fijos ── */
  R.fijos = async function () {
    const rows = await api('fijos');
    const cats = S.me.categorias_fijo;
    const form = (f) => { f = f || {}; return `<div class="form"><div class="wide"><label>Concepto</label><input name="concepto" value="${esc(f.concepto || '')}" placeholder="Nómina, IMSS, renta, mensualidad del camión…"></div>
      <div><label>Categoría</label><select name="categoria">${cats.map((k) => `<option value="${k}"${f.categoria === k ? ' selected' : ''}>${esc(CAT_LBL[k] || k)}</option>`).join('')}</select></div>
      <div><label>Monto</label><input name="monto" inputmode="decimal" value="${esc(f.monto || '')}"></div>
      <div><label>Frecuencia</label><select name="frecuencia">${Object.entries(FREC).map(([k, l]) => `<option value="${k}"${f.frecuencia === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Día (mensual: 1-31 · semanal: 1=lunes … 7=domingo)</label><input name="dia" type="number" min="1" max="31" value="${esc(f.dia || '')}"></div>
      <div><label>Desde</label><input type="date" name="desde" value="${esc(f.desde || '')}"></div><div><label>Hasta (p. ej. última mensualidad)</label><input type="date" name="hasta" value="${esc(f.hasta || '')}"></div>
      <div class="wide"><label>Notas</label><input name="notas" value="${esc(f.notas || '')}"></div></div>`; };
    const cuando = (f) => (f.frecuencia === 'semanal' ? 'cada ' + (DIAS_SEM[f.dia || 5]) : f.frecuencia === 'quincenal' ? 'el 15 y fin de mes' : 'el día ' + (f.dia || 1));
    main().innerHTML = `<h1>Gastos fijos</h1><p class="sub">Lo que sale cada semana, quincena o mes: nómina, IMSS, renta, financiamientos. Entra solo a la proyección.</p>
      ${canEdit() ? '<div class="card row"><button class="btn primary" id="nuevo">Agregar gasto fijo</button></div>' : ''}
      <div class="card tbl">${rows.length ? `<table class="cards"><thead><tr><th>Concepto</th><th>Cada cuándo</th><th class="n">Monto</th><th>Próximo</th><th></th></tr></thead><tbody>
        ${rows.map((f) => `<tr><td data-l="Concepto">${esc(f.concepto)} <span class="pill">${esc(CAT_LBL[f.categoria] || f.categoria)}</span>${f.active ? '' : ' <span class="pill">inactivo</span>'}</td>
          <td data-l="Cada cuándo">${FREC[f.frecuencia]}, ${cuando(f)}${f.hasta ? '<div class="muted" style="font-size:12px">hasta ' + fmtF(f.hasta) + '</div>' : ''}</td>
          <td class="n" data-l="Monto">${p$(f.monto)}</td><td data-l="Próximo">${f.proximo ? fmtF(f.proximo) : '—'}${f.pendientes_vencidos ? ` <span class="pill bad">${f.pendientes_vencidos} sin marcar</span>` : ''}</td>
          <td data-l="" class="right">${canEdit() ? `${f.proximo && f.active ? `<button class="btn small primary" data-pag="${f.id}">Marcar pagado</button>` : ''} <button class="btn small" data-ed="${f.id}">Editar</button>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">Sin gastos fijos. Agrega nómina, IMSS, renta y financiamientos para que la proyección sea completa.</p>'}</div>`;
    const reload = () => R.fijos();
    const nuevo = document.getElementById('nuevo');
    if (nuevo) nuevo.onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Agregar gasto fijo</h2>${form()}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
      m.querySelector('#ok').onclick = async () => { try { await api('fijos', { method: 'POST', body: formData(m.querySelector('.form')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
    };
    main().onclick = async (e) => {
      const b = e.target.closest('[data-pag],[data-ed]'); if (!b) return;
      const f = rows.find((x) => String(x.id) === (b.dataset.pag || b.dataset.ed));
      if (b.dataset.pag) {
        const m = modal(`<h2 style="margin-top:0">Marcar pagado: ${esc(f.concepto)}</h2><div class="form"><div><label>Fecha del pago que se marca</label><input type="date" name="fecha" value="${esc(f.proximo)}"></div>
          <div class="wide"><label>¿De qué cuenta salió?</label><select name="cuenta_id">${opts(activos('cuentas'), (c) => c.nombre, '', 'No anotarlo en un banco (ya está en el estado de cuenta)')}</select></div>
          <div class="row wide"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err wide"></div></div>`);
        m.querySelector('#ok').onclick = async () => { try { await api(`fijos/${f.id}/pagado`, { method: 'POST', body: formData(m.querySelector('.box')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
        return;
      }
      const m = modal(`<h2 style="margin-top:0">Editar gasto fijo</h2>${form(f)}<div class="form"><div><label><input type="checkbox" name="active" style="width:auto"${f.active ? ' checked' : ''}> Activo</label></div></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
      m.querySelector('#ok').onclick = async () => { try { await api('fijos/' + f.id, { method: 'PATCH', body: formData(m.querySelector('.box')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
    };
  };

  /* ── SICAR ── */
  const SICAR_REPORTES = [
    ['Créditos de Proveedores', 'Reportes → Proveedores (Créditos) → Créditos Proveedores. Estado: Por Pagar · Tipo: Sí (con detalle).', 'Sincroniza lo que debes, folio por folio, con vencimiento.'],
    ['Créditos a Clientes', 'Reportes → Clientes (Créditos) → Créditos Clientes. Estado: Por Pagar · Tipo: Sí (con detalle).', 'Sincroniza lo que te deben, folio por folio.'],
    ['Créditos por Periodo', 'Reportes → Clientes (o Proveedores) → Créditos por Periodo.', 'Compara los saldos de SICAR con los de la app, por persona.'],
    ['General de Compras', 'Reportes → Compras → General. Estado: Todos.', 'Compras (COM) y gastos (GAS) por mes y por proveedor.'],
    ['General de Ventas', 'Reportes → Ventas → General.', 'Ventas por mes y por cliente.'],
    ['Abonos de Clientes / a Proveedor', 'Reportes → Clientes (Créditos) → Abonos.', 'Historial de cobranza por mes (no mueve saldos).']
  ];
  const RES_LBL = { nuevo: 'Nuevos', actualizado: 'Actualizados con abonos de SICAR', sin_cambio: 'Sin cambio', diferencia: 'SICAR dice más que la app (revisar)', pagado_en_sicar: 'Ya pagados en SICAR (no se crean)',
    ya_no_aparece: 'Abiertos en la app que SICAR ya no trae (revisar)', cancelado_en_app: 'Cancelados en la app', ya_estaba: 'Ya estaban', coincide: 'Coinciden', no_esta_en_app: 'No están en la app' };
  const DET_LBL = { nuevo: 'Nuevo', abono: 'Abono de SICAR', pagado: 'Pagado en SICAR', sicar_mayor: 'SICAR dice más', ya_no_aparece: 'Ya no aparece en SICAR', total_distinto: 'Total distinto',
    cancelado_en_app: 'Cancelado en la app', diferencia: 'Diferencia', no_esta_en_app: 'No está en la app' };
  function sicarResultado(r) {
    const cuadra = r.cuadra === true ? `<div class="al info">La suma leída (${c$(r.total_leido)}) es igual al total que imprimió SICAR. El archivo se leyó completo.</div>`
      : r.cuadra === false ? `<div class="al alto">Ojo: lo leído suma ${c$(r.total_leido)} y SICAR imprimió ${c$(r.total_impreso)}. Revisa antes de aplicar; puede faltar una página.</div>` : '';
    const conteo = Object.entries(r.conteo || {}).map(([k, n]) => `<tr><td data-l="Resultado">${esc(RES_LBL[k] || k)}</td><td class="n" data-l="Cuántos">${n}</td></tr>`).join('');
    const det = (r.detalle || []).filter((d) => d.resultado !== 'nuevo' || r.detalle.length < 60);
    const porDoc = r.por_documento ? Object.entries(r.por_documento).map(([k, v]) => `${esc({ COM: 'Compras (COM)', GAS: 'Gastos (GAS)', DEV: 'Devoluciones (DEV)' }[k] || k)}: <b>${c$(v)}</b>`).join(' · ') : '';
    return `<div class="card"><h2 style="margin-top:0">${esc(r.nombre)} ${r.aplicado ? '<span class="pill ok">aplicado</span>' : '<span class="pill warn">vista previa, aún no se guarda</span>'}</h2>
      <p class="muted">${r.filtros && r.filtros.desde ? `Periodo ${fmtF(r.filtros.desde)} a ${fmtF(r.filtros.hasta)} · ` : ''}${r.filtros && r.filtros.estado ? 'Estado: ' + esc(r.filtros.estado) + ' · ' : ''}${r.n_errores ? `<b>${r.n_errores}</b> renglones no se pudieron leer` : 'todos los renglones se leyeron'}</p>
      ${r.archivo_ya_importado ? `<div class="note">Este mismo archivo ya se importó el ${fmtF(String(r.archivo_ya_importado).slice(0, 10))}. Volver a aplicarlo no duplica nada.</div>` : ''}
      ${cuadra}${porDoc ? `<p>${porDoc}${r.cancelados ? ` · ${r.cancelados} renglones cancelados (X) no cuentan` : ''}</p>` : ''}
      ${(r.partes_que_no_cuadran || []).length ? `<div class="note">En SICAR, el saldo de ${r.partes_que_no_cuadran.map(esc).join(', ')} no es la suma de sus documentos (puede haber devoluciones).</div>` : ''}
      ${conteo ? `<table class="cards"><tbody>${conteo}</tbody></table>` : ''}
      ${det.length ? `<details style="margin-top:10px"${r.aplicado ? '' : ' open'}><summary><b>Detalle (${det.length})</b></summary><div class="tbl"><table class="cards"><thead><tr><th>Persona</th><th>Folio</th><th>Resultado</th><th class="n">Saldo SICAR</th><th class="n">Saldo app</th></tr></thead><tbody>
        ${det.map((d) => `<tr><td data-l="Persona">${esc(d.parte)}</td><td data-l="Folio">${esc(d.folio || '')}</td><td data-l="Resultado">${esc(DET_LBL[d.resultado] || d.resultado)}</td>
          <td class="n" data-l="Saldo SICAR">${d.saldo_sicar != null ? c$(d.saldo_sicar) : '—'}</td><td class="n" data-l="Saldo app">${d.saldo_app != null ? c$(d.saldo_app) : '—'}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      ${(r.errores || []).length ? `<details style="margin-top:8px"><summary>Renglones que no se leyeron</summary>${r.errores.map((e) => `<div class="muted" style="font-size:13px">${esc(e.motivo)}: ${esc(e.texto || '')}</div>`).join('')}</details>` : ''}</div>`;
  }
  R.sicar = async function () {
    const imps = await api('sicar/importaciones');
    main().innerHTML = `<h1>Importar de SICAR</h1><p class="sub">SICAR no tiene conexión directa (API). Guarda el reporte en SICAR en PDF o Excel y súbelo aquí: la app lo reconoce, te muestra qué va a cambiar y lo aplica sin duplicar nada.</p>
      ${canEdit() ? `<div class="card"><div class="form"><div class="wide">${dropBox('archivo', 'Arrastra aquí el reporte de SICAR (PDF o Excel), o toca para elegirlo').replace('accept=".xlsx,.csv"', 'accept=".pdf,.xls,.xlsx,.csv"')}</div>
        <div class="row wide"><button class="btn primary" id="rev">Revisar</button><button class="btn" id="apl" disabled>Aplicar</button><span class="muted" id="st"></span></div><div class="err wide"></div></div></div><div id="res"></div>` : ''}
      <h2>Qué reportes de SICAR sirven</h2><div class="card tbl"><table class="cards"><thead><tr><th>Reporte</th><th>Dónde está en SICAR</th><th>Para qué sirve aquí</th></tr></thead><tbody>
        ${SICAR_REPORTES.map(([n, d, p]) => `<tr><td data-l="Reporte"><b>${esc(n)}</b></td><td data-l="Dónde">${esc(d)}</td><td data-l="Para qué">${esc(p)}</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="font-size:13px">En cada reporte: "Previa (F3)" y luego guardar en Excel o PDF. Los saldos los manda SICAR: si SICAR registra un abono, aquí se refleja; si SICAR dice que se debe más que en la app, no se toca y se avisa.</p></div>
      <h2>Importaciones</h2><div class="card tbl">${imps.length ? `<table class="cards"><thead><tr><th>Fecha</th><th>Reporte</th><th>Archivo</th><th>Origen</th><th>Resultado</th><th>Cuadra</th></tr></thead><tbody>
        ${imps.map((i) => `<tr><td data-l="Fecha">${fmtF(String(i.created_at).slice(0, 10))}</td><td data-l="Reporte">${esc(i.tipo.replace(/_/g, ' '))}</td><td data-l="Archivo">${esc(i.archivo || '')}</td>
          <td data-l="Origen">${i.origen === 'puente' ? 'Puente' : esc(i.por || '')}</td><td data-l="Resultado">${esc(Object.entries((i.resumen && i.resumen.conteo) || {}).map(([k, n]) => `${RES_LBL[k] || k}: ${n}`).join(' · '))}</td>
          <td data-l="Cuadra">${i.cuadra === true ? '<span class="pill ok">sí</span>' : i.cuadra === false ? '<span class="pill bad">no</span>' : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Aún no se importa nada.</p>'}</div>
      ${canAdmin() ? `<h2>Puente automático (computadora de Forzza)</h2><div class="card" id="puente"><p>Un pequeño programa en la computadora donde está SICAR sube cada reporte que se guarde en la carpeta <b>Documentos\\SICAR-Forzza</b>. Así no hay que entrar a la app para importar.</p>
        <ol style="margin:0 0 10px 18px;padding:0"><li>Crea una llave aquí abajo y cópiala (se muestra una sola vez).</li><li>Descarga el script, pega la llave donde dice PEGA_AQUI_LA_LLAVE y guárdalo en Documentos.</li><li>Prográmalo cada 15 minutos (la instrucción viene dentro del script).</li></ol>
        <div class="row"><button class="btn primary" id="nk">Crear llave</button><a class="btn" href="api/v1/sicar/puente.ps1">Descargar script (Windows)</a></div><div id="kres"></div><div id="klist" class="tbl" style="margin-top:10px"></div></div>` : ''}`;
    if (canAdmin()) {
      const pintarLlaves = async () => {
        const ks = await api('llaves');
        document.getElementById('klist').innerHTML = ks.length ? `<table class="cards"><thead><tr><th>Nombre</th><th>Empieza con</th><th>Último uso</th><th></th></tr></thead><tbody>${ks.map((k) => `<tr>
          <td data-l="Nombre">${esc(k.nombre)}</td><td data-l="Llave"><code>${esc(k.prefijo)}…</code></td><td data-l="Último uso">${k.revoked_at ? '<span class="pill">revocada</span>' : k.last_used_at ? fmtF(String(k.last_used_at).slice(0, 10)) : 'nunca'}</td>
          <td data-l="" class="right">${k.revoked_at ? '' : `<button class="btn small danger" data-rev="${k.id}">Revocar</button>`}</td></tr>`).join('')}</tbody></table>` : '';
      };
      pintarLlaves();
      document.getElementById('nk').onclick = async () => {
        try { const k = await api('llaves', { method: 'POST', body: { nombre: 'Puente SICAR' } });
          document.getElementById('kres').innerHTML = `<div class="note">Tu llave (se muestra una sola vez): <code style="word-break:break-all">${esc(k.llave)}</code></div>`; pintarLlaves(); } catch (er) { alert(errMsg(er)); }
      };
      document.getElementById('puente').onclick = async (e) => {
        const b = e.target.closest('[data-rev]'); if (!b) return;
        if (!confirm('¿Revocar esta llave? El puente que la use dejará de subir reportes.')) return;
        await api('llaves/' + b.dataset.rev, { method: 'DELETE' }); pintarLlaves();
      };
    }
    if (!canEdit()) return;
    let archivo = null;
    const inp = main().querySelector('input[type=file]');
    inp.addEventListener('change', () => { archivo = inp.files[0] || null; document.getElementById('apl').disabled = true; document.getElementById('res').innerHTML = ''; });
    const enviar = async (aplicar) => {
      const err = main().querySelector('.err'); err.textContent = '';
      if (!archivo) { err.textContent = 'Elige el reporte de SICAR.'; return; }
      const fd = new FormData(); fd.append('archivo', archivo); fd.append('aplicar', aplicar ? '1' : '0');
      const st = document.getElementById('st'); st.textContent = aplicar ? 'Aplicando…' : 'Leyendo el reporte…';
      document.getElementById('rev').disabled = true; document.getElementById('apl').disabled = true;
      try {
        const r = await api('sicar/importar', { method: 'POST', body: fd });
        document.getElementById('res').innerHTML = sicarResultado(r);
        document.getElementById('apl').disabled = !!r.aplicado;
        if (r.aplicado) { await loadCat(); setTimeout(() => R.sicar().then(() => { document.getElementById('res').innerHTML = sicarResultado(r); }), 50); }
      } catch (er) { err.textContent = errMsg(er); }
      st.textContent = ''; document.getElementById('rev').disabled = false;
    };
    document.getElementById('rev').onclick = () => enviar(false);
    document.getElementById('apl').onclick = () => { if (confirm('¿Aplicar este reporte de SICAR?')) enviar(true); };
  };
  R.sicar_resumen = async function () {
    const r = await api('sicar/resumen');
    const tot = (k) => r.meses.reduce((a, m) => a + m[k], 0);
    const n = Math.max(1, r.meses.length);
    const max = Math.max(1, ...r.meses.map((m) => Math.max(m.compras + m.gastos, m.ventas)));
    const barras = r.meses.map((m) => `<div style="display:grid;grid-template-columns:64px 1fr;gap:8px;align-items:center;margin:4px 0;font-size:12px">
      <span class="muted">${esc(m.mes)}</span><div>
      <div title="Ventas ${c$(m.ventas)}" style="height:9px;border-radius:3px;background:var(--lime);width:${(100 * m.ventas / max).toFixed(1)}%"></div>
      <div title="Compras y gastos ${c$(m.compras + m.gastos)}" style="height:9px;border-radius:3px;background:var(--acc);margin-top:2px;width:${(100 * (m.compras + m.gastos) / max).toFixed(1)}%"></div></div></div>`).join('');
    const lista = (rows) => rows.length ? `<table class="cards"><tbody>${rows.map((x) => `<tr><td data-l="Nombre">${esc(x.parte || '—')}</td><td class="n" data-l="Documentos">${x.n}</td><td class="n" data-l="Total">${c$(x.total)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Sin datos.</p>';
    const conc = (lbl, f) => (f ? kpi(lbl + ' según SICAR', c$(f.saldo_sicar), `corte ${fmtF(f.corte || String(f.fecha).slice(0, 10))} · en la app: ${c$(f.saldo_app)}${f.saldo_app !== f.saldo_sicar ? ' · diferencia ' + c$(f.saldo_app - f.saldo_sicar) : ' · coinciden'}`, f.saldo_app === f.saldo_sicar ? 'ok' : 'bad')
      : kpi(lbl + ' según SICAR', '—', 'importa el reporte de créditos'));
    main().innerHTML = `<h1>Compras y ventas (SICAR)</h1><p class="sub">Lo importado de SICAR del ${fmtF(r.desde)} al ${fmtF(r.hasta)}. Solo documentos vigentes; las devoluciones restan.${r.ultima_importacion ? ' Última importación: ' + fmtF(String(r.ultima_importacion).slice(0, 10)) + '.' : ''}</p>
      ${!r.meses.length && !r.conciliacion.cxc && !r.conciliacion.cxp ? '<div class="note">Aún no hay reportes importados. Ve a <a href="#sicar">Importar de SICAR</a>.</div>' : ''}
      <div class="grid">${kpi('Ventas', c$(tot('ventas')), 'promedio ' + c$(Math.round(tot('ventas') / n)) + ' al mes')}${kpi('Compras de material', c$(tot('compras')), 'promedio ' + c$(Math.round(tot('compras') / n)) + ' al mes')}
        ${kpi('Gastos (GAS)', c$(tot('gastos')), 'promedio ' + c$(Math.round(tot('gastos') / n)) + ' al mes')}${kpi('Cobrado (abonos)', c$(tot('cobrado')), 'según el reporte de abonos')}
        ${conc('Te deben', r.conciliacion.cxc)}${conc('Debes', r.conciliacion.cxp)}</div>
      ${r.meses.length ? `<h2>Por mes</h2><div class="card">${barras}<div class="legend"><span><i style="background:var(--lime)"></i>Ventas</span><span><i style="background:var(--acc)"></i>Compras y gastos</span></div></div>
      <div class="card tbl"><table class="cards"><thead><tr><th>Mes</th><th class="n">Ventas</th><th class="n">Compras</th><th class="n">Gastos</th><th class="n">Cobrado</th></tr></thead><tbody>
        ${r.meses.map((m) => `<tr><td data-l="Mes">${esc(m.mes)}</td><td class="n" data-l="Ventas">${c$(m.ventas)}</td><td class="n" data-l="Compras">${c$(m.compras)}</td><td class="n" data-l="Gastos">${c$(m.gastos)}</td><td class="n" data-l="Cobrado">${c$(m.cobrado)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        <div class="card"><h2 style="margin-top:0">Proveedores (compras)</h2>${lista(r.proveedores)}</div>
        <div class="card"><h2 style="margin-top:0">Gastos (GAS)</h2>${lista(r.gastos)}</div>
        <div class="card"><h2 style="margin-top:0">Clientes (ventas)</h2>${lista(r.clientes)}</div></div>`;
  };

  /* ── catálogos ── */
  function catalogo(key, titulo, cli) {
    return async function () {
      await loadCat();
      const rows = S.cat[key];
      const form = (x) => { x = x || {}; return `<div class="form"><div class="wide"><label>Nombre</label><input name="nombre" value="${esc(x.nombre || '')}"></div>
        <div><label>RFC</label><input name="rfc" value="${esc(x.rfc || '')}"></div><div><label>WhatsApp / teléfono</label><input name="telefono" value="${esc(x.telefono || '')}" placeholder="10 dígitos"></div>
        <div><label>Días de crédito</label><input name="dias_credito" type="number" min="0" value="${esc(x.dias_credito == null ? '' : x.dias_credito)}"></div>
        ${cli ? `<div><label>Límite de crédito</label><input name="limite_credito" inputmode="decimal" value="${esc(x.limite_credito || '')}"></div>` : ''}
        <div class="wide"><label>Notas</label><input name="notas" value="${esc(x.notas || '')}"></div>${x.id ? `<div><label><input type="checkbox" name="active" style="width:auto"${x.active ? ' checked' : ''}> Activo</label></div>` : ''}</div>`; };
      main().innerHTML = `<h1>${titulo}</h1>${canEdit() ? `<div class="card row"><button class="btn primary" id="nuevo">Agregar</button></div>` : ''}
        <div class="card tbl">${rows.length ? `<table class="cards"><thead><tr><th>Nombre</th><th>RFC</th><th>Teléfono</th><th class="n">Días de crédito</th>${cli ? '<th class="n">Límite</th>' : ''}<th></th></tr></thead><tbody>
        ${rows.map((x) => `<tr><td data-l="Nombre">${esc(x.nombre)}${x.active ? '' : ' <span class="pill">inactivo</span>'}</td><td data-l="RFC">${esc(x.rfc || '—')}</td><td data-l="Teléfono">${esc(x.telefono || '—')}</td>
          <td class="n" data-l="Días">${x.dias_credito == null ? '—' : x.dias_credito}</td>${cli ? `<td class="n" data-l="Límite">${x.limite_credito ? p$(x.limite_credito) : '—'}</td>` : ''}
          <td data-l="" class="right">${canEdit() ? `<button class="btn small" data-ed="${x.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Vacío. También se crean solos al capturar o importar documentos.</p>'}</div>`;
      const reload = () => go(S.view);
      const nuevo = document.getElementById('nuevo');
      if (nuevo) nuevo.onclick = () => {
        const m = modal(`<h2 style="margin-top:0">Agregar</h2>${form()}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
        m.querySelector('#ok').onclick = async () => { try { await api(key, { method: 'POST', body: formData(m.querySelector('.form')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
      };
      main().onclick = (e) => {
        const b = e.target.closest('[data-ed]'); if (!b) return;
        const x = rows.find((r) => String(r.id) === b.dataset.ed);
        const m = modal(`<h2 style="margin-top:0">Editar</h2>${form(x)}<div class="row" style="margin-top:12px"><button class="btn primary" id="ok">Guardar</button><button class="btn" data-close>Cancelar</button></div><div class="err"></div>`);
        m.querySelector('#ok').onclick = async () => { try { await api(`${key}/${x.id}`, { method: 'PATCH', body: formData(m.querySelector('.form')) }); m.remove(); reload(); } catch (er) { m.querySelector('.err').textContent = errMsg(er); } };
      };
    };
  }
  R.clientes = catalogo('clientes', 'Clientes', true);
  R.proveedores = catalogo('proveedores', 'Proveedores', false);

  /* ── ajustes ── */
  R.ajustes = async function () {
    const [c, us] = await Promise.all([api('config'), api('usuarios')]);
    const posibles = us.filter((u) => u.active && u.role !== 'contador');
    main().innerHTML = `<h1>Reserva y aprobación</h1><p class="sub">Las tres decisiones que solo la empresa puede tomar.</p>
      <div class="card"><form id="f" class="form">
        <div><label>Reserva mínima (lo que siempre debe quedar en el banco)</label><input name="reserva_minima" inputmode="decimal" value="${esc(c.reserva_minima || '')}" placeholder="Sin definir" ${canAdmin() ? '' : 'disabled'}></div>
        <div><label>Quién aprueba los pagos a proveedores</label><select name="aprobador_user_id" ${canAdmin() ? '' : 'disabled'}>${opts(posibles, (u) => `${u.name || u.email} (${u.role})`, c.aprobador_user_id || '', 'El director')}</select></div>
        <div><label>Días de crédito a clientes (por omisión)</label><input name="dias_credito_clientes" type="number" min="0" value="${c.dias_credito_clientes}" ${canAdmin() ? '' : 'disabled'}></div>
        <div><label>Días de crédito de proveedores (por omisión)</label><input name="dias_credito_proveedores" type="number" min="0" value="${c.dias_credito_proveedores}" ${canAdmin() ? '' : 'disabled'}></div>
        <div><label>Horizonte de la proyección</label><select name="horizonte_dias" ${canAdmin() ? '' : 'disabled'}>${[30, 60, 90, 120, 180].map((h) => `<option value="${h}"${h === c.horizonte_dias ? ' selected' : ''}>${h} días</option>`).join('')}</select></div>
        ${canAdmin() ? '<div><button class="btn primary">Guardar</button></div>' : '<p class="muted wide">Solo el director cambia esto.</p>'}<div class="err wide"></div><div class="okmsg wide"></div></form></div>`;
    const f = document.getElementById('f');
    f.onsubmit = async (e) => {
      e.preventDefault(); f.querySelector('.err').textContent = ''; f.querySelector('.okmsg').textContent = '';
      try { await api('config', { method: 'PUT', body: formData(f) }); S.me = await api('auth/me'); f.querySelector('.okmsg').textContent = 'Guardado.'; } catch (er) { f.querySelector('.err').textContent = errMsg(er); }
    };
  };

  /* ── usuarios ── */
  R.usuarios = async function () {
    if (!canAdmin()) return go('tablero');
    const us = await api('usuarios');
    const ROL = { owner: 'Digit2AI', director: 'Director', capturista: 'Captura', contador: 'Contador (solo lectura)' };
    main().innerHTML = `<h1>Usuarios</h1>
      <div class="card"><form id="f" class="form"><div><label>Correo</label><input name="email" type="email" required></div><div><label>Nombre</label><input name="name"></div>
        <div><label>Rol</label><select name="role">${['capturista', 'contador'].concat(S.me.user.role === 'owner' ? ['director'] : []).map((r) => `<option value="${r}">${ROL[r]}</option>`).join('')}</select></div>
        <div><button class="btn primary">Crear</button></div><div class="err wide"></div><div class="wide" id="pw"></div></form></div>
      <div class="card tbl"><table class="cards"><thead><tr><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
      ${us.map((u) => `<tr><td data-l="Correo">${esc(u.email)}${u.name ? '<div class="muted">' + esc(u.name) + '</div>' : ''}</td><td data-l="Rol">${ROL[u.role]}</td>
        <td data-l="Estado">${u.active ? '<span class="pill ok">activo</span>' : '<span class="pill">inactivo</span>'}${u.must_change ? ' <span class="pill warn">debe cambiar contraseña</span>' : ''}</td>
        <td data-l="" class="right">${u.role !== 'owner' && u.id !== S.me.user.id ? `<button class="btn small" data-reset="${u.id}">Nueva contraseña</button> <button class="btn small" data-act="${u.id}">${u.active ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    const f = document.getElementById('f');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('usuarios', { method: 'POST', body: formData(f) }); f.reset(); document.getElementById('pw').innerHTML = `<div class="note">Contraseña temporal de <b>${esc(r.email)}</b>: <code>${esc(r.password_temporal)}</code>. Se muestra una sola vez; al entrar la cambia.</div>`; }
      catch (er) { f.querySelector('.err').textContent = errMsg(er); }
    };
    main().onclick = async (e) => {
      const b = e.target.closest('[data-reset],[data-act]'); if (!b) return;
      const u = us.find((x) => String(x.id) === (b.dataset.reset || b.dataset.act));
      try {
        if (b.dataset.reset) { const r = await api('usuarios/' + u.id, { method: 'PATCH', body: { reset: true } }); alert(`Contraseña temporal de ${u.email}: ${r.password_temporal}\nSe muestra una sola vez.`); }
        else { await api('usuarios/' + u.id, { method: 'PATCH', body: { active: !u.active } }); R.usuarios(); }
      } catch (er) { alert(errMsg(er)); }
    };
  };
  R.cuenta = async function () {
    main().innerHTML = `<h1>Mi cuenta</h1><div class="card"><p>${esc(S.me.user.email)} · ${esc(S.me.user.role)}</p>
      ${S.me.user.role === 'owner' ? '<p class="muted">Entras con tu contraseña del CRM de Digit2AI.</p>' : `<form id="f" class="form"><div><label>Contraseña actual</label><input name="current" type="password"></div>
      <div><label>Nueva contraseña</label><input name="new" type="password" minlength="10"></div><div><button class="btn primary">Cambiar</button></div><div class="err wide"></div><div class="okmsg wide"></div></form>`}</div>`;
    const f = document.getElementById('f');
    if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await api('auth/password', { method: 'POST', body: formData(f) }); f.reset(); f.querySelector('.okmsg').textContent = 'Contraseña cambiada.'; } catch (er) { f.querySelector('.err').textContent = errMsg(er); } };
  };

  boot();
})();

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
    invalid_credentials: 'Correo o contraseña incorrectos.', too_many_attempts: 'Demasiados intentos. Espera 15 minutos.', read_only: 'Tu cuenta es de solo lectura.',
    ticket_duplicado: 'Ese número de ticket ya está registrado con esa tarifa.', en_estimacion: 'Ese viaje ya está en una estimación. Borra la estimación (en borrador) para liberarlo.',
    sin_viajes_confirmados: 'No hay viajes confirmados de esa obra en esas fechas.', estimacion_no_aprobada: 'Primero marca la estimación como aprobada por HTR.',
    ya_tiene_requisicion: 'Esa estimación ya tiene requisición.', falta_folio: 'Escribe el folio de la factura.', truck_busy: 'Ese camión ya está asignado a otro pedido ese día.',
    heic: 'La foto está en formato HEIC. En el iPhone: Ajustes > Cámara > Formatos > Más compatible, o envíala por WhatsApp y guárdala de ahí.',
    tipo_no_permitido: 'Solo fotos (JPG, PNG) o PDF.', archivo_muy_grande: 'El archivo es muy grande (máximo 10 MB).', sin_km: 'Escribe los kilómetros de al menos un camión.',
    usa_excel_o_csv: 'Para importar usa el archivo de Excel o CSV, no una foto.', sin_encabezados: 'No encontré las columnas Fecha, Ticket y Toneladas.',
    comision_fuera_de_rango: 'La comisión debe estar entre 0% y 15%.', semana_cerrada: 'Esa semana ya está cerrada.', password_too_short: 'Mínimo 10 caracteres.',
    wrong_current_password: 'La contraseña actual no es correcta.', solo_borrador: 'Solo se puede borrar una estimación en borrador.', transicion_invalida: 'Ese cambio de estado no es posible.',
    monto_invalido: 'El monto no puede ser mayor que el saldo.', saldo_invalido: 'El saldo no puede ser mayor que el total.', faltan_datos: 'Faltan datos obligatorios.'
  };
  const errMsg = (e) => ERR[e && e.error] || (e && e.ayuda) || 'No se pudo completar (' + esc((e && e.error) || 'error') + ').';
  const waNum = (tel) => { let d = String(tel || '').replace(/\D/g, ''); if (d.length === 10) d = '52' + d; return d; };
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
  function modal(html) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m); return m;
  }
  const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn) btn.disabled = false; } };

  /* ── sesión ── */
  function renderLogin(msg) {
    $app.innerHTML = `<div class="login"><div class="card"><h1>NeoHaul · Operación</h1><p class="sub">Grupo NeoHaul · plataforma de Digit2AI</p>
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
    await loadCat(true);
    shell();
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
      <div class="brand">NeoHaul<small>Operación</small></div><div class="sp"></div>
      <span class="muted" style="color:#cbd5e1;font-size:13px">${esc(S.me.user.name || S.me.user.email)}</span></header>
      <div class="layout"><nav class="side" id="side">${VIEWS.map(([k, l]) => (k === 'grp' ? `<div class="grp">${l}</div>`
        : (k === 'usuarios' && !canAdmin() ? '' : `<a href="#${k}" data-v="${k}">${l}</a>`))).join('')}
        <a href="#" id="salir">Salir</a></nav><main id="main"></main></div>`;
    const side = document.getElementById('side'), b = document.getElementById('burger');
    b.onclick = () => { side.classList.toggle('open'); b.setAttribute('aria-expanded', side.classList.contains('open')); };
    side.onclick = (e) => { if (e.target.closest('a')) side.classList.remove('open'); };
    document.getElementById('salir').onclick = async (e) => { e.preventDefault(); await api('auth/logout', { method: 'POST' }).catch(() => {}); S.me = null; renderLogin(); };
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

  /* ── tablero ── */
  R.tablero = async function (desde) {
    const t = await api('tablero?desde=' + (desde || lunes()));
    const k = (l, v, n) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ''}</div>`;
    const resumen = `Resumen semana ${fmtF(t.desde)} a ${fmtF(t.hasta)}\nViajes: ${t.viajes.n} (${pesos(t.viajes.importe)})\nFacturado: ${pesos(t.facturado.total)}\nCobrado: ${pesos(t.cobrado.total)}\nPor cobrar: ${pesos(t.por_cobrar_total)}\nPagos propuestos esta semana: ${pesos(t.pagos_semana_total)}\n` +
      t.pagos_semana.map((g) => `- ${g.proveedor}${g.folio ? ' ' + g.folio : ''}: ${pesos(g.monto_propuesto)}`).join('\n');
    main().innerHTML = `<h1>Tablero</h1><p class="sub">Semana del ${fmtF(t.desde)} al ${fmtF(t.hasta)}</p>
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
      <h2>Cuánto deja cada camión propio</h2>
      <div class="card tbl"><table class="cards"><thead><tr><th>Camión</th><th class="n">Viajes</th><th class="n">Ingresos</th><th class="n">Costos</th><th class="n">Resultado</th></tr></thead><tbody>
      ${t.camiones.map((c) => `<tr><td data-l="Camión">${esc(c.unidad)}</td><td class="n" data-l="Viajes">${c.viajes}</td><td class="n" data-l="Ingresos">${pesos(c.ingresos)}</td>
        <td class="n" data-l="Costos">${c.sin_costos ? '<span class="pill warn">sin costos capturados</span>' : pesos(c.costos)}</td>
        <td class="n" data-l="Resultado">${c.margen == null ? '—' : `<span class="pill ${c.margen < 0 ? 'bad' : 'ok'}">${pesos(c.margen)}</span>`}</td></tr>`).join('')}
      </tbody></table>${t.notas.map((n) => `<div class="note">${esc(n)}</div>`).join('')}</div>
      <h2>Pagos propuestos esta semana</h2>
      <div class="card tbl">${t.pagos_semana.length ? `<table class="cards"><thead><tr><th>Proveedor</th><th>Folio</th><th>Camión</th><th class="n">Monto</th></tr></thead><tbody>
        ${t.pagos_semana.map((g) => `<tr><td data-l="Proveedor">${esc(g.proveedor)}</td><td data-l="Folio">${esc(g.folio || '')}</td><td data-l="Camión">${esc(g.camion || 'General')}</td><td class="n" data-l="Monto">${pesos(g.monto_propuesto)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Ninguno programado. Prográmalos en Gastos y diésel.</p>'}</div>`;
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
  function viajeForm(v, prop) {
    v = v || {}; prop = prop || {};
    const tr = activos('trucks'), ch = activos('drivers').filter((d) => d.puesto === 'chofer');
    return `<div class="form">
      <div><label>Fecha</label><input type="date" name="fecha" value="${esc(String(v.fecha || prop.fecha || hoy()).slice(0, 10))}"></div>
      <div><label>Obra</label><select name="obra_id">${opts(activos('obras'), (o) => o.nombre, v.obra_id, 'Elige la obra')}</select></div>
      <div class="wide"><label>Tarifa / ruta</label><select name="tarifa_id">${opts(activos('tarifas'), tarifaLbl, v.tarifa_id, 'Elige la tarifa')}</select></div>
      <div><label>Camión</label><select name="truck_id">${opts(tr, (t) => `${t.empresa} · ${truckLbl(t)}`, v.truck_id, 'Sin camión')}</select></div>
      <div><label>Chofer</label><select name="driver_id">${opts(ch, (d) => d.nombre, v.driver_id, 'Sin chofer')}</select></div>
      <div><label>No. de ticket</label><input name="ticket_no" value="${esc(v.ticket_no || prop.ticket_no || '')}"></div>
      <div><label>No. de vale</label><input name="vale_no" value="${esc(v.vale_no || '')}"></div>
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
  async function abrirViaje(v, prop, fileId, leido) {
    const m = modal(`<h2 style="margin-top:0">${v ? 'Editar viaje' : 'Registrar viaje'}</h2>
      ${fileId ? `<img class="ticket-img" src="api/v1/files/${fileId}" alt="Foto del ticket">` : ''}
      ${leido === 'modelo' ? `<div class="note">La app leyó el ticket${prop && prop.fecha_impresa ? ' (fecha impresa: ' + esc(prop.fecha_impresa) + ')' : ''}. Revisa cada dato contra la foto antes de confirmar.${prop && prop.toneladas == null ? ' No pude leer el peso neto: escríbelo.' : ''}</div>`
        : fileId ? '<div class="note">No pude leer el ticket automáticamente. Captura los datos viendo la foto.</div>' : ''}
      ${viajeForm(v, prop)}<div class="row" style="margin-top:12px">${v ? '<button class="btn primary" id="g">Guardar cambios</button>' : '<button class="btn primary" id="gc">Guardar y confirmar</button><button class="btn" id="g">Guardar sin confirmar</button>'}
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
      try { const r = await api('viajes/leer-ticket', { method: 'POST', body: fd }); m.remove(); abrirViaje(null, r.propuesta || {}, r.file_id, r.leido_por); }
      catch (er) { m.querySelector('.box').innerHTML = `<div class="err">${errMsg(er)}</div><button class="btn" data-close>Cerrar</button>`; }
    };
    document.getElementById('imp').onclick = () => {
      const m = modal(`<h2 style="margin-top:0">Importar tickets de Excel</h2><p class="muted">El archivo debe tener columnas <b>Fecha</b>, <b>Ticket</b> y <b>Toneladas</b> (como el Excel «PLANTA SANT»). Todos quedan sin confirmar.</p>
        <div class="form"><div class="wide"><label>Archivo (.xlsx o .csv)</label><input type="file" name="archivo" accept=".xlsx,.xls,.csv"></div>
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
  R.gastos = async function () {
    const est = S.gEstado || '';
    const gs = await api('gastos' + (est ? '?estado=' + est : ''));
    const tr = activos('trucks');
    main().innerHTML = `<h1>Gastos y diésel</h1><p class="sub">Cada factura de proveedor va a un camión u obra. La factura única del diésel se reparte por kilómetros.</p>
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
        <td data-l="A qué va">${g.camion ? esc(g.camion) : g.reparto.length ? `Repartido en ${g.reparto.length} camiones` : g.obra ? esc(g.obra) : '<span class="pill warn">General</span>'}</td>
        <td class="n" data-l="Total">${pesos(g.total)}</td><td class="n" data-l="Saldo">${pesos(g.saldo)}</td>
        <td data-l="Estado"><span class="pill ${{ pendiente: 'warn', programado: 'acc', pagado: 'ok' }[g.estado]}">${g.estado}</span>${g.estado === 'programado' ? `<div class="muted">${pesos(g.monto_propuesto)} sem. ${fmtF(g.semana_pago)}</div>` : ''}</td>
        <td data-l=""><div class="row">${g.file_id ? `<a class="btn small" href="api/v1/files/${g.file_id}" target="_blank" rel="noopener">Factura</a>` : ''}
          ${canEdit() && !g.truck_id ? `<button class="btn small" data-rep="${g.id}">Repartir por km</button>` : ''}
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
    main().onclick = async (e) => {
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
    trucks: ['Camiones', [['empresa', 'Empresa', 'sel', ['NeoHaul', 'TTS', 'SEMAQSA', 'Externo']], ['unidad', 'Unidad / no. económico'], ['tipo', 'Tipo'], ['capacidad_m3', 'm³'], ['placas', 'Placas'], ['chofer_id', 'Chofer habitual', 'driver'], ['notas', 'Notas'], ['active', 'Activo', 'chk']]],
    drivers: ['Choferes y mecánicos', [['nombre', 'Nombre'], ['telefono', 'WhatsApp'], ['empresa', 'Empresa', 'sel', ['NeoHaul', 'TTS', 'SEMAQSA', 'Externo']], ['puesto', 'Puesto', 'sel', ['chofer', 'mecanico']], ['salario_semanal', 'Salario semanal'], ['active', 'Activo', 'chk']]],
    obras: ['Obras', [['nombre', 'Nombre'], ['clave', 'Clave'], ['client_id', 'Cliente', 'client'], ['ingeniero', 'Ingeniero'], ['ingeniero_tel', 'WhatsApp del ingeniero'], ['active', 'Activa', 'chk']]],
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
    };
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

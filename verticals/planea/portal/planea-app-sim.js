/* PLANEA — interactive app simulator for the marketing landing (/planea/main).
   Renders a phone mockup that walks through the real app flow: Login -> Inicio
   (dashboard) -> Ingresos -> Gastos -> Ahorro -> Deuda -> Inversión -> Seguros ->
   Retiro -> Mi Patrimonio -> Mis metas -> Diagnóstico -> Salud Financiera.
   Mockup amounts (normal COP). Self-contained; injected after the hero CTA. */
(function () {
  'use strict';
  if (document.getElementById('psim-root')) return;

  // ---------- data (coherent normal-amount persona, COP) ----------
  var SCORE = 68, RANGO = 'En camino';
  function money(n) { return '$' + Number(n).toLocaleString('es-CO'); }

  // ---------- icons ----------
  var DIAMOND = '<svg viewBox="0 0 24 24" width="17" height="17" style="vertical-align:-3px"><path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M9 14 L12 8 L15 14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var HB = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#cbd5cf" stroke-width="2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#cbd5cf" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke-linecap="round"/></svg>';
  var SPARK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#0a100e"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><circle cx="17.5" cy="16.5" r="1.6"/></svg>';
  var ARROW = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="6"/><path d="M12 8l4 6H8z" fill="#fff" stroke="none"/></svg>';
  var PEN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5c6b64" stroke-width="1.8"><path d="M15 4l5 5L8 21H3v-5z"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5c6b64" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // ---------- shared blocks ----------
  function header() { return '<div class="psim-hd"><span class="psim-ic">' + HB + '</span><span class="psim-logo">' + DIAMOND + '&nbsp;Planea</span><span class="psim-ic">' + SUN + '</span></div>'; }
  function ring(sz) { sz = sz || 60; var r = sz / 2 - 5, c = 2 * Math.PI * r, off = c * (1 - SCORE / 100);
    return '<svg viewBox="0 0 ' + sz + ' ' + sz + '" width="' + sz + '" height="' + sz + '"><circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" fill="none" stroke="#1c2b24" stroke-width="5"/><circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" fill="none" stroke="#8fe6ad" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + sz / 2 + ' ' + sz / 2 + ')"/><text x="' + sz / 2 + '" y="' + (sz / 2 + 6) + '" text-anchor="middle" fill="#fff" font-size="' + (sz * 0.3) + '" font-weight="800" font-family="Inter,sans-serif">' + SCORE + '</text></svg>'; }
  function scoreBox() { return '<div class="psim-scb">' + ring(58) + '<div class="psim-scl">PUNTAJE PLANEA</div><div class="psim-scr">' + RANGO + '</div></div>'; }
  function maya() { return '<div class="psim-maya"><span class="psim-orb">' + SPARK + '</span><div class="psim-maya-t"><b>Pregúntale a Maya</b><small>Tu guía financiera IA</small></div></div>'; }
  function li(name, sub, amt) { return '<div class="psim-li"><div class="psim-li-x"><div class="psim-li-n">' + name + '</div><div class="psim-li-s">' + sub + '</div></div><div class="psim-li-a">' + money(amt) + '</div><span class="psim-li-ic">' + PEN + '</span><span class="psim-li-ic">' + CLOSE + '</span></div>'; }
  function titleRow(t, s) { return '<div class="psim-tr"><div><h2 class="psim-h2">' + t + '</h2><p class="psim-sub">' + s + '</p></div>' + scoreBox() + '</div>'; }
  function totalHdr(cap, amt) { return '<div class="psim-cap">' + cap + '</div><div class="psim-big">' + money(amt) + ' <span>COP</span></div><div class="psim-hr"></div>'; }
  function listCard(hd, rows, top) { return '<div class="psim-summary">' + (top || '') + '</div><div class="psim-card"><div class="psim-card-hd">' + hd + ' <span class="psim-add">+ Agregar</span></div>' + rows + '</div>'; }

  function moduleScreen(t, s, cap, total, cardHd, rows, summaryLabel, summarySub) {
    var top = '<div class="psim-sm-hd"><div><b>' + summaryLabel + '</b><small>' + summarySub + '</small></div><b class="psim-sm-a">' + money(total) + '</b></div>';
    return header() + '<div class="psim-scroll">' + titleRow(t, s) + totalHdr(cap, total) + listCard(cardHd, rows, top) + '</div>' + maya();
  }

  // ---------- screens ----------
  var SCREENS = {
    login: function () {
      return '<div class="psim-scroll psim-login">' +
        '<div class="psim-lg-mark">' + ARROW + '</div>' +
        '<h2 class="psim-lg-h">Iniciar sesión</h2>' +
        '<label class="psim-lbl">Correo electrónico</label><div class="psim-inp psim-inp-ph">tu@correo.com</div>' +
        '<label class="psim-lbl">Contraseña</label><div class="psim-inp">••••••••</div>' +
        '<button class="psim-grad">Ingresar</button>' +
        '<div class="psim-lg-foot">¿No tienes cuenta? <b>Regístrate</b></div></div>';
    },
    inicio: function () {
      return header() + '<div class="psim-scroll">' +
        '<div class="psim-herocard"><div class="psim-tr" style="align-items:flex-start"><div><h2 class="psim-hola">Hola, Manuel</h2><p class="psim-sub">Tus propias finanzas en un solo lugar.</p></div>' + scoreBox() + '</div>' +
        '<div class="psim-hoy"><span class="psim-cap2">HOY</span><b>Lunes, 20 de julio</b></div>' +
        '<div class="psim-chip"><span class="psim-dot"></span>Tus finanzas&nbsp;·&nbsp;Colombia</div></div>' +
        '<div class="psim-blk"><div class="psim-blk-hd"><b>Tu patrimonio</b><span class="psim-link">Ver detalle →</span></div><p class="psim-sub">Cuánto has construido hasta hoy</p>' +
        '<div class="psim-big">' + money(43000000) + ' <span>COP</span></div>' +
        '<div class="psim-btns"><button class="psim-btn-light">Ver mi patrimonio →</button><button class="psim-btn-ghost">Conectar cuentas</button></div></div>' +
        '</div>' + maya();
    },
    ingresos: function () { return moduleScreen('Ingresos', 'Todo lo que entra cada mes: sueldo, freelance, arriendos.', 'TOTAL MENSUAL · LO QUE ENTRA CADA MES', 7000000, 'Tus fuentes de ingreso',
      li('Salario', 'Salario', 5000000) + li('Freelance', 'Freelance / honorarios', 2000000), 'Tus fuentes de ingreso', 'Agrega cada entrada por separado'); },
    gastos: function () { return moduleScreen('Gastos', 'Todo lo que sale cada mes: arriendo, comida, transporte.', 'TOTAL MENSUAL · LO QUE SALE CADA MES', 3900000, 'Tus gastos mensuales',
      li('Arriendo', 'Vivienda / arriendo', 2000000) + li('Comida', 'Alimentación', 800000) + li('Transporte', 'Transporte', 400000) + li('Servicios', 'Servicios', 300000), 'Tus gastos mensuales', 'Agrega cada categoría por separado'); },
    ahorro: function () { return moduleScreen('Ahorro', 'Tu colchón de seguridad y el hábito que sostiene todo.', 'TOTAL AHORRADO · LÍQUIDO DISPONIBLE', 14000000, 'Tus cuentas de ahorro',
      li('Cuenta de ahorros', 'Cuenta de ahorros', 6000000) + li('Fondo de emergencia', 'Cuenta de ahorros', 8000000), 'Tus bolsillos de ahorro', 'Cada uno con propósito'); },
    deuda: function () { return moduleScreen('Deuda', 'Todo lo que debes, ordenado por costo y prioridad.', 'SALDO TOTAL DE DEUDA · PASIVOS ACTIVOS', 21000000, 'Tus deudas',
      li('Tarjeta Visa', 'Tarjeta de crédito · cuota $200.000/mes', 3000000) + li('Crédito vehículo', 'Crédito de consumo · cuota $650.000/mes', 18000000), 'Tus créditos y tarjetas', 'Ordenados de mayor a menor saldo'); },
    inversion: function () { return moduleScreen('Inversión', '¿Tu plata está trabajando por ti? Aquí ves dónde está.', 'PORTAFOLIO TOTAL INVERTIDO', 22000000, 'Tus inversiones',
      li('CDT', 'CDT', 8000000) + li('Acciones', 'Renta variable', 14000000), 'Tus posiciones', 'Dónde está tu plata'); },
    seguros: function () { return moduleScreen('Seguros', '¿Qué pasa si algo sale mal? Aquí ves lo que estás protegiendo.', 'COBERTURA TOTAL · VALOR ASEGURADO', 180000000, 'Tus pólizas',
      li('Seguro de vida', 'Vida', 150000000) + li('Salud', 'Salud', 25000000) + li('Exequial', 'Exequial', 5000000), 'Tus pólizas', 'Agrega cada seguro que tengas'); },
    retiro: function () { return moduleScreen('Retiro', '¿Cuánto necesitas para retirarte tranquilo? Empecemos por lo que ya tienes.', 'AHORRADO PARA TU RETIRO', 28000000, 'Tus fondos de retiro',
      li('Pensión voluntaria', 'Pensión voluntaria', 12000000) + li('Fondo privado', 'Fondo privado', 16000000), 'Tus fondos para el retiro', 'Todo lo que hoy trabaja para tu futuro'); },
    patrimonio: function () {
      return header() + '<div class="psim-scroll">' + titleRow('Mi Patrimonio', 'Todas tus finanzas en una sola lectura.') +
        totalHdr('PATRIMONIO TOTAL', 43000000) +
        '<div class="psim-card"><div class="psim-sm-hd"><div><b>Activos y pasivos</b><small>Composición actual</small></div><b class="psim-sm-a">' + money(43000000) + ' neto</b></div>' +
        '<div class="psim-bar-row"><span>Activos</span><b>' + money(64000000) + '</b></div><div class="psim-bar"><i style="width:100%;background:#7ee0a0"></i></div>' +
        '<div class="psim-bar-row"><span style="color:#e08a6a">Pasivos</span><b style="color:#e08a6a">' + money(21000000) + '</b></div><div class="psim-bar"><i style="width:33%;background:#e08a6a"></i></div>' +
        '<div class="psim-bar-row" style="border-top:1px solid rgba(255,255,255,.08);padding-top:8px"><span>Patrimonio neto</span><b>' + money(43000000) + '</b></div>' +
        '</div></div>' + maya();
    },
    metas: function () {
      function goal(name, tag, cur, tgt, pct, meses) {
        return '<div class="psim-goal"><div class="psim-goal-hd"><div class="psim-goal-ic">◎</div><div class="psim-goal-x"><b>' + name + '</b><small>' + tag + '</small></div><div class="psim-goal-a"><b>' + money(cur) + '</b><small>de ' + money(tgt) + '</small></div></div>' +
          '<div class="psim-bar"><i style="width:' + pct + '%;background:#7ee0a0"></i></div><div class="psim-goal-ft"><b>' + pct + '%</b> completado<span>' + meses + ' meses restantes</span></div></div>';
      }
      return header() + '<div class="psim-scroll">' + titleRow('Mis metas', 'Todos tus planes, en orden prioritario.') +
        '<div class="psim-card"><div class="psim-card-hd">Tus metas <span class="psim-add">2 activas</span></div>' +
        goal('Fondo de emergencia', 'Emergencia', 8000000, 23400000, 34, 10) +
        goal('Viaje a Cartagena', 'Viaje', 1500000, 5000000, 30, 5) + '</div>' +
        '<div class="psim-newgoal"><span class="psim-ng-plus">+</span><div><b>Nueva meta</b><small>Crea una meta personalizada</small></div></div>' +
        '</div>' + maya();
    },
    diagnostico: function () {
      function pill(name, w, sc) { var col = sc >= 70 ? '#7ee0a0' : sc >= 45 ? '#e0b34a' : '#e08a6a'; return '<div class="psim-pilar"><div class="psim-pilar-t"><b>' + name + '</b> · ' + w + '%<span style="color:' + col + '">' + sc + '</span></div><div class="psim-bar"><i style="width:' + sc + '%;background:' + col + '"></i></div></div>'; }
      var r = SCORE / 100, C = 2 * Math.PI * 52, off = C * (1 - r);
      return header() + '<div class="psim-scroll">' +
        '<div class="psim-cap">DIAGNÓSTICO PLANEA</div><h2 class="psim-h2">Calcula tu Puntaje Planea</h2>' +
        '<p class="psim-sub" style="margin-bottom:12px">Evalúa tus 4 pilares con la metodología del CFP Board.</p>' +
        '<div class="psim-diag"><div class="psim-diag-lbl">✦ TU PUNTAJE PLANEA</div><b class="psim-diag-hook">Estás en movimiento. Eso ya es más que la mayoría.</b>' +
        '<svg viewBox="0 0 130 130" class="psim-diag-ring"><circle cx="65" cy="65" r="52" fill="none" stroke="#1c2b24" stroke-width="8"/><circle cx="65" cy="65" r="52" fill="none" stroke="#8fe6ad" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 65 65)"/><text x="65" y="72" text-anchor="middle" fill="#fff" font-size="34" font-weight="800">' + SCORE + '</text><text x="65" y="90" text-anchor="middle" fill="#8c9a93" font-size="9" letter-spacing="2">PUNTAJE</text></svg>' +
        '<div class="psim-diag-chip">' + RANGO + '</div>' +
        '<div class="psim-cap" style="width:100%;margin-top:14px">DESGLOSE POR PILARES</div>' +
        pill('Fondo de Emergencia', 35, 62) + pill('Flujo de Caja', 25, 78) + pill('Salud de Deuda', 25, 66) + pill('Estabilidad', 15, 70) +
        '</div></div>' + maya();
    },
    salud: function () {
      function area(name, sc) { var col = sc >= 70 ? '#7ee0a0' : sc >= 45 ? '#e0b34a' : '#e08a6a'; return '<div class="psim-area"><span class="psim-area-dot" style="background:' + col + '"></span><span class="psim-area-n">' + name + '</span><b class="psim-area-s" style="color:' + col + '">' + sc + '</b></div>'; }
      return header() + '<div class="psim-scroll">' + titleRow('Salud Financiera', 'Tu tablero de vuelo financiero, con tus datos reales.') +
        '<div class="psim-card" style="text-align:center;padding-top:16px">' + ring(96) + '<div class="psim-scr" style="font-size:14px;margin-top:6px">' + RANGO + '</div><div class="psim-sub" style="font-size:11px">Salud financiera general</div></div>' +
        '<div class="psim-card"><div class="psim-card-hd">Por área</div>' +
        area('Ingresos', 90) + area('Gastos', 80) + area('Ahorro', 55) + area('Deuda', 60) + area('Inversión', 85) + area('Seguros', 88) + area('Retiro', 45) + '</div>' +
        '</div>' + maya();
    }
  };

  var ORDER = ['login', 'inicio', 'ingresos', 'gastos', 'ahorro', 'deuda', 'inversion', 'seguros', 'retiro', 'patrimonio', 'metas', 'diagnostico', 'salud'];
  var LABEL = { login: 'Ingreso', inicio: 'Inicio', ingresos: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', deuda: 'Deuda', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro', patrimonio: 'Mi Patrimonio', metas: 'Mis metas', diagnostico: 'Diagnóstico', salud: 'Salud Financiera' };

  // ---------- styles ----------
  var CSS = '' +
    '#psim-root{margin:44px auto 8px;max-width:520px;padding:0 16px;font-family:Inter,"Source Sans 3",system-ui,sans-serif;color:#f4f6f5}' +
    '#psim-root *{box-sizing:border-box}' +
    '.psim-cap-top{text-align:center;font-size:13px;letter-spacing:.02em;color:rgba(255,255,255,.72);margin-bottom:4px;font-weight:600}' +
    '.psim-cap-sub{text-align:center;font-size:12.5px;color:rgba(255,255,255,.45);margin-bottom:18px}' +
    '.psim-phone{width:300px;max-width:84vw;height:600px;max-height:76vh;margin:0 auto;background:#05090 7;background:#05090a;border-radius:40px;padding:11px;box-shadow:0 34px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06);position:relative}' +
    '.psim-notch{position:absolute;top:16px;left:50%;transform:translateX(-50%);width:96px;height:22px;background:#05090a;border-radius:0 0 14px 14px;z-index:5}' +
    '.psim-screen{height:100%;background:#0a100e;border-radius:30px;overflow:hidden;display:flex;flex-direction:column;position:relative}' +
    '.psim-fade{animation:psimfade .45s ease}@keyframes psimfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
    '.psim-hd{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 14px 4px}' +
    '.psim-ic{width:30px;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center}' +
    '.psim-logo{font-weight:800;font-size:15px;letter-spacing:-.01em}' +
    '.psim-scroll{flex:1;overflow-y:auto;padding:6px 14px 84px;scrollbar-width:none}.psim-scroll::-webkit-scrollbar{display:none}' +
    '.psim-tr{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-top:8px}' +
    '.psim-h2{font-family:"Source Sans 3",Georgia,serif;font-weight:800;font-size:26px;letter-spacing:-.02em;margin:0}' +
    '.psim-sub{color:#8c9a93;font-size:11.5px;line-height:1.4;margin:3px 0 0}' +
    '.psim-scb{flex:0 0 auto;text-align:center}.psim-scl{font-size:7.5px;letter-spacing:.12em;color:#8c9a93;font-weight:700;margin-top:2px}.psim-scr{font-size:12px;font-weight:800;font-style:italic;color:#8fe6ad}' +
    '.psim-cap{font-size:9px;letter-spacing:.11em;color:#7c8a83;font-weight:700;margin-top:16px}' +
    '.psim-cap2{font-size:8.5px;letter-spacing:.11em;color:#8c9a93;font-weight:700;display:block}' +
    '.psim-big{font-family:"Source Sans 3",sans-serif;font-weight:800;font-size:30px;letter-spacing:-.02em;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.psim-big span{font-size:12px;color:#8c9a93;font-weight:600}' +
    '.psim-hr{height:1px;background:rgba(255,255,255,.07);margin:14px 0 0}' +
    '.psim-summary{margin-top:16px}.psim-sm-hd{background:linear-gradient(120deg,rgba(126,224,160,.14),rgba(126,224,160,.03));border-left:3px solid #7ee0a0;border-radius:12px;padding:12px 13px;display:flex;justify-content:space-between;align-items:center}' +
    '.psim-sm-hd b{font-size:13px}.psim-sm-hd small{display:block;color:#8c9a93;font-size:10px;margin-top:1px}.psim-sm-a{font-size:14px}' +
    '.psim-card{margin-top:10px;background:#0f1814;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:13px 13px 6px}' +
    '.psim-card-hd{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:13px;padding-bottom:8px}' +
    '.psim-add{color:#7ee0a0;font-size:11.5px;font-weight:700}' +
    '.psim-li{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}' +
    '.psim-li-x{flex:1;min-width:0}.psim-li-n{font-weight:700;font-size:12.5px}.psim-li-s{color:#8c9a93;font-size:10px;margin-top:1px}' +
    '.psim-li-a{font-weight:800;font-size:12.5px;white-space:nowrap}.psim-li-ic{opacity:.55;flex:0 0 auto}' +
    '.psim-herocard{margin-top:8px;border-radius:18px;padding:14px;background:radial-gradient(120% 120% at 15% 0,rgba(126,224,160,.16),transparent 60%),#0f1a15;border:1px solid rgba(255,255,255,.06)}' +
    '.psim-hola{font-family:"Source Sans 3",sans-serif;font-weight:800;font-size:24px;margin:0}' +
    '.psim-hoy{margin-top:14px}.psim-hoy b{font-family:"Source Sans 3",sans-serif;font-weight:800;font-size:18px}' +
    '.psim-chip{margin-top:10px;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.12);border-radius:99px;padding:6px 12px;font-size:11px;color:#cdd8d2}.psim-dot{width:7px;height:7px;border-radius:50%;background:#7ee0a0}' +
    '.psim-blk{margin-top:16px}.psim-blk-hd{display:flex;justify-content:space-between;align-items:center}.psim-blk-hd b{font-size:16px}.psim-link{color:#7ee0a0;font-size:11.5px;font-weight:700}' +
    '.psim-btns{display:flex;gap:8px;margin-top:12px}.psim-btn-light{flex:1;background:#eef0e9;color:#0a100e;border:0;border-radius:12px;padding:11px;font-weight:800;font-size:12px}.psim-btn-ghost{flex:1;background:transparent;color:#f4f6f5;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px;font-weight:700;font-size:12px}' +
    '.psim-bar-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:8px}.psim-bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:5px}.psim-bar i{display:block;height:100%;border-radius:99px}' +
    '.psim-goal{padding:12px 0;border-top:1px solid rgba(255,255,255,.05)}.psim-goal-hd{display:flex;align-items:center;gap:9px}.psim-goal-ic{width:30px;height:30px;border-radius:9px;background:rgba(126,224,160,.14);color:#7ee0a0;display:flex;align-items:center;justify-content:center;font-size:15px}.psim-goal-x{flex:1}.psim-goal-x b{font-size:13px}.psim-goal-x small{display:block;color:#8c9a93;font-size:10px}.psim-goal-a{text-align:right}.psim-goal-a b{font-size:13px}.psim-goal-a small{display:block;color:#8c9a93;font-size:9.5px}.psim-goal-ft{display:flex;justify-content:space-between;font-size:10.5px;color:#8c9a93;margin-top:6px}.psim-goal-ft b{color:#f4f6f5}' +
    '.psim-newgoal{margin-top:10px;display:flex;align-items:center;gap:10px;border:1px dashed rgba(255,255,255,.14);border-radius:14px;padding:13px}.psim-ng-plus{width:32px;height:32px;border-radius:50%;background:rgba(126,224,160,.16);color:#7ee0a0;display:flex;align-items:center;justify-content:center;font-size:20px}.psim-newgoal b{font-size:13px}.psim-newgoal small{display:block;color:#8c9a93;font-size:10px}' +
    '.psim-diag{margin-top:14px;background:#0f1814;border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px 13px;text-align:center;display:flex;flex-direction:column;align-items:center}.psim-diag-lbl{color:#7ee0a0;font-size:10px;letter-spacing:.12em;font-weight:800}.psim-diag-hook{font-size:15px;margin:8px 0 10px;line-height:1.3}.psim-diag-ring{margin:2px 0}.psim-diag-chip{border:1px solid #e0b34a;color:#e0b34a;border-radius:99px;padding:5px 16px;font-weight:800;font-size:12px;margin-top:8px}' +
    '.psim-pilar{width:100%;margin-top:9px;text-align:left}.psim-pilar-t{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;margin-bottom:3px}' +
    '.psim-area{display:flex;align-items:center;gap:9px;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}.psim-area-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}.psim-area-n{flex:1;font-weight:700;font-size:12.5px}.psim-area-s{font-size:13px}' +
    '.psim-login{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-top:60px;background:radial-gradient(120% 80% at 50% 0,rgba(126,224,160,.1),transparent 55%)}' +
    '.psim-lg-mark{width:64px;height:64px;border-radius:16px;border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin-bottom:16px}' +
    '.psim-lg-h{font-family:"Source Sans 3",sans-serif;font-weight:800;font-size:26px;margin:0 0 22px}' +
    '.psim-lbl{align-self:flex-start;font-weight:700;font-size:12px;margin:12px 0 6px}' +
    '.psim-inp{width:100%;background:#e9edf3;color:#0a100e;border-radius:12px;padding:13px 14px;font-size:13px;text-align:left}.psim-inp-ph{color:#8792a0}' +
    '.psim-grad{width:100%;margin-top:16px;border:0;border-radius:12px;padding:14px;font-weight:800;font-size:14px;color:#0a100e;background:linear-gradient(90deg,#6fce88,#3fb0a8)}' +
    '.psim-lg-foot{margin-top:16px;font-size:12px;color:#8c9a93}.psim-lg-foot b{color:#7ee0a0}' +
    '.psim-maya{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:9px;justify-content:flex-end;padding:12px 14px;background:linear-gradient(0deg,#0a100e 55%,transparent)}.psim-orb{width:40px;height:40px;border-radius:50%;background:#f4f6f5;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.4)}.psim-maya-t{text-align:right}.psim-maya-t b{font-size:12.5px}.psim-maya-t small{display:block;color:#8c9a93;font-size:10px}' +
    /* controls */
    '.psim-ctrl{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px}.psim-nav{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s}.psim-nav:hover{background:rgba(255,255,255,.14)}' +
    '.psim-now{min-width:140px;text-align:center;color:#fff;font-weight:700;font-size:14px}.psim-now small{display:block;color:rgba(255,255,255,.5);font-size:11px;font-weight:500}' +
    '.psim-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:14px}.psim-dt{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.22);cursor:pointer;transition:.2s}.psim-dt.on{background:#7ee0a0;width:20px;border-radius:99px}' +
    '.psim-cta{display:block;text-align:center;margin:18px auto 0;color:#fff;background:linear-gradient(135deg,#3fb0a8,#6fce88);border-radius:99px;padding:12px 26px;font-weight:800;text-decoration:none;font-size:14px;width:max-content}' +
    '@media(max-width:520px){.psim-now{min-width:110px;font-size:13px}}';

  // ---------- build ----------
  var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  var root = document.createElement('div'); root.id = 'psim-root';
  root.innerHTML =
    '<div class="psim-cap-top">Míralo por dentro — así funciona Planea</div>' +
    '<div class="psim-cap-sub">Demostración interactiva · datos de ejemplo</div>' +
    '<div class="psim-phone"><div class="psim-notch"></div><div class="psim-screen" id="psim-screen"></div></div>' +
    '<div class="psim-ctrl"><button class="psim-nav" id="psim-prev" aria-label="Anterior">‹</button>' +
    '<div class="psim-now" id="psim-now"></div>' +
    '<button class="psim-nav" id="psim-next" aria-label="Siguiente">›</button></div>' +
    '<div class="psim-dots" id="psim-dots"></div>' +
    '<a class="psim-cta" href="https://planea.vip/planea/signup">Crear mi cuenta gratis →</a>';

  var i = 0, timer = null;
  function render() {
    var key = ORDER[i];
    var scr = document.getElementById('psim-screen');
    scr.innerHTML = '<div class="psim-fade" style="height:100%;display:flex;flex-direction:column">' + SCREENS[key]() + '</div>';
    document.getElementById('psim-now').innerHTML = LABEL[key] + '<small>' + (i + 1) + ' de ' + ORDER.length + '</small>';
    var dots = document.getElementById('psim-dots');
    dots.innerHTML = ORDER.map(function (_, j) { return '<span class="psim-dt' + (j === i ? ' on' : '') + '" data-j="' + j + '"></span>'; }).join('');
  }
  function go(n, manual) { i = (n + ORDER.length) % ORDER.length; render(); if (manual) restart(); }
  function tick() { i = (i + 1) % ORDER.length; render(); }
  function restart() { if (timer) clearInterval(timer); timer = setInterval(tick, 4000); }

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('#psim-next')) go(i + 1, true);
    else if (t.closest('#psim-prev')) go(i - 1, true);
    else if (t.classList && t.classList.contains('psim-dt')) go(+t.getAttribute('data-j'), true);
    else if (t.closest('.psim-phone')) go(i + 1, true);
  });
  root.querySelector('.psim-phone').addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
  root.querySelector('.psim-phone').addEventListener('mouseleave', restart);

  function mount() {
    var cta = document.querySelector('#hero a[href*="app.planea.co/score"]') || document.querySelector('#hero a[href*="/score"]');
    var anchor = cta ? cta.closest('div') : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor.nextSibling);
    else { var hero = document.querySelector('#hero .max-w-4xl') || document.querySelector('#hero') || document.body; hero.appendChild(root); }
    render(); restart();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();

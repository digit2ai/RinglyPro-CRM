/* PLANEA — Vinculación / Puntaje Planea (Documento Maestro de Ajustes, Ago 2026).
   VEINTE preguntas en orden fijo (§5) -> motor ÚNICO de 8 pilares (planea-motor.js,
   window.PlaneaMotor) -> resultado con el NÚMERO + rango + Hallazgos de Maya + las 8
   tarjetas de pilar (§9). Un solo Puntaje Planea: es el punto de partida; se afina con
   los datos reales que el usuario registra.

   §5.4 encabezado por PILAR (no numérico). §5.2 monto opcional en Q5/18/19/20 (nunca
   bloquea). §5.3 saltos: Q7 "No tengo deudas" omite Q20; Q16 "No tengo nada invertido"
   omite Q17. §12 Maya: hallazgos SIN cifras, sin productos, invitan a registrar.

   Compat de persistencia: score_data conserva {score, survey_score, rango, pilares:{8},
   pillars:{emergency_fund,cash_flow,debt_health,stability} (proxy que leen
   unified-score.cjs / maya-chat.js / planea-data.js), answers, history}. */
(function () {
  'use strict';
  var E = window.PlaneaMotor;

  // ── LAS 20 PREGUNTAS (§5) — keys y vals idénticos a planea-motor.js ───────────
  var Q = {
    1:  { key: 'edad', tag: 'Contexto', title: '¿En qué rango de edad estás?', type: 'single', auto: true, options: [
      { val: 'e1', label: '18–29' }, { val: 'e2', label: '30–39' }, { val: 'e3', label: '40–49' }, { val: 'e4', label: '50–59' }, { val: 'e5', label: '60 o más' } ] },
    2:  { key: 'ocupacion', tag: 'Contexto', title: '¿A qué te dedicas hoy?', type: 'single', auto: true, options: [
      { val: 'empleado', label: 'Empleado con contrato' }, { val: 'publico', label: 'Servidor público' }, { val: 'independiente', label: 'Independiente o por prestación de servicios' }, { val: 'negocio', label: 'Dueño de negocio o empresario' }, { val: 'pensionado', label: 'Pensionado' }, { val: 'rentista', label: 'Rentista o inversionista' } ] },
    3:  { key: 'dependientes', tag: 'Contexto', title: '¿Cuántas personas dependen económicamente de ti?', type: 'single', auto: true, options: [
      { val: 'nadie', label: 'Nadie depende de mí' }, { val: 'd1_2', label: '1 o 2 personas' }, { val: 'd3plus', label: '3 o más personas' } ] },
    4:  { key: 'variabilidad', tag: 'Contexto', title: '¿Tus ingresos son más o menos los mismos cada mes?', type: 'single', auto: true, options: [
      { val: 'fijo', label: 'Siempre me cae lo mismo, es fijo' }, { val: 'varia', label: 'Varía un poco pero más o menos sé cuánto es' }, { val: 'cambia', label: 'Cambia bastante, nunca sé exactamente cuánto va a ser' } ] },
    5:  { key: 'ahorro_constancia', tag: 'Ahorro · 1 de 2', title: 'Después de cubrir tus gastos, ¿logras guardar una parte?', type: 'single', exactKey: 'monto_ahorro_mensual', exactLabel: 'Si sabes cuánto guardas al mes, escríbelo (opcional). Nunca bloquea el avance.', placeholder: '500.000', options: [
      { val: 'casi_todos', label: 'Sí, casi todos los meses' }, { val: 'a_veces', label: 'A veces, cuando me queda algo' }, { val: 'casi_nunca', label: 'Casi nunca me queda' }, { val: 'cero', label: 'Termino el mes en cero o debiendo' } ] },
    6:  { key: 'ahorro_cobertura', tag: 'Ahorro · 2 de 2', title: 'Si dejaras de recibir ingresos hoy, ¿cuánto tiempo cubrirías tus gastos con lo guardado?', type: 'single', auto: true, options: [
      { val: 'nada', label: 'No tengo nada guardado' }, { val: 'm1', label: 'Menos de 1 mes' }, { val: 'm1_3', label: 'Entre 1 y 3 meses' }, { val: 'm3_6', label: 'Entre 3 y 6 meses' }, { val: 'm6plus', label: 'Más de 6 meses' } ] },
    7:  { key: 'deuda_tipos', tag: 'Deuda · 1 de 2', title: '¿Qué tipo de deudas tienes hoy?', hint: 'Selecciona todas las que apliquen.', type: 'multi', exclusive: 'ninguna', options: [
      { val: 'tarjeta', label: 'Tarjeta de crédito' }, { val: 'libre', label: 'Préstamo personal o de libre inversión' }, { val: 'hipotecario', label: 'Crédito hipotecario' }, { val: 'vehiculo', label: 'Crédito de vehículo' }, { val: 'educativo', label: 'Crédito educativo' }, { val: 'compras', label: 'Compras a cuotas o financiadas' }, { val: 'informal', label: 'Deuda con familiares o particulares' }, { val: 'ninguna', label: 'No tengo deudas' } ] },
    8:  { key: 'seguros_tipos', tag: 'Seguros · 1 de 2', title: '¿Qué seguros o pólizas tienes activas hoy?', hint: 'Selecciona todas las que apliquen.', type: 'multi', exclusive: ['ninguno', 'inseguro'], options: [
      { val: 'salud', label: 'Salud o medicina prepagada' }, { val: 'vida', label: 'Vida' }, { val: 'vehiculo', label: 'Vehículo' }, { val: 'hogar', label: 'Hogar' }, { val: 'empresa', label: 'Solo lo que me da la empresa' }, { val: 'ninguno', label: 'No tengo ninguno' }, { val: 'inseguro', label: 'No estoy seguro' } ] },
    9:  { key: 'seguros_suficiencia', tag: 'Seguros · 2 de 2', title: 'Si no pudieras trabajar mañana, ¿por cuánto tiempo estarían cubiertos tú y los tuyos?', type: 'single', auto: true, options: [
      { val: 'menos3', label: 'Menos de 3 meses' }, { val: '3a12', label: 'Entre 3 meses y 1 año' }, { val: 'mas1', label: 'Más de 1 año' }, { val: 'nose', label: 'No sé' } ] },
    10: { key: 'retiro_tiempo', tag: 'Retiro / Pensión · 1 de 2', title: '¿Cuánto tiempo llevas cotizando a pensión?', type: 'single', auto: true, options: [
      { val: 'menos5', label: 'Menos de 5 años' }, { val: '5a15', label: 'Entre 5 y 15 años' }, { val: 'mas15', label: 'Más de 15 años' }, { val: 'nocotizo', label: 'No cotizo' }, { val: 'nose', label: 'No sé' } ] },
    11: { key: 'retiro_regimen', tag: 'Retiro / Pensión · 2 de 2', title: '¿En qué régimen de pensión estás?', type: 'single', auto: true, options: [
      { val: 'colpensiones', label: 'Colpensiones' }, { val: 'privado', label: 'Fondo privado' }, { val: 'ninguno', label: 'En ninguno' }, { val: 'nose', label: 'No sé en cuál estoy' } ] },
    12: { key: 'patrimonio_activos', tag: 'Patrimonio · 1 de 2', title: '¿Cuáles de estos tienes a tu nombre?', hint: 'Selecciona todas las que apliquen.', type: 'multi', exclusive: 'ninguno', options: [
      { val: 'vivienda', label: 'Vivienda propia' }, { val: 'vehiculo', label: 'Vehículo' }, { val: 'propiedad', label: 'Local, lote o segunda propiedad' }, { val: 'negocio', label: 'Negocio o participación en empresa' }, { val: 'inversiones', label: 'Inversiones registradas' }, { val: 'ninguno', label: 'Ninguno todavía' } ] },
    13: { key: 'patrimonio_sucesion', tag: 'Patrimonio · 2 de 2', title: '¿Has dejado por escrito qué pasaría con tus bienes o seguros?', type: 'single', auto: true, options: [
      { val: 'definido', label: 'Sí, está todo definido' }, { val: 'algunos', label: 'Algunos beneficiarios asignados' }, { val: 'nada', label: 'No he hecho nada' }, { val: 'noaplica', label: 'No sé si me aplica' } ] },
    14: { key: 'impuestos_cumplimiento', tag: 'Impuestos · 1 de 2', title: '¿Cuál es tu situación con la declaración de renta?', type: 'single', auto: true, options: [
      { val: 'aldia', label: 'Declaro y estoy al día' }, { val: 'atraso', label: 'Declaro pero me atraso' }, { val: 'notoca', label: 'Creo que no me toca declarar' }, { val: 'nose', label: 'No sé si me toca o no' } ] },
    15: { key: 'impuestos_soportes', tag: 'Impuestos · 2 de 2', title: '¿Llevas registro de los soportes que sirven para declarar?', type: 'single', auto: true, options: [
      { val: 'organizados', label: 'Sí, organizados' }, { val: 'algunos', label: 'Algunos, sin orden' }, { val: 'ninguno', label: 'No llevo ninguno' }, { val: 'nose', label: 'No sé cuáles necesito' } ] },
    16: { key: 'inversion_donde', tag: 'Inversión · 1 de 2', title: '¿Dónde tienes dinero invertido hoy?', hint: 'Selecciona todas las que apliquen.', type: 'multi', exclusive: 'ninguno', options: [
      { val: 'cdt', label: 'CDT o ahorro programado' }, { val: 'fondos', label: 'Fondos de inversión' }, { val: 'acciones', label: 'Acciones o bonos' }, { val: 'fincaraiz', label: 'Finca raíz para renta' }, { val: 'negocio', label: 'Negocio propio' }, { val: 'cripto', label: 'Criptomonedas' }, { val: 'ninguno', label: 'No tengo nada invertido' } ] },
    17: { key: 'inversion_magnitud', tag: 'Inversión · 2 de 2', title: '¿Qué parte de tu dinero tienes invertido para que crezca?', type: 'single', auto: true, options: [
      { val: 'nada', label: 'Nada' }, { val: 'menos1', label: 'Menos de un mes de mis ingresos' }, { val: '1a6', label: 'Entre 1 y 6 meses de mis ingresos' }, { val: 'mas6', label: 'Más de 6 meses de mis ingresos' }, { val: 'nose', label: 'No sé bien qué cuenta como inversión' } ] },
    18: { key: 'rango_ingresos', tag: 'Flujo de Caja · 1 de 3', title: '¿Cuánto recibes al mes en total?', hint: 'Suma todo: sueldo, rebusque, arriendos, negocio.', type: 'exact', moneyStep: true, exactKey: 'monto_ingresos', exactLabel: 'Si conoces la cifra exacta, escríbela (opcional). Nunca bloquea el avance.', placeholder: '4.000.000', options: [
      { val: 'i1', label: 'Menos de $1.500.000' }, { val: 'i2', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'i3', label: 'Entre $3.000.000 y $6.000.000' }, { val: 'i4', label: 'Entre $6.000.000 y $12.000.000' }, { val: 'i5', label: 'Más de $12.000.000' } ] },
    19: { key: 'rango_gastos', tag: 'Flujo de Caja · 2 de 3', title: '¿Cuánto se te va al mes en total?', hint: 'Arriendo, mercado, transporte, todo lo del día a día.', type: 'exact', moneyStep: true, exactKey: 'monto_gastos', exactLabel: 'Si conoces la cifra exacta, escríbela (opcional). Nunca bloquea el avance.', placeholder: '3.000.000', options: [
      { val: 'g1', label: 'Menos de $1.500.000' }, { val: 'g2', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'g3', label: 'Entre $3.000.000 y $6.000.000' }, { val: 'g4', label: 'Entre $6.000.000 y $12.000.000' }, { val: 'g5', label: 'Más de $12.000.000' } ] },
    20: { key: 'rango_pago', tag: 'Deuda · 2 de 2', title: '¿Cuánto pagas al mes en cuotas sumando todas tus deudas?', type: 'exact', moneyStep: true, last: true, exactKey: 'monto_pago', exactLabel: 'Si conoces la cifra exacta, escríbela (opcional). Nunca bloquea el avance.', placeholder: '800.000', options: [
      { val: 'nopago', label: 'No pago cuotas' }, { val: 'p1', label: 'Menos de $500.000' }, { val: 'p2', label: 'Entre $500.000 y $1.500.000' }, { val: 'p3', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'p4', label: 'Más de $3.000.000' } ] }
  };
  var CALC_LABELS = ['Midiendo tu flujo de caja', 'Analizando tu deuda y tu ahorro', 'Evaluando seguros y retiro', 'Registrando inversión, impuestos y patrimonio', 'Construyendo tu puntaje Planea'];

  // ── Denominaciones oficiales (§2) y hallazgos §12 (SIN cifras, sin productos) ──
  var PILAR_ORDER = ['ahorro', 'flujo', 'deuda', 'retiro', 'seguros', 'inversion', 'impuestos', 'patrimonio'];
  var PILAR_LABEL = { ahorro: 'Ahorro', flujo: 'Flujo de Caja', deuda: 'Deuda', retiro: 'Retiro / Pensión', seguros: 'Seguros', inversion: 'Inversión', impuestos: 'Impuestos', patrimonio: 'Patrimonio y Sucesión' };
  var PILAR_LOWER = { ahorro: 'tu ahorro', flujo: 'tu flujo de caja', deuda: 'tu deuda', retiro: 'tu retiro', seguros: 'tu protección', inversion: 'tu inversión', impuestos: 'tus impuestos', patrimonio: 'tu patrimonio' };
  var HALLAZGO = {
    ahorro: ['Tu fondo de emergencia aún es corto. Se considera saludable cubrir entre tres y seis meses de gastos; sepáralo poco a poco, es tu escudo.', 'Ya tienes algo de colchón, aunque todavía no cubre un imprevisto completo. Sigue separando y verás subir tu puntaje.', 'Tienes un buen respaldo para imprevistos. Mantén el hábito.'],
    flujo: ['Tus gastos se acercan a tus ingresos. Un margen sano deja al menos una parte del ingreso cada mes; revisa en qué se va la plata.', 'Te queda algo de margen cada mes; puedes ampliarlo revisando tus gastos.', 'Te queda buen margen cada mes: una base sólida para planear.'],
    deuda: ['Tus pagos pesan bastante sobre tu ingreso. Mantener las cuotas por debajo de un tercio del ingreso te da más aire.', 'Tu carga de deuda es manejable, con espacio para mejorar cómo la organizas.', 'Tus pagos están en un nivel cómodo frente a tu ingreso.'],
    retiro: ['Vas temprano en la construcción de tu retiro para tu etapa. Empezar pronto suma mucho con el tiempo; registra lo que ya tienes.', 'Llevas un avance en tu retiro; hay espacio para fortalecerlo.', 'Tu tiempo cotizado va consistente con tu etapa de vida.'],
    seguros: ['Hoy tu protección es tu frente más débil. Enfócate en tener cubiertos vida y salud, y ponte una meta.', 'Tienes algo de protección; revisa si cubre lo esencial para ti y los tuyos.', 'Tu cobertura cubre los frentes principales.'],
    inversion: ['Aún no pones tu dinero a crecer. Cuando tengas fondo y sin deuda cara, este es el siguiente paso natural.', 'Ya empezaste a invertir; puedes diversificar más adelante.', 'Tu dinero está trabajando y bien distribuido.'],
    impuestos: ['Tu tema tributario está por organizar. En la sección Impuestos puedes ver tu calendario y responder tu perfil; si tienes dudas sobre si debes declarar, un contador puede confirmarlo.', 'Vas encaminado en impuestos; revisa tu calendario para no perder ninguna fecha.', 'Estás al día y con tus soportes en orden.'],
    patrimonio: ['Aún estás construyendo tu patrimonio y su organización. Deja por escrito qué pasaría con tus bienes.', 'Tienes activos; ordena beneficiarios y previsión para completar la foto.', 'Tus activos y beneficiarios están definidos.']
  };
  function band(v) { return v >= 70 ? 2 : v >= 45 ? 1 : 0; }
  function hallazgo(k, v) { return HALLAZGO[k][band(v)]; }
  var ADVERTENCIA = 'Planea presenta información con fines educativos e informativos. No constituye asesoría ni recomendación de productos financieros. Las decisiones sobre tus finanzas son siempre tuyas.';

  // ── STATE ───────────────────────────────────────────────────────────────────
  var answers = {}, current = 'intro', root, profile = null, mayaMsg = {}, savedHistory = [];
  var montosYaTransferidos = false;   // §5.2: los montos exactos se transfieren UNA sola vez

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtInput(raw) { if (!raw) return ''; return parseInt(raw, 10).toLocaleString('es-CO'); }
  function firstName(full, email) { var n = (full || '').trim().split(/\s+/)[0]; return n || ((email || '').split('@')[0] || ''); }

  // ── Secuencia activa (§5.3 saltos): omite Q17 si "No tengo nada invertido" y Q20
  //    si "No tengo deudas". La última pregunta activa muestra "Calcular". ─────────
  function activeSteps() {
    var s = [];
    for (var i = 1; i <= 20; i++) {
      if (i === 17 && Array.isArray(answers.inversion_donde) && answers.inversion_donde.indexOf('ninguno') >= 0) continue;
      if (i === 20 && Array.isArray(answers.deuda_tipos) && answers.deuda_tipos.indexOf('ninguna') >= 0) continue;
      s.push(i);
    }
    return s;
  }
  function isLast(step) { var s = activeSteps(); return s[s.length - 1] === step; }

  // ── RENDER: pregunta ─────────────────────────────────────────────────────────
  function renderQuestion(step) {
    var q = Q[step], a = answers, sel = a[q.key];
    var seq = activeSteps(), pos = seq.indexOf(step) + 1;
    var html = '<div class="dg-card"><div class="dg-prog">' + pos + ' de ' + seq.length + '</div>' +
      '<div class="dg-tag">' + esc(q.tag) + '</div>' +
      '<h3 class="dg-q">' + esc(q.title) + '</h3>';
    if (q.hint) html += '<p class="dg-hint">' + esc(q.hint) + '</p>';
    if (mayaMsg[step]) html += '<div class="dg-maya show"><div class="dg-maya-av">M</div><p>' + esc(mayaMsg[step]) + '</p></div>';

    html += '<div class="dg-opts">';
    if (q.type === 'multi') {
      var arr = Array.isArray(sel) ? sel : [];
      q.options.forEach(function (o) {
        var on = arr.indexOf(o.val) >= 0;
        html += '<button class="dg-opt dg-multi' + (on ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
          '<span class="dg-box"></span><span class="dg-lbl">' + esc(o.label) + '</span></button>';
      });
    } else {
      q.options.forEach(function (o) {
        html += '<button class="dg-opt' + (sel === o.val ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
          '<span class="dg-check"></span><span class="dg-lbl">' + esc(o.label) + '</span></button>';
      });
    }
    if (q.exactKey) {
      html += '<div class="dg-exact"><span class="pfx">$</span><input type="text" inputmode="numeric" id="dg-exact-input" data-exact="' + q.exactKey + '" placeholder="' + q.placeholder + '" value="' + fmtInput(a[q.exactKey]) + '"></div>' +
        '<div class="dg-exact-lbl">' + esc(q.exactLabel || 'Si sabes el monto exacto, escríbelo aquí (opcional)') + '</div>';
    }
    html += '</div>';

    var disabled = isStepIncomplete(step);
    html += '<div class="dg-nav' + (step === 1 ? ' solo' : '') + '">';
    if (step > 1) html += '<button class="dg-back" data-step="' + step + '">Volver</button>';
    if (isLast(step)) html += '<button class="dg-calc" data-calc' + (disabled ? ' disabled' : '') + '>Calcular mi puntaje Planea</button>';
    else html += '<button class="dg-next" data-step="' + step + '"' + (disabled ? ' disabled' : '') + '>Continuar</button>';
    html += '</div></div>';
    return html;
  }

  function isStepIncomplete(step) {
    var q = Q[step], v = answers[q.key];
    if (q.type === 'multi') return !(Array.isArray(v) && v.length > 0);
    if (q.moneyStep) {
      if (v !== undefined) return false;   // eligió un rango (incluido "No pago cuotas")
      var amt = parseInt(String(answers[q.exactKey] || '').replace(/\D/g, ''), 10);
      return !(amt > 0);                    // o escribió un monto válido
    }
    return v === undefined;                  // single: basta la opción (monto opc. no obliga)
  }

  function renderIntro() {
    return '<div class="dg-card"><div class="dg-tag">Antes de empezar</div>' +
      '<h3 class="dg-q">Empecemos por conocerte</h3>' +
      '<p class="dg-hint">Responde con información real para que tu resultado refleje mejor tu situación actual.</p>' +
      '<p class="dg-hint" style="opacity:.8">Puntaje basado en estándares internacionales de planeación financiera.</p>' +
      '<div class="dg-nav solo"><button class="dg-next" data-intro>Comenzar</button></div></div>';
  }

  function renderCalculating() {
    var items = CALC_LABELS.map(function (l, i) { return '<div class="dg-calc-item" data-ci="' + i + '"><span class="dg-cdot"></span>' + esc(l) + '</div>'; }).join('');
    return '<div class="dg-card dg-calc-screen"><div class="dg-spinner"></div>' +
      '<div class="dg-calc-title">Calculando tu puntaje Planea</div>' +
      '<div class="dg-calc-sub">Analizando tus ocho pilares de planeación…</div>' +
      '<div class="dg-calc-steps">' + items + '</div></div>';
  }

  // ── RENDER: resultado (§9) — número + rango + Hallazgos de Maya + 8 tarjetas ───
  function renderResult(r) {
    var nombre = profile ? profile.nombre : '';
    var C = 2 * Math.PI * 63, color = r.rango.color;
    var prio = (r.prioridad && r.prioridad.principal) || 'ahorro';
    var pv = Math.round((r.pilares[prio] && r.pilares[prio].puntaje) || 0);
    // §9.2: la lectura principal NO repite el texto de la tarjeta; nombra el frente prioritario.
    var apertura = (nombre ? esc(nombre) + ', ' : '') + 'tu mayor palanca ahora es ' + esc(PILAR_LOWER[prio]) + '. Es el frente que más mueve tu puntaje hoy; abajo tienes la lectura de cada área.';

    injectPexStyle();
    // Referencia general por pilar (§10.1) — en forma relativa, nunca un monto en pesos.
    var REFERENCIA = {
      ahorro: 'Entre 3 y 6 meses de gastos cubiertos', flujo: 'Margen igual o superior al 20 % del ingreso',
      deuda: 'Pagos por debajo del 30 % del ingreso mensual', retiro: 'Tiempo cotizado consistente con tu rango de edad',
      seguros: 'Cobertura de vida, salud y patrimonial vigente', inversion: 'Recursos invertidos superiores a seis meses de ingreso, en más de un instrumento',
      impuestos: 'Declaración al día y soportes organizados', patrimonio: 'Activos registrados y beneficiarios definidos'
    };
    // Sección de cada pilar (§10 «Registrar más información») y pilares con control de
    // interés §15.2 (Ahorro, Deuda, Seguros, Inversión, Retiro / Pensión).
    var SECCION = { ahorro: 'ahorro', flujo: 'ingreso', deuda: 'deuda', retiro: 'retiro', seguros: 'seguros', inversion: 'inversion', impuestos: 'impuestos', patrimonio: 'patrimonio' };
    var INTERES = { ahorro: 1, deuda: 1, seguros: 1, inversion: 1, retiro: 1 };
    // §10: tarjetas COLAPSADAS por defecto (nombre + subpuntaje + barra); se expanden con
    // un toque para ver la referencia general, el hallazgo, las acciones y el interés.
    var pilaresHtml = PILAR_ORDER.map(function (k) {
      var v = Math.round((r.pilares[k] && r.pilares[k].puntaje) || 0);
      var col = v >= 70 ? 'var(--green)' : v >= 45 ? '#e0954f' : 'var(--red)';
      var interes = INTERES[k]
        ? '<label class="dg-interes"><input type="checkbox" class="dg-int-cb" data-pilar="' + k + '"><span class="dg-int-tx"><b>Quiero saber cuáles son los productos ideales para mí</b><small>Te avisaremos cuando tengamos esa opción disponible</small></span></label>'
        : '';
      return '<details class="dg-pex">' +
        '<summary>' +
          '<div class="dg-pex-top"><span class="dg-pex-nm">' + esc(PILAR_LABEL[k]) + '</span>' +
          '<span class="dg-pex-v" style="color:' + col + '">' + v + '</span></div>' +
          '<div class="dg-pex-bar"><div class="dg-pex-fill" style="width:' + Math.max(v, 3) + '%;background:' + col + '"></div></div>' +
        '</summary>' +
        '<div class="dg-pex-body">' +
          '<div class="dg-pex-ref">Meta de referencia: ' + esc(REFERENCIA[k] || '') + '</div>' +
          '<div class="dg-pex-maya"><img class="dg-pex-av" src="/planea/portal/images/maya.png" alt="Maya"><span>' + esc(hallazgo(k, v)) + '</span></div>' +
          '<div class="dg-pex-acts"><a class="dg-pex-btn" href="/planea/portal/' + SECCION[k] + '">Registrar más información</a>' +
            '<a class="dg-pex-btn ghost" href="/planea/portal/metas">Añadir o editar meta</a></div>' +
          interes +
        '</div>' +
      '</details>';
    }).join('');

    return '<div class="dg-card dg-result">' +
      '<div class="dg-res-tag">TU PUNTAJE PLANEA</div>' +
      '<div class="dg-ringwrap"><svg viewBox="0 0 156 156"><circle cx="78" cy="78" r="63" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle id="dg-ring" cx="78" cy="78" r="63" fill="none" stroke="' + color + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 78 78)"/></svg>' +
      '<div class="dg-res-num"><b id="dg-score">0</b><small>PLANEA</small></div></div>' +
      '<div class="dg-res-badge" style="border-color:' + color + ';color:' + color + '">' + esc(r.rango.name) + '</div>' +
      renderProgress(r.score) +
      '<div class="dg-insight"><p class="dg-ins-p">' + apertura + '</p></div>' +
      '<div class="dg-res-sub">HALLAZGOS DE MAYA · IA — detalle por área (8 pilares)</div>' +
      '<div class="dg-pex-list">' + pilaresHtml + '</div>' +
      // §3.3: un solo CTA. Se retiran «Próximo paso» (flujo guiado) y «Volver a responder»
      // (las respuestas se afinan registrando datos reales en cada sección, no rehaciendo
      // el cuestionario). El botón lleva al panel.
      '<a class="dg-panel" href="/planea/portal/inicio" id="dg-done">Ir a mi panel →</a>' +
      '<p class="dg-advertencia">' + esc(ADVERTENCIA) + '</p>' +
      '<div class="dg-saved" id="dg-saved"></div>' +
      '</div>';
  }

  function injectPexStyle() {
    if (document.getElementById('dg-pex-style')) return;
    var s = document.createElement('style'); s.id = 'dg-pex-style';
    s.textContent = 'details.dg-pex{position:relative}' +
      'details.dg-pex summary{list-style:none;cursor:pointer;display:block}' +
      'details.dg-pex summary::-webkit-details-marker{display:none}' +
      'details.dg-pex summary::after{content:"⌄";position:absolute;right:15px;top:13px;color:var(--mut)}' +
      'details.dg-pex[open] summary::after{content:"⌃"}' +
      '.dg-pex-body{margin-top:11px}' +
      '.dg-pex-ref{font-size:12.5px;color:var(--mut);line-height:1.5;margin-bottom:9px}' +
      '.dg-pex-acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}' +
      '.dg-pex-btn{flex:1;min-width:140px;text-align:center;background:#12494b;color:#eafff4;text-decoration:none;border-radius:11px;padding:11px 12px;font-weight:700;font-size:13px}' +
      'body.light .dg-pex-btn{background:var(--cream);color:var(--ink)}' +
      '.dg-pex-btn.ghost{background:transparent;color:var(--txt);border:1.5px solid var(--line)}' +
      '.dg-interes{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding-top:12px;border-top:1px dashed var(--line);cursor:pointer}' +
      '.dg-interes input{width:18px;height:18px;flex:0 0 18px;margin-top:2px}' +
      '.dg-int-tx b{display:block;font-size:13px;font-weight:700}' +
      '.dg-int-tx small{display:block;font-size:12px;color:var(--mut);margin-top:2px}';
    document.head.appendChild(s);
  }

  // Control de interés §15: guarda el consentimiento por pilar en finance_meta
  // (fusiona para no pisar otras claves). NO dispara Maya ni muestra producto alguno.
  function saveInteres(pilar, on) {
    if (!window.PlaneaSB || !PlaneaSB.meGet) return;
    PlaneaSB.meGet().then(function (d) {
      var fm = (d && d.finance_meta && typeof d.finance_meta === 'object') ? d.finance_meta : {};
      var ip = (fm.interes_producto && typeof fm.interes_producto === 'object') ? fm.interes_producto : {};
      ip[pilar] = !!on; fm.interes_producto = ip;
      PlaneaSB.mePut({ finance_meta: fm }).catch(function () {});
    }).catch(function () {});
  }
  function prefillInteres() {
    if (!window.PlaneaSB || !PlaneaSB.meGet) return;
    PlaneaSB.meGet().then(function (d) {
      var ip = (d && d.finance_meta && d.finance_meta.interes_producto) || {};
      document.querySelectorAll('.dg-int-cb').forEach(function (cb) {
        if (ip[cb.getAttribute('data-pilar')] === true) cb.checked = true;
      });
    }).catch(function () {});
  }

  function renderProgress(cur) {
    var hist = (savedHistory && savedHistory.length) ? savedHistory.slice() : [{ score: cur }];
    var start = hist[0].score;
    var pct = Math.max(0, Math.min(100, cur));
    if (hist.length <= 1) {
      return '<div class="dg-prog-wrap"><div class="dg-prog-bar"><div class="dg-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="dg-prog-cap">Este es tu punto de partida. Tu Puntaje Planea irá subiendo a medida que registres tu información con Maya.</div></div>';
    }
    return '<div class="dg-prog-wrap"><div class="dg-prog-bar"><div class="dg-prog-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="dg-prog-cap">Así empezaste: ' + start + '. Así vas hoy: ' + cur + '.</div></div>';
  }

  // ── FLOW ─────────────────────────────────────────────────────────────────────
  function paint() {
    if (current === 'intro') root.innerHTML = renderIntro();
    else if (typeof current === 'number') root.innerHTML = renderQuestion(current);
  }
  function go(step) { current = step; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function next(from) {
    if (from === 'intro') { go(1); return; }
    var s = activeSteps(), idx = s.indexOf(from);
    if (idx >= 0 && idx < s.length - 1) go(s[idx + 1]);
  }
  function back(from) {
    if (from === 1 || from === 'intro') { go('intro'); return; }
    var s = activeSteps(), idx = s.indexOf(from);
    if (idx > 0) go(s[idx - 1]); else go('intro');
  }

  function selectSingle(step, val) {
    var q = Q[step];
    answers[q.key] = val;
    // §5.4 avance automático en las de opción única sin campo de monto.
    if (q.auto) {
      if (isLast(step)) { startCalc(); return; }
      next(step); return;
    }
    paint();
  }
  function toggleMulti(step, val) {
    var q = Q[step], arr = Array.isArray(answers[q.key]) ? answers[q.key].slice() : [];
    var excl = Array.isArray(q.exclusive) ? q.exclusive : (q.exclusive ? [q.exclusive] : []);
    if (excl.indexOf(val) >= 0) { arr = arr.indexOf(val) >= 0 ? [] : [val]; }
    else {
      arr = arr.filter(function (x) { return excl.indexOf(x) < 0; });
      var i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val);
    }
    answers[q.key] = arr;
    paint();
  }

  function startCalc() {
    var r = E.compute(answers);
    root.innerHTML = renderCalculating();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    CALC_LABELS.forEach(function (_, i) { setTimeout(function () { var el = document.querySelector('[data-ci="' + i + '"]'); if (el) el.classList.add('done'); }, 450 + i * 520); });
    setTimeout(function () { showResult(r); }, 3200);
  }

  function showResult(r, opts) {
    current = 'result';
    root.innerHTML = renderResult(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var C = 2 * Math.PI * 63, ring = document.getElementById('dg-ring');
    setTimeout(function () { if (ring) ring.setAttribute('stroke-dashoffset', C - (r.score / 100) * C); }, 140);
    var numEl = document.getElementById('dg-score'), t0 = performance.now(), dur = 1400;
    (function tick(now) { var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); if (numEl) numEl.textContent = Math.round(r.score * e); if (p < 1) requestAnimationFrame(tick); })(performance.now());
    if (!(opts && opts.skipPersist)) persist(r);
    prefillInteres();
  }

  // ── §5.2 Transferencia de montos exactos a su sección de destino ──────────────
  // Cuando el usuario escribió un monto exacto en P5/P18/P19/P20, se crea un REGISTRO
  // editable en la sección correspondiente (Ahorro, Ingresos, Gastos, Deuda), para no
  // pedir el mismo dato dos veces. Solo lo tecleado (el rango solo NO transfiere).
  function amt(k) { var v = parseInt(String(answers[k] || '').replace(/\D/g, ''), 10); return v > 0 ? v : 0; }
  function transferirMontos() {
    if (montosYaTransferidos || !window.PlaneaSB || !PlaneaSB.itemCreate) return;
    var reg = [];
    if (amt('monto_ingresos')) reg.push({ category: 'ingreso', name: 'Ingreso mensual (de tu diagnóstico)', type: 'recurrente', value: amt('monto_ingresos') });
    if (amt('monto_gastos')) reg.push({ category: 'gasto', name: 'Gasto mensual (de tu diagnóstico)', type: 'recurrente', value: amt('monto_gastos') });
    if (amt('monto_ahorro_mensual')) reg.push({ category: 'ahorro', name: 'Ahorro mensual (de tu diagnóstico)', type: '', value: amt('monto_ahorro_mensual') });
    if (amt('monto_pago')) reg.push({ category: 'deuda', name: 'Deuda (de tu diagnóstico)', type: '', value: 0, monthly: amt('monto_pago') });
    if (!reg.length) { montosYaTransferidos = true; return; }
    montosYaTransferidos = true;
    reg.forEach(function (it) { PlaneaSB.itemCreate(it).catch(function () {}); });   // editable por el usuario
  }

  // ── PERSISTENCIA — un solo Puntaje Planea + histórico + compat proxy ──────────
  function persist(r) {
    if (!window.PlaneaSB) return;
    var nowIso = new Date().toISOString();
    var willTransfer = !montosYaTransferidos;
    var hist = savedHistory && savedHistory.length ? savedHistory.slice() : [];
    hist.push({ score: r.score, at: nowIso, source: 'onboarding' });
    savedHistory = hist;
    var P = r.pilares, sub = function (k) { return Math.round((P[k] && P[k].puntaje) || 0); };
    var entry = {
      timestamp: nowIso, source: 'survey',
      score: r.score, survey_score: r.score, rango: r.rango.name,
      // pilares oficiales (8) del Documento Maestro
      pilares: {
        ahorro: sub('ahorro'), flujo: sub('flujo'), deuda: sub('deuda'), retiro: sub('retiro'),
        seguros: sub('seguros'), inversion: sub('inversion'), impuestos: sub('impuestos'), patrimonio: sub('patrimonio')
      },
      // proxy de compat que leen unified-score.cjs / maya-chat.js / planea-data.js
      pillars: { emergency_fund: sub('ahorro'), cash_flow: sub('flujo'), debt_health: sub('deuda'), stability: sub('patrimonio') },
      prioridad: r.prioridad,
      history: hist,
      montos_transferidos: montosYaTransferidos || willTransfer,   // §5.2: no re-transferir
      answers: answers
    };
    PlaneaSB.mePut({ score_data: entry })
      .then(function () {
        var el = document.getElementById('dg-saved'); if (el) el.textContent = 'Puntaje Planea guardado en tu perfil.';
        if (willTransfer) transferirMontos();   // §5.2: pasa los montos exactos a sus secciones (una vez)
        try { localStorage.setItem('planea-onboarded', '1'); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('planea:onboarded')); } catch (e) {}
      })
      .catch(function (e) {
        var el = document.getElementById('dg-saved'); if (el) { el.textContent = 'No se pudo guardar tu puntaje Planea (revisa tu sesión).'; el.className = 'dg-saved warn'; }
        if (window.console) console.warn('[planea-score] save failed', e && e.message);
      });
  }

  function retake() { answers = {}; mayaMsg = {}; current = 'intro'; paint(); }

  function onClick(e) {
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.hasAttribute('data-intro')) { e.preventDefault(); next('intro'); return; }
    if (t.classList.contains('dg-multi')) { e.preventDefault(); toggleMulti(+t.getAttribute('data-step'), t.getAttribute('data-val')); return; }
    if (t.classList.contains('dg-opt')) { e.preventDefault(); selectSingle(+t.getAttribute('data-step'), t.getAttribute('data-val')); return; }
    if (t.classList.contains('dg-next')) { e.preventDefault(); if (!t.hasAttribute('disabled')) next(+t.getAttribute('data-step')); return; }
    if (t.classList.contains('dg-back')) { e.preventDefault(); back(+t.getAttribute('data-step')); return; }
    if (t.hasAttribute('data-calc')) { e.preventDefault(); if (!t.hasAttribute('disabled')) startCalc(); return; }
    if (t.id === 'dg-maya-btn') { e.preventDefault(); if (window.MayaChat) MayaChat.open(); else location.href = '/planea/portal/inicio'; return; }
    if (t.id === 'dg-retake') { e.preventDefault(); retake(); return; }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'dg-exact-input') {
      var raw = t.value.replace(/\D/g, '');
      answers[t.getAttribute('data-exact')] = raw; t.value = fmtInput(raw);
      refreshNavDisabled();
    }
  }
  function refreshNavDisabled() {
    if (typeof current !== 'number') return;
    var disabled = isStepIncomplete(current);
    var btn = root.querySelector('.dg-next, .dg-calc');
    if (btn) { if (disabled) btn.setAttribute('disabled', ''); else btn.removeAttribute('disabled'); }
  }

  function readOurUser() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/);
      if (!m) return null;
      var v = m[1];
      for (var i = 0; i < 3; i++) { try { return JSON.parse(v); } catch (e) {} var d; try { d = decodeURIComponent(v); } catch (e) { break; } if (d === v) break; v = d; }
      return null;
    } catch (e) { return null; }
  }

  function boot() {
    root = document.getElementById('dg-root'); if (!root || !E) return;
    root.addEventListener('click', onClick);
    // Control de interés §15 — guarda el consentimiento por pilar (sin disparar Maya).
    root.addEventListener('change', function (e) {
      var cb = e.target;
      if (cb && cb.classList && cb.classList.contains('dg-int-cb')) saveInteres(cb.getAttribute('data-pilar'), cb.checked);
    });
    root.addEventListener('input', onInput);

    var ou = readOurUser();
    if (ou) profile = { nombre: firstName(ou.full_name, ou.email), email: ou.email || '' };

    function startSurvey() { current = 'intro'; paint(); }

    if (window.PlaneaSB) {
      PlaneaSB.meGet().then(function (d) {
        if (d && d.full_name) profile = { nombre: firstName(d.full_name, d.email), email: d.email || '' };
        var sd = d && d.score_data;
        savedHistory = (sd && Array.isArray(sd.history)) ? sd.history : [];
        montosYaTransferidos = !!(sd && sd.montos_transferidos);   // §5.2: ya se hizo una vez
        // Ya completado con el ESQUEMA NUEVO (marcador: answers.edad) -> muestra el resultado
        // guardado. Un perfil con respuestas del esquema viejo re-hace la vinculación (el
        // motor cambió; no se recalcula sobre respuestas incompatibles).
        if (sd && sd.score != null && sd.answers && sd.answers.edad && !/[?&]edit=1/.test(location.search)) {
          answers = sd.answers;
          var r = E.compute(answers);
          var stale = sd.score !== r.score; // self-heal si cambió la fórmula
          showResult(r, { skipPersist: !stale });
        } else {
          startSurvey();
        }
      }).catch(function (e) {
        if (e && /\b401\b/.test(e.message || '')) { location.replace('/planea/login'); return; }
        startSurvey();
      });
    } else { startSurvey(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

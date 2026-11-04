'use strict';

/**
 * RECORRIDO NARRADO (copia en español para Synthex SAI Discovery).
 *
 * Tres piezas interactivas y una voz. Lina lee la página con la ruta Edge TTS
 * sin clave del repo (/api/tts/edge), con la voz del navegador como respaldo.
 *
 * LAS CIFRAS VAN ESCRITAS CON PALABRAS EN EL GUION, porque la voz lee mal los
 * dígitos y los importes. El texto EN PANTALLA conserva los dígitos.
 */

const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════════════
   NARRACIÓN — el índice 0 es la introducción, 1..6 son las seis secciones
   ════════════════════════════════════════════════════════════════════════ */
const SCRIPT_ES = [
    "Hola, soy Lina, la voz de Synthex SAI. Te voy a explicar Synthex SAI Discovery en unos seis minutos, sin tecnicismos. La idea completa en una frase: trabajas normalmente durante una semana. Algo anota discretamente qué programas usaste y cuánto tardó cada tarea, nunca lo que escribiste. Al final recibes un documento que te dice cuánto cuesta realmente tu trabajo y qué conviene automatizar primero.",

    "¿Y por qué no simplemente preguntar? Porque la respuesta siempre es una suposición. Pregúntale a alguien cuánto tarda la facturación y escucharás: unas cuatro horas por semana. Eso es una sensación redondeada. Obsérvalo en cambio y obtienes: diez horas y media por semana cada uno, entre dos personas, en dieciocho ejecuciones observadas. Una de esas cifras sirve para un caso de negocio. La otra no. Y hay algo más: nadie menciona nunca que copia datos de una pantalla a otra, porque lo recuerda como parte del trabajo y no como trabajo. Ese hábito suele ser lo más caro de la empresa, y solo se encuentra observando.",

    "Ahora, la parte que a todos les preocupa. ¿Qué graba realmente? Mira las dos columnas de esta página y pulsa el botón. A la izquierda está lo que la persona hizo de verdad. A la derecha está absolutamente todo lo que llegó a nuestro servidor. Fíjate en lo que nunca cruza: el nombre del cliente, el importe, la dirección que escribió, el número de factura que iba en la dirección web. La página en la que estaba se convierte solo en: Salesforce, pedidos, editar. Y esto no es una promesa: no existe ningún lugar en nuestra base de datos donde guardar lo demás. Esas columnas no existen. El grabador lo elimina en tu computadora, y el servidor lo vuelve a eliminar al llegar y cuenta lo que quitó, para que puedas comprobar que el muro funciona en vez de creernos.",

    "Este es el producto completo, seis pantallas. Primero, instalas el grabador y pegas tu clave. Segundo, trabajas normalmente, y una barra permanece visible arriba de cada página todo el tiempo, porque un grabador que nadie puede ver es un espía, sin importar qué recoja. Tercero, agrupa lo que vio en procesos propuestos: este ocurrió dieciocho veces, tomó diez horas y media por semana y cruzó cuatro programas. Cuarto, una persona confirma cada uno y escribe una tarifa por hora, porque un navegador puede medir el tiempo pero no puede saber cuánto gana nadie. Quinto, seis preguntas que solo tú puedes responder. Y sexto, tu hoja de ruta.",

    "Ahora el dinero, porque aquí es donde la mayoría de los informes se vuelven vagos y este no. Seis pasos, todos aritmética que puedes comprobar en papel: pulsa el botón que está a mi lado y se construyen uno a uno. Empieza con tiempo medido y una tarifa que alguien escribió. Multiplica esas dos cosas y descubres que esta empresa gasta ciento cuarenta y siete mil dólares al año haciendo este trabajo a mano. Después decide qué se permite siquiera en un primer proyecto: todo lo que ve un cliente queda fuera, todo lo que toca datos regulados queda fuera, y todo donde un error no se puede deshacer queda fuera. Sobrevivieron dos procesos. Dimensionar esos dos da nueve mil ochocientos dólares, mostrado como rango, porque una cifra exacta sobre software que nadie ha construido todavía es una ficción. Y entonces llega la cifra que de verdad termina la discusión: lo máximo que puedes perder son diez mil doscientos noventa dólares. Eso es la construcción más un mes de operación, si no devuelve absolutamente nada y lo apagas.",

    "Dos reglas mantienen todo esto honesto, y ambas están impuestas en el software, no prometidas en una reunión de ventas. Regla uno: el tiempo se mide, el dinero lo escribe una persona. Si nadie introduce una tarifa por hora para un proceso, ese proceso muestra sus horas y aporta exactamente cero dólares, y el informe lo dice por su nombre, en vez de tomar discretamente un promedio del sector y presentarlo como tu cifra. Regla dos: una semana corta se reporta, nunca se estira. Si solo observamos dos días, no multiplicamos por tres y medio para fabricar una semana. Eso convertiría una suposición en algo que parece exactamente una medición. Y una cosa más: si te saltas una de las seis preguntas, se niega a terminar. No construye una hoja de ruta alrededor de un hueco. Se detiene y te dice qué respuesta falta, porque un documento seguro de sí mismo construido sobre cosas que nadie preguntó es justo lo que a la mayoría ya le vendieron una vez.",

    "Te toca. Crea una cuenta gratis, toma un minuto. Crea una clave e instala el grabador en las máquinas donde ocurre el trabajo de verdad. Después déjalo en paz una semana completa, incluyendo el día en que cae el cierre de mes, porque ese suele ser el caro. Vuelve, confirma los procesos que encontró y ponle una tarifa por hora a los que puedas. Responde las seis preguntas. Pulsa ejecutar. Tendrás un tablero de evaluación, un plan de tres fases con costos reales, y un siguiente paso lo bastante pequeño como para decir que sí. Todo gratis, y todo tuyo, construyas o no algo con Synthex SAI."
];
// Solo español: ambas claves apuntan al mismo guion para que segs() nunca quede vacío.
const SCRIPT = { es: SCRIPT_ES, en: SCRIPT_ES };

/* ════════════════════════════════════════════════════════════════════════
   LINA — voz neuronal primero, voz del navegador como respaldo
   ════════════════════════════════════════════════════════════════════════ */
(function ava() {
  const synth = window.speechSynthesis;
  const orb = $('orb'), status = $('status'), playAll = $('playAll');
  const pauseBtn = $('pause'), stopBtn = $('stop'), hd = $('hd');
  const voiceSel = $('voiceSel'), mode = $('mode');
  const secs = Array.prototype.slice.call(document.querySelectorAll('.sec'));

  let lang = 'es', voice = 'dalia';
  let queue = [], qi = 0, runMode = null, token = 0, paused = false;
  let playbackMode = null, audio = null, neuralOK = true, cache = {}, browserVoice = null;

  // ONE FAILED SEGMENT MUST NOT DOWNGRADE THE REST OF THE PRESENTATION.
  // The first version set neuralOK=false on any error, so a single lost
  // request meant the voice spoke, paused, and a robot finished the deck — which is
  // exactly what a listener reported. A miss now falls back for THAT segment
  // only; the voice is given up on solely when the route is genuinely down,
  // which is what three consecutive failures indicate.
  let consecutiveMisses = 0;
  const GIVE_UP_AFTER = 3;

  function neuralMissed() {
    consecutiveMisses++;
    if (consecutiveMisses >= GIVE_UP_AFTER) { neuralOK = false; setMode(); }
  }
  function neuralWorked() { consecutiveMisses = 0; }

  const segs = () => SCRIPT[lang];

  function pickBrowserVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    browserVoice = vs.filter(v => v.lang && v.lang.toLowerCase().indexOf(lang) === 0)[0] || vs[0] || null;
  }
  if (synth) { pickBrowserVoice(); synth.onvoiceschanged = pickBrowserVoice; }

  const useNeural = () => hd.checked && neuralOK;
  function setMode() { mode.textContent = useNeural() ? 'HD' : 'voz del navegador'; }
  setMode();

  voiceSel.addEventListener('change', function () {
    voice = this.value;
    lang = voice === 'dalia' ? 'es' : 'en';
    clearCache(); pickBrowserVoice();
    status.textContent = 'Voz cambiada. Pulsa reproducir.';
  });
  hd.addEventListener('change', setMode);
  function clearCache() {
    Object.keys(cache).forEach(k => { try { URL.revokeObjectURL(cache[k]); } catch (e) {} });
    cache = {};
  }

  function requestNeural(i) {
    return fetch('/api/tts/edge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: segs()[i], voice })
    }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
      .then(b => { if (!b || b.size < 200) throw new Error('empty'); return b; });
  }

  /**
   * One retry before giving up on a segment. A miss here is nearly always a
   * cold connection losing a race, and the second attempt reuses a warm path —
   * so retrying costs a second and saves the voice.
   */
  function fetchNeural(i) {
    const key = voice + '|' + i;
    if (cache[key]) return Promise.resolve(cache[key]);
    return requestNeural(i)
      .catch(() => requestNeural(i))
      .then(b => { const u = URL.createObjectURL(b); cache[key] = u; return u; });
  }

  function setActive(i) {
    secs.forEach(s => s.classList.remove('active'));
    const el = secs.find(s => Number(s.dataset.i) === i);
    if (el) { el.classList.add('active'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  function speaking() {
    status.textContent = runMode === 'all'
      ? `Lina está hablando… (${qi + 1} de ${queue.length})`
      : 'Reproduciendo sección…';
  }

  function run(t) {
    if (t !== token) return;
    if (qi >= queue.length) return finish();
    const i = queue[qi];
    setActive(i);
    const advance = () => { if (t !== token) return; qi++; run(t); };
    if (useNeural()) {
      status.textContent = 'Preparando voz…';
      // Two ahead, not one. The request that makes a listener wait is always
      // the one that was not already in flight during the previous segment.
      for (let n = 1; n <= 2; n++) {
        if (qi + n < queue.length) fetchNeural(queue[qi + n]).catch(() => {});
      }
      fetchNeural(i).then(url => {
        if (t !== token) return;
        neuralWorked();
        playbackMode = 'neural'; audio = new Audio(url);
        audio.onended = advance;
        audio.onerror = () => { neuralMissed(); browserSpeak(i, advance); };
        orb.classList.add('speaking'); speaking();
        audio.play().catch(() => { neuralMissed(); browserSpeak(i, advance); });
      }).catch(() => {
        if (t !== token) return;
        neuralMissed();
        // Say so, rather than swapping the voice without explanation.
        status.textContent = 'Esta sección se leerá con la voz del navegador.';
        browserSpeak(i, advance);
      });
    } else browserSpeak(i, advance);
  }

  function browserSpeak(i, onEnd) {
    if (!synth) return onEnd();
    playbackMode = 'browser';
    const u = new SpeechSynthesisUtterance(segs()[i]);
    if (browserVoice) u.voice = browserVoice;
    u.lang = browserVoice ? browserVoice.lang : (lang === 'es' ? 'es-MX' : 'en-US');
    u.rate = 1; u.pitch = 1.02;
    u.onstart = () => { orb.classList.add('speaking'); speaking(); };
    u.onend = onEnd; u.onerror = onEnd;
    synth.speak(u);
  }

  function start(q, m) {
    if (synth) synth.cancel();
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    queue = q; qi = 0; runMode = m; paused = false; token++;
    pauseBtn.disabled = false; stopBtn.disabled = false; playAll.disabled = true;
    pauseBtn.textContent = 'Pausar';
    run(token);
  }
  function finish() {
    token++; orb.classList.remove('speaking');
    secs.forEach(s => s.classList.remove('active'));
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    pauseBtn.disabled = true; stopBtn.disabled = true; playAll.disabled = false;
    status.textContent = 'Terminado. Pulsa de nuevo para repetir.';
  }

  playAll.addEventListener('click', () => start(segs().map((_, i) => i), 'all'));
  document.querySelectorAll('.listen').forEach(b =>
    b.addEventListener('click', function () { start([Number(this.dataset.play)], 'one'); }));

  pauseBtn.addEventListener('click', () => {
    if (!paused) {
      paused = true; pauseBtn.textContent = 'Reanudar';
      orb.classList.remove('speaking');
      status.textContent = 'En pausa.';
      if (playbackMode === 'neural' && audio) audio.pause(); else if (synth) synth.pause();
    } else {
      paused = false; pauseBtn.textContent = 'Pausar';
      orb.classList.add('speaking'); speaking();
      if (playbackMode === 'neural' && audio) audio.play(); else if (synth) synth.resume();
    }
  });
  stopBtn.addEventListener('click', finish);
  window.addEventListener('beforeunload', () => {
    if (synth) synth.cancel();
    if (audio) { try { audio.pause(); } catch (e) {} }
  });
})();

/* ════════════════════════════════════════════════════════════════════════
   DEMOSTRACIÓN DE LIMPIEZA — los mismos seis pasos, vistos dos veces
   ════════════════════════════════════════════════════════════════════════ */
const DEMO = [
  { act: 'Abrió una página',
    did: 'harborline.my.salesforce.com/orders/8837/edit?ref=INV-44021&q=acme',
    got: 'Salesforce · /orders/:id/edit',
    gone: ['el número de factura', 'el término de búsqueda'] },
  { act: 'Escribió en un campo',
    did: 'Facturar a: ACME Corporation — $12,480.00 — 44 Harbor Way',
    got: 'escribió en un campo · 45 segundos',
    gone: ['el cliente', 'el importe', 'la dirección'] },
  { act: 'Copió un valor',
    did: 'Copió "PO-99413" al portapapeles',
    got: 'copió algo · 6 segundos',
    gone: ['el contenido del portapapeles'] },
  { act: 'Cambió de programa',
    did: 'quickbooks.intuit.com/app/invoice',
    got: 'QuickBooks · /app/invoice · cambió de programa',
    gone: [] },
  { act: 'Lo pegó',
    did: 'Pegó "PO-99413" en Número de referencia',
    got: 'pegó en un campo · 52 segundos',
    gone: ['el valor', 'el nombre del campo'] },
  { act: 'Pulsó Guardar',
    did: 'Pulsó el botón "Aprobar factura INV-44021"',
    got: 'pulsó un botón · 3 segundos',
    gone: ['el texto del botón'] }
];

(function redactionDemo() {
  const did = $('didList'), got = $('gotList'), count = $('demoCount');
  let timer = null, i = 0;

  function reset() {
    clearInterval(timer); timer = null; i = 0;
    did.innerHTML = ''; got.innerHTML = '';
    count.textContent = '';
    $('demoPlay').textContent = 'Míralo suceder';
  }
  function step() {
    if (i >= DEMO.length) {
      clearInterval(timer); timer = null;
      $('demoPlay').textContent = 'Reproducir de nuevo';
      const stripped = DEMO.reduce((a, d) => a + d.gone.length, 0);
      count.textContent = `${DEMO.length} acciones · ${stripped} datos descartados antes de guardar nada`;
      return;
    }
    const d = DEMO[i];
    did.insertAdjacentHTML('beforeend',
      `<div class="demo-row"><div class="act">${d.act}</div><div class="txt strike">${esc(d.did)}</div></div>`);
    got.insertAdjacentHTML('beforeend',
      `<div class="demo-row"><div class="act">${d.act}</div><div class="txt kept">${esc(d.got)}</div>` +
      d.gone.map(g => `<span class="gone">${esc(g)}: descartado</span>`).join('') + `</div>`);
    i++;
  }
  $('demoPlay').addEventListener('click', () => {
    if (timer) return;
    if (i >= DEMO.length) reset();
    timer = setInterval(step, 900); step();
  });
  $('demoReset').addEventListener('click', reset);
})();

/* ════════════════════════════════════════════════════════════════════════
   EL SIMULADOR — seis pantallas
   ════════════════════════════════════════════════════════════════════════ */
const SCREENS = [
  {
    tab: '1 · Instalar', url: 'chrome://extensions',
    caption: 'Pegas tu clave una vez. No hay nada más que configurar.',
    html: `<h3>Conecta el grabador</h3><div class="sub">Una clave, pegada una vez, en cada máquina donde ocurre el trabajo.</div>
      <div style="max-width:340px">
        <label>Dirección de Synthex SAI</label><div class="fakefield" style="width:100%">https://synthexsai.com</div>
        <label>Clave de ingesta</label><div class="fakefield" style="width:100%">synthex_dk_7Kq…9fT</div>
        <div style="margin-top:16px"><span class="fakebtn p">Conectar</span></div>
        <p class="faint" style="margin-top:14px">Esta clave solo puede enviar trabajo. No puede leer tu evaluación: esa es otra clave, así que la que está en cincuenta portátiles es inofensiva si se filtra.</p>
      </div>`
  },
  {
    tab: '2 · Trabajar', url: 'harborline.my.salesforce.com/orders/8837/edit',
    caption: 'Una barra permanece visible todo el tiempo. Nunca es oculto.',
    html: `<div class="banner-demo">Synthex SAI Discovery está grabando la forma de este trabajo: qué programa, qué tipo de acción y cuánto tiempo. No lo que escribes, no el contenido de la página, no la barra de direcciones más allá del nombre del sitio.</div>
      <h3>Tú solo trabajas</h3><div class="sub">Sin formularios, sin etiquetas, sin cronómetro. Déjalo funcionando una semana completa.</div>
      <div class="mockrow"><div><div class="nm">Salesforce</div><div class="meta">abrió un pedido · 42 segundos</div></div><span class="fakebtn">registrado</span></div>
      <div class="mockrow"><div><div class="nm">QuickBooks</div><div class="meta">cambió de programa · escribió en un campo · 88 segundos</div></div><span class="fakebtn">registrado</span></div>
      <div class="mockrow"><div><div class="nm">Google Sheets</div><div class="meta">pegó en un campo · 51 segundos</div></div><span class="fakebtn">registrado</span></div>
      <p class="faint" style="margin-top:14px">Tres programas para una sola factura. Ese cruce es lo que una entrevista nunca saca a la luz.</p>`
  },
  {
    tab: '3 · Agrupa', url: 'synthexsai.com/discovery',
    caption: 'Sugerencias, no conclusiones. Todo dice "propuesto".',
    html: `<h3>Esto es lo que creo que vi</h3><div class="sub">Las ejecuciones con la misma forma se agrupan en un proceso propuesto. Son suposiciones hasta que digas lo contrario.</div>
      <div class="mockrow"><div><div class="nm">conciliación diaria de facturas <span class="pill yellow">propuesto</span></div>
        <div class="meta">10.6 h/semana por persona · 2 personas · 18 ejecuciones en 10 días · confianza alta</div>
        <div class="meta">Salesforce · QuickBooks · Google Sheets · Gmail</div></div>
        <div class="acts"><span class="fakebtn p">Confirmar</span><span class="fakebtn">No es un proceso</span></div></div>
      <div class="mockrow"><div><div class="nm">revisión de paquetes de transportistas <span class="pill yellow">propuesto</span></div>
        <div class="meta">4.6 h/semana · 1 persona · 14 ejecuciones en 14 días · confianza alta</div></div>
        <div class="acts"><span class="fakebtn p">Confirmar</span><span class="fakebtn">No es un proceso</span></div></div>
      <div class="mockrow"><div><div class="nm">cotizaciones de tarifas a clientes <span class="pill yellow">propuesto</span></div>
        <div class="meta">2.3 h/semana · 3 personas · 18 ejecuciones en 8 días · confianza alta</div></div>
        <div class="acts"><span class="fakebtn p">Confirmar</span><span class="fakebtn">No es un proceso</span></div></div>`
  },
  {
    tab: '4 · Tú confirmas', url: 'synthexsai.com/discovery',
    caption: 'La tarifa es la única forma en que entra un dólar al sistema.',
    html: `<h3>Confírmalo y dile cuánto cuesta una hora</h3><div class="sub">Un navegador puede medir el trabajo. No puede saber cuánto gana nadie, así que pregunta.</div>
      <div class="mockrow" style="flex-direction:column;align-items:stretch">
        <div><div class="nm">conciliación diaria de facturas <span class="pill green">confirmado</span> <span class="pill green">con costo</span></div>
        <div class="meta">10.6 h/semana por persona · 2 personas · medido</div></div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px">
          <div><label>Costo por hora con cargas</label><div class="fakefield">44</div></div>
          <div><label>Lo ve un cliente</label><div class="fakefield">no</div></div>
          <div><label>Datos regulados</label><div class="fakefield">no</div></div>
          <div><label>Costo de un error</label><div class="fakefield">medio</div></div>
        </div></div>
      <div class="mockrow" style="flex-direction:column;align-items:stretch">
        <div><div class="nm">liquidación de choferes <span class="pill green">confirmado</span> <span class="pill red">sin tarifa</span></div>
        <div class="meta">22.0 h/semana · 1 persona · medido</div></div>
        <div style="margin-top:14px;max-width:180px"><label>Costo por hora con cargas</label><div class="fakefield empty">sin definir</div></div>
        <p class="faint" style="margin-top:10px">En blanco a propósito. Este proceso mostrará sus 22 horas y aportará <b>cero dólares</b>, y el informe lo nombrará en vez de adivinar.</p></div>`
  },
  {
    tab: '5 · Seis preguntas', url: 'synthexsai.com/discovery',
    caption: 'Seis. No cuarenta. Lo demás se midió.',
    html: `<h3>Las seis cosas que nadie puede observar</h3><div class="sub">Una entrevista de preparación completa pregunta unas cuarenta cosas. Más de treinta se midieron, así que no se preguntan.</div>
      <div class="qrow"><span>¿Qué preocupación es el verdadero obstáculo para ti?</span><span class="a">Ya me vendieron esto de más antes</span></div>
      <div class="qrow"><span>¿Cuánto podrías gastar una vez sin perder el sueño si no devolviera nada?</span><span class="a">$22,000</span></div>
      <div class="qrow"><span>¿Qué riesgos te quitan el sueño?</span><span class="a">Equivocarse con seguridad · ánimo del equipo</span></div>
      <div class="qrow"><span>¿Confiarías en un reporte sacado ahora mismo?</span><span class="a">3 de 5</span></div>
      <div class="qrow"><span>¿Qué tan fácil es sacar datos de esos sistemas?</span><span class="a">3 de 5</span></div>
      <div class="qrow"><span>¿El trabajo toca datos personales o de pago?</span><span class="a">Sí</span></div>
      <p class="faint" style="margin-top:16px">Sáltate una y se niega a producir una hoja de ruta. Se detiene y nombra la respuesta que falta.</p>`
  },
  {
    tab: '6 · Tu hoja de ruta', url: 'synthexsai.com/discovery/r/CpZrYJ…',
    caption: 'Gratis. Tuya. Se comparte o se imprime en PDF.',
    html: `<h3>Harborline Freight — Hoja de ruta de preparación para IA</h3>
      <div class="sub">Hay una cosa que resolver antes de un piloto, y se mide en días.</div>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px">
        <div class="mockrow" style="display:block"><div class="meta">Comodidad con el costo</div><div class="nm" style="color:var(--good)">93 verde</div></div>
        <div class="mockrow" style="display:block"><div class="meta">Comodidad con el riesgo</div><div class="nm" style="color:var(--good)">95 verde</div></div>
        <div class="mockrow" style="display:block"><div class="meta">Preparación de los datos</div><div class="nm" style="color:var(--warn)">56 amarillo</div></div>
      </div>
      <div class="mockrow" style="border-color:rgba(240,100,90,.4)"><div><div class="nm">Resolver primero</div>
        <div class="meta">Datos personales sin acuerdo de tratamiento: fírmalo, o sácalo del alcance de la Fase 1</div></div><span class="fakebtn">2 días</span></div>
      <div class="mockrow" style="border-color:var(--blue)"><div><div class="nm">Fase 1 — Probarlo en una sola cosa</div>
        <div class="meta">conciliación diaria de facturas · revisión de paquetes de transportistas</div>
        <div class="meta">4 semanas · $6,860 – $12,740 · lo máximo que puedes perder: $10,290</div></div><span class="fakebtn p">riesgo bajo</span></div>
      <div class="mockrow"><div><div class="nm">Fase 2 — Ampliar lo que funcionó</div>
        <div class="meta">Solo se financia si la Fase 1 pasó su compuerta</div></div><span class="fakebtn">8 semanas</span></div>
      <div class="mockrow"><div><div class="nm">Fase 3 — Cambiar cómo se hace el trabajo</div>
        <div class="meta">Deliberadamente sin precio</div></div><span class="fakebtn">—</span></div>`
  }
];

(function simulator() {
  const steps = $('simSteps'), screen = $('simScreen'), url = $('simUrl'), cap = $('simCaption');
  let cur = 0, auto = null;

  steps.innerHTML = SCREENS.map((s, i) => `<button data-s="${i}">${s.tab}</button>`).join('');
  function show(i) {
    cur = Math.max(0, Math.min(SCREENS.length - 1, i));
    const s = SCREENS[cur];
    screen.innerHTML = s.html;
    url.textContent = s.url;
    cap.textContent = s.caption;
    steps.querySelectorAll('button').forEach((b, bi) => {
      b.classList.toggle('on', bi === cur);
      b.classList.toggle('done', bi < cur);
    });
    $('simPrev').disabled = cur === 0;
    $('simNext').disabled = cur === SCREENS.length - 1;
  }
  steps.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { stopAuto(); show(Number(b.dataset.s)); } });
  $('simNext').addEventListener('click', () => { stopAuto(); show(cur + 1); });
  $('simPrev').addEventListener('click', () => { stopAuto(); show(cur - 1); });
  function stopAuto() { if (auto) { clearInterval(auto); auto = null; $('simAuto').textContent = 'Reproducir las seis'; } }
  $('simAuto').addEventListener('click', () => {
    if (auto) return stopAuto();
    $('simAuto').textContent = 'Detener';
    show(0);
    auto = setInterval(() => {
      if (cur >= SCREENS.length - 1) return stopAuto();
      show(cur + 1);
    }, 3800);
  });
  show(0);
})();

/* ════════════════════════════════════════════════════════════════════════
   LA CALCULADORA — los mismos seis pasos que ejecutan los motores
   ════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { k: 'Paso 1 — medido, todavía sin dinero', h: '¿Cuánto tarda?',
    sum: '1,818 minutos observados  =  30.3 horas\n30.3 horas ÷ 2 personas ÷ (10 días ÷ 7)',
    out: '10.6 horas por semana, cada uno',
    why: 'Directo del grabador. Dieciocho ejecuciones, diez días, dos personas. Aquí no interviene ninguna tarifa, estimación ni referencia del sector.' },
  { k: 'Paso 2 — esto lo escribe una persona', h: '¿Cuánto cuesta una hora?',
    sum: 'Costo por hora con cargas, ingresado por el dueño',
    out: '$44 / hora',
    why: 'La única puerta por la que puede entrar un dólar. Déjalo en blanco y este proceso aporta cero, y el informe lo nombra como sin costo.' },
  { k: 'Paso 3 — multiplicar', h: '¿Cuánto te está costando ahora?',
    sum: '10.6 h/sem × 2 personas × 52 semanas = 1,103 horas\n1,103 horas × $44',
    out: '$48,551 / año — solo en este proceso',
    why: 'Haz lo mismo con cada proceso: $48,551 + $9,050 + $21,792 + $0 = $79,393. Suma los $68,000 que el dueño ya sabía que estaba perdiendo y llegas a los $147,393 del informe.' },
  { k: 'Paso 4 — las reglas', h: '¿Qué se permite siquiera en un primer proyecto?',
    sum: 'conciliación diaria de facturas         PERMITIDO\nrevisión de paquetes de transportistas  PERMITIDO\ncotizaciones de tarifas a clientes      BLOQUEADO — lo ve un cliente\nliquidación de choferes                 BLOQUEADO — datos regulados; errores irreversibles',
    out: '2 procesos califican',
    why: 'Se aplican como reglas, no como preferencias. Un primer proyecto nunca debería ser lo que pone a prueba tu cumplimiento normativo frente a un cliente.' },
  { k: 'Paso 5 — dimensionarlo', h: '¿Cuánto costaría construirlo?',
    sum: '2 procesos   × 40 horas =  80\n3 conexiones × 16 horas =  48\n1 arreglo de datos × 12 horas =  12\n                          140 horas × $70/h',
    out: '$9,800  →  mostrado como $6,860 – $12,740',
    why: 'Un rango, porque una cifra única sobre software no construido es una ficción. Luego revisa los $22,000 que dijiste que podías arriesgar: cabe, así que no se recorta nada. Si no hubiera cabido, el alcance se reduciría y el informe diría que se redujo.' },
  { k: 'Paso 6 — la cifra que termina la discusión', h: '¿Qué es lo máximo que puedes perder?',
    sum: 'construcción $9,800 + un mes de operación $490',
    out: '$10,290 — peor caso, en total',
    why: 'Si no devuelve absolutamente nada y te detienes en la primera compuerta, esa es toda la pérdida posible. Frente a $147,393 al año que se van por hacer el trabajo a mano.' }
];

(function calculator() {
  const box = $('calc'), cap = $('calcCaption');
  let n = 0;
  function render() {
    box.innerHTML = STEPS.slice(0, n).map((s, i) => `
      <div class="cstep${i === n - 1 ? ' hl' : ''}">
        <div class="k">${esc(s.k)}</div>
        <h4>${esc(s.h)}</h4>
        <div class="sum">${esc(s.sum)}</div>
        <div class="out">${esc(s.out)}</div>
        <p class="why">${esc(s.why)}</p>
      </div>`).join('') || '<div class="cstep"><p class="mut" style="margin:0">Pulsa <b>Siguiente paso</b> para construir las cifras una por una.</p></div>';
    cap.textContent = n ? `${n} de ${STEPS.length}` : '';
    $('calcNext').textContent = n >= STEPS.length ? 'Los seis mostrados' : 'Siguiente paso';
    $('calcNext').disabled = n >= STEPS.length;
  }
  $('calcNext').addEventListener('click', () => { if (n < STEPS.length) { n++; render(); } });
  $('calcReset').addEventListener('click', () => { n = 0; render(); });
  render();
})();

/* ════════════════════════════════════════════════════════════════════════
   LA GUÍA DE USO
   ════════════════════════════════════════════════════════════════════════ */
const GUIDE = [
  { h: 'Crea tu cuenta', p: 'Nombre de la empresa, tu correo y una contraseña. Más o menos un minuto. Sin tarjeta, sin llamada.',
    tip: 'Tu empresa se convierte en su propio espacio. Nadie más puede ver nunca tu trabajo observado.' },
  { h: 'Crea una clave de ingesta', p: 'En la página Conectar, ponle un nombre como "Portátiles de operaciones", marca <b>ingest</b> y pulsa Crear.',
    tip: 'Se muestra una sola vez y se guarda como hash. Si la pierdes, la revocas y creas otra: ese es el resultado correcto, no un problema.' },
  { h: 'Instala el grabador', p: 'Descarga la carpeta de la extensión, abre chrome://extensions, activa el Modo de desarrollador y elige Cargar extensión sin empaquetar. Pulsa el icono y pega tu clave.',
    tip: 'Ponlo en las máquinas donde ocurre el trabajo de verdad, no en la portátil de un gerente.' },
  { h: 'Trabaja normalmente una semana completa', p: 'Pulsa Iniciar captura, ponle nombre a la tarea y sigue con tu trabajo. Pulsa Detener cuando la tarea termine.',
    tip: 'Incluye el día en que cae el cierre de mes. Suele ser el caro, y una semana que no lo incluye te subestima.' },
  { h: 'Confirma lo que encontró', p: 'Pulsa <b>Releer capturas</b>. Confirma los procesos reales, rechaza los que no lo son y corrige cualquier nombre.',
    tip: 'Solo los procesos confirmados entran en la hoja de ruta. Rechazar uno es permanente: no se volverá a proponer.' },
  { h: 'Ponle tarifa por hora a lo que puedas', p: 'El costo con cargas: sueldo más impuestos más prestaciones, dividido entre las horas. Una cifra aproximada es mejor que un espacio vacío.',
    tip: 'Vacío es honesto, no un error. Esas horas simplemente aparecen sin dólares, y el informe lo dice por su nombre.' },
  { h: 'Responde las seis preguntas', p: 'Tu verdadero obstáculo, cuánto podrías gastar una vez, qué te preocupa y tres sobre tus datos.',
    tip: 'Respóndelas tú. Son la mitad que una máquina no puede aportar, y la hoja de ruta no se ejecuta sin ellas.' },
  { h: 'Pulsa Ejecutar y luego comparte o imprime', p: 'Recibes un tablero de evaluación, un plan de tres fases y un siguiente paso. Usa el enlace para compartir con quien no debe tener acceso, o Guardar como PDF para el consejo.',
    tip: 'Ejecutar de nuevo crea una versión nueva. Un informe que alguien ya leyó nunca cambia sin que se entere.' }
];

$('guideSteps').innerHTML = GUIDE.map((g, i) => `
  <div class="gstep"><div class="n">${i + 1}</div>
    <div><h3>${g.h}</h3><p>${g.p}</p><div class="tip">${g.tip}</div></div></div>`).join('');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

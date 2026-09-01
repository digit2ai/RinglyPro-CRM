'use strict';

/**
 * THE NARRATED WALKTHROUGH.
 *
 * Three interactive pieces and one voice. Ava reads the page through the
 * repo's zero-key Edge TTS route (/api/tts/edge) with browser speech as the
 * fallback — no second TTS backend ships here.
 *
 * NUMBERS ARE SPELLED OUT IN THE SCRIPT. Edge reads "10.61" as "ten point six
 * one" only sometimes, and reads "$147,393" badly almost always. This is copy
 * being read aloud to a business owner, so every figure is written the way a
 * person would say it. The ON-SCREEN text keeps the digits; only the spoken
 * script spells them.
 */

const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════════════
   NARRATION — index 0 is the intro, 1..6 map to the six sections
   ════════════════════════════════════════════════════════════════════════ */
const SCRIPT = {
  en: [
    "Hi, I'm Ava, the voice of OrbUp. I'm going to walk you through AI Discovery in about six minutes, with no jargon. Here's the whole idea in one sentence. You do your job normally for a week. Something quietly notes which programs you used and how long each task took — never what you typed. At the end, you get a document that tells you what your work actually costs and what to automate first.",

    "So why not just ask people? Because the answer is always a guess. Ask someone how long invoicing takes and you'll hear, maybe four hours a week. That's a feeling, rounded to a story. Watch it instead and you get: ten and a half hours a week each, across two people, over eighteen observed runs. One of those goes in a business case. The other one doesn't. And there's a third thing. Nobody ever mentions copying numbers from one screen into another, because they remember it as part of the job rather than as a job. That habit is usually the most expensive thing in the building, and only watching can find it.",

    "Now, the part everyone worries about. What does it actually record? Look at the two columns on this page and press the watch button. On the left is what a person really did. On the right is every single thing that reached our server. Notice what never crosses over: the customer's name, the dollar amount, the address they typed, the invoice number sitting in the web address. The page they were on becomes just: Salesforce, orders, edit. That's it. And this isn't a promise — there is nowhere in our database to put the rest. Those columns do not exist. The recorder strips it on your laptop, and the server strips it again on arrival and counts what it removed, so you can check that the wall is working rather than take our word for it.",

    "Here's the whole product, six screens. First, you install the recorder and paste in your key. Second, you work normally, and a bar sits at the top of every page the entire time, because a recorder nobody can see is spyware, no matter what it collects. Third, it groups what it saw into suggested jobs — this one happened eighteen times, took ten and a half hours a week, and crossed four programs. Fourth, a human confirms each one and types an hourly rate, because a browser can time your work but it cannot know what anyone is paid. Fifth, six questions only you can answer. And sixth, your roadmap.",

    "Now the money, because this is where most reports go vague and this one doesn't. Six steps, all of them arithmetic you can check on paper — press the button beside me and they build up one at a time. It starts with measured time and a rate somebody typed. Multiply those and you learn this company spends one hundred forty-seven thousand dollars a year doing this work by hand. Then it decides what is even allowed in a first project: anything a customer sees is out, anything touching regulated data is out, anything where a mistake cannot be undone is out. Two jobs survived that. Sizing those two comes to nine thousand eight hundred dollars, shown as a range, because a single exact number on software nobody has built yet is a fiction. And then the figure that actually ends the argument: the most you can lose is ten thousand two hundred and ninety dollars. That is the build plus one month of running it, if it returns absolutely nothing and you switch it off.",

    "Two rules keep the whole thing honest, and they're both enforced in the software rather than promised in a sales meeting. Rule one: time is measured, money is typed by a person. If nobody enters an hourly rate for a job, that job shows its hours and contributes exactly zero dollars — and the report names it, instead of quietly borrowing an industry average and passing it off as your number. Rule two: a short week is reported, never stretched. If we only watched for two days, we do not multiply by three and a half to make it a week. That would turn a guess into something that looks exactly like a measurement. And one more thing. If you skip one of the six questions, it refuses to finish. It will not build a roadmap around a gap. It stops and tells you which answer is missing, because a confident document built on things nobody asked is precisely what most owners have already been sold once.",

    "Your turn. Create a free account, which takes about a minute. Mint a key and install the recorder on the machines where the work actually happens. Then leave it alone for a full week — including whichever day the month-end work lands on, because that's usually the expensive one. Come back, confirm the jobs it found, and put an hourly rate on the ones you can. Answer the six questions. Press run. You'll have a scorecard, a three-phase plan with real costs, and a next step small enough to say yes to. All of it free, and all of it yours to keep whether or not you ever build anything with us."
  ],
  es: [
    "Hola, soy Ava, la voz de OrbUp. Te voy a explicar AI Discovery en unos seis minutos, sin tecnicismos. La idea completa en una frase: trabajas normalmente durante una semana. Algo anota discretamente qué programas usaste y cuánto tardó cada tarea, nunca lo que escribiste. Al final recibes un documento que te dice cuánto cuesta realmente tu trabajo y qué conviene automatizar primero.",

    "¿Y por qué no simplemente preguntar? Porque la respuesta siempre es una suposición. Pregúntale a alguien cuánto tarda la facturación y escucharás: unas cuatro horas por semana. Eso es una sensación redondeada. Obsérvalo en cambio y obtienes: diez horas y media por semana cada uno, entre dos personas, en dieciocho ejecuciones observadas. Una de esas cifras sirve para un caso de negocio. La otra no. Y hay algo más: nadie menciona nunca que copia datos de una pantalla a otra, porque lo recuerda como parte del trabajo y no como trabajo. Ese hábito suele ser lo más caro de la empresa, y solo se encuentra observando.",

    "Ahora, la parte que a todos les preocupa. ¿Qué graba realmente? Mira las dos columnas de esta página y pulsa el botón. A la izquierda está lo que la persona hizo de verdad. A la derecha está absolutamente todo lo que llegó a nuestro servidor. Fíjate en lo que nunca cruza: el nombre del cliente, el importe, la dirección que escribió, el número de factura que iba en la dirección web. La página en la que estaba se convierte solo en: Salesforce, pedidos, editar. Y esto no es una promesa: no existe ningún lugar en nuestra base de datos donde guardar lo demás. Esas columnas no existen. El grabador lo elimina en tu computadora, y el servidor lo vuelve a eliminar al llegar y cuenta lo que quitó, para que puedas comprobar que el muro funciona en vez de creernos.",

    "Este es el producto completo, seis pantallas. Primero, instalas el grabador y pegas tu clave. Segundo, trabajas normalmente, y una barra permanece visible arriba de cada página todo el tiempo, porque un grabador que nadie puede ver es un espía, sin importar qué recoja. Tercero, agrupa lo que vio en trabajos sugeridos: este ocurrió dieciocho veces, tomó diez horas y media por semana y cruzó cuatro programas. Cuarto, una persona confirma cada uno y escribe una tarifa por hora, porque un navegador puede medir el tiempo pero no puede saber cuánto gana nadie. Quinto, seis preguntas que solo tú puedes responder. Y sexto, tu hoja de ruta.",

    "Ahora el dinero, porque aquí es donde la mayoría de los informes se vuelven vagos y este no. Seis pasos, todos aritmética que puedes comprobar en papel: pulsa el botón que está a mi lado y se construyen uno a uno. Empieza con tiempo medido y una tarifa que alguien escribió. Multiplica esas dos cosas y descubres que esta empresa gasta ciento cuarenta y siete mil dólares al año haciendo este trabajo a mano. Después decide qué se permite siquiera en un primer proyecto: todo lo que ve un cliente queda fuera, todo lo que toca datos regulados queda fuera, y todo donde un error no se puede deshacer queda fuera. Sobrevivieron dos trabajos. Dimensionar esos dos da nueve mil ochocientos dólares, mostrado como rango, porque una cifra exacta sobre software que nadie ha construido todavía es una ficción. Y entonces llega la cifra que de verdad termina la discusión: lo máximo que puedes perder son diez mil doscientos noventa dólares. Eso es la construcción más un mes de operación, si no devuelve absolutamente nada y lo apagas.",

    "Dos reglas mantienen todo esto honesto, y ambas están impuestas en el software, no prometidas en una reunión de ventas. Regla uno: el tiempo se mide, el dinero lo escribe una persona. Si nadie introduce una tarifa por hora para un trabajo, ese trabajo muestra sus horas y aporta exactamente cero dólares, y el informe lo dice por su nombre, en vez de tomar discretamente un promedio del sector y presentarlo como tu cifra. Regla dos: una semana corta se reporta, nunca se estira. Si solo observamos dos días, no multiplicamos por tres y medio para fabricar una semana. Eso convertiría una suposición en algo que parece exactamente una medición. Y una cosa más: si te saltas una de las seis preguntas, se niega a terminar. No construye una hoja de ruta alrededor de un hueco. Se detiene y te dice qué respuesta falta, porque un documento seguro de sí mismo construido sobre cosas que nadie preguntó es justo lo que a la mayoría ya le vendieron una vez.",

    "Te toca. Crea una cuenta gratis, toma un minuto. Genera una clave e instala el grabador en las máquinas donde ocurre el trabajo de verdad. Después déjalo en paz una semana completa, incluyendo el día en que cae el cierre de mes, porque ese suele ser el caro. Vuelve, confirma los trabajos que encontró y ponle una tarifa por hora a los que puedas. Responde las seis preguntas. Pulsa ejecutar. Tendrás un tablero de puntuación, un plan de tres fases con costos reales, y un siguiente paso lo bastante pequeño como para decir que sí. Todo gratis, y todo tuyo, construyas o no algo con nosotros."
  ]
};

/* ════════════════════════════════════════════════════════════════════════
   AVA — neural first, browser speech as the fallback
   ════════════════════════════════════════════════════════════════════════ */
(function ava() {
  const synth = window.speechSynthesis;
  const orb = $('orb'), status = $('status'), playAll = $('playAll');
  const pauseBtn = $('pause'), stopBtn = $('stop'), hd = $('hd');
  const voiceSel = $('voiceSel'), mode = $('mode');
  const secs = Array.prototype.slice.call(document.querySelectorAll('.sec'));

  let lang = 'en', voice = 'ava';
  let queue = [], qi = 0, runMode = null, token = 0, paused = false;
  let playbackMode = null, audio = null, neuralOK = true, cache = {}, browserVoice = null;

  // ONE FAILED SEGMENT MUST NOT DOWNGRADE THE REST OF THE PRESENTATION.
  // The first version set neuralOK=false on any error, so a single lost
  // request meant Ava spoke, paused, and a robot finished the deck — which is
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
  function setMode() { mode.textContent = useNeural() ? 'HD' : 'browser voice'; }
  setMode();

  voiceSel.addEventListener('change', function () {
    voice = this.value;
    lang = voice === 'dalia' ? 'es' : 'en';
    clearCache(); pickBrowserVoice();
    status.textContent = lang === 'es'
      ? 'Idioma cambiado. Pulsa reproducir.' : 'Language changed. Press play.';
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
      ? (lang === 'es' ? `Ava está hablando… (${qi + 1} de ${queue.length})` : `Ava is speaking… (${qi + 1} of ${queue.length})`)
      : (lang === 'es' ? 'Reproduciendo sección…' : 'Playing this section…');
  }

  function run(t) {
    if (t !== token) return;
    if (qi >= queue.length) return finish();
    const i = queue[qi];
    setActive(i);
    const advance = () => { if (t !== token) return; qi++; run(t); };
    if (useNeural()) {
      status.textContent = lang === 'es' ? 'Preparando voz…' : 'Preparing the voice…';
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
        status.textContent = lang === 'es'
          ? 'Esta sección se leerá con la voz del navegador.'
          : 'Reading this section in the browser voice.';
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
    pauseBtn.textContent = lang === 'es' ? 'Pausar' : 'Pause';
    run(token);
  }
  function finish() {
    token++; orb.classList.remove('speaking');
    secs.forEach(s => s.classList.remove('active'));
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    pauseBtn.disabled = true; stopBtn.disabled = true; playAll.disabled = false;
    status.textContent = lang === 'es'
      ? 'Terminado. Pulsa de nuevo para repetir.' : 'Finished. Press play to hear it again.';
  }

  playAll.addEventListener('click', () => start(segs().map((_, i) => i), 'all'));
  document.querySelectorAll('.listen').forEach(b =>
    b.addEventListener('click', function () { start([Number(this.dataset.play)], 'one'); }));

  pauseBtn.addEventListener('click', () => {
    if (!paused) {
      paused = true; pauseBtn.textContent = lang === 'es' ? 'Reanudar' : 'Resume';
      orb.classList.remove('speaking');
      status.textContent = lang === 'es' ? 'En pausa.' : 'Paused.';
      if (playbackMode === 'neural' && audio) audio.pause(); else if (synth) synth.pause();
    } else {
      paused = false; pauseBtn.textContent = lang === 'es' ? 'Pausar' : 'Pause';
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
   THE REDACTION DEMO — the same six steps, shown twice
   ════════════════════════════════════════════════════════════════════════ */
const DEMO = [
  { act: 'Opened a page',
    did: 'harborline.my.salesforce.com/orders/8837/edit?ref=INV-44021&q=acme',
    got: 'Salesforce · /orders/:id/edit',
    gone: ['the invoice number', 'the search term'] },
  { act: 'Typed into a field',
    did: 'Bill to: ACME Corporation — $12,480.00 — 44 Harbor Way',
    got: 'typed in a field · 45 seconds',
    gone: ['the customer', 'the amount', 'the address'] },
  { act: 'Copied a value',
    did: 'Copied "PO-99413" to the clipboard',
    got: 'copied something · 6 seconds',
    gone: ['the clipboard contents'] },
  { act: 'Switched program',
    did: 'quickbooks.intuit.com/app/invoice',
    got: 'QuickBooks · /app/invoice · switched program',
    gone: [] },
  { act: 'Pasted it in',
    did: 'Pasted "PO-99413" into Reference number',
    got: 'pasted into a field · 52 seconds',
    gone: ['the value', 'the field name'] },
  { act: 'Clicked Save',
    did: 'Clicked the button labelled "Approve invoice INV-44021"',
    got: 'pressed a button · 3 seconds',
    gone: ['the button text'] }
];

(function redactionDemo() {
  const did = $('didList'), got = $('gotList'), count = $('demoCount');
  let timer = null, i = 0;

  function reset() {
    clearInterval(timer); timer = null; i = 0;
    did.innerHTML = ''; got.innerHTML = '';
    count.textContent = '';
    $('demoPlay').textContent = 'Watch it happen';
  }
  function step() {
    if (i >= DEMO.length) {
      clearInterval(timer); timer = null;
      $('demoPlay').textContent = 'Play again';
      const stripped = DEMO.reduce((a, d) => a + d.gone.length, 0);
      count.textContent = `${DEMO.length} actions · ${stripped} pieces of information discarded before anything was written down`;
      return;
    }
    const d = DEMO[i];
    did.insertAdjacentHTML('beforeend',
      `<div class="demo-row"><div class="act">${d.act}</div><div class="txt strike">${esc(d.did)}</div></div>`);
    got.insertAdjacentHTML('beforeend',
      `<div class="demo-row"><div class="act">${d.act}</div><div class="txt kept">${esc(d.got)}</div>` +
      d.gone.map(g => `<span class="gone">${esc(g)} dropped</span>`).join('') + `</div>`);
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
   THE SIMULATOR — six screens
   ════════════════════════════════════════════════════════════════════════ */
const SCREENS = [
  {
    tab: '1 · Install', url: 'chrome://extensions',
    caption: 'Paste your key once. Nothing else to configure.',
    html: `<h3>Connect the recorder</h3><div class="sub">One key, pasted once, on each machine where the work happens.</div>
      <div style="max-width:340px">
        <label>OrbUp address</label><div class="fakefield" style="width:100%">https://orbup.app</div>
        <label>Ingest key</label><div class="fakefield" style="width:100%">orbup_dk_7Kq…9fT</div>
        <div style="margin-top:16px"><span class="fakebtn p">Connect</span></div>
        <p class="faint" style="margin-top:14px">This key can only push work in. It cannot read your assessment back — that is a separate key, so the one on fifty laptops is harmless if it leaks.</p>
      </div>`
  },
  {
    tab: '2 · Work', url: 'harborline.my.salesforce.com/orders/8837/edit',
    caption: 'A bar stays visible the entire time. It is never covert.',
    html: `<div class="banner-demo">OrbUp Discovery is recording the shape of this work — which app, which kind of action, how long. Not what you type, not page contents, not the address bar beyond the site name.</div>
      <h3>You just work</h3><div class="sub">No forms, no tagging, no stopwatch. Leave it running for a full week.</div>
      <div class="mockrow"><div><div class="nm">Salesforce</div><div class="meta">opened an order · 42 seconds</div></div><span class="fakebtn">recorded</span></div>
      <div class="mockrow"><div><div class="nm">QuickBooks</div><div class="meta">switched program · typed in a field · 88 seconds</div></div><span class="fakebtn">recorded</span></div>
      <div class="mockrow"><div><div class="nm">Google Sheets</div><div class="meta">pasted into a field · 51 seconds</div></div><span class="fakebtn">recorded</span></div>
      <p class="faint" style="margin-top:14px">Three programs for one invoice. That crossing is the thing an interview never surfaces.</p>`
  },
  {
    tab: '3 · It groups', url: 'orbup.app/discovery',
    caption: 'Suggestions, not conclusions. Everything says "proposed".',
    html: `<h3>Here is what I think I saw</h3><div class="sub">Runs with the same shape get grouped into a suggested job. These are guesses until you say otherwise.</div>
      <div class="mockrow"><div><div class="nm">daily invoice reconciliation <span class="pill yellow">proposed</span></div>
        <div class="meta">10.6 h/week per person · 2 people · 18 runs over 10 days · high confidence</div>
        <div class="meta">Salesforce · QuickBooks · Google Sheets · Gmail</div></div>
        <div class="acts"><span class="fakebtn p">Confirm</span><span class="fakebtn">Not a job</span></div></div>
      <div class="mockrow"><div><div class="nm">carrier packet review <span class="pill yellow">proposed</span></div>
        <div class="meta">4.6 h/week · 1 person · 14 runs over 14 days · high confidence</div></div>
        <div class="acts"><span class="fakebtn p">Confirm</span><span class="fakebtn">Not a job</span></div></div>
      <div class="mockrow"><div><div class="nm">customer rate quotes <span class="pill yellow">proposed</span></div>
        <div class="meta">2.3 h/week · 3 people · 18 runs over 8 days · high confidence</div></div>
        <div class="acts"><span class="fakebtn p">Confirm</span><span class="fakebtn">Not a job</span></div></div>`
  },
  {
    tab: '4 · You confirm', url: 'orbup.app/discovery',
    caption: 'The rate is the only way a dollar enters the system.',
    html: `<h3>Confirm it, and tell it what an hour costs</h3><div class="sub">A browser can time the work. It cannot know what anyone is paid — so it asks.</div>
      <div class="mockrow" style="flex-direction:column;align-items:stretch">
        <div><div class="nm">daily invoice reconciliation <span class="pill green">confirmed</span> <span class="pill green">costed</span></div>
        <div class="meta">10.6 h/week per person · 2 people · measured</div></div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px">
          <div><label>Loaded hourly cost</label><div class="fakefield">44</div></div>
          <div><label>A customer sees it</label><div class="fakefield">no</div></div>
          <div><label>Regulated data</label><div class="fakefield">no</div></div>
          <div><label>Cost of an error</label><div class="fakefield">medium</div></div>
        </div></div>
      <div class="mockrow" style="flex-direction:column;align-items:stretch">
        <div><div class="nm">driver settlement run <span class="pill green">confirmed</span> <span class="pill red">no rate</span></div>
        <div class="meta">22.0 h/week · 1 person · measured</div></div>
        <div style="margin-top:14px;max-width:180px"><label>Loaded hourly cost</label><div class="fakefield empty">not set</div></div>
        <p class="faint" style="margin-top:10px">Left blank on purpose. This job will show its 22 hours and contribute <b>zero dollars</b>, and the report will name it rather than guess.</p></div>`
  },
  {
    tab: '5 · Six questions', url: 'orbup.app/discovery',
    caption: 'Six. Not forty. The rest was measured.',
    html: `<h3>The six things nobody can watch</h3><div class="sub">A full readiness interview asks about forty things. Better than thirty of them were measured, so they are not asked.</div>
      <div class="qrow"><span>Which concern is the real blocker for you?</span><span class="a">I have been oversold this before</span></div>
      <div class="qrow"><span>What could you spend once and not lose sleep if it returned nothing?</span><span class="a">$22,000</span></div>
      <div class="qrow"><span>Which risks keep you up at night?</span><span class="a">Confidently wrong · morale</span></div>
      <div class="qrow"><span>Would you trust a report pulled right now?</span><span class="a">3 of 5</span></div>
      <div class="qrow"><span>How easy is it to get data out of those systems?</span><span class="a">3 of 5</span></div>
      <div class="qrow"><span>Does the work touch personal or payment data?</span><span class="a">Yes</span></div>
      <p class="faint" style="margin-top:16px">Skip one and it refuses to produce a roadmap. It stops and names the missing answer.</p>`
  },
  {
    tab: '6 · Your roadmap', url: 'orbup.app/discovery/r/CpZrYJ…',
    caption: 'Free. Yours. Shareable, or printed to PDF.',
    html: `<h3>Harborline Freight — AI Readiness Roadmap</h3>
      <div class="sub">One thing has to be fixed before a pilot — and it is measured in days.</div>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px">
        <div class="mockrow" style="display:block"><div class="meta">Cost Comfort</div><div class="nm" style="color:var(--good)">93 green</div></div>
        <div class="mockrow" style="display:block"><div class="meta">Risk Comfort</div><div class="nm" style="color:var(--good)">95 green</div></div>
        <div class="mockrow" style="display:block"><div class="meta">Data Readiness</div><div class="nm" style="color:var(--warn)">56 yellow</div></div>
      </div>
      <div class="mockrow" style="border-color:rgba(240,100,90,.4)"><div><div class="nm">Clear first</div>
        <div class="meta">Personal data with no processing agreement — sign it, or scope it out of Phase 1</div></div><span class="fakebtn">2 days</span></div>
      <div class="mockrow" style="border-color:var(--blue)"><div><div class="nm">Phase 1 — Prove it on one thing</div>
        <div class="meta">daily invoice reconciliation · carrier packet review</div>
        <div class="meta">4 weeks · $6,860 – $12,740 · most you can lose: $10,290</div></div><span class="fakebtn p">low risk</span></div>
      <div class="mockrow"><div><div class="nm">Phase 2 — Expand what worked</div>
        <div class="meta">Only funded if Phase 1 met its gate</div></div><span class="fakebtn">8 weeks</span></div>
      <div class="mockrow"><div><div class="nm">Phase 3 — Change how the work is done</div>
        <div class="meta">Deliberately not priced</div></div><span class="fakebtn">—</span></div>`
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
  function stopAuto() { if (auto) { clearInterval(auto); auto = null; $('simAuto').textContent = 'Play all six'; } }
  $('simAuto').addEventListener('click', () => {
    if (auto) return stopAuto();
    $('simAuto').textContent = 'Stop';
    show(0);
    auto = setInterval(() => {
      if (cur >= SCREENS.length - 1) return stopAuto();
      show(cur + 1);
    }, 3800);
  });
  show(0);
})();

/* ════════════════════════════════════════════════════════════════════════
   THE CALCULATOR — the same six steps the engines actually run
   ════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { k: 'Step 1 — measured, no money yet', h: 'How long does it take?',
    sum: '1,818 minutes observed  =  30.3 hours\n30.3 hours ÷ 2 people ÷ (10 days ÷ 7)',
    out: '10.6 hours per week, each',
    why: 'Straight from the recorder. Eighteen runs, ten days, two people. Nothing here involves a rate, an estimate or a benchmark.' },
  { k: 'Step 2 — a person types this', h: 'What does an hour cost?',
    sum: 'Loaded hourly cost, entered by the owner',
    out: '$44 / hour',
    why: 'The only door a dollar can walk through. Leave it blank and this job contributes zero, and gets named in the report as uncosted.' },
  { k: 'Step 3 — multiply', h: 'What is this costing you now?',
    sum: '10.6 h/wk × 2 people × 52 weeks = 1,103 hours\n1,103 hours × $44',
    out: '$48,551 / year — on this one job',
    why: 'Do the same for every job: $48,551 + $9,050 + $21,792 + $0 = $79,393. Add the $68,000 the owner already knew they were losing, and you reach the $147,393 on the report.' },
  { k: 'Step 4 — the rules', h: 'What is even allowed in a first project?',
    sum: 'daily invoice reconciliation   ALLOWED\ncarrier packet review          ALLOWED\ncustomer rate quotes           BLOCKED — a customer sees it\ndriver settlement run          BLOCKED — regulated data; errors unrecoverable',
    out: '2 jobs qualify',
    why: 'Applied as rules, not preferences. A first project should never be the thing that tests your compliance posture in front of a customer.' },
  { k: 'Step 5 — size it', h: 'What would it cost to build?',
    sum: '2 jobs      × 40 hours =  80\n3 connections × 16 hours =  48\n1 data fix   × 12 hours =  12\n                          140 hours × $70/hr',
    out: '$9,800  →  shown as $6,860 – $12,740',
    why: 'A range, because a single number on unbuilt software is a fiction. It then checks the $22,000 you said you could risk — it fits, so nothing is narrowed. If it had not fit, the scope would shrink and the report would say it shrank.' },
  { k: 'Step 6 — the number that ends the argument', h: 'What is the most you can lose?',
    sum: 'build $9,800 + one month of running it $490',
    out: '$10,290 — worst case, total',
    why: 'If it returns absolutely nothing and you stop at the first gate, that is the whole downside. Against $147,393 a year going out the door by hand.' }
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
      </div>`).join('') || '<div class="cstep"><p class="mut" style="margin:0">Press <b>Next step</b> to build the numbers up one at a time.</p></div>';
    cap.textContent = n ? `${n} of ${STEPS.length}` : '';
    $('calcNext').textContent = n >= STEPS.length ? 'All six shown' : 'Next step';
    $('calcNext').disabled = n >= STEPS.length;
  }
  $('calcNext').addEventListener('click', () => { if (n < STEPS.length) { n++; render(); } });
  $('calcReset').addEventListener('click', () => { n = 0; render(); });
  render();
})();

/* ════════════════════════════════════════════════════════════════════════
   THE USER GUIDE
   ════════════════════════════════════════════════════════════════════════ */
const GUIDE = [
  { h: 'Create your account', p: 'Company name, your email, a password. About a minute. No card, no call.',
    tip: 'Your company becomes its own tenant. Nobody else can ever see your observed work.' },
  { h: 'Mint an ingest key', p: 'On the Connect page, name it something like "Ops laptops", tick <b>ingest</b>, and press Mint.',
    tip: 'It is shown once and stored as a hash. Lose it and you revoke it and mint another — that is the right outcome, not a problem.' },
  { h: 'Install the recorder', p: 'Download the extension folder, open chrome://extensions, turn on Developer mode, choose Load unpacked. Click the icon and paste your key.',
    tip: 'Put it on the machines where the work actually happens, not on a manager\'s laptop.' },
  { h: 'Work normally for a full week', p: 'Press Start capture, name the task, and get on with it. Press Stop when the task is done.',
    tip: 'Include whichever day the month-end work lands on. That is usually the expensive one, and a week that misses it understates you.' },
  { h: 'Confirm what it found', p: 'Press <b>Re-read captures</b>. Confirm the jobs that are real, reject the ones that are not, and correct any name.',
    tip: 'Only confirmed jobs enter the roadmap. Rejecting one is permanent — it will not be suggested again.' },
  { h: 'Put an hourly rate on what you can', p: 'The loaded cost — salary plus tax plus benefits, divided by hours. A rough figure beats a blank.',
    tip: 'Blank is honest, not broken. Those hours simply appear with no dollars, and the report says so by name.' },
  { h: 'Answer the six questions', p: 'Your real blocker, what you could spend once, what worries you, and three about your data.',
    tip: 'Answer these yourself. They are the half a machine cannot supply, and the roadmap will not run without them.' },
  { h: 'Press Run, then share or print', p: 'You get a scorecard, a three-phase plan and a next step. Use the share link for people who should not have a login, or Save as PDF for the board pack.',
    tip: 'Running again writes a new version. A report someone has already read never changes underneath them.' }
];

$('guideSteps').innerHTML = GUIDE.map((g, i) => `
  <div class="gstep"><div class="n">${i + 1}</div>
    <div><h3>${g.h}</h3><p>${g.p}</p><div class="tip">${g.tip}</div></div></div>`).join('');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

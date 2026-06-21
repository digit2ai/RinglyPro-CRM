import React, { useState, useRef, useEffect } from 'react';

// ============================================================================
// Lina — zero-key neural voice orb (Microsoft Edge "Read Aloud" via /api/tts/edge)
// Server-proxied, no API key in the browser, $0 per play. Neural-first with an
// automatic browser-speech fallback. Narrates the landing page in the active
// UI language (en / es / fil) and scrolls each section into view as she speaks.
// ============================================================================

const NEURAL_URL = '/api/tts/edge';

// Active-language -> Edge voice. Spanish uses the canonical "Lina" (Dalia);
// the route also accepts raw Edge voice names (e.g. fil-PH-BlessicaNeural).
const LANG_VOICE = { es: 'lina', en: 'ava', fil: 'fil-PH-BlessicaNeural' };
const FALLBACK_LANG = { es: 'es-MX', en: 'en-US', fil: 'fil-PH' };

// Spanish accent picker (only shown when the page is in Spanish).
// México (Dalia) is the default and only AI voice.
const ES_ACCENTS = [
  { value: 'lina',   label: 'México (Dalia)' },
];

// Narration: index 0 = intro; 1..5 map to mission / why / pillars / impact / join.
const SEGMENTS = {
  es: [
    'Hola, soy Lina, la voz de inteligencia artificial de Digit2AI. En pocos minutos te voy a explicar qué es Torna Idioma y por qué Makati está a punto de convertirse en la primera ciudad hispanohablante de Asia.',
    'Nuestra misión es empoderar a la juventud filipina a través del dominio del español, restaurando dignidad, orgullo y legado. Nuestra visión es establecer a Filipinas como la primera nación hispanohablante de Asia, donde la herencia se convierte en fortaleza.',
    '¿Por qué español y por qué ahora? El español no es ajeno a Filipinas: es el idioma de Rizal, de Bonifacio y de la Constitución de Malolos. Hoy lo hablan más de seiscientos cincuenta millones de personas, y abre carreras globales con salarios mucho más altos.',
    'Torna Idioma se levanta sobre tres pilares. Dignidad: recuperar un idioma que pertenece al alma filipina. Orgullo: reconectar con una comunidad de seiscientos cincuenta millones de hispanohablantes. Y premio: desbloquear carreras internacionales y nuevas oportunidades económicas.',
    'El impacto para Makati es transformador. Si tan solo el diez por ciento de su fuerza laboral domina el español, hablamos de cientos de millones de pesos en ingresos para los residentes, mayor recaudación fiscal e inversión extranjera de miles de millones en cinco años. Un retorno estimado de diez a veinte veces la inversión.',
    'Esto es más que un programa: es un movimiento. Ya seas estudiante, profesor, profesional de un centro de servicios o funcionario del gobierno, en Torna Idioma hay un lugar para ti. Sé parte de la historia.',
  ],
  en: [
    "Hi, I'm Lina, the artificial intelligence voice of Digit2AI. In just a few minutes I'll walk you through what Torna Idioma is, and why Makati is about to become the first Spanish-enabled city in Asia.",
    "Our mission is to empower Filipino youth through Spanish proficiency, restoring dignity, pride, and legacy. Our vision is to establish the Philippines as Asia's first Spanish-enabled nation, where heritage becomes strength.",
    'Why Spanish, and why now? Spanish is not foreign to the Philippines. It is the language of Rizal, of Bonifacio, and of the Malolos Constitution. Today more than six hundred fifty million people speak it, and it opens global careers with significantly higher salaries.',
    'Torna Idioma stands on three pillars. Dignity: reclaiming a language that belongs to the Filipino soul. Pride: reconnecting with a community of six hundred fifty million Spanish speakers. And prize: unlocking international careers and new economic opportunity.',
    "The impact for Makati is transformative. If just ten percent of its outsourcing workforce becomes proficient in Spanish, we're talking about hundreds of millions of pesos in resident income, higher tax revenue, and billions in foreign investment over five years — an estimated return of ten to twenty times the investment.",
    "This is more than a program; it's a movement. Whether you're a student, a teacher, an outsourcing professional, or a government official, Torna Idioma has a place for you. Be part of history.",
  ],
  fil: [
    'Kumusta, ako si Lina, ang artificial intelligence na boses ng Digit2AI. Sa loob ng ilang minuto, ipapaliwanag ko kung ano ang Torna Idioma at kung bakit malapit nang maging unang lungsod na may Espanyol sa Asya ang Makati.',
    'Layunin naming palakasin ang kabataang Pilipino sa pamamagitan ng kahusayan sa Espanyol, ibinabalik ang dignidad, pagmamalaki, at pamana. Ang aming bisyon ay gawing unang bansang may Espanyol sa Asya ang Pilipinas, kung saan ang pamana ay nagiging lakas.',
    'Bakit Espanyol, at bakit ngayon? Hindi dayuhan ang Espanyol sa Pilipinas. Ito ang wika ni Rizal, ni Bonifacio, at ng Konstitusyong Malolos. Ngayon, mahigit anim na raan at limampung milyong tao ang nagsasalita nito, at nagbubukas ito ng pandaigdigang karera na may mas mataas na sahod.',
    'Nakatayo ang Torna Idioma sa tatlong haligi. Dignidad: pagbawi ng wikang pag-aari ng kaluluwa ng Pilipino. Pagmamalaki: muling pakikipag-ugnay sa anim na raan at limampung milyong nagsasalita ng Espanyol. At gantimpala: pagbubukas ng pandaigdigang karera at bagong oportunidad pang-ekonomiya.',
    'Transformatibo ang epekto para sa Makati. Kung sampung porsiyento lamang ng manggagawa nito ay magkaroon ng kahusayan sa Espanyol, pinag-uusapan natin ang daan-daang milyong piso na kita para sa mga residente, mas mataas na buwis, at bilyun-bilyong dayuhang pamumuhunan sa loob ng limang taon — isang tinatayang balik na sampu hanggang dalawampung beses ng pamumuhunan.',
    'Higit pa ito sa isang programa; ito ay isang kilusan. Estudyante ka man, guro, propesyonal sa BPO, o opisyal ng gobyerno, may lugar para sa iyo ang Torna Idioma. Maging bahagi ng kasaysayan.',
  ],
};

// Section anchors aligned with SEGMENTS indexes (0 = intro stays on the orb).
const SECTION_IDS = [null, 'mission', 'why', 'pillars', 'impact', 'join'];

const UI = {
  es: {
    title: 'Lina · Voz AI de Digit2AI',
    role: 'Tu guía de la visión Torna Idioma',
    playAll: '▶ Que Lina lo explique todo',
    pause: '❚❚ Pausar', resume: '▶ Reanudar', stop: '■ Detener',
    idle: 'Pulsa el botón para que Lina te presente la visión.',
    paused: 'En pausa.', prep: 'Preparando voz neural…',
    done: 'Presentación terminada. Pulsa de nuevo para repetir.',
    neural: 'Voz neural HD', accent: 'Acento',
    speaking: (i, n) => `Lina está hablando… (${i} de ${n})`,
    hd: '● HD', browser: '○ navegador',
  },
  en: {
    title: 'Lina · Digit2AI AI Voice',
    role: 'Your guide to the Torna Idioma vision',
    playAll: '▶ Let Lina explain it all',
    pause: '❚❚ Pause', resume: '▶ Resume', stop: '■ Stop',
    idle: 'Tap the button and let Lina walk you through the vision.',
    paused: 'Paused.', prep: 'Preparing neural voice…',
    done: 'Presentation finished. Tap again to replay.',
    neural: 'HD neural voice', accent: 'Accent',
    speaking: (i, n) => `Lina is speaking… (${i} of ${n})`,
    hd: '● HD', browser: '○ browser',
  },
  fil: {
    title: 'Lina · AI na Boses ng Digit2AI',
    role: 'Ang iyong gabay sa bisyon ng Torna Idioma',
    playAll: '▶ Ipaliwanag ni Lina ang lahat',
    pause: '❚❚ I-pause', resume: '▶ Ituloy', stop: '■ Itigil',
    idle: 'Pindutin ang button para ipakilala ni Lina ang bisyon.',
    paused: 'Naka-pause.', prep: 'Inihahanda ang neural na boses…',
    done: 'Tapos na ang presentasyon. Pindutin muli upang ulitin.',
    neural: 'HD neural na boses', accent: 'Accent',
    speaking: (i, n) => `Nagsasalita si Lina… (${i} ng ${n})`,
    hd: '● HD', browser: '○ browser',
  },
};

export default function LinaOrb({ lang = 'es' }) {
  const L = UI[lang] || UI.es;
  const segs = SEGMENTS[lang] || SEGMENTS.es;
  const voiceName = lang === 'es' ? null /* uses accent state */ : LANG_VOICE[lang];

  const [neuralOn, setNeuralOn] = useState(true);
  const [accent, setAccent] = useState('lina');
  const [status, setStatus] = useState(L.idle);
  const [speaking, setSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const runToken = useRef(0);
  const audioRef = useRef(null);
  const cacheRef = useRef({});
  const neuralOKRef = useRef(true);
  const browserVoiceRef = useRef(null);
  const playbackModeRef = useRef(null);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  const resolvedVoice = lang === 'es' ? accent : LANG_VOICE[lang];

  // ---- browser-speech voice selection (fallback path) ----
  useEffect(() => {
    if (!synth) return;
    const pick = () => {
      const vs = synth.getVoices();
      const pref = vs.filter(v => v.lang && v.lang.toLowerCase().indexOf(lang === 'fil' ? 'fil' : lang) === 0);
      browserVoiceRef.current = pref[0] || vs.find(v => v.lang && v.lang.toLowerCase().startsWith('es')) || vs[0] || null;
    };
    pick();
    synth.onvoiceschanged = pick;
    return () => { if (synth) synth.onvoiceschanged = null; };
  }, [lang, synth]);

  // ---- reset idle status when language changes; stop any in-flight playback ----
  useEffect(() => {
    finish();
    setStatus((UI[lang] || UI.es).idle);
    clearCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ---- stop on unmount ----
  useEffect(() => () => {
    runToken.current++;
    if (synth) synth.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} }
  }, [synth]);

  function clearCache() {
    Object.keys(cacheRef.current).forEach(k => { try { URL.revokeObjectURL(cacheRef.current[k]); } catch (e) {} });
    cacheRef.current = {};
  }

  function useNeural() { return neuralOn && neuralOKRef.current; }

  function fetchNeural(idx, voice) {
    const key = voice + '|' + lang + '|' + idx;
    if (cacheRef.current[key]) return Promise.resolve(cacheRef.current[key]);
    return fetch(NEURAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: segs[idx], voice }),
    })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
      .then(b => { if (!b || b.size < 200) throw new Error('empty'); const u = URL.createObjectURL(b); cacheRef.current[key] = u; return u; });
  }

  function scrollToSection(idx) {
    const id = SECTION_IDS[idx];
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function browserSpeak(idx, onEnd) {
    if (!synth) { onEnd(); return; }
    playbackModeRef.current = 'browser';
    const u = new SpeechSynthesisUtterance(segs[idx]);
    if (browserVoiceRef.current) u.voice = browserVoiceRef.current;
    u.lang = browserVoiceRef.current ? browserVoiceRef.current.lang : (FALLBACK_LANG[lang] || 'es-MX');
    u.rate = 0.98; u.pitch = 1.04;
    u.onstart = () => { setSpeaking(true); };
    u.onend = onEnd; u.onerror = onEnd;
    synth.speak(u);
  }

  function runQueue(queue, qi, token, voice) {
    if (token !== runToken.current) return;
    if (qi >= queue.length) { finishDone(); return; }
    const idx = queue[qi];
    scrollToSection(idx);
    setStatus(queue.length > 1 ? L.speaking(qi + 1, queue.length) : '…');
    const advance = () => { if (token !== runToken.current) return; runQueue(queue, qi + 1, token, voice); };

    if (useNeural()) {
      setStatus(L.prep);
      if (qi + 1 < queue.length) fetchNeural(queue[qi + 1], voice).catch(() => {});
      fetchNeural(idx, voice).then(url => {
        if (token !== runToken.current) return;
        playbackModeRef.current = 'neural';
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = advance;
        a.onerror = () => { neuralOKRef.current = false; advance(); };
        setSpeaking(true);
        setStatus(queue.length > 1 ? L.speaking(qi + 1, queue.length) : '…');
        a.play().catch(() => { neuralOKRef.current = false; browserSpeak(idx, advance); });
      }).catch(() => {
        if (token !== runToken.current) return;
        neuralOKRef.current = false;
        browserSpeak(idx, advance);
      });
    } else {
      browserSpeak(idx, advance);
    }
  }

  function start(queue) {
    if (synth) synth.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
    runToken.current++;
    const token = runToken.current;
    setPlaying(true); setPaused(false); setSpeaking(true);
    runQueue(queue, 0, token, resolvedVoice);
  }

  function finishDone() {
    runToken.current++;
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
    setSpeaking(false); setPlaying(false); setPaused(false);
    setStatus(L.done);
  }

  function finish() {
    runToken.current++;
    if (synth) synth.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
    setSpeaking(false); setPlaying(false); setPaused(false);
  }

  function togglePause() {
    if (!paused) {
      setPaused(true); setSpeaking(false); setStatus(L.paused);
      if (playbackModeRef.current === 'neural' && audioRef.current) audioRef.current.pause();
      else if (synth) synth.pause();
    } else {
      setPaused(false); setSpeaking(true);
      if (playbackModeRef.current === 'neural' && audioRef.current) audioRef.current.play();
      else if (synth) synth.resume();
    }
  }

  function onPlayAll() { start(segs.map((_, i) => i)); }

  return (
    <div style={st.wrap}>
      <div style={st.card}>
        <div className={'lina-orb' + (speaking ? ' lina-speaking' : '')} style={st.orb} />
        <div style={st.meta}>
          <div style={st.name}>{L.title}</div>
          <div style={st.roleTxt}>{L.role}</div>
          <div style={st.controls}>
            <button style={{ ...st.btn, ...st.primary }} onClick={onPlayAll} disabled={playing}>{L.playAll}</button>
            <button style={st.btn} onClick={togglePause} disabled={!playing}>{paused ? L.resume : L.pause}</button>
            <button style={st.btn} onClick={finishDone} disabled={!playing}>{L.stop}</button>
          </div>
          <div style={st.status}>{status}</div>
          <div style={st.voicepick}>
            <label style={st.lbl}>
              <input type="checkbox" checked={neuralOn} onChange={e => { setNeuralOn(e.target.checked); neuralOKRef.current = true; }} /> {L.neural}
            </label>
            <span style={st.mode}>{useNeural() ? L.hd : L.browser}</span>
            {lang === 'es' && (
              <span style={st.accentWrap}>
                &nbsp;·&nbsp;{L.accent}:
                <select value={accent} onChange={e => { setAccent(e.target.value); clearCache(); }} style={st.select}>
                  {ES_ACCENTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inject keyframes + orb visuals once (inline styles can't express @keyframes).
if (typeof document !== 'undefined' && !document.getElementById('lina-orb-style')) {
  const el = document.createElement('style');
  el.id = 'lina-orb-style';
  el.textContent = `
    .lina-orb { position: relative; }
    .lina-orb::after { content:""; position:absolute; inset:-8px; border-radius:50%; border:2px solid rgba(201,168,76,0.35); }
    .lina-orb.lina-speaking { animation: lina-pulse 1.2s ease-in-out infinite; }
    @keyframes lina-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(201,168,76,0.5); }
      70%  { box-shadow: 0 0 0 22px rgba(201,168,76,0); }
      100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); }
    }
    @media(max-width:560px){ .lina-card-flex { flex-direction: column; text-align: center; } }
  `;
  document.head.appendChild(el);
}

const st = {
  wrap: { background: 'linear-gradient(135deg,#0F1A2E,#1B2A4A)', padding: '56px 24px', display: 'flex', justifyContent: 'center' },
  card: {
    maxWidth: 680, width: '100%', display: 'flex', gap: 22, alignItems: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  orb: {
    width: 92, height: 92, flex: '0 0 92px', borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #F4E3A6, #C9A84C 45%, #6B4E0F 100%)',
    boxShadow: '0 0 0 0 rgba(201,168,76,0.5)',
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 19, color: '#C9A84C', letterSpacing: 0.5 },
  roleTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, marginBottom: 14 },
  controls: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  btn: {
    padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(201,168,76,0.4)',
    background: 'rgba(255,255,255,0.06)', color: '#E8D48B', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  primary: { background: 'linear-gradient(135deg,#C9A84C,#8B6914)', color: '#0F1A2E', border: 'none', fontWeight: 700 },
  status: { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 12, minHeight: 18 },
  voicepick: { marginTop: 12, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  lbl: { display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  mode: { marginLeft: 8, color: '#7CCf8e' },
  accentWrap: { display: 'inline-flex', alignItems: 'center' },
  select: {
    fontFamily: 'inherit', background: '#1b2536', color: '#E9EEF7',
    border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '5px 8px', marginLeft: 6,
  },
};

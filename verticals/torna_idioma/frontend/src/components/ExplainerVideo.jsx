import React, { useState, useEffect, useRef, useCallback } from 'react';
import { speak, stopVoice } from '../services/voice';

/**
 * The animated explanation of Torna Idioma, in four scenes:
 *
 *   1. What it is        — a Spanish word crossing into Filipino, because that is
 *                          the whole thesis: this language is already half here.
 *   2. Who it is for     — students, BPO professionals, teachers, institutions.
 *   3. Why it matters    — 4,000 loanwords, 650 million speakers, a salary premium.
 *   4. How we get there  — twelve modules, A1 to B1+, ending in work.
 *
 * Rendered as animated SVG rather than a video file: it is a few kilobytes instead
 * of tens of megabytes, it stays sharp on any screen, it re-narrates instantly in
 * three languages, and a learner on Philippine mobile data is not made to download
 * a film before they understand what the programme is.
 *
 * Narration is Profesora Isabel through services/voice.js — Dalia in Spanish, Ava
 * in English, Blessica in Filipino. Silent autoplay by default (browsers block
 * unsolicited audio); the voice starts when the viewer asks for it.
 */

const COPY = {
  es: {
    play: 'Ver la explicación',
    playVoice: 'Con la voz de la Profesora Isabel',
    pause: 'Pausar',
    replay: 'Ver de nuevo',
    mute: 'Silenciar',
    scenes: [
      {
        eyebrow: 'Qué es',
        title: 'El idioma ya está aquí',
        body: 'Torna Idioma enseña español a los filipinos como una herencia que se recupera, no como una lengua extranjera. El filipino ya lleva unas cuatro mil palabras de origen español.',
        narration: 'Torna Idioma enseña español a los filipinos como una herencia que se recupera, no como una lengua extranjera. El filipino ya lleva unas cuatro mil palabras de origen español. Cuando dices "kumusta", estás diciendo "¿cómo está?".',
      },
      {
        eyebrow: 'Para quién',
        title: 'Para quien quiere hablar, no solo aprobar',
        body: 'Estudiantes universitarios, profesionales de centros de servicios, docentes e instituciones que necesitan una certificación que signifique algo.',
        narration: 'Es para estudiantes universitarios, para profesionales de centros de servicios que atienden a clientes hispanohablantes, para docentes y para instituciones que necesitan una certificación que signifique algo.',
      },
      {
        eyebrow: 'Por qué importa',
        title: 'Dignidad, y también salario',
        body: 'Rizal escribió en español. Hoy lo hablan más de seiscientos cincuenta millones de personas, y en el sector de servicios filipino el español paga una prima real.',
        narration: 'Rizal escribió el Noli Me Tángere en español. Un filipino que lo lee traducido está leyendo a su propio autor de segunda mano. Hoy el español lo hablan más de seiscientos cincuenta millones de personas, y en el sector de servicios filipino paga una prima salarial real.',
      },
      {
        eyebrow: 'Cómo lo logramos',
        title: 'Doce módulos, del A1 al B1+',
        body: 'Setenta y dos lecciones con práctica hablada todos los días, puentes con el tagalo, y desde el módulo siete, español para el trabajo.',
        narration: 'Doce módulos, setenta y dos lecciones, del nivel A1 al B1+. Cada lección tiene práctica hablada, puentes con el tagalo y pronunciación pensada para la boca filipina. Desde el módulo siete se añade el español del trabajo.',
      },
    ],
  },
  en: {
    play: 'Watch the explanation',
    playVoice: 'Narrated by Profesora Isabel',
    pause: 'Pause',
    replay: 'Watch again',
    mute: 'Mute',
    scenes: [
      {
        eyebrow: 'What it is',
        title: 'The language is already here',
        body: 'Torna Idioma teaches Filipinos Spanish as an inheritance being recovered, not a foreign language. Filipino already carries around four thousand words of Spanish origin.',
        narration: 'Torna Idioma teaches Filipinos Spanish as an inheritance being recovered, not a foreign language. Filipino already carries around four thousand words of Spanish origin. When you say kumusta, you are saying cómo está.',
      },
      {
        eyebrow: 'Who it is for',
        title: 'For people who want to speak, not just pass',
        body: 'University students, outsourcing professionals, teachers, and institutions that need a certification which actually means something.',
        narration: 'It is for university students, for outsourcing professionals serving Spanish-speaking customers, for teachers, and for institutions that need a certification which actually means something.',
      },
      {
        eyebrow: 'Why it matters',
        title: 'Dignity, and also salary',
        body: 'Rizal wrote in Spanish. Today more than six hundred and fifty million people speak it, and on the Philippine services floor it carries a real premium.',
        narration: 'Rizal wrote Noli Me Tángere in Spanish. A Filipino reading it in translation is reading their own national author second hand. Today more than six hundred and fifty million people speak Spanish, and on the Philippine services floor it carries a real salary premium.',
      },
      {
        eyebrow: 'How we get there',
        title: 'Twelve modules, A1 to B1 plus',
        body: 'Seventy-two lessons with spoken practice every day, bridges to Tagalog, and from module seven, Spanish for work.',
        narration: 'Twelve modules, seventy-two lessons, from A1 to B1 plus. Every lesson carries spoken practice, bridges to Tagalog, and pronunciation built for the Filipino mouth. From module seven, workplace Spanish is added.',
      },
    ],
  },
  fil: {
    play: 'Panoorin ang paliwanag',
    playVoice: 'Boses ni Profesora Isabel',
    pause: 'I-pause',
    replay: 'Panoorin muli',
    mute: 'I-mute',
    scenes: [
      {
        eyebrow: 'Ano ito',
        title: 'Nandito na ang wika',
        body: 'Itinuturo ng Torna Idioma ang Espanyol bilang pamanang binabawi, hindi bilang dayuhang wika. May humigit-kumulang apat na libong salitang Espanyol na ang Filipino.',
        narration: 'Itinuturo ng Torna Idioma ang Espanyol sa mga Pilipino bilang pamanang binabawi, hindi bilang dayuhang wika. May humigit-kumulang apat na libong salitang mula sa Espanyol ang Filipino. Kapag sinabi mong kumusta, sinasabi mo ang cómo está.',
      },
      {
        eyebrow: 'Para kanino',
        title: 'Para sa gustong magsalita, hindi lang pumasa',
        body: 'Mga estudyante sa unibersidad, propesyonal sa BPO, guro, at institusyong nangangailangan ng sertipikasyong may tunay na halaga.',
        narration: 'Para ito sa mga estudyante sa unibersidad, sa mga propesyonal sa BPO na naglilingkod sa mga kliyenteng nagsasalita ng Espanyol, sa mga guro, at sa mga institusyong nangangailangan ng sertipikasyong may tunay na halaga.',
      },
      {
        eyebrow: 'Bakit mahalaga',
        title: 'Dignidad, at sahod din',
        body: 'Sa Espanyol sumulat si Rizal. Ngayon, mahigit anim na raan at limampung milyon ang nagsasalita nito, at may tunay na dagdag-sahod ito sa BPO.',
        narration: 'Sa Espanyol isinulat ni Rizal ang Noli Me Tángere. Ang Pilipinong nagbabasa nito sa salin ay nagbabasa ng sariling awtor sa segunda mano. Ngayon, mahigit anim na raan at limampung milyong tao ang nagsasalita ng Espanyol, at may tunay itong dagdag-sahod sa sektor ng BPO.',
      },
      {
        eyebrow: 'Paano natin makakamit',
        title: 'Labindalawang module, A1 hanggang B1+',
        body: 'Pitumpu at dalawang aralin na may pagsasalita araw-araw, tulay sa Tagalog, at mula module pito, Espanyol para sa trabaho.',
        narration: 'Labindalawang module, pitumpu at dalawang aralin, mula A1 hanggang B1 plus. May pagsasanay sa pagsasalita ang bawat aralin, may tulay sa Tagalog, at may pagbigkas na ginawa para sa bibig ng Pilipino. Mula module pito, idinaragdag ang Espanyol sa trabaho.',
      },
    ],
  },
};

const SCENE_MS = 9000;
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#E8D48B';

/** Scene 1 — the cognate bridge: a Spanish phrase crossing into Filipino. */
function SceneBridge({ on }) {
  return (
    <g opacity={on ? 1 : 0} style={{ transition: 'opacity .6s' }}>
      <text x="150" y="72" textAnchor="middle" fill={GOLD_LIGHT} fontFamily="'Playfair Display',serif" fontSize="21" fontStyle="italic"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .7s .1s' }}>¿cómo está?</text>
      <path d="M78 92 Q150 116 222 92" fill="none" stroke={GOLD} strokeWidth="1.6" strokeDasharray="200"
        strokeDashoffset={on ? 0 : 200} style={{ transition: 'stroke-dashoffset 1.4s .5s ease-out' }} />
      <circle cx="150" cy="107" r="3.4" fill={GOLD} style={{ opacity: on ? 1 : 0, transition: 'opacity .5s 1.5s' }} />
      <text x="150" y="140" textAnchor="middle" fill="#fff" fontFamily="'Playfair Display',serif" fontSize="26" fontWeight="700"
        style={{ opacity: on ? 1 : 0, transform: on ? 'translateY(0)' : 'translateY(8px)', transformOrigin: 'center', transition: 'opacity .7s 1.6s, transform .7s 1.6s' }}>kumusta</text>
      <text x="150" y="164" textAnchor="middle" fill="rgba(255,255,255,.5)" fontFamily="'Inter',sans-serif" fontSize="10" letterSpacing="1.4"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .6s 2.1s' }}>~4,000 palabras · words · salita</text>
    </g>
  );
}

/** Scene 2 — the four audiences appearing in turn. */
function SceneWho({ on }) {
  const people = [
    { x: 60, label: 'estudiante' },
    { x: 120, label: 'BPO' },
    { x: 180, label: 'docente' },
    { x: 240, label: 'institución' },
  ];
  return (
    <g opacity={on ? 1 : 0} style={{ transition: 'opacity .6s' }}>
      {people.map((p, i) => (
        <g key={p.label} style={{ opacity: on ? 1 : 0, transform: on ? 'translateY(0)' : 'translateY(14px)', transition: `opacity .55s ${0.15 * i + 0.2}s, transform .55s ${0.15 * i + 0.2}s` }}>
          <circle cx={p.x} cy="86" r="12" fill="none" stroke={GOLD} strokeWidth="1.6" />
          <path d={`M${p.x - 17} 130 q17 -24 34 0`} fill="none" stroke={GOLD} strokeWidth="1.6" />
          <text x={p.x} y="152" textAnchor="middle" fill="rgba(255,255,255,.62)" fontFamily="'Inter',sans-serif" fontSize="9">{p.label}</text>
        </g>
      ))}
      <line x1="46" y1="166" x2="254" y2="166" stroke={GOLD} strokeWidth="1" strokeDasharray="208"
        strokeDashoffset={on ? 0 : 208} style={{ transition: 'stroke-dashoffset 1.1s .9s' }} />
    </g>
  );
}

/** Scene 3 — the three numbers that make the case. */
function SceneWhy({ on }) {
  const stats = [
    { v: '650M', k: 'hablantes' },
    { v: '4,000', k: 'palabras' },
    { v: 'B1+', k: 'al trabajo' },
  ];
  return (
    <g opacity={on ? 1 : 0} style={{ transition: 'opacity .6s' }}>
      {stats.map((s, i) => (
        <g key={s.k} style={{ opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(.85)', transformOrigin: `${70 + i * 80}px 100px`, transition: `opacity .5s ${0.2 * i + 0.2}s, transform .5s ${0.2 * i + 0.2}s` }}>
          <text x={70 + i * 80} y="102" textAnchor="middle" fill={GOLD} fontFamily="'Playfair Display',serif" fontSize="27" fontWeight="800">{s.v}</text>
          <text x={70 + i * 80} y="120" textAnchor="middle" fill="rgba(255,255,255,.55)" fontFamily="'Inter',sans-serif" fontSize="9" letterSpacing="1">{s.k}</text>
        </g>
      ))}
      <text x="150" y="158" textAnchor="middle" fill={GOLD_LIGHT} fontFamily="'Playfair Display',serif" fontSize="13" fontStyle="italic"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .7s 1.1s' }}>«Noli Me Tángere» — Rizal, 1887</text>
    </g>
  );
}

/** Scene 4 — twelve modules filling, then the certificate. */
function SceneHow({ on }) {
  return (
    <g opacity={on ? 1 : 0} style={{ transition: 'opacity .6s' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        return (
          <rect key={i} x={54 + col * 32} y={72 + row * 26} width="24" height="18" rx="3"
            fill={i >= 6 ? 'rgba(201,168,76,.30)' : 'rgba(201,168,76,.14)'} stroke={GOLD} strokeWidth="1"
            style={{ opacity: on ? 1 : 0, transition: `opacity .32s ${0.07 * i + 0.15}s` }} />
        );
      })}
      <text x="150" y="142" textAnchor="middle" fill="rgba(255,255,255,.55)" fontFamily="'Inter',sans-serif" fontSize="9" letterSpacing="1"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .5s 1s' }}>A1 · A2 · B1 · B1+</text>
      <text x="150" y="164" textAnchor="middle" fill={GOLD} fontFamily="'Playfair Display',serif" fontSize="14" fontWeight="700"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .6s 1.3s' }}>72 lecciones · español del trabajo</text>
    </g>
  );
}

export default function ExplainerVideo({ lang = 'es' }) {
  const t = COPY[lang] || COPY.es;
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const timer = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const goTo = useCallback((i, withVoice) => {
    setScene(i);
    if (withVoice) speak(t.scenes[i].narration, lang);
  }, [t, lang]);

  // Advance while playing. Narration and the visual are on the same clock, so a
  // long sentence is not cut off by a scene change.
  useEffect(() => {
    clear();
    if (!playing) return undefined;
    timer.current = setTimeout(() => {
      if (scene < t.scenes.length - 1) goTo(scene + 1, voiceOn);
      else { setPlaying(false); stopVoice(); }
    }, reduced ? SCENE_MS * 1.5 : SCENE_MS);
    return clear;
  }, [playing, scene, voiceOn, goTo, t.scenes.length, reduced]);

  useEffect(() => () => { clear(); stopVoice(); }, []);

  const start = () => {
    const from = scene >= t.scenes.length - 1 ? 0 : scene;
    setPlaying(true);
    goTo(from, voiceOn);
  };
  const pause = () => { setPlaying(false); clear(); stopVoice(); };

  const s = t.scenes[scene];
  const finished = !playing && scene === t.scenes.length - 1;

  return (
    <div style={st.wrap}>
      <div style={st.stage}>
        <svg viewBox="0 0 300 200" style={st.svg} role="img" aria-label={s.title}>
          <defs>
            <radialGradient id="ti-glow" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stopColor="rgba(201,168,76,.18)" />
              <stop offset="100%" stopColor="rgba(201,168,76,0)" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="300" height="200" fill="url(#ti-glow)" />
          <text x="150" y="34" textAnchor="middle" fill={GOLD} fontFamily="'Inter',sans-serif" fontSize="9" letterSpacing="3">
            {s.eyebrow.toUpperCase()}
          </text>
          <SceneBridge on={scene === 0} />
          <SceneWho on={scene === 1} />
          <SceneWhy on={scene === 2} />
          <SceneHow on={scene === 3} />
        </svg>

        {!playing && scene === 0 && (
          <button type="button" onClick={start} style={st.bigPlay} aria-label={t.play}>
            <span style={st.bigPlayIcon}>&#9658;</span>
          </button>
        )}
      </div>

      <h3 style={st.title}>{s.title}</h3>
      <p style={st.body}>{s.body}</p>

      <div style={st.controls}>
        <button type="button" onClick={playing ? pause : start} style={st.primary}>
          {playing ? t.pause : (finished ? t.replay : t.play)}
        </button>
        <button type="button" onClick={() => { const n = !voiceOn; setVoiceOn(n); if (!n) stopVoice(); }} style={st.ghost}>
          {voiceOn ? t.mute : t.playVoice}
        </button>
      </div>

      <div style={st.dots}>
        {t.scenes.map((sc, i) => (
          <button key={i} type="button" onClick={() => { setPlaying(false); clear(); stopVoice(); goTo(i, false); }}
            aria-label={sc.eyebrow} style={{ ...st.dot, ...(i === scene ? st.dotOn : {}) }} />
        ))}
      </div>
      <div style={st.voiceCap}>{t.playVoice}</div>
    </div>
  );
}

const st = {
  wrap: { maxWidth: 460, margin: '0 auto 30px', textAlign: 'center' },
  stage: { position: 'relative', background: 'rgba(255,255,255,.03)', border: `1px solid rgba(201,168,76,.35)`, borderRadius: 16, overflow: 'hidden' },
  svg: { display: 'block', width: '100%', height: 'auto' },
  bigPlay: { position: 'absolute', inset: 0, margin: 'auto', width: 62, height: 62, borderRadius: '50%', border: `2px solid ${GOLD}`, background: 'rgba(15,26,46,.72)', color: GOLD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bigPlayIcon: { fontSize: 20, marginLeft: 4 },
  title: { fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#fff', margin: '18px 0 6px', lineHeight: 1.25 },
  body: { fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'rgba(255,255,255,.66)', lineHeight: 1.65, margin: '0 auto', maxWidth: 400 },
  controls: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 },
  primary: { fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#E8D48B,#C9A84C)', color: '#0F1A2E' },
  ghost: { fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: GOLD_LIGHT, border: `1px solid rgba(201,168,76,.45)` },
  dots: { display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 },
  dot: { width: 22, height: 3, borderRadius: 99, border: 0, padding: 0, cursor: 'pointer', background: 'rgba(201,168,76,.28)' },
  dotOn: { background: GOLD },
  voiceCap: { fontFamily: "'Inter',sans-serif", fontSize: 10.5, color: 'rgba(255,255,255,.4)', letterSpacing: 1, marginTop: 10 },
};

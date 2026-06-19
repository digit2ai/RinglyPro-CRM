import React, { useState, useEffect, useRef } from 'react';
import { tr, uiLang } from '../i18n';
import api from '../services/api';

// Heritage tokens (match the rest of the app)
const GOLD = '#C9A84C', GOLD_D = '#8B6914', NAVY = '#1B2A4A', NAVY_D = '#0F1A2E', CREAM = '#FFF8E7', CREAM_L = '#FFFDF5', BORDER = '#F5E6C8', RED = '#C41E3A';

const stripEs = (s) => String(s || '').replace(/⟦es⟧/g, '');
const lite = (md) => stripEs(md).replace(/\*\*(.+?)\*\*/g, '$1').replace(/[#*`_>~]/g, '');

// ---- shared speech helpers -------------------------------------------------
function useSpeech() {
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const start = (onText) => {
    if (!supported) return;
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'es-MX'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
      recRef.current = rec;
      let got = '';
      rec.onresult = (e) => { got = e.results[0][0].transcript; };
      rec.onerror = () => setListening(false);
      rec.onend = () => { setListening(false); if (got) onText(got.trim()); };
      setListening(true); rec.start();
    } catch (e) { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch (e) { /* noop */ } setListening(false); };
  return { supported, listening, start, stop };
}

let _audio = null;
async function playEs(textEs) {
  try {
    if (_audio) { try { _audio.pause(); } catch (e) {} }
    const wrapped = textEs.includes('⟦es⟧') ? textEs : `⟦es⟧${textEs}⟦es⟧`;
    const r = await api.post('/tutor/tts', { text: wrapped, interface_lang: uiLang() }, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = new Audio(url); _audio = a;
    a.onended = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
    await a.play();
  } catch (e) { /* TTS optional */ }
}

// A reusable "say it" control: mic (if supported) + always a typed fallback.
function SpeakBox({ placeholder, onSubmit, busy }) {
  const sp = useSpeech();
  const [text, setText] = useState('');
  const submit = (t) => { const v = (t ?? text).trim(); if (!v || busy) return; onSubmit(v); setText(''); };
  return (
    <div style={s.speakBox}>
      {sp.supported && (
        <button
          onClick={() => sp.listening ? sp.stop() : sp.start((t) => submit(t))}
          style={{ ...s.micBtn, ...(sp.listening ? s.micOn : {}) }}
          title={tr('speak.tapToSpeak')}
        >{sp.listening ? '■' : '🎤'}</button>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder={sp.listening ? tr('speak.listening') : (placeholder || tr('speak.typeInstead'))}
        style={s.speakInput}
        disabled={busy}
      />
      <button onClick={() => submit()} disabled={busy || !text.trim()} style={{ ...s.sendBtn, opacity: busy || !text.trim() ? 0.5 : 1 }}>
        {tr('speak.send')}
      </button>
    </div>
  );
}

function ScorePill({ ok, score }) {
  return <span style={{ ...s.pill, background: ok ? 'rgba(46,125,50,0.12)' : 'rgba(196,30,58,0.1)', color: ok ? '#2E7D32' : RED, borderColor: ok ? 'rgba(46,125,50,0.3)' : 'rgba(196,30,58,0.3)' }}>{score}/100</span>;
}

export default function SpeakingLesson() {
  const lang = uiLang();
  const [list, setList] = useState(null);   // unit summaries for the picker
  const [unit, setUnit] = useState(null);   // selected full unit
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/speaking/units')
      .then(r => setList(r.data.units || []))
      .catch(() => setErr(tr('common.error')));
  }, []);

  const openUnit = (id) => {
    setUnit(null); setStarted(false); setStep(0);
    api.get(`/speaking/units/${id}`).then(u => setUnit(u.data.unit)).catch(() => setErr(tr('common.error')));
  };
  const backToList = () => { setUnit(null); setStarted(false); setStep(0); };

  if (err) return <div style={s.page}><div style={s.center}>{err}</div></div>;
  if (!list) return <div style={s.page}><div style={s.center}>{tr('common.loading')}</div></div>;

  const steps = [Step1Listen, Step2Shadow, Step3Speak, Step4Converse, Step5Assess];
  const StepComp = steps[step];
  const title = unit ? (unit.title?.[lang] || unit.title?.en) : null;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <div style={s.avatar}>{unit ? unit.cefr : '🗣'}</div>
          <div>
            <h1 style={s.h1}>{unit ? `${tr('speak.title')}: ${title}` : tr('speak.title')}</h1>
            <p style={s.sub}>{tr('speak.subtitle')}</p>
          </div>
        </div>
        {unit && started && (
          <div style={s.progressWrap}>
            <div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${((step + 1) / steps.length) * 100}%` }} /></div>
            <div style={s.progressLabel}>{tr('speak.step')} {step + 1} {tr('speak.of')} {steps.length}</div>
          </div>
        )}
      </div>

      <div style={s.body} id="ti-speak-body">
        {!unit ? (
          <Picker list={list} lang={lang} loading={false} onOpen={openUnit} />
        ) : (
          <>
            <button onClick={backToList} style={s.lessonsLink}>← {tr('nav.speak')}</button>
            {!started ? (
              <Intro unit={unit} lang={lang} onStart={() => setStarted(true)} />
            ) : (
              <>
                <StepComp unit={unit} lang={lang} />
                <div style={s.navRow}>
                  {step > 0 && <button onClick={() => setStep(step - 1)} style={s.ghostBtn}>{tr('speak.back')}</button>}
                  {step < steps.length - 1 && <button onClick={() => setStep(step + 1)} style={s.primaryBtn}>{tr('speak.next')} →</button>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Picker({ list, lang, onOpen }) {
  if (!list.length) return <div style={s.center}>{tr('common.loading')}</div>;
  return (
    <div style={s.pickGrid}>
      {list.map((u, i) => (
        <button key={u.unit_id} onClick={() => onOpen(u.unit_id)} style={s.pickCard}>
          <div style={s.pickTop}><span style={s.pickNum}>{i + 1}</span><span style={s.pickCefr}>{u.cefr}</span></div>
          <div style={s.pickTitle}>{u.title?.[lang] || u.title?.en}</div>
          {u.objectives?.[0] && <div style={s.pickObj}>{u.objectives[0][lang] || u.objectives[0].en}</div>}
          <div style={s.pickGo}>{tr('speak.start')} →</div>
        </button>
      ))}
    </div>
  );
}

function Intro({ unit, lang, onStart }) {
  return (
    <div style={s.card}>
      <div style={s.kicker}>MÉTODO RIZAL · {unit.cefr}</div>
      <h2 style={s.cardTitle}>{unit.title?.[lang] || unit.title?.en}</h2>
      <ul style={s.objList}>
        {(unit.objectives || []).map((o, i) => <li key={i} style={s.objItem}>{o[lang] || o.en}</li>)}
      </ul>
      {unit.target?.cognates?.length > 0 && (
        <div style={s.cognateBox}>
          <div style={s.cognateLabel}>{tr('speak.cognateBridge')}</div>
          <div style={s.cognateChips}>
            {unit.target.cognates.map((c, i) => <span key={i} style={s.chip}>{c.es} ≈ {c.fil}</span>)}
          </div>
        </div>
      )}
      <button onClick={onStart} style={s.startBtn}>{tr('speak.start')}</button>
    </div>
  );
}

// Step 1 — Listen (comprehensible input)
function Step1Listen({ unit, lang }) {
  const [fb, setFb] = useState(null); const [busy, setBusy] = useState(false);
  const scene = unit.input_scene || {};
  const playAll = async () => { for (const ln of scene.lines || []) { await playEs(ln.es); await new Promise(r => setTimeout(r, 350)); } };
  const checkGist = async (said) => {
    setBusy(true);
    try { const r = await api.post('/speaking/feedback', { target_es: scene.gist_question?.answer_es || scene.gist_question?.es, said_text: said, interface_lang: lang }); setFb(r.data); } catch (e) { setFb({ ok: false, tip: tr('common.error') }); } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <StepHead n={1} title={tr('speak.s1.title')} hint={tr('speak.s1.hint')} />
      <button onClick={playAll} style={s.playAllBtn}>▶ {tr('speak.playAll')}</button>
      <div style={s.scene}>
        {(scene.lines || []).map((ln, i) => (
          <div key={i} style={s.lineRow}>
            <button onClick={() => playEs(ln.es)} style={s.linePlay} title={tr('speak.play')}>▶</button>
            <div>
              <div style={s.lineEs}>{ln.es}</div>
              <div style={s.lineGloss}>{ln[lang] || ln.en}</div>
            </div>
          </div>
        ))}
      </div>
      {scene.gist_question && (
        <div style={s.gistBox}>
          <div style={s.gistLabel}>{tr('speak.s1.gist')}</div>
          <div style={s.gistQ}><button onClick={() => playEs(scene.gist_question.es)} style={s.linePlay}>▶</button> {scene.gist_question.es} <span style={s.lineGloss}>({scene.gist_question[lang] || ''})</span></div>
          <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={checkGist} busy={busy} />
          {busy && <div style={s.muted}>{tr('speak.checking')}</div>}
          {fb && <Feedback fb={fb} />}
        </div>
      )}
    </div>
  );
}

// Step 2 — Shadow
function Step2Shadow({ unit, lang }) {
  const [idx, setIdx] = useState(0); const [fb, setFb] = useState(null); const [busy, setBusy] = useState(false);
  const lines = unit.shadow_lines || [];
  const line = lines[idx];
  const check = async (said) => {
    setBusy(true);
    try { const r = await api.post('/speaking/feedback', { target_es: line, said_text: said, interface_lang: lang }); setFb(r.data); } catch (e) { setFb({ ok: false, tip: tr('common.error') }); } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <StepHead n={2} title={tr('speak.s2.title')} hint={tr('speak.s2.hint')} />
      <div style={s.shadowCounter}>{idx + 1} / {lines.length}</div>
      <div style={s.shadowLine}>{line}</div>
      <button onClick={() => playEs(line)} style={s.playAllBtn}>▶ {tr('speak.play')}</button>
      <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={check} busy={busy} />
      {busy && <div style={s.muted}>{tr('speak.checking')}</div>}
      {fb && <Feedback fb={fb} />}
      <div style={s.shadowNav}>
        {idx > 0 && <button onClick={() => { setIdx(idx - 1); setFb(null); }} style={s.ghostBtnSm}>←</button>}
        {idx < lines.length - 1 && <button onClick={() => { setIdx(idx + 1); setFb(null); }} style={s.ghostBtnSm}>{tr('speak.next')} →</button>}
      </div>
    </div>
  );
}

// Step 3 — Guided speaking
function Step3Speak({ unit, lang }) {
  const [idx, setIdx] = useState(0); const [fb, setFb] = useState(null); const [busy, setBusy] = useState(false);
  const prompts = unit.guided_prompts || [];
  const p = prompts[idx];
  const check = async (said) => {
    setBusy(true);
    try { const r = await api.post('/speaking/feedback', { target_es: p.say_es, said_text: said, interface_lang: lang }); setFb(r.data); } catch (e) { setFb({ ok: false, tip: tr('common.error') }); } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <StepHead n={3} title={tr('speak.s3.title')} hint={tr('speak.s3.hint')} />
      <div style={s.shadowCounter}>{idx + 1} / {prompts.length}</div>
      <div style={s.guidedInstruction}>{p.instruction_fil && lang === 'fil' ? p.instruction_fil : (p.instruction_en || p.instruction_fil)}</div>
      <div style={s.guidedTarget}><button onClick={() => playEs(p.say_es)} style={s.linePlay}>▶</button> {p.say_es}</div>
      <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={check} busy={busy} />
      {busy && <div style={s.muted}>{tr('speak.checking')}</div>}
      {fb && <Feedback fb={fb} />}
      <div style={s.shadowNav}>
        {idx > 0 && <button onClick={() => { setIdx(idx - 1); setFb(null); }} style={s.ghostBtnSm}>←</button>}
        {idx < prompts.length - 1 && <button onClick={() => { setIdx(idx + 1); setFb(null); }} style={s.ghostBtnSm}>{tr('speak.next')} →</button>}
      </div>
    </div>
  );
}

// Step 4 — Converse (roleplay)
function Step4Converse({ unit, lang }) {
  const [msgs, setMsgs] = useState([]); const [busy, setBusy] = useState(false); const endRef = useRef(null);
  useEffect(() => { send('Hola.', true); /* kick off */ }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const send = async (text, hidden) => {
    if (busy) return; setBusy(true);
    const next = hidden ? msgs : [...msgs, { role: 'user', content: text }];
    if (!hidden) setMsgs(next);
    try {
      const hist = (hidden ? [{ role: 'user', content: text }] : next).map(m => ({ role: m.role, content: m.content }));
      const r = await api.post('/speaking/roleplay', { unit_id: unit.unit_id, messages: hist, interface_lang: lang });
      const reply = r.data.reply || '';
      setMsgs(m => [...(hidden ? m : next), { role: 'assistant', content: reply }]);
      playEs(reply);
    } catch (e) { setMsgs(m => [...m, { role: 'assistant', content: tr('common.error') }]); } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <StepHead n={4} title={tr('speak.s4.title')} hint={tr('speak.s4.hint')} />
      <div style={s.scenarioBox}>{unit.roleplay?.setup_fil && lang === 'fil' ? unit.roleplay.setup_fil : (unit.roleplay?.setup_es || '')}</div>
      <div style={s.chat}>
        {msgs.map((m, i) => (
          <div key={i} style={{ ...s.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={m.role === 'user' ? s.userBubble : s.botBubble}>
              {m.role === 'assistant' && <button onClick={() => playEs(m.content)} style={s.linePlaySm}>▶</button>}
              <span>{lite(m.content)}</span>
            </div>
          </div>
        ))}
        {busy && <div style={s.muted}>…</div>}
        <div ref={endRef} />
      </div>
      <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={(t) => send(t)} busy={busy} />
    </div>
  );
}

// Step 5 — Assessment
function Step5Assess({ unit, lang }) {
  const a = unit.assessment || {};
  const [mono, setMono] = useState(''); const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const qa = (a.qa_turns || []).map((t, i) => ({ q: t.es, a: answers[i] || '' }));
      const r = await api.post('/speaking/assess', { unit_id: unit.unit_id, monologue_text: mono, qa, interface_lang: lang });
      setResult(r.data);
    } catch (e) { setResult({ error: true }); } finally { setBusy(false); }
  };
  if (result && !result.error) return <Result result={result} lang={lang} onRetry={() => { setResult(null); setMono(''); setAnswers({}); }} />;
  return (
    <div style={s.card}>
      <StepHead n={5} title={tr('speak.s5.title')} hint={tr('speak.s5.hint')} />
      <div style={s.assessQ}><strong>{tr('speak.monologue')}:</strong> {a.monologue_prompt?.[lang] || a.monologue_prompt?.es}</div>
      <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={(t) => setMono(m => (m ? m + ' ' : '') + t)} busy={busy} />
      {mono && <div style={s.saidBox}><strong>{tr('speak.youSaid')}:</strong> {mono}</div>}
      <div style={{ height: 14 }} />
      {(a.qa_turns || []).map((t, i) => (
        <div key={i} style={s.assessQ}>
          <div><button onClick={() => playEs(t.es)} style={s.linePlay}>▶</button> {t.es}</div>
          <SpeakBox placeholder={tr('speak.tapToSpeak')} onSubmit={(txt) => setAnswers(o => ({ ...o, [i]: txt }))} busy={busy} />
          {answers[i] && <div style={s.saidBoxSm}>{answers[i]}</div>}
        </div>
      ))}
      <button onClick={submit} disabled={busy || !mono} style={{ ...s.startBtn, opacity: busy || !mono ? 0.5 : 1 }}>{tr('speak.submitAssessment')}</button>
      {busy && <div style={s.muted}>{tr('speak.scoring')}</div>}
      {result?.error && <div style={s.muted}>{tr('common.error')}</div>}
    </div>
  );
}

function Result({ result, lang, onRetry }) {
  const crit = result.criteria || {};
  const labels = { fluency: tr('speak.fluency'), accuracy: tr('speak.accuracy'), pronunciation: tr('speak.pronunciation'), range: tr('speak.range'), interaction: tr('speak.interaction') };
  return (
    <div style={s.card}>
      <div style={{ textAlign: 'center' }}>
        <div style={s.scoreBig}>{result.weighted_percent}<span style={s.scoreOf}>/100</span></div>
        <div style={{ ...s.resultBadge, background: result.pass ? '#2E7D32' : RED }}>{result.pass ? tr('speak.passed') : tr('speak.notYet')}</div>
      </div>
      <div style={s.rubric}>
        {Object.keys(labels).map(k => (
          <div key={k} style={s.rubricRow}>
            <span style={s.rubricLabel}>{labels[k]}</span>
            <span style={s.rubricBars}>{[1, 2, 3, 4, 5].map(n => <span key={n} style={{ ...s.rbar, background: n <= (crit[k] || 0) ? GOLD : '#E8E0C8' }} />)}</span>
          </div>
        ))}
      </div>
      {result[`summary_${lang}`] && <p style={s.summary}>{result[`summary_${lang}`]}</p>}
      <button onClick={onRetry} style={s.startBtn}>{tr('speak.retry')}</button>
    </div>
  );
}

function StepHead({ n, title, hint }) {
  return (<div style={s.stepHead}><div style={s.stepNum}>{n}</div><div><div style={s.stepTitle}>{title}</div><div style={s.stepHint}>{hint}</div></div></div>);
}
function Feedback({ fb }) {
  return (
    <div style={{ ...s.fbBox, borderColor: fb.ok ? 'rgba(46,125,50,0.4)' : GOLD }}>
      <div style={s.fbTop}>{typeof fb.score === 'number' && <ScorePill ok={fb.ok} score={fb.score} />}<span style={s.fbHead}>{fb.ok ? tr('speak.goodJob') : tr('speak.tryAgain')}</span></div>
      {fb.tip && <div style={s.fbTip}>{fb.tip}</div>}
      {fb.corrected && !fb.ok && <div style={s.fbCorrected}>→ {fb.corrected}</div>}
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: CREAM, minHeight: '100vh' },
  center: { padding: 48, textAlign: 'center', color: '#6B6B6B' },
  header: { background: `linear-gradient(135deg, ${NAVY_D}, ${NAVY}, #2A3F6A)`, padding: '20px 24px', borderBottom: `3px solid ${GOLD}` },
  headerRow: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: { width: 46, height: 46, borderRadius: '50%', border: `2px solid ${GOLD}`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: "'Playfair Display',serif", flexShrink: 0 },
  h1: { fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 800, color: '#fff' },
  sub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic' },
  progressWrap: { marginTop: 14 },
  progressTrack: { height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', background: GOLD, transition: 'width 0.3s' },
  progressLabel: { fontSize: 11, color: '#E8D48B', marginTop: 5, letterSpacing: 1, textTransform: 'uppercase' },
  body: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' },
  card: { background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, borderTop: `4px solid ${GOLD}`, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: GOLD_D },
  cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 26, color: NAVY, margin: '6px 0 14px' },
  objList: { listStyle: 'none', padding: 0, margin: '0 0 16px' },
  objItem: { padding: '8px 0 8px 26px', position: 'relative', fontSize: 15, borderBottom: `1px solid ${BORDER}` },
  cognateBox: { background: CREAM_L, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14, marginBottom: 18 },
  cognateLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: GOLD_D, textTransform: 'uppercase', marginBottom: 8 },
  cognateChips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '4px 12px', fontSize: 13, color: NAVY },
  startBtn: { width: '100%', padding: '14px 0', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, fontFamily: "'Playfair Display',serif", letterSpacing: 1, cursor: 'pointer', marginTop: 8 },
  stepHead: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 },
  stepNum: { width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: "'Playfair Display',serif", flexShrink: 0 },
  stepTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, color: NAVY, fontWeight: 700 },
  stepHint: { fontSize: 13, color: '#6B6B6B' },
  playAllBtn: { background: NAVY, color: GOLD, border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 14 },
  scene: { display: 'flex', flexDirection: 'column', gap: 10 },
  lineRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, background: CREAM_L, borderRadius: 8, border: `1px solid ${BORDER}` },
  linePlay: { width: 30, height: 30, minWidth: 30, borderRadius: '50%', border: `1px solid ${GOLD}`, background: '#fff', color: GOLD_D, cursor: 'pointer', fontSize: 12 },
  linePlaySm: { width: 22, height: 22, minWidth: 22, borderRadius: '50%', border: `1px solid ${GOLD}`, background: '#fff', color: GOLD_D, cursor: 'pointer', fontSize: 10, marginRight: 6 },
  lineEs: { fontSize: 16, color: NAVY, fontWeight: 600 },
  lineGloss: { fontSize: 13, color: '#6B6B6B', fontStyle: 'italic' },
  gistBox: { marginTop: 18, padding: 16, background: CREAM_L, borderRadius: 8, border: `1px solid ${BORDER}` },
  gistLabel: { fontSize: 12, fontWeight: 700, color: GOLD_D, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  gistQ: { fontSize: 16, color: NAVY, marginBottom: 12 },
  speakBox: { display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 6 },
  micBtn: { minWidth: 48, padding: '0 14px', background: '#fff', border: `1px solid ${GOLD}`, borderRadius: 8, fontSize: 18, cursor: 'pointer', color: GOLD_D },
  micOn: { background: RED, borderColor: RED, color: '#fff' },
  speakInput: { flex: 1, padding: '12px 14px', border: `1px solid #ddd`, borderRadius: 8, fontSize: 15, outline: 'none', minWidth: 0 },
  sendBtn: { padding: '0 18px', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  muted: { fontSize: 13, color: '#8B6914', fontStyle: 'italic', marginTop: 8 },
  fbBox: { marginTop: 12, padding: 12, borderRadius: 8, border: '2px solid', background: CREAM_L },
  fbTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  fbHead: { fontWeight: 700, color: NAVY },
  fbTip: { fontSize: 14, color: '#2C2C2C', lineHeight: 1.5 },
  fbCorrected: { fontSize: 14, color: GOLD_D, fontWeight: 600, marginTop: 4 },
  pill: { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 12, border: '1px solid' },
  shadowCounter: { fontSize: 12, color: '#8B6914', fontWeight: 700, marginBottom: 8 },
  shadowLine: { fontFamily: "'Playfair Display',serif", fontSize: 24, color: NAVY, fontWeight: 700, margin: '6px 0 14px' },
  shadowNav: { display: 'flex', justifyContent: 'space-between', marginTop: 16 },
  ghostBtnSm: { background: 'none', border: `1px solid ${GOLD}`, color: GOLD_D, borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' },
  guidedInstruction: { fontSize: 16, color: '#2C2C2C', marginBottom: 8 },
  guidedTarget: { fontFamily: "'Playfair Display',serif", fontSize: 22, color: NAVY, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  scenarioBox: { background: CREAM_L, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14, fontSize: 14, color: '#2C2C2C', marginBottom: 14, lineHeight: 1.6 },
  chat: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', padding: '6px 2px', marginBottom: 12 },
  bubbleRow: { display: 'flex' },
  botBubble: { background: '#fff', border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, padding: '10px 14px', borderRadius: '4px 14px 14px 14px', maxWidth: '85%', fontSize: 15, color: NAVY, display: 'flex', alignItems: 'flex-start' },
  userBubble: { background: NAVY, color: '#fff', padding: '10px 14px', borderRadius: '14px 4px 14px 14px', maxWidth: '80%', fontSize: 15 },
  assessQ: { fontSize: 16, color: NAVY, marginBottom: 12 },
  saidBox: { marginTop: 8, padding: 10, background: CREAM_L, borderRadius: 8, fontSize: 14, border: `1px solid ${BORDER}` },
  saidBoxSm: { marginTop: 6, fontSize: 13, color: '#6B6B6B', fontStyle: 'italic' },
  scoreBig: { fontFamily: "'Playfair Display',serif", fontSize: 64, fontWeight: 800, color: NAVY, lineHeight: 1 },
  scoreOf: { fontSize: 24, color: '#8B6914' },
  resultBadge: { display: 'inline-block', color: '#fff', padding: '6px 18px', borderRadius: 16, fontWeight: 700, fontSize: 14, margin: '10px 0 18px' },
  rubric: { display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 16px' },
  rubricRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rubricLabel: { fontSize: 14, color: NAVY, fontWeight: 600 },
  rubricBars: { display: 'flex', gap: 4 },
  rbar: { width: 28, height: 10, borderRadius: 3 },
  summary: { fontSize: 15, color: '#2C2C2C', lineHeight: 1.6, background: CREAM_L, padding: 14, borderRadius: 8, border: `1px solid ${BORDER}` },
  lessonsLink: { background: 'none', border: 'none', color: GOLD_D, fontWeight: 700, cursor: 'pointer', padding: '2px 0 12px', fontSize: 14 },
  pickGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 },
  pickCard: { textAlign: 'left', background: '#fff', border: `1px solid ${BORDER}`, borderTop: `4px solid ${GOLD}`, borderRadius: 12, padding: 18, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 8 },
  pickTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pickNum: { width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: "'Playfair Display',serif" },
  pickCefr: { fontSize: 11, fontWeight: 700, color: GOLD_D, background: 'rgba(201,168,76,0.15)', padding: '3px 10px', borderRadius: 12, letterSpacing: 1 },
  pickTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, color: NAVY, fontWeight: 700 },
  pickObj: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.5, flex: 1 },
  pickGo: { fontSize: 13, fontWeight: 700, color: GOLD_D, marginTop: 4 },
  navRow: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  primaryBtn: { background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, fontFamily: "'Playfair Display',serif", letterSpacing: 1, cursor: 'pointer' },
  ghostBtn: { background: 'none', border: `1px solid ${GOLD}`, color: GOLD_D, borderRadius: 8, padding: '12px 22px', fontWeight: 600, cursor: 'pointer' },
};

// mobile
if (typeof document !== 'undefined' && !document.getElementById('ti-speak-resp')) {
  const st = document.createElement('style'); st.id = 'ti-speak-resp';
  st.textContent = `@media(max-width:768px){#ti-speak-body{padding:16px 12px 50px!important}}`;
  document.head.appendChild(st);
}

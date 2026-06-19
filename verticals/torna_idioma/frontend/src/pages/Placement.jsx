import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tr, uiLang } from '../i18n';
import api from '../services/api';

const GOLD = '#C9A84C', GOLD_D = '#8B6914', NAVY = '#1B2A4A', NAVY_D = '#0F1A2E', CREAM = '#FFF8E7', CREAM_L = '#FFFDF5', BORDER = '#F5E6C8', RED = '#C41E3A';
const BASE = '/Torna_Idioma';

// minimal mic + typed input (browser STT optional; typed always works)
function OralInput({ value, onChange }) {
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const listen = () => {
    if (!supported) return;
    if (listening) { try { recRef.current?.stop(); } catch (e) {} return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = 'es-MX'; rec.interimResults = false; rec.continuous = false;
    recRef.current = rec; let got = '';
    rec.onresult = (e) => { got = e.results[0][0].transcript; };
    rec.onerror = () => setListening(false);
    rec.onend = () => { setListening(false); if (got) onChange(got.trim()); };
    setListening(true); rec.start();
  };
  return (
    <div style={s.oralRow}>
      {supported && <button onClick={listen} style={{ ...s.mic, ...(listening ? s.micOn : {}) }}>{listening ? '■' : '🎤'}</button>}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={listening ? '…' : ''} style={s.oralInput} />
    </div>
  );
}

export default function Placement() {
  const lang = uiLang();
  const nav = useNavigate();
  const [bank, setBank] = useState(null);
  const [phase, setPhase] = useState('intro'); // intro | a | b | done
  const [mcq, setMcq] = useState({});
  const [oral, setOral] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/placement/bank').then(r => setBank(r.data)).catch(() => setErr(tr('common.error'))); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/placement/score', {
        mcq: Object.entries(mcq).map(([id, chosen]) => ({ id, chosen })),
        oral: Object.entries(oral).map(([id, said]) => ({ id, said })),
        interface_lang: lang,
      });
      setResult(r.data); setPhase('done');
    } catch (e) { setErr(tr('common.error')); } finally { setBusy(false); }
  };

  if (err) return <div style={s.page}><div style={s.center}>{err}</div></div>;
  if (!bank) return <div style={s.page}><div style={s.center}>{tr('common.loading')}</div></div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.avatar}>★</div>
        <div><h1 style={s.h1}>{tr('place.title')}</h1><p style={s.sub}>{tr('place.subtitle')}</p></div>
      </div>
      <div style={s.body}>
        {phase === 'intro' && (
          <div style={s.card}>
            <p style={s.lead}>{tr('place.intro')}</p>
            <button onClick={() => setPhase('a')} style={s.primary}>{tr('place.begin')}</button>
          </div>
        )}

        {phase === 'a' && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>{tr('place.stageA')}</h2>
            {bank.stage_a_mcq.map((q, i) => (
              <div key={q.id} style={s.qBlock}>
                <div style={s.qText}>{i + 1}. {q.q}</div>
                <div style={s.opts}>
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setMcq(m => ({ ...m, [q.id]: oi }))}
                      style={{ ...s.opt, ...(mcq[q.id] === oi ? s.optOn : {}) }}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => setPhase('b')} style={s.primary}>{tr('place.next')} →</button>
          </div>
        )}

        {phase === 'b' && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>{tr('place.stageB')}</h2>
            <p style={s.hint}>{tr('place.oralHint')}</p>
            {bank.stage_b_oral.map((q) => (
              <div key={q.id} style={s.qBlock}>
                <div style={s.qText}>{q.es}</div>
                <div style={s.qGloss}>{q[lang] || ''}</div>
                <OralInput value={oral[q.id] || ''} onChange={(v) => setOral(o => ({ ...o, [q.id]: v }))} />
              </div>
            ))}
            <button onClick={submit} disabled={busy} style={{ ...s.primary, opacity: busy ? 0.6 : 1 }}>{busy ? tr('place.scoring') : tr('place.submit')}</button>
          </div>
        )}

        {phase === 'done' && result && (
          <div style={s.card}>
            <div style={{ textAlign: 'center' }}>
              <div style={s.levelLabel}>{tr('place.yourLevel')}</div>
              <div style={s.levelBig}>{result.cefr_level}</div>
            </div>
            {result[`summary_${lang}`] && <p style={s.summary}>{result[`summary_${lang}`]}</p>}
            <div style={s.recBox}>
              <div style={s.recLabel}>{tr('place.recommended')}</div>
              <div style={s.recUnit}>{(result.recommended_lesson || '').replace(/^a1-/, '').replace(/-/g, ' ')}</div>
            </div>
            <button onClick={() => nav(`${BASE}/speak`)} style={s.primary}>{tr('place.startLesson')} →</button>
            <button onClick={() => { setResult(null); setMcq({}); setOral({}); setPhase('intro'); }} style={s.ghost}>{tr('place.retake')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: CREAM, minHeight: '100vh' },
  center: { padding: 48, textAlign: 'center', color: '#6B6B6B' },
  header: { background: `linear-gradient(135deg, ${NAVY_D}, ${NAVY}, #2A3F6A)`, padding: '20px 24px', borderBottom: `3px solid ${GOLD}`, display: 'flex', gap: 14, alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: '50%', border: `2px solid ${GOLD}`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
  h1: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: '#fff' },
  sub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic' },
  body: { maxWidth: 680, margin: '0 auto', padding: '24px 16px 60px' },
  card: { background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, borderTop: `4px solid ${GOLD}`, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
  lead: { fontSize: 16, color: '#2C2C2C', lineHeight: 1.6, marginBottom: 18 },
  cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 20, color: NAVY, marginBottom: 16 },
  hint: { fontSize: 14, color: '#6B6B6B', marginBottom: 16 },
  qBlock: { marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` },
  qText: { fontSize: 16, color: NAVY, fontWeight: 600, marginBottom: 10 },
  qGloss: { fontSize: 13, color: '#6B6B6B', fontStyle: 'italic', marginBottom: 10, marginTop: -6 },
  opts: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  opt: { padding: '10px 16px', background: CREAM_L, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 15, cursor: 'pointer', color: NAVY },
  optOn: { background: NAVY, color: '#fff', borderColor: NAVY },
  oralRow: { display: 'flex', gap: 8 },
  mic: { minWidth: 46, padding: '0 14px', background: '#fff', border: `1px solid ${GOLD}`, borderRadius: 8, fontSize: 18, cursor: 'pointer', color: GOLD_D },
  micOn: { background: RED, borderColor: RED, color: '#fff' },
  oralInput: { flex: 1, padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, outline: 'none', minWidth: 0 },
  primary: { width: '100%', padding: '14px 0', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_D})`, color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, fontFamily: "'Playfair Display',serif", letterSpacing: 1, cursor: 'pointer', marginTop: 8 },
  ghost: { width: '100%', padding: '10px 0', background: 'none', border: `1px solid ${GOLD}`, color: GOLD_D, borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 10 },
  levelLabel: { fontSize: 12, fontWeight: 700, letterSpacing: 2, color: GOLD_D, textTransform: 'uppercase' },
  levelBig: { fontFamily: "'Playfair Display',serif", fontSize: 64, fontWeight: 800, color: NAVY, lineHeight: 1, margin: '6px 0 12px' },
  summary: { fontSize: 15, color: '#2C2C2C', lineHeight: 1.6, background: CREAM_L, padding: 14, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 16 },
  recBox: { background: CREAM_L, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14, marginBottom: 8, textAlign: 'center' },
  recLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: GOLD_D, textTransform: 'uppercase' },
  recUnit: { fontFamily: "'Playfair Display',serif", fontSize: 20, color: NAVY, textTransform: 'capitalize', marginTop: 4 },
};

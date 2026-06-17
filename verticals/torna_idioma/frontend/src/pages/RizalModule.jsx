import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { tr, uiLang } from '../i18n';

// Voice markers ⟦es⟧ flag spans for TTS pronunciation; they must never be shown.
const stripEs = s => String(s || '').replace(/⟦es⟧/g, '');

// Map a progress status string to the right interface label.
function statusLabel(status) {
  if (status === 'completed' || status === 'passed') return tr('rizal.completed');
  if (status === 'in_progress') return tr('rizal.inProgress');
  return tr('rizal.notStarted');
}

// Map overall completion-record status to its display label.
function recordStatusLabel(status) {
  if (status === 'passed') return tr('rizal.passed');
  if (status === 'completed_below_threshold') return tr('rizal.belowThreshold');
  return tr('rizal.inProgress');
}

export default function RizalModule() {
  const lang = uiLang();
  const [config, setConfig] = useState(null);
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // section key currently completing
  const [record, setRecord] = useState(null);
  const [showRecord, setShowRecord] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [cfgRes, secRes, progRes] = await Promise.all([
          api.get('/rizal/config'),
          api.get('/rizal/sections'),
          api.get('/rizal/progress'),
        ]);
        if (!alive) return;
        setConfig(cfgRes.data || {});
        setSections((secRes.data && secRes.data.sections) || []);
        setProgress((progRes.data && progRes.data.progress) || []);
      } catch (e) {
        if (alive) setError(tr('common.error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      try { audioRef.current?.pause(); } catch (e) { /* noop */ }
    };
  }, []);

  const refetchProgress = async () => {
    try {
      const r = await api.get('/rizal/progress');
      setProgress((r.data && r.data.progress) || []);
    } catch (e) { /* keep prior progress on failure */ }
  };

  const progressFor = (key) => {
    return (progress || []).find(p => p && p.section === key) || null;
  };

  const markComplete = async (key) => {
    if (busy) return;
    setBusy(key);
    try {
      await api.post(`/rizal/section/${encodeURIComponent(key)}/complete`, { score: 100 });
      await refetchProgress();
    } catch (e) {
      setError(tr('common.error'));
    } finally {
      setBusy(null);
    }
  };

  // Optional nicety: speak the Spanish reading (with voice markers) via the
  // tutor TTS endpoint. Silently skip on any failure.
  const listen = async (markedText) => {
    if (!markedText) return;
    try { audioRef.current?.pause(); } catch (e) { /* noop */ }
    try {
      const r = await api.post('/tutor/tts', { text: markedText }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } };
      await audio.play();
    } catch (e) { /* silent */ }
  };

  const openRecord = async () => {
    setShowRecord(true);
    setRecordLoading(true);
    try {
      const r = await api.get('/rizal/completion-record');
      setRecord(r.data || null);
    } catch (e) {
      setRecord(null);
      setError(tr('common.error'));
    } finally {
      setRecordLoading(false);
    }
  };

  const closeRecord = () => setShowRecord(false);

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.centerMsg}>{tr('common.loading')}</div>
      </div>
    );
  }

  if (error && !sections.length) {
    return (
      <div style={s.page}>
        <div style={s.centerMsg}>{error}</div>
      </div>
    );
  }

  const passThreshold = config && config.pass_threshold != null ? config.pass_threshold : null;

  return (
    <div style={s.page}>
      <style>{PRINT_CSS}</style>

      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.avatar}>R</div>
          <div>
            <h1 style={s.headerTitle}>{tr('rizal.title')}</h1>
            <p style={s.headerSub}>{tr('rizal.subtitle')}</p>
          </div>
        </div>
        <button onClick={openRecord} style={s.recordBtn}>{tr('rizal.viewRecord')}</button>
      </div>

      <div style={s.body}>
        <div style={s.sectionLabel}>{tr('rizal.sections')}</div>

        {sections.map((sec, i) => {
          if (!sec) return null;
          const reading = sec.reading || {};
          const prov = reading.provenance;
          const isOriginal = prov === 'public_domain_original';
          const title = lang === 'fil' ? (sec.title_fil || sec.title_en) : (sec.title_en || sec.title_fil);
          const intro = lang === 'fil' ? (sec.intro_fil || sec.intro_en) : (sec.intro_en || sec.intro_fil);
          const note = lang === 'fil' ? (reading.note_fil || reading.note_en) : (reading.note_en || reading.note_fil);
          const pr = progressFor(sec.key);
          const status = pr ? pr.status : null;
          const score = pr && pr.score != null ? pr.score : null;
          const done = status === 'completed' || status === 'passed';
          const mainText = stripEs(reading.text_es);
          const adaptText = stripEs(reading.adaptation_es);

          return (
            <div key={sec.key || i} style={s.card}>
              <div style={s.cardHead}>
                <div style={s.cardHeadLeft}>
                  <h2 style={s.cardTitle}>{title}</h2>
                  {sec.cefr && <span style={s.cefrPill}>{sec.cefr}</span>}
                </div>
                <span style={{ ...s.statusBadge, ...(done ? s.statusDone : status === 'in_progress' ? s.statusProgress : s.statusNone) }}>
                  {statusLabel(status)}{score != null ? ` · ${score}` : ''}
                </span>
              </div>

              {intro && <p style={s.intro}>{intro}</p>}

              <div style={s.readingPanel}>
                <div style={s.readingLabelRow}>
                  <span style={s.readingLabel}>
                    {isOriginal ? tr('rizal.original') : tr('rizal.adaptation')}
                  </span>
                  {mainText && (
                    <button onClick={() => listen(reading.text_es)} style={s.listenBtn} title={tr('rizal.read')}>
                      {tr('rizal.read')}
                    </button>
                  )}
                </div>
                {isOriginal && reading.source && (
                  <div style={s.source}>{reading.source}</div>
                )}
                {mainText && <p style={s.readingText}>{mainText}</p>}

                {isOriginal && adaptText && (
                  <div style={s.adaptationBlock}>
                    <span style={s.readingLabel}>{tr('rizal.adaptation')}</span>
                    <p style={s.readingText}>{adaptText}</p>
                  </div>
                )}
              </div>

              {note && <p style={s.note}>{note}</p>}

              <div style={s.cardActions}>
                <button
                  onClick={() => markComplete(sec.key)}
                  disabled={busy === sec.key || done}
                  style={{ ...s.markBtn, opacity: (busy === sec.key || done) ? 0.55 : 1, cursor: done ? 'default' : 'pointer' }}
                >
                  {done ? tr('rizal.completed') : tr('rizal.markComplete')}
                </button>
              </div>
            </div>
          );
        })}

        {error && sections.length > 0 && <div style={s.inlineError}>{error}</div>}
      </div>

      {showRecord && (
        <div style={s.modalOverlay} onClick={closeRecord}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            {recordLoading && <div style={s.centerMsg}>{tr('common.loading')}</div>}

            {!recordLoading && !record && <div style={s.centerMsg}>{tr('common.error')}</div>}

            {!recordLoading && record && (
              <div className="rizal-record" style={s.recordSheet}>
                <h2 style={s.recordHeading}>
                  {record.artifact_label || config?.artifact_label || tr('rizal.completionRecord')}
                </h2>

                <div style={s.recordMetaGrid}>
                  <div style={s.recordMetaItem}>
                    <span style={s.recordMetaLabel}>{tr('rizal.learner')}</span>
                    <span style={s.recordMetaValue}>{record.learner?.name || '—'}</span>
                  </div>
                  <div style={s.recordMetaItem}>
                    <span style={s.recordMetaLabel}>{tr('rizal.status')}</span>
                    <span style={s.recordMetaValue}>{recordStatusLabel(record.status)}</span>
                  </div>
                  <div style={s.recordMetaItem}>
                    <span style={s.recordMetaLabel}>{tr('rizal.overall')}</span>
                    <span style={s.recordMetaValue}>{record.overall_score != null ? record.overall_score : '—'}</span>
                  </div>
                  <div style={s.recordMetaItem}>
                    <span style={s.recordMetaLabel}>{tr('rizal.threshold')}</span>
                    <span style={s.recordMetaValue}>{record.pass_threshold != null ? record.pass_threshold : (passThreshold != null ? passThreshold : '—')}</span>
                  </div>
                  {record.issued_at && (
                    <div style={s.recordMetaItem}>
                      <span style={s.recordMetaLabel}>{tr('rizal.issued')}</span>
                      <span style={s.recordMetaValue}>{record.issued_at}</span>
                    </div>
                  )}
                </div>

                <table style={s.recordTable}>
                  <thead>
                    <tr>
                      <th style={s.th}>{tr('rizal.sections')}</th>
                      <th style={s.th}>{tr('rizal.status')}</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>{tr('rizal.score')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(record.sections || []).map((rs, i) => {
                      if (!rs) return null;
                      const rtitle = lang === 'fil' ? (rs.title_fil || rs.title_en) : (rs.title_en || rs.title_fil);
                      return (
                        <tr key={rs.key || i}>
                          <td style={s.td}>{rtitle || rs.key}</td>
                          <td style={s.td}>{statusLabel(rs.status)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{rs.score != null ? rs.score : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {(record.disclaimer || config?.disclaimer) && (
                  <div style={s.disclaimer}>{record.disclaimer || config?.disclaimer}</div>
                )}

                <div style={s.recordActions}>
                  <button onClick={() => window.print()} style={s.printBtn}>{tr('rizal.print')}</button>
                  <button onClick={closeRecord} style={s.closeBtn}>{tr('common.close')}</button>
                </div>
              </div>
            )}

            {!recordLoading && !record && (
              <div style={s.recordActions}>
                <button onClick={closeRecord} style={s.closeBtn}>{tr('common.close')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Print stylesheet: hide all chrome so only the completion record prints.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .rizal-record, .rizal-record * { visibility: visible; }
  .rizal-record { position: absolute; left: 0; top: 0; width: 100%; }
  .rizal-record button { display: none; }
}
`;

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  centerMsg: { padding: '60px 32px', textAlign: 'center', fontSize: 15, color: '#8B6914' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '24px 32px', borderBottom: '3px solid #C9A84C', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  avatar: { width: 52, height: 52, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '2px solid #C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display',serif" },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic', maxWidth: 560 },
  recordBtn: { padding: '12px 22px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1, whiteSpace: 'nowrap' },

  body: { flex: 1, padding: '28px 32px', maxWidth: 920, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },

  card: { background: '#FFFDF5', border: '1px solid #F5E6C8', borderRadius: 12, padding: 22, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  cardHeadLeft: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700, color: '#1B2A4A' },
  cefrPill: { fontSize: 11, fontWeight: 700, color: '#8B6914', background: 'rgba(201,168,76,0.18)', border: '1px solid #C9A84C', borderRadius: 999, padding: '2px 10px', letterSpacing: 1 },
  statusBadge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 12px', letterSpacing: 0.5, whiteSpace: 'nowrap' },
  statusDone: { background: 'rgba(34,120,60,0.12)', color: '#22783C', border: '1px solid #22783C' },
  statusProgress: { background: 'rgba(201,168,76,0.18)', color: '#8B6914', border: '1px solid #C9A84C' },
  statusNone: { background: '#fff', color: '#6B6B6B', border: '1px solid #ddd' },

  intro: { fontSize: 14, color: '#4A4A4A', lineHeight: 1.6, margin: '8px 0 14px' },

  readingPanel: { background: '#0F1A2E', borderRadius: 10, padding: '18px 20px', borderLeft: '4px solid #C9A84C' },
  readingLabelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  readingLabel: { fontSize: 10, fontWeight: 700, color: '#E8D48B', letterSpacing: 2, textTransform: 'uppercase' },
  listenBtn: { padding: '4px 14px', background: 'rgba(201,168,76,0.15)', border: '1px solid #C9A84C', color: '#E8D48B', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 },
  source: { fontSize: 12, color: '#9FB0CC', fontStyle: 'italic', marginBottom: 8 },
  readingText: { fontSize: 15.5, color: '#FFF8E7', lineHeight: 1.85, fontFamily: "'Playfair Display',serif", whiteSpace: 'pre-wrap' },
  adaptationBlock: { marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(201,168,76,0.3)' },

  note: { fontSize: 13, color: '#8B6914', lineHeight: 1.6, margin: '14px 0 0', fontStyle: 'italic' },

  cardActions: { marginTop: 18, display: 'flex', justifyContent: 'flex-end' },
  markBtn: { padding: '10px 22px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "'Playfair Display',serif", letterSpacing: 1 },

  inlineError: { fontSize: 13, color: '#C41E3A', textAlign: 'center', padding: '8px 0' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(15,26,46,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto', zIndex: 1000 },
  modalCard: { background: '#FFFDF5', borderRadius: 14, maxWidth: 720, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.35)', border: '1px solid #C9A84C' },
  recordSheet: { padding: '32px 36px' },
  recordHeading: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#1B2A4A', textAlign: 'center', borderBottom: '3px solid #C9A84C', paddingBottom: 16, marginBottom: 24 },
  recordMetaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 },
  recordMetaItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  recordMetaLabel: { fontSize: 10, fontWeight: 700, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase' },
  recordMetaValue: { fontSize: 15, fontWeight: 600, color: '#1B2A4A' },
  recordTable: { width: '100%', borderCollapse: 'collapse', marginBottom: 24 },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '2px solid #C9A84C' },
  td: { fontSize: 14, color: '#2C2C2C', padding: '10px', borderBottom: '1px solid #F5E6C8' },
  disclaimer: { background: '#F5E6C8', border: '1px solid #C9A84C', borderRadius: 8, padding: '14px 16px', fontSize: 12.5, color: '#6B6B6B', lineHeight: 1.6, marginBottom: 22 },
  recordActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 0 0 0' },
  printBtn: { padding: '10px 22px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
  closeBtn: { padding: '10px 22px', background: '#fff', color: '#1B2A4A', border: '1px solid #C9A84C', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};

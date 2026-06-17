import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { tr, uiLang } from '../i18n';

// Cinco Raíces — five Spanish roots a night (José Rizal's spaced-repetition method).
// Interface chrome is en|fil via tr(); the ONLY Spanish on screen is taught root data
// (root_lemma, example_es). Glosses/examples display in the interface language.

// Grade buttons map to SRS quality scores.
const GRADES = [
  { key: 'cinco.again', quality: 1, bg: '#C41E3A' },
  { key: 'cinco.hard',  quality: 3, bg: '#8B6914' },
  { key: 'cinco.good',  quality: 4, bg: '#1B2A4A' },
  { key: 'cinco.easy',  quality: 5, bg: '#2A6B3F' },
];

// Safe helpers — tolerate missing fields from the API.
function gloss(root) {
  if (!root) return '';
  return (uiLang() === 'fil' ? root.gloss_fil : root.gloss_en) || root.gloss_en || root.gloss_fil || '';
}
function exampleTrans(root) {
  if (!root) return '';
  return (uiLang() === 'fil' ? root.example_fil : root.example_en) || root.example_en || root.example_fil || '';
}
function family(root) {
  const forms = Array.isArray(root?.derived_forms) ? root.derived_forms.filter(Boolean) : [];
  return forms.join(' · ');
}

export default function CincoRaices() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [session, setSession] = useState(null);   // daily-session payload
  const [progress, setProgress] = useState(null);  // progress payload

  // Study queue: array of { root, type: 'new' | 'review' }
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [studiedNewIds, setStudiedNewIds] = useState([]);
  const [reviewsDone, setReviewsDone] = useState(0);
  const [done, setDone] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [sRes, pRes] = await Promise.all([
        api.get('/vocab/daily-session'),
        api.get('/vocab/progress').catch(() => ({ data: null })),
      ]);
      const s = sRes.data || {};
      setSession(s);
      setProgress(pRes.data || null);

      const newRoots = Array.isArray(s.new_roots) ? s.new_roots : [];
      const dueReviews = Array.isArray(s.due_reviews) ? s.due_reviews : [];
      const q = [
        ...newRoots.map(r => ({ root: r, type: 'new' })),
        ...dueReviews.map(r => ({ root: r, type: 'review' })),
      ];
      setQueue(q);
      setIdx(0);
      setRevealed(false);
      setStudiedNewIds([]);
      setReviewsDone(0);
      setDone(q.length === 0);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshProgress = useCallback(async () => {
    try {
      const r = await api.get('/vocab/progress');
      setProgress(r.data || null);
    } catch (e) { /* keep stale progress */ }
  }, []);

  const finishSession = useCallback(async (newIds, revCount) => {
    setDone(true);
    try {
      const r = await api.post('/vocab/session/complete', {
        new_root_ids: newIds,
        reviews_done: revCount,
      });
      if (r.data?.streak) {
        setProgress(p => (p ? { ...p, streak: r.data.streak } : p));
      }
    } catch (e) { /* still show completion UI */ }
    refreshProgress();
  }, [refreshProgress]);

  const grade = useCallback(async (quality) => {
    if (grading) return;
    const card = queue[idx];
    if (!card) return;
    setGrading(true);
    const nextNewIds = card.type === 'new' && card.root?.id != null
      ? [...studiedNewIds, card.root.id]
      : studiedNewIds;
    const nextRevCount = card.type === 'review' ? reviewsDone + 1 : reviewsDone;
    try {
      if (card.root?.id != null) {
        await api.post('/vocab/review', { root_id: card.root.id, quality });
      }
    } catch (e) { /* advance regardless so the learner is never stuck */ }
    finally {
      setStudiedNewIds(nextNewIds);
      setReviewsDone(nextRevCount);
      const nextIdx = idx + 1;
      if (nextIdx >= queue.length) {
        setGrading(false);
        finishSession(nextNewIds, nextRevCount);
      } else {
        setIdx(nextIdx);
        setRevealed(false);
        setGrading(false);
      }
    }
  }, [grading, queue, idx, studiedNewIds, reviewsDone, finishSession]);

  // ---- Render: loading / error ----
  if (loading) {
    return (
      <div style={s.page}>
        <Header />
        <div style={s.centerNote}>{tr('common.loading')}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={s.page}>
        <Header />
        <div style={{ ...s.centerNote, color: '#C41E3A' }}>{tr('common.error')}</div>
      </div>
    );
  }

  const streak = progress?.streak || session?.streak || { current: 0, longest: 0 };
  const mastered = progress?.mastered_total;
  const projection = progress?.projection_per_year;

  const card = queue[idx];
  const total = queue.length;
  const newCount = Array.isArray(session?.new_roots) ? session.new_roots.length : 0;
  const dueCount = Array.isArray(session?.due_reviews) ? session.due_reviews.length : 0;

  return (
    <div style={s.page}>
      <Header />

      <div style={s.body}>
        {/* Progress meter */}
        <div style={s.meterRow}>
          <Stat
            label={tr('cinco.mastered')}
            value={mastered != null ? String(mastered) : '—'}
          />
          <Stat
            label={tr('cinco.projection')}
            value={projection != null ? `${projection} ${tr('cinco.perYear')}` : '—'}
            sub={tr('cinco.target')}
          />
          <Stat
            label={tr('cinco.streak')}
            value={`${streak.current ?? 0} ${tr('cinco.days')}`}
            sub={`${tr('cinco.longest')}: ${streak.longest ?? 0} ${tr('cinco.days')}`}
          />
        </div>

        {/* Section counters */}
        <div style={s.counterRow}>
          <span style={s.counterChip}>
            <span style={s.counterLabel}>{tr('cinco.todayRoots')}</span>
            <span style={s.counterNum}>{newCount}</span>
          </span>
          <span style={s.counterChip}>
            <span style={s.counterLabel}>{tr('cinco.dueReviews')}</span>
            <span style={s.counterNum}>{dueCount}</span>
          </span>
        </div>

        {/* Study card / completion / empty states */}
        {done ? (
          <CompletionCard
            session={session}
            newCount={studiedNewIds.length}
            revCount={reviewsDone}
            streak={streak}
            onAgain={loadAll}
          />
        ) : card ? (
          <StudyCard
            card={card}
            index={idx}
            total={total}
            revealed={revealed}
            grading={grading}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
          />
        ) : (
          <div style={s.studyCard}>
            <p style={s.emptyMsg}>{newCount === 0 ? tr('cinco.noNew') : tr('cinco.allCaughtUp')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Header() {
  return (
    <div style={s.header}>
      <div>
        <h1 style={s.headerTitle}>{tr('cinco.title')}</h1>
        <p style={s.headerSub}>{tr('cinco.subtitle')}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={s.statCard}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      {sub ? <div style={s.statSub}>{sub}</div> : null}
    </div>
  );
}

function StudyCard({ card, index, total, revealed, grading, onReveal, onGrade }) {
  const root = card.root || {};
  const isReview = card.type === 'review';
  const fam = family(root);
  const g = gloss(root);
  const exTrans = exampleTrans(root);

  return (
    <div style={s.studyCard}>
      <div style={s.cardTop}>
        <span style={{ ...s.typeBadge, background: isReview ? '#1B2A4A' : '#8B6914' }}>
          {isReview ? tr('cinco.dueReviews') : tr('cinco.todayRoots')}
        </span>
        <span style={s.progressCount}>{index + 1} / {total}</span>
      </div>

      {/* Spanish lemma (taught data) */}
      <div style={s.lemma}>{root.root_lemma || '—'}</div>
      {root.pos ? <div style={s.pos}>{root.pos}</div> : null}

      {/* Answer area */}
      {revealed ? (
        <div style={s.answerArea}>
          {fam ? (
            <div style={s.answerBlock}>
              <div style={s.answerLabel}>{tr('cinco.family')}</div>
              <div style={s.familyText}>{fam}</div>
            </div>
          ) : null}
          {g ? (
            <div style={s.answerBlock}>
              <div style={s.glossText}>{g}</div>
            </div>
          ) : null}
          {(root.example_es || exTrans) ? (
            <div style={s.answerBlock}>
              <div style={s.answerLabel}>{tr('cinco.example')}</div>
              {root.example_es ? <div style={s.exampleEs}>{root.example_es}</div> : null}
              {exTrans ? <div style={s.exampleTrans}>{exTrans}</div> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={s.hiddenArea}>
          <p style={s.reviewPrompt}>{tr('cinco.reviewPrompt')}</p>
        </div>
      )}

      {/* Controls */}
      {!revealed ? (
        <button style={s.revealBtn} onClick={onReveal}>{tr('cinco.showAnswer')}</button>
      ) : (
        <div style={s.gradeRow}>
          {GRADES.map(gr => (
            <button
              key={gr.key}
              style={{ ...s.gradeBtn, background: gr.bg, opacity: grading ? 0.6 : 1 }}
              disabled={grading}
              onClick={() => onGrade(gr.quality)}
            >
              {tr(gr.key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletionCard({ session, newCount, revCount, streak, onAgain }) {
  const nothingToDo =
    (!Array.isArray(session?.new_roots) || session.new_roots.length === 0) &&
    (!Array.isArray(session?.due_reviews) || session.due_reviews.length === 0);

  return (
    <div style={s.studyCard}>
      {nothingToDo ? (
        <>
          <p style={s.emptyMsg}>
            {(!session?.new_roots || session.new_roots.length === 0)
              ? tr('cinco.noNew')
              : tr('cinco.allCaughtUp')}
          </p>
          {(!session?.due_reviews || session.due_reviews.length === 0) ? null : (
            <p style={s.emptyMsg}>{tr('cinco.allCaughtUp')}</p>
          )}
        </>
      ) : (
        <>
          <div style={s.doneTitle}>{tr('cinco.sessionDone')}</div>
          <div style={s.doneStats}>
            <div style={s.doneStat}>
              <div style={s.doneStatNum}>{newCount}</div>
              <div style={s.doneStatLabel}>{tr('cinco.newToday')}</div>
            </div>
            <div style={s.doneStat}>
              <div style={s.doneStatNum}>{revCount}</div>
              <div style={s.doneStatLabel}>{tr('cinco.reviewsDone')}</div>
            </div>
            <div style={s.doneStat}>
              <div style={s.doneStatNum}>{streak.current ?? 0}</div>
              <div style={s.doneStatLabel}>{tr('cinco.streak')}</div>
            </div>
          </div>
          <div style={s.methodNote}>{tr('cinco.method')}</div>
        </>
      )}
      <button style={s.revealBtn} onClick={onAgain}>{tr('common.back')}</button>
    </div>
  );
}

// ---------- Styles (Heritage theme — matches AITutor.jsx) ----------
const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '24px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 6 },
  headerSub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic', maxWidth: 620, lineHeight: 1.5 },

  body: { flex: 1, padding: '28px 32px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  centerNote: { padding: '60px 32px', textAlign: 'center', fontSize: 15, color: '#8B6914', fontStyle: 'italic' },

  meterRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 },
  statCard: { background: '#FFFDF5', border: '1px solid #F5E6C8', borderRadius: 10, padding: '16px 18px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  statValue: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#1B2A4A', lineHeight: 1.2 },
  statLabel: { fontSize: 11, fontWeight: 700, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },
  statSub: { fontSize: 11, color: '#6B6B6B', marginTop: 4, fontStyle: 'italic' },

  counterRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  counterChip: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #F5E6C8', borderRadius: 999, padding: '6px 14px' },
  counterLabel: { fontSize: 12, fontWeight: 600, color: '#1B2A4A' },
  counterNum: { fontSize: 13, fontWeight: 800, color: '#C9A84C', background: '#0F1A2E', borderRadius: 999, minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' },

  studyCard: { background: '#fff', border: '1px solid #F5E6C8', borderTop: '4px solid #C9A84C', borderRadius: 12, padding: '28px 28px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', textAlign: 'center' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  typeBadge: { fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 1, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999 },
  progressCount: { fontSize: 12, fontWeight: 700, color: '#8B6914' },

  lemma: { fontFamily: "'Playfair Display',serif", fontSize: 42, fontWeight: 800, color: '#1B2A4A', lineHeight: 1.1 },
  pos: { fontSize: 13, color: '#8B6914', fontStyle: 'italic', marginTop: 6 },

  hiddenArea: { minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '22px 0' },
  reviewPrompt: { fontSize: 14, color: '#6B6B6B', fontStyle: 'italic', margin: 0 },

  answerArea: { margin: '22px 0', textAlign: 'left' },
  answerBlock: { padding: '12px 0', borderTop: '1px solid #F5E6C8' },
  answerLabel: { fontSize: 10, fontWeight: 700, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  familyText: { fontSize: 15, color: '#1B2A4A', fontWeight: 600 },
  glossText: { fontSize: 18, color: '#2C2C2C', fontWeight: 600, lineHeight: 1.5 },
  exampleEs: { fontFamily: "'Playfair Display',serif", fontSize: 17, color: '#1B2A4A', fontStyle: 'italic', lineHeight: 1.5 },
  exampleTrans: { fontSize: 14, color: '#6B6B6B', marginTop: 6, lineHeight: 1.5 },

  revealBtn: { marginTop: 8, padding: '12px 28px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },

  gradeRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 },
  gradeBtn: { padding: '12px 6px', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter',sans-serif", letterSpacing: 0.5 },

  emptyMsg: { fontSize: 15, color: '#6B6B6B', lineHeight: 1.6, margin: '8px 0 20px' },

  doneTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: '#1B2A4A', marginBottom: 20 },
  doneStats: { display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 20, flexWrap: 'wrap' },
  doneStat: { textAlign: 'center' },
  doneStatNum: { fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 800, color: '#C9A84C' },
  doneStatLabel: { fontSize: 11, fontWeight: 700, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  methodNote: { fontSize: 13, color: '#6B6B6B', fontStyle: 'italic', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 22px' },
};

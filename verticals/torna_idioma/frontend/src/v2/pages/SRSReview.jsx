import React, { useEffect, useState, useCallback } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

/**
 * SRSReview — flashcard review session
 *
 * Route: /Torna_Idioma/learn/review
 * Flow:
 *   1. Fetch due queue on mount
 *   2. Show current card (Spanish front)
 *   3. Learner taps "Show answer" -> reveal Tagalog cognate + translation
 *   4. Learner grades: Again (0), Hard (3), Good (4), Easy (5)
 *   5. POST /srs/review, advance to next card
 *   6. When queue empty -> celebration screen
 */
export default function SRSReview() {
  const authed = isAuthenticated();
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [sessionStats, setSessionStats] = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0 });

  const current = queue[index];

  const loadQueue = useCallback(() => {
    setLoading(true);
    Promise.all([
      v2Api.get('/srs/queue?limit=30'),
      v2Api.get('/srs/stats')
    ])
      .then(([q, s]) => {
        setQueue(q.cards || []);
        setStats(s.stats);
        setIndex(0);
        setRevealed(false);
        setStartTime(Date.now());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authed) loadQueue();
    else setLoading(false);
  }, [authed, loadQueue]);

  const handleReveal = () => {
    setRevealed(true);
  };

  const handleGrade = async (quality) => {
    if (!current) return;
    const elapsed = Date.now() - startTime;
    try {
      await v2Api.post('/srs/review', {
        card_id: current.id,
        quality,
        time_taken_ms: elapsed
      });

      // Update session stats
      const bucket = quality === 0 ? 'again' : quality === 3 ? 'hard' : quality === 4 ? 'good' : 'easy';
      setSessionStats((s) => ({ ...s, total: s.total + 1, [bucket]: s[bucket] + 1 }));

      // Advance
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        setRevealed(false);
        setStartTime(Date.now());
      } else {
        // Session complete — refresh stats
        v2Api.get('/srs/stats').then((s) => setStats(s.stats));
        setIndex(queue.length); // past end → triggers completion UI
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Keyboard shortcuts: Space = reveal, 1/2/3/4 = grade
  useEffect(() => {
    const handler = (e) => {
      if (!current) return;
      if (e.key === ' ' && !revealed) {
        e.preventDefault();
        handleReveal();
      } else if (revealed) {
        if (e.key === '1') handleGrade(0);
        else if (e.key === '2') handleGrade(3);
        else if (e.key === '3') handleGrade(4);
        else if (e.key === '4') handleGrade(5);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [revealed, current, index]);

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>SRS Review</h1>
          <p style={styles.subtitle}>Please log in to access your flashcard deck.</p>
          <a href="/Torna_Idioma/login" style={styles.btnPrimary}>Login</a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Loading your review queue...</div>
        </div>
      </div>
    );
  }

  // Empty deck — suggest adding cards
  if (queue.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.crest}>
            <div style={styles.crestText}>TORNA IDIOMA</div>
            <div style={styles.crestMotto}>Spaced Repetition</div>
          </div>
          <h1 style={styles.title}>No cards due right now</h1>
          <p style={styles.subtitle}>
            {stats && stats.total > 0
              ? `You have ${stats.total} cards in your deck, but none are due. Come back later!`
              : 'Your deck is empty. Browse the cognate database to add your first cards.'}
          </p>
          {stats && (
            <div style={styles.statsGrid}>
              <StatCard value={stats.total} label="Total Cards" />
              <StatCard value={stats.due} label="Due Now" />
              <StatCard value={stats.new_cards} label="New" />
              <StatCard value={stats.mastered} label="Mastered" />
            </div>
          )}
          <div style={styles.btnRow}>
            <a href="/Torna_Idioma/learn/cognates" style={styles.btnPrimary}>Browse Cognates</a>
            <a href="/Torna_Idioma/learn" style={styles.btnSecondary}>← Learner Home</a>
          </div>
        </div>
      </div>
    );
  }

  // Session complete
  if (index >= queue.length) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.crest}>
            <div style={styles.crestText}>¡EXCELENTE!</div>
            <div style={styles.crestMotto}>Session complete</div>
          </div>
          <h1 style={styles.title}>You reviewed {sessionStats.total} cards</h1>
          <div style={styles.sessionBreakdown}>
            <div style={styles.sessionBar}>
              <span style={{ ...styles.sessionPill, background: 'rgba(196,30,58,.15)', color: '#fca5a5' }}>
                Again: {sessionStats.again}
              </span>
              <span style={{ ...styles.sessionPill, background: 'rgba(245,158,11,.15)', color: '#fcd34d' }}>
                Hard: {sessionStats.hard}
              </span>
              <span style={{ ...styles.sessionPill, background: 'rgba(16,185,129,.15)', color: '#6ee7b7' }}>
                Good: {sessionStats.good}
              </span>
              <span style={{ ...styles.sessionPill, background: 'rgba(14,165,233,.15)', color: '#7dd3fc' }}>
                Easy: {sessionStats.easy}
              </span>
            </div>
          </div>
          {stats && (
            <div style={styles.statsGrid}>
              <StatCard value={stats.total} label="Total Cards" />
              <StatCard value={stats.due} label="Still Due" />
              <StatCard value={stats.mastered} label="Mastered" />
              <StatCard value={stats.total_reviews} label="Lifetime Reviews" />
            </div>
          )}
          <div style={styles.btnRow}>
            <button onClick={loadQueue} style={styles.btnPrimary}>Review More</button>
            <a href="/Torna_Idioma/learn" style={styles.btnSecondary}>← Learner Home</a>
          </div>
        </div>
      </div>
    );
  }

  // Active review
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${((index + (revealed ? 0.5 : 0)) / queue.length) * 100}%`
            }}
          />
        </div>
        <div style={styles.progressText}>
          Card {index + 1} of {queue.length} · Interval: {current.interval_days}d · Reviews: {current.total_reviews}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.wordFront}>{current.word_es}</div>

        {revealed ? (
          <>
            <div style={styles.divider} />
            {current.word_tl_cognate && (
              <div style={styles.wordTagalog}>
                <span style={styles.wordLabel}>Tagalog cognate</span>
                {current.word_tl_cognate}
              </div>
            )}
            {current.translation_en && (
              <div style={styles.translation}>
                <span style={styles.wordLabel}>English</span>
                {current.translation_en}
              </div>
            )}
            {current.example_sentence && (
              <div style={styles.example}>
                <span style={styles.wordLabel}>Note</span>
                {current.example_sentence}
              </div>
            )}

            <div style={styles.gradeRow}>
              <button onClick={() => handleGrade(0)} style={{ ...styles.gradeBtn, ...styles.gradeAgain }}>
                <span style={styles.gradeKey}>1</span>
                Again
              </button>
              <button onClick={() => handleGrade(3)} style={{ ...styles.gradeBtn, ...styles.gradeHard }}>
                <span style={styles.gradeKey}>2</span>
                Hard
              </button>
              <button onClick={() => handleGrade(4)} style={{ ...styles.gradeBtn, ...styles.gradeGood }}>
                <span style={styles.gradeKey}>3</span>
                Good
              </button>
              <button onClick={() => handleGrade(5)} style={{ ...styles.gradeBtn, ...styles.gradeEasy }}>
                <span style={styles.gradeKey}>4</span>
                Easy
              </button>
            </div>
          </>
        ) : (
          <button onClick={handleReveal} style={styles.btnPrimary}>
            Show Answer (Space)
          </button>
        )}

        <div style={styles.footer}>
          Step 4 of 12 · SRS · <a href="/Torna_Idioma/learn" style={styles.link}>← Learner Home</a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value ?? 0}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '60px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  card: {
    maxWidth: 640,
    width: '100%',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    backdropFilter: 'blur(12px)'
  },
  crest: { textAlign: 'center', marginBottom: 20 },
  crestText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 3
  },
  crestMotto: {
    fontSize: 10,
    color: '#E8D48B',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
    fontStyle: 'italic'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
    fontWeight: 900,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 1.15
  },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 24, lineHeight: 1.7 },
  loading: { color: '#94a3b8', textAlign: 'center', padding: 32 },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 20
  },
  progressBar: {
    height: 4,
    background: 'rgba(201, 168, 76, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #C9A84C, #E8D48B)',
    transition: 'width 0.3s ease'
  },
  progressText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: 0.5
  },
  wordFront: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(2.4rem, 6vw, 3.6rem)',
    fontWeight: 800,
    color: '#C9A84C',
    textAlign: 'center',
    padding: '40px 20px',
    lineHeight: 1.15
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.4), transparent)',
    margin: '0 -20px 24px'
  },
  wordTagalog: {
    textAlign: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 32,
    fontWeight: 700,
    color: '#10b981',
    marginBottom: 20
  },
  translation: {
    textAlign: 'center',
    fontSize: 18,
    color: '#e2e8f0',
    marginBottom: 20
  },
  example: {
    textAlign: 'center',
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginBottom: 28,
    lineHeight: 1.7
  },
  wordLabel: {
    display: 'block',
    fontSize: 9,
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4
  },
  gradeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    marginTop: 8
  },
  gradeBtn: {
    padding: '16px 8px',
    border: 'none',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'transform 0.15s'
  },
  gradeKey: {
    fontSize: 9,
    opacity: 0.6,
    letterSpacing: 1,
    fontWeight: 600
  },
  gradeAgain: { background: 'rgba(196, 30, 58, 0.25)', color: '#fca5a5' },
  gradeHard: { background: 'rgba(245, 158, 11, 0.25)', color: '#fcd34d' },
  gradeGood: { background: 'rgba(16, 185, 129, 0.25)', color: '#6ee7b7' },
  gradeEasy: { background: 'rgba(14, 165, 233, 0.25)', color: '#7dd3fc' },
  btnPrimary: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '14px 32px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    display: 'block',
    margin: '0 auto',
    textDecoration: 'none',
    textAlign: 'center'
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '12px 24px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block'
  },
  btnRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 24
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginTop: 24,
    marginBottom: 8
  },
  statCard: {
    background: 'rgba(15, 26, 46, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.15)',
    borderRadius: 10,
    padding: 14,
    textAlign: 'center'
  },
  statValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 22,
    fontWeight: 900,
    color: '#C9A84C',
    lineHeight: 1
  },
  statLabel: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 600 },
  sessionBreakdown: { marginTop: 12, marginBottom: 16 },
  sessionBar: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  sessionPill: {
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5
  },
  footer: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};

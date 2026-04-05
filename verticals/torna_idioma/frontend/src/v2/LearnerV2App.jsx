import React, { useState, useEffect } from 'react';

/**
 * Torna Idioma — Learner Platform v2
 *
 * Step 1: Skeleton placeholder. Mounted at /Torna_Idioma/learn/*
 *
 * In subsequent steps this component will become a nested Router with:
 *   /learn              — LearnerHome
 *   /learn/lesson/:id   — LessonPlayer
 *   /learn/review       — SRSReview
 *   /learn/isabel       — IsabelChat
 *   /learn/voice        — ConversationRoom
 *   /learn/progress     — Progress
 *   /learn/leaderboard  — Leaderboard
 *   /learn/tutors       — TutorMarketplace
 *
 * For now, it displays a placeholder + live health check against the v2 API
 * to confirm end-to-end wiring works on deploy.
 */
export default function LearnerV2App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/Torna_Idioma/api/v2/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(e => setError(e.message));
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.crest}>
          <div style={styles.crestText}>TORNA<br />IDIOMA</div>
          <div style={styles.crestMotto}>Learner Platform v2</div>
        </div>

        <h1 style={styles.title}>Profesora Isabel is Coming</h1>
        <p style={styles.subtitle}>
          AI-powered Spanish language learning for Filipino learners.<br />
          Built on UVEG's CEFR-aligned curriculum. 80% AI instruction, 20% human teachers.
        </p>

        <div style={styles.statusBox}>
          <div style={styles.statusLabel}>v2 API HEALTH</div>
          {health && (
            <div style={styles.statusOk}>
              <strong>{health.status.toUpperCase()}</strong> — {health.service}
              <div style={styles.statusMeta}>
                {health.version} · {health.phase} · {new Date(health.timestamp).toLocaleString()}
              </div>
            </div>
          )}
          {error && <div style={styles.statusError}>ERROR: {error}</div>}
          {!health && !error && <div style={styles.statusPending}>Checking...</div>}
        </div>

        <div style={styles.phaseGrid}>
          <div style={{ ...styles.phaseItem, ...styles.phaseActive }}>
            <div style={styles.phaseNum}>01</div>
            <div style={styles.phaseLabel}>Skeleton</div>
            <div style={styles.phaseStatus}>DEPLOYED</div>
          </div>
          <div style={styles.phaseItem}>
            <div style={styles.phaseNum}>02</div>
            <div style={styles.phaseLabel}>Learner Profile</div>
            <div style={styles.phaseStatus}>Pending</div>
          </div>
          <div style={styles.phaseItem}>
            <div style={styles.phaseNum}>03</div>
            <div style={styles.phaseLabel}>Cognate Engine</div>
            <div style={styles.phaseStatus}>Pending</div>
          </div>
          <div style={styles.phaseItem}>
            <div style={styles.phaseNum}>04</div>
            <div style={styles.phaseLabel}>SRS Engine</div>
            <div style={styles.phaseStatus}>Pending</div>
          </div>
          <div style={styles.phaseItem}>
            <div style={styles.phaseNum}>05</div>
            <div style={styles.phaseLabel}>Gamification</div>
            <div style={styles.phaseStatus}>Pending</div>
          </div>
          <div style={styles.phaseItem}>
            <div style={styles.phaseNum}>06</div>
            <div style={styles.phaseLabel}>Profesora Isabel</div>
            <div style={styles.phaseStatus}>Pending</div>
          </div>
        </div>

        <div style={styles.links}>
          <a href="/Torna_Idioma/" style={styles.link}>&larr; Torna Idioma Main Site</a>
          <a href="/Torna_Idioma/dashboard" style={styles.link}>Admin Dashboard</a>
        </div>
      </div>
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
    maxWidth: 720,
    width: '100%',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center',
    backdropFilter: 'blur(12px)'
  },
  crest: { marginBottom: 32 },
  crestText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 4,
    lineHeight: 1.1
  },
  crestMotto: {
    fontSize: 11,
    color: '#E8D48B',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 6,
    fontStyle: 'italic'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
    fontWeight: 900,
    color: '#fff',
    marginBottom: 12,
    lineHeight: 1.15
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    lineHeight: 1.7,
    maxWidth: 520,
    margin: '0 auto 32px'
  },
  statusBox: {
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 2,
    marginBottom: 10
  },
  statusOk: { color: '#10b981', fontSize: 14 },
  statusError: { color: '#ef4444', fontSize: 14 },
  statusPending: { color: '#f59e0b', fontSize: 14 },
  statusMeta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  phaseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 32
  },
  phaseItem: {
    background: 'rgba(15, 26, 46, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.12)',
    borderRadius: 10,
    padding: '16px 12px',
    textAlign: 'center'
  },
  phaseActive: {
    background: 'rgba(201, 168, 76, 0.1)',
    border: '1px solid rgba(201, 168, 76, 0.4)'
  },
  phaseNum: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 800,
    color: '#C9A84C',
    lineHeight: 1
  },
  phaseLabel: { fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 },
  phaseStatus: { fontSize: 9, color: '#64748b', marginTop: 4, letterSpacing: 1 },
  links: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 16
  },
  link: {
    color: '#C9A84C',
    fontSize: 13,
    textDecoration: 'none',
    padding: '8px 16px',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 6
  }
};

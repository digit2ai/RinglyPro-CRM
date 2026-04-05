import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';
import EngagementMeter from '../components/EngagementMeter';
import useEmotionDetect from '../hooks/useEmotionDetect';

/**
 * Insights — learner-facing engagement, fatigue, and opt-in emotion dashboard.
 * Route: /Torna_Idioma/learn/insights
 */
export default function Insights() {
  const authed = isAuthenticated();
  const [fatigue, setFatigue] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const emotion = useEmotionDetect();

  const load = () => {
    Promise.all([
      v2Api.get('/behavior/fatigue-signals'),
      v2Api.get('/behavior/recent?limit=20')
    ])
      .then(([f, r]) => {
        setFatigue(f);
        setRecent(r.events || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // When emotion detection samples a new engagement value, POST it as an event
  useEffect(() => {
    if (!emotion.active || emotion.engagement == null) return;
    v2Api.post('/behavior/event', {
      event_type: 'emotion_sample',
      engagement_score: emotion.engagement,
      payload: { source: 'client_motion_proxy' }
    }).catch(() => {});
  }, [emotion.engagement, emotion.active]);

  const handleOptIn = async () => {
    if (!privacyAccepted) {
      alert('Please read and accept the privacy notice first.');
      return;
    }
    await emotion.optIn();
    if (!emotion.error) {
      v2Api.post('/behavior/event', {
        event_type: 'focus_regained',
        payload: { opt_in_emotion: true }
      }).catch(() => {});
    }
  };

  const handleOptOut = () => {
    emotion.optOut();
    v2Api.post('/behavior/event', {
      event_type: 'focus_lost',
      payload: { opt_out_emotion: true }
    }).catch(() => {});
  };

  const handleRest = async (accepted) => {
    await v2Api.post('/behavior/event', {
      event_type: accepted ? 'rest_accepted' : 'rest_dismissed',
      payload: {}
    }).catch(() => {});
    if (accepted) load();
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Insights</h1>
          <p style={styles.subtitle}>Login to view your learning analytics.</p>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <div style={styles.crestText}>TORNA IDIOMA</div>
          <div style={styles.crestMotto}>Learning Insights</div>
          <h1 style={styles.title}>Your Engagement</h1>
          <p style={styles.subtitle}>
            Real-time signals from your study sessions. All computed server-side from aggregate data.
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Live engagement */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>LIVE ENGAGEMENT</div>
          <EngagementMeter pollIntervalMs={15000} />
        </div>

        {/* Fatigue panel */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>FATIGUE DETECTION</div>
          {loading && <div style={styles.loading}>Loading...</div>}
          {fatigue && (
            <>
              <div
                style={{
                  ...styles.fatigueBanner,
                  background: fatigue.fatigued
                    ? 'rgba(196, 30, 58, 0.08)'
                    : 'rgba(16, 185, 129, 0.06)',
                  borderColor: fatigue.fatigued
                    ? 'rgba(196, 30, 58, 0.3)'
                    : 'rgba(16, 185, 129, 0.3)'
                }}
              >
                <div style={styles.fatigueTitle}>
                  {fatigue.fatigued ? 'Time for a break' : 'All systems green'}
                </div>
                <div style={styles.fatigueDesc}>
                  {fatigue.fatigued
                    ? fatigue.rest_suggestion ||
                      'We detected multiple fatigue signals. Consider taking 5 minutes to rest.'
                    : 'No fatigue signals detected. Keep going!'}
                </div>
              </div>

              {fatigue.fatigued && (
                <div style={styles.restBtns}>
                  <button onClick={() => handleRest(true)} style={styles.btnPrimary}>
                    Take a Break
                  </button>
                  <button onClick={() => handleRest(false)} style={styles.btnSecondary}>
                    Keep Studying
                  </button>
                </div>
              )}

              {fatigue.signals && fatigue.signals.length > 0 && (
                <div style={styles.signalList}>
                  {fatigue.signals.map((s, i) => (
                    <div key={i} style={styles.signal}>
                      <span
                        style={{
                          ...styles.severityPill,
                          background:
                            s.severity === 'high'
                              ? 'rgba(196, 30, 58, 0.15)'
                              : s.severity === 'medium'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(100, 116, 139, 0.15)',
                          color:
                            s.severity === 'high'
                              ? '#fca5a5'
                              : s.severity === 'medium'
                              ? '#fcd34d'
                              : '#94a3b8'
                        }}
                      >
                        {s.severity}
                      </span>
                      <span style={styles.signalMsg}>{s.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Emotion detection opt-in */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>OPT-IN: CAMERA-BASED ENGAGEMENT</div>
          {!emotion.supported ? (
            <div style={styles.loading}>Your browser does not support camera access.</div>
          ) : emotion.active ? (
            <>
              <div style={styles.activeBanner}>
                <strong style={{ color: '#10b981' }}>ACTIVE</strong>
                <span style={{ marginLeft: 10 }}>
                  Current engagement proxy: <strong>{emotion.engagement ?? '—'}</strong>/100
                </span>
              </div>
              <p style={styles.privacyNote}>
                Your camera is on. Frames are processed in-browser only — no face data leaves your device.
                Only the scalar engagement score is recorded.
              </p>
              <button onClick={handleOptOut} style={styles.btnDanger}>
                Stop & Disable Camera
              </button>
            </>
          ) : (
            <>
              <div style={styles.privacyBox}>
                <h4 style={styles.privacyTitle}>Privacy Notice</h4>
                <ul style={styles.privacyList}>
                  <li>Your camera activates <strong>only</strong> after you click opt-in below.</li>
                  <li>Video frames are processed <strong>entirely in your browser</strong>.</li>
                  <li>No image data, face landmarks, or video stream is ever sent to our servers.</li>
                  <li>Only an aggregate 0-100 engagement score is computed and stored.</li>
                  <li>You can opt out at any time — the camera stops instantly.</li>
                </ul>
                <label style={styles.consent}>
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  />
                  I understand and consent to camera-based engagement analysis.
                </label>
              </div>
              {emotion.error && <div style={styles.errorBox}>{emotion.error}</div>}
              <button
                onClick={handleOptIn}
                disabled={!privacyAccepted}
                style={{ ...styles.btnPrimary, opacity: privacyAccepted ? 1 : 0.5 }}
              >
                Enable Camera Engagement
              </button>
            </>
          )}
        </div>

        {/* Recent events */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>RECENT ACTIVITY</div>
          {recent.length === 0 ? (
            <div style={styles.loading}>No behavior events logged yet.</div>
          ) : (
            <div style={styles.eventList}>
              {recent.slice(0, 15).map((e) => (
                <div key={e.id} style={styles.eventRow}>
                  <span style={styles.eventType}>{e.event_type}</span>
                  <span style={styles.eventTime}>{new Date(e.created_at).toLocaleTimeString()}</span>
                  {e.engagement_score != null && (
                    <span style={styles.eventScore}>{e.engagement_score}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          Step 8 of 12 · Behavior Analytics · <a href="/Torna_Idioma/learn" style={styles.link}>← Home</a>
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
    padding: '40px 24px 80px'
  },
  inner: { maxWidth: 760, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 32 },
  crestText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 16,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 4
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
    fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
    fontWeight: 900,
    color: '#fff',
    marginTop: 16,
    marginBottom: 8
  },
  subtitle: { fontSize: 14, color: '#94a3b8', maxWidth: 540, margin: '0 auto' },
  card: {
    background: 'rgba(27, 42, 74, 0.55)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 14,
    padding: 22,
    marginBottom: 18,
    backdropFilter: 'blur(8px)'
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 2,
    marginBottom: 12
  },
  loading: { color: '#94a3b8', fontSize: 13, padding: 12 },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 16
  },

  fatigueBanner: {
    border: '1px solid',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12
  },
  fatigueTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 6
  },
  fatigueDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.6 },
  restBtns: { display: 'flex', gap: 10, marginBottom: 14 },
  signalList: { display: 'flex', flexDirection: 'column', gap: 8 },
  signal: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 8
  },
  severityPill: {
    fontSize: 9,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 10,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  signalMsg: { fontSize: 12, color: '#e2e8f0', flex: 1 },

  activeBanner: {
    padding: 14,
    background: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 13
  },
  privacyNote: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 },
  privacyBox: {
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10
  },
  privacyList: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.8,
    paddingLeft: 18,
    marginBottom: 16
  },
  consent: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#e2e8f0',
    cursor: 'pointer'
  },

  eventList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' },
  eventRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    background: 'rgba(15, 26, 46, 0.4)',
    borderRadius: 6,
    fontSize: 11
  },
  eventType: {
    fontWeight: 700,
    color: '#C9A84C',
    flex: 1,
    fontFamily: 'ui-monospace, monospace'
  },
  eventTime: { color: '#64748b' },
  eventScore: {
    fontWeight: 700,
    color: '#10b981',
    minWidth: 24,
    textAlign: 'right'
  },

  btnPrimary: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '12px 24px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit'
  },
  btnDanger: {
    background: 'rgba(196, 30, 58, 0.15)',
    color: '#fca5a5',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit'
  },

  gate: {
    maxWidth: 480,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  btn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block'
  },
  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 24 },
  link: { color: '#C9A84C', textDecoration: 'none' }
};

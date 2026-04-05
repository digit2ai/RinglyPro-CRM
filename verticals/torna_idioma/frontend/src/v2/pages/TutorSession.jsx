import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

/**
 * TutorSession — live video session room with Jitsi Meet + AI co-pilot panel
 * Route: /Torna_Idioma/learn/session/:bookingId
 *
 * Architecture: embeds a Jitsi Meet room via iframe using the unique room_id
 * assigned at booking time. No signaling server needed — Jitsi's public
 * infrastructure handles all WebRTC negotiation. Works on desktop + mobile
 * browsers with mic/camera permissions.
 */
export default function TutorSession() {
  const { id } = useParams();
  const authed = isAuthenticated();
  const [booking, setBooking] = useState(null);
  const [roomUrl, setRoomUrl] = useState(null);
  const [copilot, setCopilot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionState, setSessionState] = useState('ready'); // ready | live | ended
  const [reviewMode, setReviewMode] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    Promise.all([
      v2Api.get(`/tutor-market/bookings/${id}`),
      v2Api.get(`/tutor-market/bookings/${id}/copilot`)
    ])
      .then(([b, cp]) => {
        setBooking(b.booking);
        setRoomUrl(b.room_url);
        setCopilot(cp);
        if (b.booking.status === 'in_progress') setSessionState('live');
        if (b.booking.status === 'completed') setSessionState('ended');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, authed]);

  const handleStart = async () => {
    try {
      await v2Api.post(`/tutor-market/bookings/${id}/start`, {});
      setSessionState('live');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEnd = async () => {
    try {
      await v2Api.post(`/tutor-market/bookings/${id}/end`, {});
      setSessionState('ended');
      setReviewMode(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleReview = async () => {
    try {
      await v2Api.post(`/tutor-market/bookings/${id}/review`, {
        rating,
        review_text: reviewText
      });
      alert('Thank you for your review!');
      window.location.href = '/Torna_Idioma/learn/bookings';
    } catch (e) {
      setError(e.message);
    }
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Session Room</h1>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  if (loading) return <div style={styles.container}><div style={styles.loading}>Loading session...</div></div>;
  if (!booking) return <div style={styles.container}><div style={styles.errorBox}>Booking not found</div></div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.breadcrumb}>
            <a href="/Torna_Idioma/learn/bookings" style={styles.link}>
              ← Bookings
            </a>
          </div>
          <h1 style={styles.title}>Session with {booking.tutor_name}</h1>
          <div style={styles.meta}>
            {new Date(booking.scheduled_at).toLocaleString()} · {booking.duration_minutes} min ·{' '}
            <span
              style={{
                color:
                  sessionState === 'live'
                    ? '#10b981'
                    : sessionState === 'ended'
                    ? '#94a3b8'
                    : '#C9A84C'
              }}
            >
              {sessionState === 'live' ? 'LIVE NOW' : booking.status.toUpperCase()}
            </span>
          </div>
        </div>
        <div style={styles.headerActions}>
          {sessionState === 'ready' && (
            <button onClick={handleStart} style={styles.btnPrimary}>
              Start Session
            </button>
          )}
          {sessionState === 'live' && (
            <button onClick={handleEnd} style={styles.btnDanger}>
              End Session
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.twoCol}>
        {/* Left: Video room (Jitsi) */}
        <div style={styles.videoPanel}>
          {sessionState === 'ready' && (
            <div style={styles.readyScreen}>
              <div style={styles.readyIcon}>▶</div>
              <h2 style={styles.readyTitle}>Ready to begin</h2>
              <p style={styles.readySub}>
                Click <strong>Start Session</strong> above to enter the video room.
                Your tutor will join the same room. Grant camera and mic permissions
                when prompted.
              </p>
              <div style={styles.roomInfo}>
                <span style={styles.roomLabel}>Room ID:</span>
                <code style={styles.roomCode}>{booking.room_id}</code>
              </div>
            </div>
          )}

          {sessionState === 'live' && roomUrl && (
            <>
              <iframe
                src={`${roomUrl}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false`}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                style={styles.iframe}
                title={`Session with ${booking.tutor_name}`}
              />
              <div style={styles.iframeFooter}>
                Powered by Jitsi Meet · Session recorded to transcript only
              </div>
            </>
          )}

          {sessionState === 'ended' && !reviewMode && (
            <div style={styles.endedScreen}>
              <div style={styles.endedIcon}>✓</div>
              <h2 style={styles.endedTitle}>Session complete</h2>
              <p style={styles.readySub}>Thank you for learning with {booking.tutor_name}.</p>
              <button onClick={() => setReviewMode(true)} style={styles.btnPrimary}>
                Leave a Review
              </button>
            </div>
          )}

          {reviewMode && (
            <div style={styles.reviewForm}>
              <h2 style={styles.reviewTitle}>Rate your session</h2>
              <div style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    style={{ ...styles.star, color: n <= rating ? '#fcd34d' : '#334155' }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="How was the session? Any feedback for the tutor?"
                style={styles.reviewTextarea}
              />
              <button onClick={handleReview} style={styles.btnPrimary}>
                Submit Review
              </button>
            </div>
          )}
        </div>

        {/* Right: AI Co-pilot panel */}
        <div style={styles.copilotPanel}>
          <div style={styles.copilotHeader}>
            <div style={styles.copilotLabel}>AI CO-PILOT</div>
            <div style={styles.copilotSub}>Learner context for the tutor</div>
          </div>

          {copilot && (
            <>
              {copilot.learner && (
                <div style={styles.copilotSection}>
                  <div style={styles.sectionLabel}>LEARNER</div>
                  <div style={styles.learnerName}>{copilot.learner.full_name}</div>
                  <div style={styles.learnerMeta}>
                    CEFR <strong style={{ color: '#C9A84C' }}>{copilot.learner.cefr_level}</strong>
                    {' · '}
                    {copilot.learner.total_xp} XP
                    {' · '}
                    Native: {copilot.learner.native_language}
                  </div>
                </div>
              )}

              {copilot.copilot_notes && copilot.copilot_notes.length > 0 && (
                <div style={styles.copilotSection}>
                  <div style={styles.sectionLabel}>KEY NOTES</div>
                  <ul style={styles.notesList}>
                    {copilot.copilot_notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {copilot.suggested_focus && copilot.suggested_focus.length > 0 && (
                <div style={styles.copilotSection}>
                  <div style={styles.sectionLabel}>SUGGESTED FOCUS</div>
                  {copilot.suggested_focus.map((s, i) => (
                    <div key={i} style={styles.focusItem}>
                      <div style={styles.focusWords}>
                        <strong style={{ color: '#C9A84C' }}>{s.word_es}</strong>
                        {' ↔ '}
                        <span style={{ color: '#10b981' }}>{s.word_tl}</span>
                      </div>
                      <div style={styles.focusReason}>{s.reason}</div>
                    </div>
                  ))}
                </div>
              )}

              {copilot.recent_lessons && copilot.recent_lessons.length > 0 && (
                <div style={styles.copilotSection}>
                  <div style={styles.sectionLabel}>RECENT LESSONS</div>
                  {copilot.recent_lessons.slice(0, 3).map((l, i) => (
                    <div key={i} style={styles.lessonItem}>
                      <div style={styles.lessonTitle}>{l.title_en}</div>
                      <div style={styles.lessonMeta}>
                        {l.course_title} · {Math.round(l.score)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {copilot.engagement && (
                <div style={styles.copilotSection}>
                  <div style={styles.sectionLabel}>ENGAGEMENT (60 MIN)</div>
                  <div style={styles.engagementBar}>
                    <div
                      style={{
                        ...styles.engagementFill,
                        width: `${copilot.engagement.score}%`,
                        background:
                          copilot.engagement.score >= 70
                            ? '#10b981'
                            : copilot.engagement.score >= 40
                            ? '#f59e0b'
                            : '#ef4444'
                      }}
                    />
                  </div>
                  <div style={styles.engagementValue}>{copilot.engagement.score}/100</div>
                </div>
              )}
            </>
          )}
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
    padding: '24px 24px 48px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 16
  },
  breadcrumb: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  link: { color: '#C9A84C', textDecoration: 'none' },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.4rem, 3vw, 1.9rem)',
    fontWeight: 900,
    color: '#fff',
    marginBottom: 4
  },
  meta: { fontSize: 12, color: '#94a3b8', fontWeight: 600 },
  headerActions: { display: 'flex', gap: 10 },

  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16
  },

  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
    gap: 18
  },

  videoPanel: {
    background: 'rgba(15, 26, 46, 0.8)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 14,
    minHeight: 520,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },

  readyScreen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    textAlign: 'center'
  },
  readyIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    fontSize: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingLeft: 6
  },
  readyTitle: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 10 },
  readySub: { fontSize: 13, color: '#94a3b8', maxWidth: 420, lineHeight: 1.7 },
  roomInfo: { marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 },
  roomLabel: { fontSize: 11, color: '#64748b', letterSpacing: 1 },
  roomCode: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    color: '#C9A84C',
    background: 'rgba(201, 168, 76, 0.1)',
    padding: '4px 10px',
    borderRadius: 4
  },

  iframe: {
    flex: 1,
    width: '100%',
    border: 'none',
    minHeight: 520,
    background: '#000'
  },
  iframeFooter: {
    padding: '10px 16px',
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    borderTop: '1px solid rgba(201, 168, 76, 0.1)'
  },

  endedScreen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    textAlign: 'center'
  },
  endedIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    fontSize: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    border: '2px solid rgba(16, 185, 129, 0.5)'
  },
  endedTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 10
  },

  reviewForm: { padding: 48, textAlign: 'center' },
  reviewTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 24
  },
  starRow: { display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 },
  star: {
    background: 'none',
    border: 'none',
    fontSize: 40,
    cursor: 'pointer',
    padding: 4
  },
  reviewTextarea: {
    width: '100%',
    maxWidth: 480,
    minHeight: 100,
    padding: 14,
    background: 'rgba(15, 26, 46, 0.7)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit',
    marginBottom: 20,
    resize: 'vertical'
  },

  copilotPanel: {
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 14,
    padding: 20,
    height: 'fit-content',
    position: 'sticky',
    top: 20,
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto'
  },
  copilotHeader: {
    borderBottom: '1px solid rgba(201, 168, 76, 0.15)',
    paddingBottom: 12,
    marginBottom: 16
  },
  copilotLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 2
  },
  copilotSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  copilotSection: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#64748b',
    letterSpacing: 1.5,
    marginBottom: 8
  },
  learnerName: { fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 },
  learnerMeta: { fontSize: 11, color: '#94a3b8' },
  notesList: { fontSize: 11, color: '#e2e8f0', lineHeight: 1.8, paddingLeft: 14 },
  focusItem: {
    padding: '8px 10px',
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 8,
    marginBottom: 6
  },
  focusWords: { fontSize: 12, marginBottom: 2 },
  focusReason: { fontSize: 10, color: '#94a3b8' },
  lessonItem: {
    padding: '6px 10px',
    background: 'rgba(15, 26, 46, 0.4)',
    borderRadius: 6,
    marginBottom: 5
  },
  lessonTitle: { fontSize: 12, color: '#e2e8f0' },
  lessonMeta: { fontSize: 10, color: '#64748b', marginTop: 2 },
  engagementBar: {
    height: 8,
    background: 'rgba(15, 26, 46, 0.7)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6
  },
  engagementFill: { height: '100%', transition: 'width 0.6s, background 0.6s' },
  engagementValue: { fontSize: 11, color: '#94a3b8', fontWeight: 600 },

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
    letterSpacing: 0.5,
    textDecoration: 'none',
    display: 'inline-block'
  },
  btnDanger: {
    background: 'rgba(196, 30, 58, 0.2)',
    color: '#fca5a5',
    border: '1px solid rgba(196, 30, 58, 0.4)',
    padding: '12px 24px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5
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
  loading: { textAlign: 'center', color: '#94a3b8', padding: 60 }
};

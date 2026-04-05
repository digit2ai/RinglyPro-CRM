import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';
import XPBar from '../components/XPBar';
import StreakFlame from '../components/StreakFlame';

/**
 * Learner Home — the main v2 landing page for authenticated learners.
 * Fetches /api/v2/learner/me, displays profile, allows editing.
 */
export default function LearnerHome() {
  const [learner, setLearner] = useState(null);
  const [xpData, setXpData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const authed = isAuthenticated();

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    Promise.all([v2Api.learner.me(), v2Api.get('/xp/total').catch(() => null)])
      .then(([profile, xp]) => {
        setLearner(profile.learner);
        setXpData(xp);
        setForm({
          cefr_level: profile.learner.cefr_level,
          daily_goal_minutes: profile.learner.daily_goal_minutes,
          target_dialect: profile.learner.target_dialect,
          native_language: profile.learner.native_language,
          voice_preference: profile.learner.voice_preference,
          cognate_highlighting: profile.learner.cognate_highlighting
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authed]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await v2Api.learner.update(form);
      setLearner(r.learner);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Profesora Isabel Awaits</h1>
          <p style={styles.subtitle}>Please log in to access your learner profile.</p>
          <a href="/Torna_Idioma/login" style={styles.btnPrimary}>Login</a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Loading your profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.crest}>
          <div style={styles.crestText}>TORNA<br />IDIOMA</div>
          <div style={styles.crestMotto}>Learner Platform v2</div>
        </div>

        <h1 style={styles.title}>Welcome, {learner?.full_name?.split(' ')[0] || 'Learner'}</h1>
        <p style={styles.subtitle}>{learner?.email}</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        {!editing ? (
          <>
            {/* XP bar */}
            <div style={styles.xpWrapper}>
              <XPBar totalXp={xpData?.total_xp ?? learner?.total_xp ?? 0} label="Your Progress" />
            </div>

            {/* Streak + top stats */}
            <div style={styles.topRow}>
              <div style={styles.topStatLeft}>
                <StreakFlame
                  current={xpData?.current_streak || 0}
                  longest={xpData?.longest_streak || 0}
                  active={!!xpData?.current_streak}
                />
              </div>
              <div style={styles.topStatRight}>
                <div style={styles.statCard}>
                  <div style={styles.statValue}>{learner?.cefr_level || 'A1'}</div>
                  <div style={styles.statLabel}>CEFR Level</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statValue}>{xpData?.badges_earned ?? 0}</div>
                  <div style={styles.statLabel}>Badges</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statValue}>{learner?.daily_goal_minutes || 10}<span style={styles.statUnit}>min</span></div>
                  <div style={styles.statLabel}>Daily Goal</div>
                </div>
              </div>
            </div>

            {/* Quick nav to v2 features */}
            <div style={styles.quickNav}>
              <a href="/Torna_Idioma/learn/courses" style={styles.navBtnPrimary}>Courses</a>
              <a href="/Torna_Idioma/learn/isabel" style={styles.navBtnPrimary}>Chat with Isabel</a>
              <a href="/Torna_Idioma/learn/voice" style={styles.navBtnPrimary}>Voice Practice</a>
              <a href="/Torna_Idioma/learn/review" style={styles.navBtn}>SRS Review</a>
              <a href="/Torna_Idioma/learn/cognates" style={styles.navBtn}>Cognates</a>
              <a href="/Torna_Idioma/learn/badges" style={styles.navBtn}>Badges</a>
              <a href="/Torna_Idioma/learn/leaderboard" style={styles.navBtn}>Leaderboard</a>
              <a href="/Torna_Idioma/learn/insights" style={styles.navBtn}>Insights</a>
            </div>

            <div style={styles.detailsGrid}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Native language</span>
                <span style={styles.detailValue}>{fmtNative(learner?.native_language)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Target Spanish dialect</span>
                <span style={styles.detailValue}>{fmtDialect(learner?.target_dialect)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Voice preference</span>
                <span style={styles.detailValue}>{fmtVoice(learner?.voice_preference)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Cognate highlighting</span>
                <span style={styles.detailValue}>{learner?.cognate_highlighting ? 'On' : 'Off'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Member since</span>
                <span style={styles.detailValue}>{new Date(learner?.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div style={styles.btnRow}>
              <button onClick={() => setEditing(true)} style={styles.btnPrimary}>Edit Profile</button>
              <a href="/Torna_Idioma/dashboard" style={styles.btnSecondary}>Back to Dashboard</a>
            </div>
          </>
        ) : (
          <div style={styles.form}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>CEFR Level</span>
              <select
                value={form.cefr_level}
                onChange={(e) => setForm({ ...form, cefr_level: e.target.value })}
                style={styles.input}
              >
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Daily Goal (minutes)</span>
              <select
                value={form.daily_goal_minutes}
                onChange={(e) => setForm({ ...form, daily_goal_minutes: parseInt(e.target.value, 10) })}
                style={styles.input}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Target Dialect</span>
              <select
                value={form.target_dialect}
                onChange={(e) => setForm({ ...form, target_dialect: e.target.value })}
                style={styles.input}
              >
                <option value="latin_american_spanish">Latin American Spanish</option>
                <option value="spain_spanish">Spain Spanish (Castellano)</option>
                <option value="mexican_spanish">Mexican Spanish</option>
                <option value="colombian_spanish">Colombian Spanish</option>
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Native Language</span>
              <select
                value={form.native_language}
                onChange={(e) => setForm({ ...form, native_language: e.target.value })}
                style={styles.input}
              >
                <option value="tagalog">Tagalog / Filipino</option>
                <option value="cebuano">Cebuano</option>
                <option value="chabacano">Chabacano</option>
                <option value="english">English</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Voice Preference</span>
              <select
                value={form.voice_preference}
                onChange={(e) => setForm({ ...form, voice_preference: e.target.value })}
                style={styles.input}
              >
                <option value="isabel_default">Profesora Isabel (default)</option>
                <option value="ate_maria">Ate Maria (coming soon)</option>
                <option value="kuya_diego">Kuya Diego (coming soon)</option>
              </select>
            </label>

            <label style={{ ...styles.field, flexDirection: 'row', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!form.cognate_highlighting}
                onChange={(e) => setForm({ ...form, cognate_highlighting: e.target.checked })}
                style={{ marginRight: 10 }}
              />
              <span style={styles.fieldLabel}>Highlight Filipino-Spanish cognates in lessons</span>
            </label>

            <div style={styles.btnRow}>
              <button onClick={handleSave} disabled={saving} style={styles.btnPrimary}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} style={styles.btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={styles.footer}>
          Step 2 of 12 · Learner Profile · <a href="/Torna_Idioma/" style={styles.link}>Main Site</a>
        </div>
      </div>
    </div>
  );
}

function fmtNative(v) {
  const map = { tagalog: 'Tagalog / Filipino', cebuano: 'Cebuano', chabacano: 'Chabacano', english: 'English', other: 'Other' };
  return map[v] || v;
}

function fmtDialect(v) {
  const map = { latin_american_spanish: 'Latin American Spanish', spain_spanish: 'Spain Spanish (Castellano)', mexican_spanish: 'Mexican Spanish', colombian_spanish: 'Colombian Spanish' };
  return map[v] || v;
}

function fmtVoice(v) {
  const map = { isabel_default: 'Profesora Isabel (default)', ate_maria: 'Ate Maria', kuya_diego: 'Kuya Diego' };
  return map[v] || v;
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
    backdropFilter: 'blur(12px)'
  },
  crest: { textAlign: 'center', marginBottom: 24 },
  crestText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 4,
    lineHeight: 1.1
  },
  crestMotto: {
    fontSize: 10,
    color: '#E8D48B',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 6,
    fontStyle: 'italic'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
    fontWeight: 900,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 1.15
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28
  },
  xpWrapper: { marginBottom: 24 },
  topRow: { display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' },
  topStatLeft: { flexShrink: 0 },
  topStatRight: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1, minWidth: 260 },
  quickNav: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 28 },
  navBtn: {
    padding: '14px 16px',
    background: 'rgba(201, 168, 76, 0.08)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 10,
    color: '#C9A84C',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0.5,
    transition: 'all 0.2s'
  },
  navBtnPrimary: {
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    border: '1px solid #C9A84C',
    borderRadius: 10,
    color: '#0F1A2E',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 800,
    textAlign: 'center',
    letterSpacing: 0.5,
    boxShadow: '0 6px 20px rgba(201, 168, 76, 0.2)'
  },
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 28
  },
  statCard: {
    background: 'rgba(15, 26, 46, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 12,
    padding: 20,
    textAlign: 'center'
  },
  statValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 900,
    color: '#C9A84C',
    lineHeight: 1
  },
  statUnit: { fontSize: 14, color: '#94a3b8', marginLeft: 4 },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600, letterSpacing: 0.5 },
  detailsGrid: {
    background: 'rgba(15, 26, 46, 0.4)',
    borderRadius: 12,
    padding: 8,
    marginBottom: 28
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
    fontSize: 13
  },
  detailLabel: { color: '#94a3b8' },
  detailValue: { color: '#e2e8f0', fontWeight: 600 },
  btnRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 8
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block'
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block'
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 },
  input: {
    padding: '10px 12px',
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit'
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

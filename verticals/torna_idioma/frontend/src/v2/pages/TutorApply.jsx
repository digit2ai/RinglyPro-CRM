import React, { useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

const ALL_SPECIALTIES = [
  'heritage', 'beginner', 'intermediate', 'advanced',
  'bpo', 'business', 'conversation', 'cultural',
  'writing', 'diplomacy', 'tourism', 'cognates',
  'customer_service', 'phone_conversation'
];

export default function TutorApply() {
  const authed = isAuthenticated();
  const [form, setForm] = useState({
    display_name: '',
    headline: '',
    bio: '',
    accent: 'latin_american',
    native_language: 'spanish',
    years_experience: 0,
    hourly_rate_usd: 25,
    timezone: 'Asia/Manila',
    languages_spoken: ['Spanish', 'English'],
    specialties: [],
    certifications: []
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const toggleSpecialty = (s) => {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(s)
        ? f.specialties.filter((x) => x !== s)
        : [...f.specialties, s]
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await v2Api.post('/tutor-market/tutors/apply', form);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Become a Tutor</h1>
          <p style={styles.subtitle}>Please log in first.</p>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div style={styles.container}>
        <div style={styles.inner}>
          <div style={styles.successCard}>
            <div style={styles.successLabel}>APPLICATION RECEIVED</div>
            <h1 style={styles.title}>Thank you, {result.tutor.display_name}!</h1>
            <p style={styles.subtitle}>
              {result.message}
            </p>
            <div style={styles.actionRow}>
              <a href="/Torna_Idioma/learn/tutors" style={styles.btnPrimary}>
                Browse Tutors
              </a>
              <a href="/Torna_Idioma/learn" style={styles.btnSecondary}>
                ← Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <div style={styles.crestText}>TORNA IDIOMA</div>
          <h1 style={styles.title}>Become a Tutor</h1>
          <p style={styles.subtitle}>
            Teach Spanish to Filipino learners. 20% human instruction tier — the bridge between
            AI lessons and real conversation.
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={submit} style={styles.card}>
          <Field label="Display Name *">
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              required
              style={styles.input}
              placeholder="Maria Elena Reyes"
            />
          </Field>

          <Field label="Headline">
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              style={styles.input}
              placeholder="Filipino-Spanish heritage teacher from Zamboanga"
            />
          </Field>

          <Field label="Bio *">
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              required
              style={{ ...styles.input, minHeight: 120 }}
              placeholder="Tell learners about your teaching background, approach, and what makes you unique..."
            />
          </Field>

          <div style={styles.grid2}>
            <Field label="Accent / Dialect">
              <select
                value={form.accent}
                onChange={(e) => setForm({ ...form, accent: e.target.value })}
                style={styles.input}
              >
                <option value="latin_american">Latin American</option>
                <option value="filipino_spanish">Filipino-Spanish (Chabacano)</option>
                <option value="spain">Spain (Castellano)</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <Field label="Native Language">
              <select
                value={form.native_language}
                onChange={(e) => setForm({ ...form, native_language: e.target.value })}
                style={styles.input}
              >
                <option value="spanish">Spanish</option>
                <option value="chabacano">Chabacano</option>
                <option value="tagalog">Tagalog</option>
                <option value="english">English</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>

          <div style={styles.grid2}>
            <Field label="Years Experience">
              <input
                type="number"
                value={form.years_experience}
                onChange={(e) => setForm({ ...form, years_experience: parseInt(e.target.value, 10) || 0 })}
                style={styles.input}
                min={0}
                max={50}
              />
            </Field>
            <Field label="Hourly Rate (USD) *">
              <input
                type="number"
                value={form.hourly_rate_usd}
                onChange={(e) => setForm({ ...form, hourly_rate_usd: parseFloat(e.target.value) || 0 })}
                style={styles.input}
                min={10}
                max={200}
                step={0.5}
                required
              />
            </Field>
          </div>

          <Field label="Specialties (select all that apply)">
            <div style={styles.tagSelect}>
              {ALL_SPECIALTIES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSpecialty(s)}
                  style={{
                    ...styles.tagBtn,
                    ...(form.specialties.includes(s) ? styles.tagBtnActive : {})
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              style={styles.input}
            >
              <option value="Asia/Manila">Asia/Manila (PHT)</option>
              <option value="America/Mexico_City">America/Mexico_City (CST)</option>
              <option value="America/Bogota">America/Bogota (COT)</option>
              <option value="America/Lima">America/Lima (PET)</option>
              <option value="America/Buenos_Aires">America/Buenos_Aires (ART)</option>
              <option value="Europe/Madrid">Europe/Madrid (CET)</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
            </select>
          </Field>

          <div style={styles.notice}>
            <strong>Note:</strong> All tutor applications are reviewed by Torna Idioma admin.
            Once approved, you'll appear in the marketplace and can start accepting bookings.
            Stripe Connect onboarding is required before you can receive payouts (80% of each booking).
          </div>

          <button type="submit" disabled={submitting} style={styles.btnPrimary}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
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
  inner: { maxWidth: 720, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 32 },
  crestText: { fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 800, color: '#C9A84C', letterSpacing: 4, marginBottom: 12 },
  title: { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.8rem, 4vw, 2.4rem)', fontWeight: 900, color: '#fff', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#94a3b8', maxWidth: 520, margin: '0 auto' },
  card: {
    background: 'rgba(27, 42, 74, 0.55)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 16,
    padding: 32
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: '#C9A84C', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    padding: '12px 14px',
    background: 'rgba(15, 26, 46, 0.7)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  tagSelect: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tagBtn: {
    background: 'transparent',
    border: '1px solid rgba(201, 168, 76, 0.3)',
    color: '#94a3b8',
    padding: '6px 12px',
    borderRadius: 16,
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tagBtnActive: { background: 'rgba(201, 168, 76, 0.15)', color: '#C9A84C', borderColor: '#C9A84C' },
  notice: {
    fontSize: 12,
    color: '#94a3b8',
    background: 'rgba(245, 158, 11, 0.06)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: 10,
    padding: 14,
    lineHeight: 1.6,
    marginBottom: 20
  },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  btnPrimary: {
    width: '100%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '14px 28px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5,
    textDecoration: 'none',
    display: 'inline-block',
    textAlign: 'center'
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '14px 28px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    display: 'inline-block'
  },
  actionRow: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 },
  successCard: {
    maxWidth: 560,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  successLabel: { fontSize: 11, fontWeight: 800, color: '#10b981', letterSpacing: 2, marginBottom: 10 },
  gate: { maxWidth: 480, margin: '60px auto', background: 'rgba(27, 42, 74, 0.6)', border: '1px solid rgba(201, 168, 76, 0.25)', borderRadius: 20, padding: 48, textAlign: 'center' },
  btn: { background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#0F1A2E', padding: '12px 28px', borderRadius: 8, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }
};

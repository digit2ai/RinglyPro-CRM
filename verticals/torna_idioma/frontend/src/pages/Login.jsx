import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as storeLogin } from '../services/auth';
import api from '../services/api';

const BASE = '/torna-idioma';

export default function Login() {
  const nav = useNavigate();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'student', organization: '', language_pref: 'en' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
      const payload = tab === 'login' ? { email: form.email, password: form.password } : form;
      const { data } = await api.post(endpoint, payload);
      storeLogin(data.token, data.user);
      nav(`${BASE}/dashboard`);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally { setLoading(false); }
  };

  const roles = [
    { value: 'student', label: 'Student / Estudiante' },
    { value: 'bpo_worker', label: 'BPO Professional' },
    { value: 'teacher', label: 'Teacher / Profesor' },
    { value: 'partner', label: 'Partner Institution' },
  ];

  return (
    <div style={s.page}>
      <div style={s.left}>
        <div style={s.leftContent}>
          <div style={s.crest}>
            <div style={s.crestInner}>TORNA<br/>IDIOMA<span style={s.crestSub}>Vida · Cultura · Legado</span></div>
          </div>
          <h1 style={s.leftTitle}>The Return of the<br/><span style={s.accent}>Cultural Language</span></h1>
          <p style={s.leftDesc}>Makati — Asia's First Spanish-Enabled City. A movement of dignity, pride, and economic opportunity.</p>
          <div style={s.pillars}>
            <div style={s.pillar}><div style={s.pillarNum}>I</div><div style={s.pillarLabel}>Dignidad</div></div>
            <div style={s.pillar}><div style={s.pillarNum}>II</div><div style={s.pillarLabel}>Orgullo</div></div>
            <div style={s.pillar}><div style={s.pillarNum}>III</div><div style={s.pillarLabel}>Premio</div></div>
          </div>
        </div>
      </div>
      <div style={s.right}>
        <div style={s.formBox}>
          <div style={s.tabs}>
            <button onClick={() => setTab('login')} style={{ ...s.tab, ...(tab === 'login' ? s.tabActive : {}) }}>Sign In</button>
            <button onClick={() => setTab('register')} style={{ ...s.tab, ...(tab === 'register' ? s.tabActive : {}) }}>Register</button>
          </div>
          <form onSubmit={handleSubmit}>
            {tab === 'register' && (
              <>
                <label style={s.label}>Full Name</label>
                <input style={s.input} type="text" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="Juan dela Cruz" required />
                <label style={s.label}>Role</label>
                <select style={s.input} value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <label style={s.label}>Organization (optional)</label>
                <input style={s.input} type="text" value={form.organization} onChange={e => setForm({...form, organization: e.target.value})} placeholder="School, company, or institution" />
                <label style={s.label}>Language Preference</label>
                <select style={s.input} value={form.language_pref} onChange={e => setForm({...form, language_pref: e.target.value})}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fil">Filipino</option>
                </select>
              </>
            )}
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="you@example.com" required />
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
            {error && <div style={s.error}>{error}</div>}
            <button type="submit" disabled={loading} style={s.submit}>{loading ? 'Loading...' : tab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</button>
          </form>
          <div style={s.demo}>
            <div style={s.demoTitle}>Demo Accounts</div>
            <div style={s.demoItem}><strong>Admin:</strong> admin@tornaidioma.ph / TornaIdioma2026!</div>
            <div style={s.demoItem}><strong>Teacher:</strong> teacher@tornaidioma.ph / TeacherDemo2026!</div>
            <div style={s.demoItem}><strong>Student:</strong> student@tornaidioma.ph / StudentDemo2026!</div>
            <div style={s.demoItem}><strong>Official:</strong> official@makati.gov.ph / MakatiOfficial2026!</div>
          </div>
          <a href={`${BASE}/`} style={s.backLink}>&larr; Back to Landing Page</a>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', minHeight: '100vh', fontFamily: "'Inter',sans-serif" },
  left: { flex: 1, background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 40%, #2A3F6A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative', overflow: 'hidden' },
  leftContent: { position: 'relative', zIndex: 1, maxWidth: 480, textAlign: 'center' },
  crest: { width: 120, height: 120, border: '2px solid #C9A84C', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', background: 'rgba(201,168,76,0.08)' },
  crestInner: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#C9A84C', textAlign: 'center', lineHeight: 1.2, letterSpacing: 2 },
  crestSub: { display: 'block', fontSize: 9, fontStyle: 'italic', fontWeight: 400, color: '#E8D48B', marginTop: 4, letterSpacing: 1 },
  leftTitle: { fontFamily: "'Playfair Display',serif", fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 16 },
  accent: { color: '#C9A84C' },
  leftDesc: { fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 28 },
  pillars: { display: 'flex', justifyContent: 'center', gap: 32 },
  pillar: { textAlign: 'center' },
  pillarNum: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#C9A84C' },
  pillarLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase' },
  right: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: '#FFF8E7' },
  formBox: { width: '100%', maxWidth: 420, background: '#fff', padding: 36, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderTop: '4px solid #C9A84C' },
  tabs: { display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #eee' },
  tab: { flex: 1, padding: '10px 0', background: 'none', border: 'none', fontSize: 14, fontWeight: 600, color: '#6B6B6B', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabActive: { color: '#1B2A4A', borderBottomColor: '#C9A84C' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2A4A', marginBottom: 4, marginTop: 14, letterSpacing: 0.5 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' },
  error: { marginTop: 12, padding: '8px 12px', background: 'rgba(196,30,58,0.08)', border: '1px solid rgba(196,30,58,0.2)', borderRadius: 4, color: '#C41E3A', fontSize: 13 },
  submit: { width: '100%', marginTop: 20, padding: '12px 0', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', fontFamily: "'Playfair Display',serif" },
  demo: { marginTop: 24, padding: '16px', background: '#FFF8E7', borderRadius: 6, border: '1px solid #F5E6C8' },
  demoTitle: { fontSize: 11, fontWeight: 700, color: '#8B6914', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  demoItem: { fontSize: 11, color: '#6B6B6B', marginBottom: 4, wordBreak: 'break-all' },
  backLink: { display: 'block', marginTop: 16, textAlign: 'center', fontSize: 13, color: '#C9A84C', textDecoration: 'none', fontWeight: 500 },
};

// Responsive
const style = document.createElement('style');
style.textContent = `@media(max-width:768px){[style*="minHeight: 100vh"][style*="display: flex"]{flex-direction:column!important;}}`;
if (typeof document !== 'undefined' && !document.getElementById('ti-login-resp')) { style.id = 'ti-login-resp'; document.head.appendChild(style); }

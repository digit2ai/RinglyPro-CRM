import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as storeLogin } from '../services/auth';
import api from '../services/api';

const BASE = '/Torna_Idioma';

// The login screen is the hand-off between the landing page and the app, so it
// reads the same ti_lang the landing page wrote and offers the same two choices.
// Interface language is en|fil only — Spanish is the subject, not a menu language.
const T = {
  en: {
    signIn: 'Sign In', register: 'Register',
    fullName: 'Full Name', role: 'Role', org: 'Organization (optional)',
    langPref: 'Language Preference', email: 'Email', password: 'Password',
    submitLogin: 'Sign In', submitRegister: 'Create Account', loading: 'Loading...',
    demo: 'Demo Accounts', back: 'Back to Landing Page',
    heroA: 'The Return of the', heroB: 'Cultural Language',
    heroDesc: "Makati — Asia's First Spanish-Enabled City. A movement of dignity, pride, and economic opportunity.",
    orientation: 'Student Orientation — How to Use Torna Idioma',
    modules: 'The 12 Modules — Full Curriculum',
    namePh: 'Juan dela Cruz', orgPh: 'School, company, or institution',
    emailPh: 'you@example.com',
  },
  fil: {
    signIn: 'Mag-login', register: 'Magrehistro',
    fullName: 'Buong Pangalan', role: 'Tungkulin', org: 'Organisasyon (opsyonal)',
    langPref: 'Piniling Wika', email: 'Email', password: 'Password',
    submitLogin: 'Mag-login', submitRegister: 'Gumawa ng Account', loading: 'Naglo-load...',
    demo: 'Mga Demo na Account', back: 'Bumalik sa Landing Page',
    heroA: 'Ang Pagbabalik ng', heroB: 'Kultural na Wika',
    heroDesc: 'Makati — Ang Unang Lungsod na May Espanyol sa Asya. Isang kilusan ng dignidad, pagmamalaki, at oportunidad.',
    orientation: 'Oryentasyon ng Mag-aaral — Paano Gamitin ang Torna Idioma',
    modules: 'Ang 12 Module — Buong Kurikulum',
    namePh: 'Juan dela Cruz', orgPh: 'Paaralan, kompanya, o institusyon',
    emailPh: 'ikaw@halimbawa.com',
  },
};



function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

export default function Login() {
  const nav = useNavigate();
  const mob = useIsMobile();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'student', organization: '', language_pref: (localStorage.getItem('ti_lang') === 'fil' ? 'fil' : 'en') });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Seeded from whatever the visitor chose on the landing page; a legacy 'es'
  // coerces to English rather than falling through to the account default.
  const [lang, setLang] = useState(() => (localStorage.getItem('ti_lang') === 'fil' ? 'fil' : 'en'));
  const L = T[lang] || T.en;
  const switchLang = (l) => { const v = l === 'fil' ? 'fil' : 'en'; localStorage.setItem('ti_lang', v); setLang(v); };

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
    <div style={{ ...s.page, ...(mob ? s.pageMob : {}) }}>
      <div style={{ ...s.left, ...(mob ? s.leftMob : {}) }}>
        <div style={s.leftContent}>
          <div style={{ ...s.crest, ...(mob ? s.crestMob : {}) }}>
            <div style={s.crestInner}>TORNA<br/>IDIOMA<span style={s.crestSub}>Vida · Cultura · Legado</span></div>
          </div>
          <h1 style={{ ...s.leftTitle, ...(mob ? s.leftTitleMob : {}) }}>{L.heroA}<br/><span style={s.accent}>{L.heroB}</span></h1>
          {!mob && <p style={s.leftDesc}>{L.heroDesc}</p>}
          <div style={{ ...s.pillars, ...(mob ? s.pillarsMob : {}) }}>
            <div style={s.pillar}><div style={s.pillarNum}>I</div><div style={s.pillarLabel}>Dignidad</div></div>
            <div style={s.pillar}><div style={s.pillarNum}>II</div><div style={s.pillarLabel}>Orgullo</div></div>
            <div style={s.pillar}><div style={s.pillarNum}>III</div><div style={s.pillarLabel}>Premio</div></div>
          </div>
          <a
            href={`${BASE}/orientation`}
            target="_blank"
            rel="noopener"
            onClick={(e) => { e.preventDefault(); window.open(`${BASE}/orientation`, 'tornaOrientation', 'noopener,width=1180,height=1000,scrollbars=yes,resizable=yes'); }}
            style={s.guideBtn}
          >{L.orientation}</a>
          <a
            href={`${BASE}/modules`}
            target="_blank"
            rel="noopener"
            onClick={(e) => { e.preventDefault(); window.open(`${BASE}/modules`, 'tornaModules', 'noopener,width=1180,height=1000,scrollbars=yes,resizable=yes'); }}
            style={s.modulesBtn}
          >{L.modules}</a>
        </div>
      </div>
      <div style={{ ...s.right, ...(mob ? s.rightMob : {}) }}>
        <div style={{ ...s.formBox, ...(mob ? s.formBoxMob : {}) }}>
          <div style={s.langRow}>
            {['en', 'fil'].map((l) => (
              <button key={l} type="button" onClick={() => switchLang(l)}
                style={{ ...s.langBtn, ...(lang === l ? s.langBtnOn : {}) }}>{l === 'fil' ? 'Filipino' : 'English'}</button>
            ))}
          </div>
          <div style={s.tabs}>
            <button onClick={() => setTab('login')} style={{ ...s.tab, ...(tab === 'login' ? s.tabActive : {}) }}>{L.signIn}</button>
            <button onClick={() => setTab('register')} style={{ ...s.tab, ...(tab === 'register' ? s.tabActive : {}) }}>{L.register}</button>
          </div>
          <form onSubmit={handleSubmit}>
            {tab === 'register' && (
              <>
                <label style={s.label}>{L.fullName}</label>
                <input style={s.input} type="text" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder={L.namePh} required />
                <label style={s.label}>{L.role}</label>
                <select style={s.input} value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <label style={s.label}>{L.org}</label>
                <input style={s.input} type="text" value={form.organization} onChange={e => setForm({...form, organization: e.target.value})} placeholder={L.orgPh} />
                <label style={s.label}>{L.langPref}</label>
                <select style={s.input} value={form.language_pref} onChange={e => setForm({...form, language_pref: e.target.value})}>
                  <option value="en">English</option>
                  <option value="fil">Filipino</option>
                </select>
              </>
            )}
            <label style={s.label}>{L.email}</label>
            <input style={s.input} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder={L.emailPh} required />
            <label style={s.label}>{L.password}</label>
            <input style={s.input} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
            {error && <div style={s.error}>{error}</div>}
            <button type="submit" disabled={loading} style={s.submit}>{loading ? L.loading : tab === 'login' ? L.submitLogin : L.submitRegister}</button>
          </form>
          <div style={s.demo}>
            <div style={s.demoTitle}>{L.demo}</div>
            <div style={s.demoItem}><strong>Admin:</strong> admin@tornaidioma.ph / TornaIdioma2026!</div>
            <div style={s.demoItem}><strong>Teacher:</strong> teacher@tornaidioma.ph / TeacherDemo2026!</div>
            <div style={s.demoItem}><strong>Student:</strong> student@tornaidioma.ph / StudentDemo2026!</div>
            <div style={s.demoItem}><strong>Official:</strong> official@makati.gov.ph / MakatiOfficial2026!</div>
            <div style={s.demoItem}><strong>BPO Worker:</strong> bpo@tornaidioma.ph / BPODemo2026!</div>
            <div style={s.demoItem}><strong>Partner:</strong> partner@tornaidioma.ph / PartnerDemo2026!</div>
          </div>
          <a href={`${BASE}/`} style={s.backLink}>&larr; {L.back}</a>
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
  langRow: { display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 14 },
  langBtn: { font: 'inherit', fontSize: 11.5, fontWeight: 600, padding: '6px 13px', borderRadius: 99, border: '1px solid #F5E6C8', background: '#fff', color: '#8B6914', cursor: 'pointer' },
  langBtnOn: { background: 'linear-gradient(135deg, #E8D48B, #C9A84C)', borderColor: 'transparent', color: '#0F1A2E' },
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
  guideBtn: { display: 'inline-block', marginTop: 36, textAlign: 'center', fontSize: 13, color: '#0F1A2E', textDecoration: 'none', fontWeight: 700, padding: '12px 24px', background: 'linear-gradient(135deg, #E8D48B, #C9A84C)', borderRadius: 8, letterSpacing: 0.5, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' },
  modulesBtn: { display: 'inline-block', marginTop: 10, textAlign: 'center', fontSize: 13, color: '#E8D48B', textDecoration: 'none', fontWeight: 600, padding: '11px 22px', background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.45)', borderRadius: 8, letterSpacing: 0.3 },
  backLink: { display: 'block', marginTop: 12, textAlign: 'center', fontSize: 13, color: '#C9A84C', textDecoration: 'none', fontWeight: 500 },

  // --- Mobile / tablet (<=768px): stack the panes, compact the hero ---
  pageMob: { flexDirection: 'column', minHeight: '100vh' },
  leftMob: { flex: 'none', width: '100%', padding: '28px 20px 24px', boxSizing: 'border-box' },
  crestMob: { width: 84, height: 84, margin: '0 auto 16px' },
  leftTitleMob: { fontSize: 26, marginBottom: 12 },
  pillarsMob: { gap: 24 },
  rightMob: { flex: 'none', width: '100%', padding: '20px 16px 40px', boxSizing: 'border-box' },
  formBoxMob: { maxWidth: 480, padding: 22 },
};

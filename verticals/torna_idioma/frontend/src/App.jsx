import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { isAuthenticated, logout, getUser, hasRole, getLang, setLang } from './services/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import CourseCatalog from './pages/CourseCatalog';
import Classroom from './pages/Classroom';
import Progress from './pages/Progress';
import Certifications from './pages/Certifications';
import BPOProgram from './pages/BPOProgram';
import JobBoard from './pages/JobBoard';
import Events from './pages/Events';
import Supporters from './pages/Supporters';
import ProgramMetrics from './pages/ProgramMetrics';
import Schools from './pages/Schools';
import EconomicImpact from './pages/EconomicImpact';
import PartnerNetwork from './pages/PartnerNetwork';
import AITutor from './pages/AITutor';
import InternationalCollaboration from './pages/InternationalCollaboration';

const BASE = '/torna-idioma';

function ProtectedRoute({ children, roles }) {
  if (!isAuthenticated()) return <Navigate to={`${BASE}/login`} replace />;
  if (roles && !hasRole(...roles)) return <Navigate to={`${BASE}/dashboard`} replace />;
  return children;
}

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

function LangSwitcher() {
  const [lang, setL] = useState(getLang());
  const handleLang = (l) => { setLang(l); setL(l); window.location.reload(); };
  return (
    <div style={S.langSwitcher}>
      {['en','es','fil'].map(l => (
        <button key={l} onClick={() => handleLang(l)} style={{ ...S.langBtn, ...(lang === l ? S.langBtnActive : {}) }}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function Sidebar({ open, onClose }) {
  const loc = useLocation();
  const user = getUser();
  const mob = useIsMobile();
  const role = user?.role || 'admin';

  const allNav = [
    { path: `${BASE}/dashboard`, label: 'Command Center', roles: ['admin','official','teacher'] },
    { section: 'EDUCATION' },
    { path: `${BASE}/courses`, label: 'Course Catalog', roles: ['admin','teacher','student','bpo_worker'] },
    { path: `${BASE}/ai-tutor`, label: 'AI Spanish Tutor', roles: ['admin','teacher','student','bpo_worker'] },
    { path: `${BASE}/progress`, label: 'My Progress', roles: ['admin','student','bpo_worker'] },
    { path: `${BASE}/certifications`, label: 'Certifications', roles: ['admin','teacher','student','bpo_worker','official'] },
    { section: 'BPO PROGRAM' },
    { path: `${BASE}/bpo-program`, label: 'BPO Training', roles: ['admin','official','bpo_worker'] },
    { path: `${BASE}/job-board`, label: 'Job Board', roles: ['admin','bpo_worker'] },
    { section: 'ADVOCACY' },
    { path: `${BASE}/events`, label: 'Events', roles: ['admin','official','teacher','partner'] },
    { path: `${BASE}/supporters`, label: 'Supporters', roles: ['admin','official'] },
    { section: 'GOVERNMENT' },
    { path: `${BASE}/program-metrics`, label: 'Program Metrics', roles: ['admin','official'] },
    { path: `${BASE}/schools`, label: 'Schools', roles: ['admin','official'] },
    { path: `${BASE}/economic-impact`, label: 'Economic Impact', roles: ['admin','official'] },
    { path: `${BASE}/partner-network`, label: 'Partner Network', roles: ['admin','official','partner'] },
    { path: `${BASE}/collaboration`, label: 'Int\'l Collaboration', roles: ['admin','official','partner'] },
    { section: 'EXTERNAL' },
    { path: '/Torna_Idioma/', label: 'Public Website', roles: ['admin','official'], ext: true },
  ];

  const nav = allNav.filter(n => n.section || n.roles.includes(role));
  const ss = mob ? { ...S.sidebar, ...S.sidebarMob, transform: open ? 'translateX(0)' : 'translateX(-100%)' } : S.sidebar;

  return (
    <>
      {mob && open && <div style={S.overlay} onClick={onClose} />}
      <div style={ss}>
        {mob && <button onClick={onClose} style={S.closeBtn}>&times;</button>}
        <div style={S.logoArea}>
          <div style={S.logoCrest}>
            <div style={S.logoCrestText}>TORNA<br/>IDIOMA</div>
          </div>
          <div style={S.logoMotto}>Vida · Cultura · Legado</div>
        </div>
        <LangSwitcher />
        <nav style={S.nav}>
          {nav.map((item, i) => {
            if (item.section) return <div key={item.section} style={S.sectionLabel}>{item.section}</div>;
            if (item.ext) return <a key={item.path} href={item.path} style={S.navItem} target="_blank" rel="noopener">{item.label}<span style={S.extBadge}>EXT</span></a>;
            return <Link key={item.path} to={item.path} onClick={mob ? onClose : undefined} style={{...S.navItem, ...(loc.pathname === item.path ? S.navActive : {})}}>{item.label}</Link>;
          })}
        </nav>
        <div style={S.footer}>
          <div style={S.userRole}>{role.replace('_',' ').toUpperCase()}</div>
          <div style={S.userInfo}>{user?.full_name || user?.email}</div>
          <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }} style={S.logoutBtn}>Cerrar Sesión</button>
        </div>
      </div>
    </>
  );
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mob = useIsMobile();
  return (
    <div style={S.layout}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={S.main}>
        {mob && (
          <div style={S.topBar}>
            <button onClick={() => setSidebarOpen(true)} style={S.hamburger}>
              <span style={S.hamburgerLine}/><span style={S.hamburgerLine}/><span style={S.hamburgerLine}/>
            </button>
            <span style={S.topBarTitle}>TORNA IDIOMA</span>
          </div>
        )}
        <div style={S.content}>{children}</div>
      </div>
    </div>
  );
}

// Placeholder page for future modules
function ComingSoon({ title }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 32, color: '#1B2A4A', marginBottom: 16 }}>{title}</div>
      <p style={{ color: '#6B6B6B', fontSize: 16 }}>This module is coming soon. Phase 2+ of the Torna Idioma platform.</p>
      <div style={{ marginTop: 24, padding: '12px 32px', background: '#C9A84C', color: '#0F1A2E', display: 'inline-block', borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>PRÓXIMAMENTE</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={`${BASE}/`} element={<Landing />} />
        <Route path={`${BASE}/login`} element={<Login />} />
        <Route path={`${BASE}/dashboard`} element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/courses`} element={<ProtectedRoute><Layout><CourseCatalog /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/classroom/:courseId/:lessonId`} element={<ProtectedRoute><Layout><Classroom /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/classroom/:courseId`} element={<ProtectedRoute><Layout><Classroom /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/progress`} element={<ProtectedRoute><Layout><Progress /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/certifications`} element={<ProtectedRoute><Layout><Certifications /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/bpo-program`} element={<ProtectedRoute><Layout><BPOProgram /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/job-board`} element={<ProtectedRoute><Layout><JobBoard /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/events`} element={<ProtectedRoute><Layout><Events /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/supporters`} element={<ProtectedRoute><Layout><Supporters /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/program-metrics`} element={<ProtectedRoute roles={['admin','official']}><Layout><ProgramMetrics /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/schools`} element={<ProtectedRoute roles={['admin','official']}><Layout><Schools /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/economic-impact`} element={<ProtectedRoute roles={['admin','official']}><Layout><EconomicImpact /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/ai-tutor`} element={<ProtectedRoute><Layout><AITutor /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/partner-network`} element={<ProtectedRoute roles={['admin','official','partner']}><Layout><PartnerNetwork /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/collaboration`} element={<ProtectedRoute roles={['admin','official','partner']}><Layout><InternationalCollaboration /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={`${BASE}/`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// Heritage theme styles — gold/navy/cream palette
const S = {
  layout: { display: 'flex', minHeight: '100vh', background: '#FFF8E7' },
  sidebar: { width: 260, background: 'linear-gradient(180deg, #0F1A2E 0%, #1B2A4A 100%)', color: '#fff', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 100, overflowY: 'auto' },
  sidebarMob: { position: 'fixed', top: 0, bottom: 0, left: 0, width: 280, transition: 'transform 0.3s ease', zIndex: 200 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 },
  closeBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#C9A84C', fontSize: 28, cursor: 'pointer' },
  logoArea: { padding: '28px 20px 12px', textAlign: 'center', borderBottom: '1px solid rgba(201,168,76,0.2)' },
  logoCrest: { width: 80, height: 80, border: '2px solid #C9A84C', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', background: 'rgba(201,168,76,0.08)' },
  logoCrestText: { fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: '#C9A84C', textAlign: 'center', lineHeight: 1.2, letterSpacing: 2 },
  logoMotto: { fontFamily: "'Playfair Display',serif", fontSize: 11, color: '#E8D48B', fontStyle: 'italic', letterSpacing: 1, marginBottom: 8 },
  langSwitcher: { display: 'flex', gap: 4, justifyContent: 'center', padding: '12px 20px 8px' },
  langBtn: { padding: '4px 10px', border: '1px solid rgba(201,168,76,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', borderRadius: 3 },
  langBtnActive: { background: '#C9A84C', color: '#0F1A2E', borderColor: '#C9A84C' },
  nav: { flex: 1, padding: '12px 0' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: 'rgba(201,168,76,0.6)', letterSpacing: 2, padding: '16px 20px 6px', textTransform: 'uppercase' },
  navItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: 13, fontWeight: 500, transition: 'all 0.2s', cursor: 'pointer', borderLeft: '3px solid transparent' },
  navActive: { color: '#C9A84C', background: 'rgba(201,168,76,0.08)', borderLeftColor: '#C9A84C' },
  extBadge: { fontSize: 9, fontWeight: 700, color: '#C9A84C', background: 'rgba(201,168,76,0.12)', padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5 },
  footer: { padding: '16px 20px', borderTop: '1px solid rgba(201,168,76,0.2)', textAlign: 'center' },
  userRole: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2, marginBottom: 4 },
  userInfo: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn: { background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.3)', color: '#C41E3A', padding: '6px 20px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%' },
  main: { flex: 1, marginLeft: 260, minHeight: '100vh' },
  topBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#0F1A2E', borderBottom: '1px solid rgba(201,168,76,0.3)' },
  hamburger: { display: 'flex', flexDirection: 'column', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  hamburgerLine: { display: 'block', width: 22, height: 2, background: '#C9A84C', borderRadius: 1 },
  topBarTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#C9A84C', letterSpacing: 2 },
  content: { padding: 0 },
};

// Mobile override
const style = document.createElement('style');
style.textContent = `
  @media (max-width: 768px) {
    [style*="marginLeft: 260"] { margin-left: 0 !important; }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('ti-responsive')) {
  style.id = 'ti-responsive';
  document.head.appendChild(style);
}

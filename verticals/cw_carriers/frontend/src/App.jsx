import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { isAuthenticated, logout, getUser } from './services/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Loads from './pages/Loads';
import Contacts from './pages/Contacts';
import Calls from './pages/Calls';
import NLP from './pages/NLP';
import Analytics from './pages/Analytics';
import HubSpot from './pages/HubSpot';
import Settings from './pages/Settings';
import Demo from './pages/Demo';
import Landing from './pages/Landing';
import TMS from './pages/TMS';
import Reports from './pages/Reports';

const BASE = '/cw_carriers';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to={`${BASE}/login`} replace />;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function Sidebar({ open, onClose }) {
  const location = useLocation();
  const user = getUser();
  const isMobile = useIsMobile();
  const nav = [
    { path: `${BASE}/dashboard`, label: 'Dashboard', icon: '\u{1F4CA}' },
    { path: `${BASE}/loads`, label: 'Loads', icon: '\u{1F69A}' },
    { path: `${BASE}/contacts`, label: 'Contacts', icon: '\u{1F465}' },
    { path: `${BASE}/calls`, label: 'Calls', icon: '\u{1F4DE}' },
    { path: `${BASE}/nlp`, label: 'NLP Assistant', icon: '\u{1F916}' },
    { path: `${BASE}/analytics`, label: 'Analytics', icon: '\u{1F4C8}' },
    { path: `${BASE}/tms`, label: 'TMS Bridge', icon: '\u{1F310}' },
    { path: `${BASE}/reports`, label: 'Reports', icon: '\u{1F4C4}' },
    { path: `${BASE}/hubspot`, label: 'HubSpot Sync', icon: '\u{1F504}' },
    { path: `${BASE}/settings`, label: 'Settings', icon: '\u2699\uFE0F' },
    { path: `${BASE}/demo`, label: 'Demo Data', icon: '\u{1F4E6}' },
  ];

  // On mobile, sidebar slides in/out
  const sidebarStyle = isMobile
    ? { ...styles.sidebar, ...styles.sidebarMobile, transform: open ? 'translateX(0)' : 'translateX(-100%)' }
    : styles.sidebar;

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && open && (
        <div style={styles.overlay} onClick={onClose} />
      )}
      <div style={sidebarStyle}>
        {isMobile && (
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        )}
        <div style={styles.ringlyProBanner}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6884f40a6d2fd3fed0b84613.png" alt="RinglyPro" style={styles.ringlyProLogo} />
        </div>
        <div style={styles.logo}>
          <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="CW Carriers" style={styles.logoImg} />
          <div style={styles.logoText}>CW CARRIERS</div>
          <div style={styles.logoSub}>USA, Inc.</div>
        </div>
        <a href={`${BASE}/hubspot`} style={styles.hubspotLoginBtn}>
          HubSpot Portal Login
        </a>
        <nav style={styles.nav}>
          {nav.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={isMobile ? onClose : undefined}
              style={{
                ...styles.navItem,
                ...(location.pathname === item.path ? styles.navItemActive : {})
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>{user?.email}</div>
          <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>
    </>
  );
}

function MobileHeader({ onOpenMenu }) {
  return (
    <div style={styles.mobileHeader}>
      <button onClick={onOpenMenu} style={styles.hamburger}>
        <span style={styles.hamburgerLine} />
        <span style={styles.hamburgerLine} />
        <span style={styles.hamburgerLine} />
      </button>
      <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="CW Carriers" style={styles.mobileLogoImg} />
      <span style={styles.mobileTitle}>CW CARRIERS</span>
    </div>
  );
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div style={styles.layout}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={isMobile ? styles.mainMobile : styles.main}>
        {isMobile && <MobileHeader onOpenMenu={() => setSidebarOpen(true)} />}
        <div style={isMobile ? styles.mainContentMobile : styles.mainContent}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <style>{globalCSS}</style>
      <Routes>
        <Route path={`${BASE}/login`} element={<Login />} />
        <Route path={`${BASE}/dashboard`} element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/loads`} element={<ProtectedRoute><Layout><Loads /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/contacts`} element={<ProtectedRoute><Layout><Contacts /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/calls`} element={<ProtectedRoute><Layout><Calls /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/nlp`} element={<ProtectedRoute><Layout><NLP /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/analytics`} element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/tms`} element={<ProtectedRoute><Layout><TMS /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/reports`} element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/hubspot`} element={<ProtectedRoute><Layout><HubSpot /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/settings`} element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/demo`} element={<ProtectedRoute><Layout><Demo /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}`} element={<Landing />} />
        <Route path={`${BASE}/`} element={<Landing />} />
        <Route path="*" element={<Navigate to={`${BASE}/`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const globalCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #0D1117; color: #E6EDF3; -webkit-text-size-adjust: 100%; }
  h1, h2, h3, h4 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 1px; }
  input, select, textarea, button { font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #161B22; }
  ::-webkit-scrollbar-thumb { background: #1A4FA8; border-radius: 3px; }
  a { text-decoration: none; color: inherit; }
  table { overflow-x: auto; display: block; }
  @media (min-width: 769px) { table { display: table; } }
`;

const styles = {
  layout: { display: 'flex', minHeight: '100vh' },

  // Desktop sidebar
  sidebar: { width: 240, background: '#161B22', borderRight: '1px solid #21262D', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', zIndex: 50, transition: 'transform 0.3s ease' },

  // Mobile sidebar overrides
  sidebarMobile: { position: 'fixed', top: 0, left: 0, width: 280, height: '100vh', zIndex: 200 },

  // Overlay behind mobile sidebar
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 199 },

  // Close button inside mobile sidebar
  closeBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#8B949E', fontSize: 28, cursor: 'pointer', zIndex: 201, lineHeight: 1, padding: 4 },

  // Mobile header bar
  mobileHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#161B22', borderBottom: '1px solid #21262D', position: 'sticky', top: 0, zIndex: 40 },
  hamburger: { display: 'flex', flexDirection: 'column', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  hamburgerLine: { display: 'block', width: 22, height: 2, background: '#E6EDF3', borderRadius: 1 },
  mobileLogoImg: { width: 28, height: 'auto', borderRadius: 4 },
  mobileTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#C8962A', letterSpacing: 1 },

  // Sidebar internals
  ringlyProBanner: { padding: '12px 20px', borderBottom: '1px solid #21262D', textAlign: 'center', background: '#0D1117' },
  ringlyProLogo: { height: 28, width: 'auto' },
  logo: { padding: '20px 20px 16px', borderBottom: '1px solid #21262D', textAlign: 'center' },
  logoImg: { width: 70, height: 'auto', marginBottom: 8, borderRadius: 6 },
  hubspotLoginBtn: { display: 'block', margin: '10px 16px', padding: '8px 12px', background: '#FF7A59', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', textDecoration: 'none' },
  logoText: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#C8962A', letterSpacing: 2 },
  logoSub: { fontSize: 12, color: '#8B949E', marginTop: 2 },
  nav: { flex: 1, padding: '12px 0', overflowY: 'auto' },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', fontSize: 14, color: '#8B949E', cursor: 'pointer', transition: 'all 0.2s', borderLeft: '3px solid transparent' },
  navItemActive: { color: '#fff', background: '#1A4FA822', borderLeftColor: '#1A4FA8' },
  navIcon: { fontSize: 16 },
  sidebarFooter: { padding: '16px 20px', borderTop: '1px solid #21262D' },
  userInfo: { fontSize: 12, color: '#8B949E', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { background: 'none', border: '1px solid #30363D', color: '#8B949E', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, width: '100%' },

  // Desktop main area
  main: { flex: 1, marginLeft: 240, minHeight: '100vh' },
  mainContent: { padding: 24 },

  // Mobile main area
  mainMobile: { flex: 1, marginLeft: 0, minHeight: '100vh' },
  mainContentMobile: { padding: 16 },
};

import React from 'react';
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

const BASE = '/cw_carriers';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to={`${BASE}/login`} replace />;
}

function Sidebar() {
  const location = useLocation();
  const user = getUser();
  const nav = [
    { path: `${BASE}/dashboard`, label: 'Dashboard', icon: '📊' },
    { path: `${BASE}/loads`, label: 'Loads', icon: '🚚' },
    { path: `${BASE}/contacts`, label: 'Contacts', icon: '👥' },
    { path: `${BASE}/calls`, label: 'Calls', icon: '📞' },
    { path: `${BASE}/nlp`, label: 'NLP Assistant', icon: '🤖' },
    { path: `${BASE}/analytics`, label: 'Analytics', icon: '📈' },
    { path: `${BASE}/hubspot`, label: 'HubSpot Sync', icon: '🔄' },
    { path: `${BASE}/settings`, label: 'Settings', icon: '⚙️' },
    { path: `${BASE}/demo`, label: 'Demo Data', icon: '📦' },
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="CW Carriers" style={styles.logoImg} />
        <div style={styles.logoText}>CW CARRIERS</div>
        <div style={styles.logoSub}>USA, Inc.</div>
      </div>
      <nav style={styles.nav}>
        {nav.map(item => (
          <Link
            key={item.path}
            to={item.path}
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
  );
}

function Layout({ children }) {
  return (
    <div style={styles.layout}>
      <Sidebar />
      <main style={styles.main}>{children}</main>
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
        <Route path={`${BASE}/hubspot`} element={<ProtectedRoute><Layout><HubSpot /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/settings`} element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/demo`} element={<ProtectedRoute><Layout><Demo /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}`} element={<Navigate to={`${BASE}/login`} replace />} />
        <Route path={`${BASE}/`} element={<Navigate to={`${BASE}/login`} replace />} />
        <Route path="*" element={<Navigate to={`${BASE}/login`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const globalCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #0D1117; color: #E6EDF3; }
  h1, h2, h3, h4 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 1px; }
  input, select, textarea, button { font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #161B22; }
  ::-webkit-scrollbar-thumb { background: #1A4FA8; border-radius: 3px; }
  a { text-decoration: none; color: inherit; }
`;

const styles = {
  layout: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 240, background: '#161B22', borderRight: '1px solid #21262D', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', zIndex: 10 },
  logo: { padding: '24px 20px', borderBottom: '1px solid #21262D', textAlign: 'center' },
  logoImg: { width: 80, height: 'auto', marginBottom: 8, borderRadius: 6 },
  logoText: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#C8962A', letterSpacing: 2 },
  logoSub: { fontSize: 12, color: '#8B949E', marginTop: 2 },
  nav: { flex: 1, padding: '12px 0', overflowY: 'auto' },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', fontSize: 14, color: '#8B949E', cursor: 'pointer', transition: 'all 0.2s', borderLeft: '3px solid transparent' },
  navItemActive: { color: '#fff', background: '#1A4FA822', borderLeftColor: '#1A4FA8' },
  navIcon: { fontSize: 16 },
  sidebarFooter: { padding: '16px 20px', borderTop: '1px solid #21262D' },
  userInfo: { fontSize: 12, color: '#8B949E', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { background: 'none', border: '1px solid #30363D', color: '#8B949E', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, width: '100%' },
  main: { flex: 1, marginLeft: 240, padding: 24, minHeight: '100vh', overflowY: 'auto' },
};

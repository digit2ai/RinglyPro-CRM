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
import Offers from './pages/Offers';
import CheckCalls from './pages/CheckCalls';
import Billing from './pages/Billing';
import Warehouse from './pages/Warehouse';
// Brokerage modules
import ShipperPortal from './pages/ShipperPortal';
import CarrierPortal from './pages/CarrierPortal';
import FreightMatching from './pages/FreightMatching';
import LoadMatching from './pages/LoadMatching';
import RateIntelligence from './pages/RateIntelligence';
import BrokerageAnalytics from './pages/BrokerageAnalytics';
import DataIngestion from './pages/DataIngestion';
import DocumentVault from './pages/DocumentVault';
import Compliance from './pages/Compliance';
import BrokerageDemo from './pages/BrokerageDemo';
// Admin modules
import TokenEstimator from './pages/TokenEstimator';
import ContractBuilder from './pages/ContractBuilder';
import MCPTools from './pages/MCPTools';

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
  const allNav = [
    { path: `${BASE}/dashboard`, label: 'Dashboard' },
    { path: `${BASE}/loads`, label: 'Loads' },
    { path: `${BASE}/offers`, label: 'Carrier Offers' },
    { path: `${BASE}/contacts`, label: 'Contacts' },
    { path: `${BASE}/calls`, label: 'Calls' },
    { path: `${BASE}/tracking`, label: 'Check Calls' },
    { path: `${BASE}/billing`, label: 'Billing' },
    { path: `${BASE}/nlp`, label: 'NLP Assistant' },
    { path: `${BASE}/analytics`, label: 'Analytics' },
    { path: `${BASE}/warehouse`, label: 'Warehouse' },
    { path: `${BASE}/tms`, label: 'TMS Bridge' },
    { path: `${BASE}/reports`, label: 'Reports' },
    { path: `${BASE}/hubspot`, label: 'HubSpot Sync' },
    { path: `${BASE}/settings`, label: 'Settings' },
    { path: `${BASE}/demo`, label: 'Demo Data' },
    // AI Brokerage section
    { path: `${BASE}/shipper`, label: 'Shipper Portal', section: 'AI BROKERAGE' },
    { path: `${BASE}/carrier-portal`, label: 'Carrier Portal' },
    { path: `${BASE}/freight-matching`, label: 'Carrier Matching' },
    { path: `${BASE}/load-matching`, label: 'Load Matching' },
    { path: `${BASE}/pricing`, label: 'Rate Intelligence' },
    { path: `${BASE}/brokerage-analytics`, label: 'Analytics & KPIs' },
    { path: `${BASE}/ingestion`, label: 'Data Ingestion', section: 'DATA' },
    { path: `${BASE}/documents`, label: 'Document Vault' },
    { path: `${BASE}/compliance`, label: 'FMCSA Compliance' },
    { path: `${BASE}/brokerage-demo`, label: 'Demo Workspaces' },
    // Admin section
    { path: `${BASE}/token-estimator`, label: 'Token Estimator', section: 'ADMIN' },
    { path: `${BASE}/contract-builder`, label: 'Contract Builder' },
    { path: `${BASE}/mcp-tools`, label: 'MCP Tools' },
    // External links
    { path: '/pinaxis/', label: 'Warehouse OPS', ext: true, section: 'EXTERNAL' },
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
          <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="RinglyPro Logistics" style={styles.logoImg} />
          <div style={styles.logoText}>CARRIERS</div>
          <div style={styles.logoSub}>Logistics CRM</div>
        </div>
        <a href={`${BASE}/hubspot`} style={styles.hubspotLoginBtn}>
          HubSpot Portal Login
        </a>
        <nav style={styles.nav}>
          {allNav.map((item, i) => {
            const showSection = item.section && (i === 0 || allNav[i-1]?.section !== item.section);
            return (
              <React.Fragment key={item.path}>
                {showSection && <div style={styles.sectionLabel}>{item.section}</div>}
                {item.ext ? (
                  <a href={item.path} style={styles.navItem}>{item.label}<span style={styles.extBadge}>EXT</span></a>
                ) : (
                  <Link
                    to={item.path}
                    onClick={isMobile ? onClose : undefined}
                    style={{
                      ...styles.navItem,
                      ...(location.pathname === item.path ? styles.navItemActive : {})
                    }}
                  >
                    {item.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
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
      <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="RinglyPro Logistics" style={styles.mobileLogoImg} />
      <span style={styles.mobileTitle}>CARRIERS</span>
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
        <Route path={`${BASE}/offers`} element={<ProtectedRoute><Layout><Offers /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/tracking`} element={<ProtectedRoute><Layout><CheckCalls /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/billing`} element={<ProtectedRoute><Layout><Billing /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/warehouse`} element={<ProtectedRoute><Layout><Warehouse /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/hubspot`} element={<ProtectedRoute><Layout><HubSpot /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/settings`} element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/demo`} element={<ProtectedRoute><Layout><Demo /></Layout></ProtectedRoute>} />
        {/* Brokerage routes */}
        <Route path={`${BASE}/shipper`} element={<ProtectedRoute><Layout><ShipperPortal /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/carrier-portal`} element={<ProtectedRoute><Layout><CarrierPortal /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/freight-matching`} element={<ProtectedRoute><Layout><FreightMatching /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/load-matching`} element={<ProtectedRoute><Layout><LoadMatching /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/pricing`} element={<ProtectedRoute><Layout><RateIntelligence /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/brokerage-analytics`} element={<ProtectedRoute><Layout><BrokerageAnalytics /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/ingestion`} element={<ProtectedRoute><Layout><DataIngestion /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/documents`} element={<ProtectedRoute><Layout><DocumentVault /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/compliance`} element={<ProtectedRoute><Layout><Compliance /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/brokerage-demo`} element={<ProtectedRoute><Layout><BrokerageDemo /></Layout></ProtectedRoute>} />
        {/* Admin routes */}
        <Route path={`${BASE}/token-estimator`} element={<ProtectedRoute><Layout><TokenEstimator /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/contract-builder`} element={<ProtectedRoute><Layout><ContractBuilder /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/mcp-tools`} element={<ProtectedRoute><Layout><MCPTools /></Layout></ProtectedRoute>} />
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
  sectionLabel: { padding: '12px 20px 4px', fontSize: 10, color: '#C8962A', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' },
  extBadge: { marginLeft: 'auto', padding: '1px 5px', background: '#30363D', color: '#8B949E', borderRadius: 4, fontSize: 9, fontWeight: 600 },
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

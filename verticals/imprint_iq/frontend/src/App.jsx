import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { isAuthenticated, logout, getUser } from './services/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NeuralIntelligence from './pages/NeuralIntelligence';
import ProcessModel from './pages/ProcessModel';
import Ingestion from './pages/Ingestion';
import Architecture from './pages/Architecture';
import SalesPitch from './pages/SalesPitch';

const BASE = '/imprint_iq';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to={`${BASE}/login`} replace />;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

function Layout({ children }) {
  const location = useLocation();
  const user = getUser();
  const isMobile = useIsMobile();
  const [sideOpen, setSideOpen] = useState(!isMobile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on navigation
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  const navItems = [
    { path: `${BASE}/dashboard`, label: 'Dashboard' },
    { path: `${BASE}/neural`, label: 'Neural Intelligence' },
    { path: `${BASE}/process`, label: 'Process & ROI' },
    { path: `${BASE}/ingest`, label: 'Data Ingestion' },
    { path: `${BASE}/architecture`, label: 'Architecture' },
    { path: `${BASE}/pitch`, label: 'Presentation' }
  ];

  const isActive = (p) => location.pathname === p;

  // MOBILE LAYOUT
  if (isMobile) {
    return (
      <div style={{ minHeight:'100vh', background:'#0D1117' }}>
        {/* Mobile Top Bar */}
        <div style={{ position:'sticky', top:0, zIndex:50, background:'#161B22', borderBottom:'1px solid #21262D', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="IQ" style={{ width:24, height:24, borderRadius:4 }} />
            <span style={{ fontFamily:'Bebas Neue', fontSize:16, color:'#E6EDF3', letterSpacing:2 }}>IMPRINT<span style={{ color:'#C8962A' }}>IQ</span></span>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}>
            {mobileMenuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B949E" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B949E" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:40, background:'rgba(0,0,0,0.7)' }} onClick={() => setMobileMenuOpen(false)}>
            <div style={{ position:'absolute', top:48, right:0, width:'75%', maxWidth:280, background:'#161B22', borderLeft:'1px solid #21262D', borderBottom:'1px solid #21262D', borderRadius:'0 0 0 12px', padding:'12px 8px' }} onClick={e => e.stopPropagation()}>
              {navItems.map(n => (
                <Link key={n.path} to={n.path} onClick={() => setMobileMenuOpen(false)}
                  style={{ display:'block', padding:'12px 16px', borderRadius:8, marginBottom:2, textDecoration:'none', background: isActive(n.path) ? '#C8962A22' : 'transparent', color: isActive(n.path) ? '#C8962A' : '#8B949E', fontSize:14, fontWeight: isActive(n.path) ? 600 : 400 }}>
                  {n.label}
                </Link>
              ))}
              <div style={{ borderTop:'1px solid #21262D', marginTop:8, paddingTop:12, padding:'12px 16px' }}>
                <div style={{ color:'#484F58', fontSize:11, marginBottom:8 }}>{user?.email}</div>
                <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }}
                  style={{ width:'100%', padding:'10px', background:'#21262D', color:'#8B949E', border:'1px solid #30363D', borderRadius:6, fontSize:12, cursor:'pointer' }}>Sign Out</button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Content — Full Width */}
        <div style={{ padding:'16px 12px' }}>{children}</div>

        <style>{`
          * { margin:0;padding:0;box-sizing:border-box; }
          body { font-family:'DM Sans',sans-serif;background:#0D1117;color:#E6EDF3; }
          h1,h2,h3,h4 { font-family:'Bebas Neue',sans-serif;letter-spacing:1px; }
          ::-webkit-scrollbar { width:4px; }
          ::-webkit-scrollbar-track { background:#0D1117; }
          ::-webkit-scrollbar-thumb { background:#30363D;border-radius:2px; }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        `}</style>
      </div>
    );
  }

  // DESKTOP LAYOUT
  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0D1117' }}>
      {/* Sidebar */}
      <div style={{ width: sideOpen ? 220 : 60, background:'#161B22', borderRight:'1px solid #21262D', transition:'width 0.3s', overflow:'hidden', flexShrink:0 }}>
        <div style={{ padding:'16px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #21262D', cursor:'pointer' }} onClick={() => setSideOpen(!sideOpen)}>
          <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="IQ" style={{ width:28, height:28, borderRadius:4 }} />
          {sideOpen && <span style={{ fontFamily:'Bebas Neue', fontSize:20, color:'#E6EDF3', letterSpacing:2 }}>IMPRINT<span style={{ color:'#C8962A' }}>IQ</span></span>}
        </div>
        <div style={{ padding:'12px 8px' }}>
          {navItems.map(n => (
            <Link key={n.path} to={n.path} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 10px', borderRadius:8, marginBottom:4, textDecoration:'none', background: isActive(n.path) ? '#C8962A22' : 'transparent', color: isActive(n.path) ? '#C8962A' : '#8B949E' }}>
              {sideOpen && <span style={{ fontSize:13, fontWeight: isActive(n.path) ? 600 : 400 }}>{n.label}</span>}
            </Link>
          ))}
        </div>
        {sideOpen && (
          <div style={{ position:'absolute', bottom:16, left:0, width:220, padding:'0 14px' }}>
            <div style={{ color:'#8B949E', fontSize:11, marginBottom:6 }}>{user?.email}</div>
            <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }}
              style={{ width:'100%', padding:'8px', background:'#21262D', color:'#8B949E', border:'1px solid #30363D', borderRadius:6, fontSize:12, cursor:'pointer' }}>Sign Out</button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex:1, overflow:'auto' }}>
        <div style={{ padding:'20px 28px', borderBottom:'1px solid #21262D', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:22, margin:0, letterSpacing:1 }}>
            {navItems.find(n => isActive(n.path))?.label || 'ImprintIQ'}
          </h2>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:'#238636', fontSize:10 }}>LIVE</span>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#238636', animation:'pulse 2s infinite' }} />
          </div>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>

      <style>{`
        * { margin:0;padding:0;box-sizing:border-box; }
        body { font-family:'DM Sans',sans-serif;background:#0D1117;color:#E6EDF3; }
        h1,h2,h3,h4 { font-family:'Bebas Neue',sans-serif;letter-spacing:1px; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:#0D1117; }
        ::-webkit-scrollbar-thumb { background:#30363D;border-radius:3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={`${BASE}/login`} element={<Login />} />
        <Route path={`${BASE}/dashboard`} element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/neural`} element={<ProtectedRoute><Layout><NeuralIntelligence /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/process`} element={<ProtectedRoute><Layout><ProcessModel /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/ingest`} element={<ProtectedRoute><Layout><Ingestion /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/architecture`} element={<ProtectedRoute><Layout><Architecture /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/pitch`} element={<ProtectedRoute><Layout><SalesPitch /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/`} element={<Landing />} />
        <Route path={`${BASE}`} element={<Landing />} />
        <Route path="*" element={<Navigate to={`${BASE}/`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

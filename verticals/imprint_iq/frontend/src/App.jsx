import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { isAuthenticated, logout, getUser } from './services/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NeuralIntelligence from './pages/NeuralIntelligence';

const BASE = '/imprint_iq';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to={`${BASE}/login`} replace />;
}

function Layout({ children }) {
  const location = useLocation();
  const user = getUser();
  const [sideOpen, setSideOpen] = useState(true);

  const navItems = [
    { path: `${BASE}/dashboard`, label: 'Dashboard', icon: '📊' },
    { path: `${BASE}/neural`, label: 'Neural Intelligence', icon: '🧠' }
  ];

  const isActive = (p) => location.pathname === p;

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0D1117' }}>
      {/* Sidebar */}
      <div style={{ width: sideOpen ? 220 : 60, background:'#161B22', borderRight:'1px solid #21262D', transition:'width 0.3s', overflow:'hidden', flexShrink:0 }}>
        <div style={{ padding:'16px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #21262D', cursor:'pointer' }} onClick={() => setSideOpen(!sideOpen)}>
          <span style={{ fontSize:24 }}>🖨️</span>
          {sideOpen && <span style={{ fontFamily:'Bebas Neue', fontSize:20, color:'#E6EDF3', letterSpacing:2 }}>IMPRINT<span style={{ color:'#C8962A' }}>IQ</span></span>}
        </div>
        <div style={{ padding:'12px 8px' }}>
          {navItems.map(n => (
            <Link key={n.path} to={n.path} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 10px', borderRadius:8, marginBottom:4, textDecoration:'none', background: isActive(n.path) ? '#C8962A22' : 'transparent', color: isActive(n.path) ? '#C8962A' : '#8B949E' }}>
              <span style={{ fontSize:18 }}>{n.icon}</span>
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
        <Route path={`${BASE}/`} element={<Landing />} />
        <Route path={`${BASE}`} element={<Landing />} />
        <Route path="*" element={<Navigate to={`${BASE}/`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

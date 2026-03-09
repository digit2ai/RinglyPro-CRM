import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { isAuthenticated, logout, getUser, hasRole } from './services/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShipperPortal from './pages/ShipperPortal';
import CarrierPortal from './pages/CarrierPortal';
import DocumentVault from './pages/DocumentVault';
import Compliance from './pages/Compliance';
import FreightMatching from './pages/FreightMatching';
import MCPTools from './pages/MCPTools';
import Landing from './pages/Landing';

const BASE = '/logistics';

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

function Sidebar({ open, onClose, tierInfo }) {
  const loc = useLocation();
  const user = getUser();
  const mob = useIsMobile();
  const role = user?.role || 'admin';
  const allNav = [
    { path: `${BASE}/dashboard`, label: 'Command Center', icon: '\u{1F3AF}', roles: ['admin','dispatcher'] },
    { path: `${BASE}/shipper`, label: 'Shipper Portal', icon: '\u{1F4E6}', roles: ['admin','dispatcher','shipper'] },
    { path: `${BASE}/carrier`, label: 'Carrier Portal', icon: '\u{1F69A}', roles: ['admin','dispatcher','carrier'] },
    { path: `${BASE}/documents`, label: 'Document Vault', icon: '\u{1F4C1}', roles: ['admin','dispatcher','shipper','carrier'] },
    { path: `${BASE}/compliance`, label: 'FMCSA Compliance', icon: '\u{1F6E1}\uFE0F', roles: ['admin','dispatcher'] },
    { path: `${BASE}/matching`, label: 'Freight Matching', icon: '\u{1F916}', roles: ['admin','dispatcher'] },
    { path: `${BASE}/tools`, label: 'MCP Tools', icon: '\u{1F527}', roles: ['admin'] },
    { path: '/cw_carriers/dashboard', label: 'CW Carriers', icon: '\u{1F310}', roles: ['admin','dispatcher'], ext: true },
    { path: '/pinaxis/', label: 'Warehouse OPS', icon: '\u{1F3ED}', roles: ['admin','dispatcher'], ext: true },
  ];
  const nav = allNav.filter(n => n.roles.includes(role));
  const ss = mob ? { ...S.sidebar, ...S.sidebarMob, transform: open ? 'translateX(0)' : 'translateX(-100%)' } : S.sidebar;
  return (
    <>
      {mob && open && <div style={S.overlay} onClick={onClose} />}
      <div style={ss}>
        {mob && <button onClick={onClose} style={S.closeBtn}>&times;</button>}
        <div style={S.logoArea}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6884f40a6d2fd3fed0b84613.png" alt="RinglyPro" style={S.logoImg} />
          <div style={S.logoText}>LOGISTICS</div>
          <div style={S.tierBadge}>{tierInfo?.tier_name || 'Full Suite'}</div>
        </div>
        <nav style={S.nav}>
          {nav.map(item => item.ext ? (
            <a key={item.path} href={item.path} style={S.navItem}><span style={S.navIcon}>{item.icon}</span>{item.label}<span style={S.extBadge}>EXT</span></a>
          ) : (
            <Link key={item.path} to={item.path} onClick={mob ? onClose : undefined} style={{...S.navItem, ...(loc.pathname === item.path ? S.navActive : {})}}><span style={S.navIcon}>{item.icon}</span>{item.label}</Link>
          ))}
        </nav>
        <div style={S.footer}>
          <div style={S.userRole}>{role.toUpperCase()}</div>
          <div style={S.userInfo}>{user?.email}</div>
          <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }} style={S.logoutBtn}>Logout</button>
        </div>
      </div>
    </>
  );
}

function MobileHeader({ onOpen }) {
  return (<div style={S.mobHeader}><button onClick={onOpen} style={S.hamburger}><span style={S.hLine}/><span style={S.hLine}/><span style={S.hLine}/></button><span style={S.mobTitle}>RINGLYPRO LOGISTICS</span></div>);
}

function Layout({ children, tierInfo }) {
  const [so, setSo] = useState(false);
  const mob = useIsMobile();
  return (<div style={S.layout}><Sidebar open={so} onClose={() => setSo(false)} tierInfo={tierInfo} /><div style={mob ? S.mainMob : S.main}>{mob && <MobileHeader onOpen={() => setSo(true)} />}<div style={mob ? S.contentMob : S.content}>{children}</div></div></div>);
}

export default function App() {
  const [ti, setTi] = useState(null);
  useEffect(() => { fetch('/logistics/api/tiers').then(r => r.json()).then(d => { if (d.success) { const a = d.tiers.find(t => t.is_active); setTi({ tier: d.current_tier, tier_name: a?.name, modules: a?.modules || [] }); }}).catch(() => {}); }, []);
  return (
    <BrowserRouter>
      <style>{`* { margin:0;padding:0;box-sizing:border-box; } body { font-family:'DM Sans',sans-serif;background:#0D1117;color:#E6EDF3; } h1,h2,h3,h4 { font-family:'Bebas Neue',sans-serif;letter-spacing:1px; } input,select,textarea,button { font-family:'DM Sans',sans-serif; } ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#161B22} ::-webkit-scrollbar-thumb{background:#0EA5E9;border-radius:3px} a{text-decoration:none;color:inherit}`}</style>
      <Routes>
        <Route path={`${BASE}/login`} element={<Login />} />
        <Route path={`${BASE}/dashboard`} element={<ProtectedRoute><Layout tierInfo={ti}><Dashboard /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/shipper`} element={<ProtectedRoute roles={['admin','dispatcher','shipper']}><Layout tierInfo={ti}><ShipperPortal /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/carrier`} element={<ProtectedRoute roles={['admin','dispatcher','carrier']}><Layout tierInfo={ti}><CarrierPortal /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/documents`} element={<ProtectedRoute><Layout tierInfo={ti}><DocumentVault /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/compliance`} element={<ProtectedRoute roles={['admin','dispatcher']}><Layout tierInfo={ti}><Compliance /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/matching`} element={<ProtectedRoute roles={['admin','dispatcher']}><Layout tierInfo={ti}><FreightMatching /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/tools`} element={<ProtectedRoute roles={['admin']}><Layout tierInfo={ti}><MCPTools /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}`} element={<Landing />} />
        <Route path={`${BASE}/`} element={<Landing />} />
        <Route path="*" element={<Navigate to={`${BASE}/`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const S = {
  layout:{display:'flex',minHeight:'100vh'},
  sidebar:{width:260,background:'#161B22',borderRight:'1px solid #21262D',display:'flex',flexDirection:'column',position:'fixed',height:'100vh',zIndex:50,transition:'transform 0.3s ease'},
  sidebarMob:{position:'fixed',top:0,left:0,width:280,height:'100vh',zIndex:200},
  overlay:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:199},
  closeBtn:{position:'absolute',top:12,right:12,background:'none',border:'none',color:'#8B949E',fontSize:28,cursor:'pointer',zIndex:201},
  mobHeader:{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#161B22',borderBottom:'1px solid #21262D',position:'sticky',top:0,zIndex:40},
  hamburger:{display:'flex',flexDirection:'column',gap:4,background:'none',border:'none',cursor:'pointer',padding:4},
  hLine:{display:'block',width:22,height:2,background:'#E6EDF3',borderRadius:1},
  mobTitle:{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:'#0EA5E9',letterSpacing:2},
  logoArea:{padding:20,borderBottom:'1px solid #21262D',textAlign:'center'},
  logoImg:{height:30,width:'auto',marginBottom:8},
  logoText:{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:'#0EA5E9',letterSpacing:3},
  tierBadge:{display:'inline-block',marginTop:6,padding:'3px 10px',background:'#0EA5E922',color:'#0EA5E9',borderRadius:12,fontSize:10,fontWeight:600,letterSpacing:1,textTransform:'uppercase'},
  nav:{flex:1,padding:'12px 0',overflowY:'auto'},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'11px 20px',fontSize:14,color:'#8B949E',cursor:'pointer',transition:'all 0.2s',borderLeft:'3px solid transparent'},
  navActive:{color:'#fff',background:'#0EA5E922',borderLeftColor:'#0EA5E9'},
  navIcon:{fontSize:16},
  extBadge:{marginLeft:'auto',padding:'1px 5px',background:'#30363D',color:'#8B949E',borderRadius:4,fontSize:9,fontWeight:600},
  footer:{padding:'16px 20px',borderTop:'1px solid #21262D'},
  userRole:{fontSize:10,color:'#0EA5E9',fontWeight:600,letterSpacing:1,marginBottom:4},
  userInfo:{fontSize:12,color:'#8B949E',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis'},
  logoutBtn:{background:'none',border:'1px solid #30363D',color:'#8B949E',padding:'6px 12px',borderRadius:6,cursor:'pointer',fontSize:12,width:'100%'},
  main:{flex:1,marginLeft:260,minHeight:'100vh'},
  content:{padding:24},
  mainMob:{flex:1,marginLeft:0,minHeight:'100vh'},
  contentMob:{padding:16},
};

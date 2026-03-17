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
import NDA from './pages/NDA';
import NeuralIntelligence from './pages/NeuralIntelligence';
import CRMAgent from './pages/CRMAgent';
import HubSpotPipeline from './pages/HubSpotPipeline';
import ROIAnalytics from './pages/ROIAnalytics';

const BASE = '/cw_carriers';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to={`${BASE}/login`} replace />;
}

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

function Sidebar({ open, onClose }) {
  const loc = useLocation();
  const user = getUser();
  const mob = useIsMobile();
  const [collapsed, setCollapsed] = useState({});
  const toggle = (section) => setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));

  const sections = [
    {
      id: 'home', label: 'HOME', icon: '\u2302', items: [
        { path: `${BASE}/dashboard`, label: 'Command Center', icon: '\u25A3' },
        { path: `${BASE}/roi`, label: 'ROI & Predictions', icon: '\uD83D\uDCC8', badge: 'AI' },
      ]
    },
    {
      id: 'hubspot', label: 'HUBSPOT CRM', icon: '\uD83D\uDD36', accent: '#ff7a59', items: [
        { path: `${BASE}/crm-agent`, label: 'CRM Agent', icon: '\uD83E\uDD16', badge: 'AI' },
        { path: `${BASE}/pipeline`, label: 'Pipeline', icon: '\u2B95' },
        { path: `${BASE}/contacts`, label: 'Contacts', icon: '\uD83D\uDC64' },
        { path: `${BASE}/calls`, label: 'Call History', icon: '\uD83D\uDCDE' },
        { path: `${BASE}/hubspot`, label: 'Sync Manager', icon: '\u21C4' },
      ]
    },
    {
      id: 'intelligence', label: 'INTELLIGENCE', icon: '\uD83E\uDDE0', accent: '#a78bfa', items: [
        { path: `${BASE}/neural`, label: 'Neural Intelligence', icon: '\u26A1', badge: 'AI' },
        { path: `${BASE}/nlp`, label: 'NLP Assistant', icon: '\uD83D\uDCAC', badge: 'AI' },
        { path: `${BASE}/analytics`, label: 'Analytics', icon: '\uD83D\uDCCA' },
        { path: `${BASE}/brokerage-analytics`, label: 'Brokerage KPIs', icon: '\uD83C\uDFAF' },
        { path: `${BASE}/reports`, label: 'Reports', icon: '\uD83D\uDCC4' },
      ]
    },
    {
      id: 'dispatch', label: 'DISPATCH', icon: '\uD83D\uDE9A', items: [
        { path: `${BASE}/loads`, label: 'Loads', icon: '\uD83D\uDCE6' },
        { path: `${BASE}/offers`, label: 'Carrier Offers', icon: '\uD83D\uDCB0' },
        { path: `${BASE}/tracking`, label: 'Check Calls', icon: '\u2611' },
        { path: `${BASE}/freight-matching`, label: 'Carrier Matching', icon: '\uD83D\uDD0D', badge: 'AI' },
        { path: `${BASE}/load-matching`, label: 'Load Matching', icon: '\u2194', badge: 'AI' },
        { path: `${BASE}/pricing`, label: 'Rate Intelligence', icon: '\uD83D\uDCB2', badge: 'AI' },
      ]
    },
    {
      id: 'portals', label: 'PORTALS', icon: '\uD83C\uDF10', items: [
        { path: `${BASE}/shipper`, label: 'Shipper Portal', icon: '\uD83C\uDFED' },
        { path: `${BASE}/carrier-portal`, label: 'Carrier Portal', icon: '\uD83D\uDE9B' },
      ]
    },
    {
      id: 'compliance', label: 'COMPLIANCE & DATA', icon: '\uD83D\uDEE1', items: [
        { path: `${BASE}/compliance`, label: 'FMCSA Compliance', icon: '\u2705' },
        { path: `${BASE}/ingestion`, label: 'Data Ingestion', icon: '\u2B07' },
        { path: `${BASE}/documents`, label: 'Document Vault', icon: '\uD83D\uDDC4' },
        { path: `${BASE}/tms`, label: 'TMS Bridge', icon: '\uD83D\uDD17' },
      ]
    },
    {
      id: 'admin', label: 'ADMIN', icon: '\u2699', items: [
        { path: `${BASE}/settings`, label: 'Settings', icon: '\u2699' },
        { path: `${BASE}/billing`, label: 'Billing', icon: '\uD83D\uDCB3' },
        { path: `${BASE}/token-estimator`, label: 'Token Estimator', icon: '\uD83E\uDE99' },
        { path: `${BASE}/contract-builder`, label: 'Contract Builder', icon: '\uD83D\uDCDD' },
        { path: `${BASE}/mcp-tools`, label: 'MCP Tools', icon: '\uD83D\uDEE0' },
        { path: `${BASE}/nda`, label: 'NDA Signing', icon: '\u270D' },
        { path: `${BASE}/demo`, label: 'Demo Data', icon: '\uD83C\uDFB2' },
        { path: `${BASE}/brokerage-demo`, label: 'Demo Workspaces', icon: '\uD83E\uDDEA' },
      ]
    },
    {
      id: 'docs', label: 'DOCS', icon: '\uD83D\uDCD6', items: [
        { path: '/proposals/RinglyPro-Platform-User-Guide.html', label: 'User Guide', icon: '\uD83D\uDCD8', ext: true },
        { path: '/proposals/CW-CARRIERS-System-Architecture-Document.html', label: 'Architecture', icon: '\uD83D\uDCD0', ext: true },
      ]
    },
  ];

  // Check if any item in a section is active
  const isSectionActive = (section) => section.items.some(item => loc.pathname === item.path);

  const ss = mob ? { ...S.sidebar, ...S.sidebarMob, transform: open ? 'translateX(0)' : 'translateX(-100%)' } : S.sidebar;
  return (
    <>
      {mob && open && <div style={S.overlay} onClick={onClose} />}
      <div style={ss}>
        {mob && <button onClick={onClose} style={S.closeBtn}>&times;</button>}
        <div style={S.logoArea}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="CW Carriers" style={S.logoImg} />
          <div style={S.tierBadge}>Full Suite</div>
        </div>
        <nav style={S.nav}>
          {sections.map(section => {
            const isOpen = !collapsed[section.id];
            const active = isSectionActive(section);
            return (
              <div key={section.id}>
                <button
                  onClick={() => toggle(section.id)}
                  style={{
                    ...S.sectionHeader,
                    ...(active && !isOpen ? { background: '#0EA5E908' } : {}),
                    ...(section.accent ? { color: section.accent } : {})
                  }}
                >
                  <span style={S.sectionIcon}>{section.icon}</span>
                  <span style={S.sectionText}>{section.label}</span>
                  {active && !isOpen && <span style={S.activeDot} />}
                  <span style={{ ...S.chevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u276F'}</span>
                </button>
                {isOpen && (
                  <div style={S.sectionItems}>
                    {section.items.map(item => (
                      item.ext ? (
                        <a key={item.path} href={item.path} style={S.navItem} target="_blank" rel="noopener noreferrer">
                          <span style={S.itemIcon}>{item.icon}</span>
                          <span style={S.itemLabel}>{item.label}</span>
                          <span style={S.extBadge}>EXT</span>
                        </a>
                      ) : (
                        <Link key={item.path} to={item.path} onClick={mob ? onClose : undefined}
                          style={{ ...S.navItem, ...(loc.pathname === item.path ? S.navActive : {}) }}>
                          <span style={S.itemIcon}>{item.icon}</span>
                          <span style={S.itemLabel}>{item.label}</span>
                          {item.badge && <span style={S.aiBadge}>{item.badge}</span>}
                        </Link>
                      )
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div style={S.footer}>
          <div style={S.userRole}>ADMIN</div>
          <div style={S.userInfo}>{user?.email}</div>
          <button onClick={() => { logout(); window.location.href = `${BASE}/login`; }} style={S.logoutBtn}>Logout</button>
        </div>
      </div>
    </>
  );
}

function MobileHeader({ onOpen }) {
  return (<div style={S.mobHeader}><button onClick={onOpen} style={S.hamburger}><span style={S.hLine}/><span style={S.hLine}/><span style={S.hLine}/></button><span style={S.mobTitle}>CW CARRIERS</span></div>);
}

function Layout({ children }) {
  const [so, setSo] = useState(false);
  const mob = useIsMobile();
  return (<div style={S.layout}><Sidebar open={so} onClose={() => setSo(false)} /><div style={mob ? S.mainMob : S.main}>{mob && <MobileHeader onOpen={() => setSo(true)} />}<div style={mob ? S.contentMob : S.content}>{children}</div></div></div>);
}

export default function App() {
  return (
    <BrowserRouter>
      <style>{`* { margin:0;padding:0;box-sizing:border-box; } body { font-family:'DM Sans',sans-serif;background:#0D1117;color:#E6EDF3; } h1,h2,h3,h4 { font-family:'Bebas Neue',sans-serif;letter-spacing:1px; } input,select,textarea,button { font-family:'DM Sans',sans-serif; } ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#161B22} ::-webkit-scrollbar-thumb{background:#0EA5E9;border-radius:3px} a{text-decoration:none;color:inherit}`}</style>
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
        <Route path={`${BASE}/nda`} element={<ProtectedRoute><Layout><NDA /></Layout></ProtectedRoute>} />
        {/* Intelligence routes */}
        <Route path={`${BASE}/neural`} element={<ProtectedRoute><Layout><NeuralIntelligence /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/crm-agent`} element={<ProtectedRoute><Layout><CRMAgent /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/pipeline`} element={<ProtectedRoute><Layout><HubSpotPipeline /></Layout></ProtectedRoute>} />
        <Route path={`${BASE}/roi`} element={<ProtectedRoute><Layout><ROIAnalytics /></Layout></ProtectedRoute>} />
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
  logoArea:{padding:16,borderBottom:'1px solid #21262D',textAlign:'center'},
  logoImg:{width:'100%',maxWidth:200,height:'auto',marginBottom:4},
  tierBadge:{display:'inline-block',marginTop:4,padding:'3px 10px',background:'#0EA5E922',color:'#0EA5E9',borderRadius:12,fontSize:10,fontWeight:600,letterSpacing:1,textTransform:'uppercase'},
  nav:{flex:1,padding:'8px 0',overflowY:'auto'},
  // Section header (collapsible)
  sectionHeader:{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 16px',fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#0EA5E9',background:'none',border:'none',cursor:'pointer',transition:'all 0.15s',fontFamily:'inherit'},
  sectionIcon:{fontSize:13,width:18,textAlign:'center',flexShrink:0},
  sectionText:{flex:1,textAlign:'left'},
  chevron:{fontSize:9,color:'#484F58',transition:'transform 0.2s',marginLeft:'auto'},
  activeDot:{width:6,height:6,borderRadius:'50%',background:'#0EA5E9',flexShrink:0},
  sectionItems:{paddingBottom:4},
  // Nav items
  navItem:{display:'flex',alignItems:'center',gap:8,padding:'8px 16px 8px 28px',fontSize:13,color:'#8B949E',cursor:'pointer',transition:'all 0.15s',borderLeft:'3px solid transparent',textDecoration:'none'},
  navActive:{color:'#E6EDF3',background:'#0EA5E915',borderLeftColor:'#0EA5E9'},
  itemIcon:{fontSize:14,width:18,textAlign:'center',flexShrink:0,opacity:0.7},
  itemLabel:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  aiBadge:{marginLeft:'auto',padding:'1px 6px',background:'linear-gradient(135deg,#8b5cf6,#06b6d4)',color:'#fff',borderRadius:4,fontSize:8,fontWeight:700,letterSpacing:0.5,flexShrink:0},
  extBadge:{marginLeft:'auto',padding:'1px 5px',background:'#30363D',color:'#8B949E',borderRadius:4,fontSize:9,fontWeight:600,flexShrink:0},
  footer:{padding:'12px 16px',borderTop:'1px solid #21262D'},
  userRole:{fontSize:10,color:'#0EA5E9',fontWeight:600,letterSpacing:1,marginBottom:4},
  userInfo:{fontSize:11,color:'#8B949E',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis'},
  logoutBtn:{background:'none',border:'1px solid #30363D',color:'#8B949E',padding:'6px 12px',borderRadius:6,cursor:'pointer',fontSize:12,width:'100%',fontFamily:'inherit'},
  main:{flex:1,marginLeft:260,minHeight:'100vh'},
  content:{padding:24},
  mainMob:{flex:1,marginLeft:0,minHeight:'100vh'},
  contentMob:{padding:16},
};

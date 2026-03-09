import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { getUser } from '../services/auth';

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const user = getUser();
  useEffect(() => { api.get('/tiers').then(r => setStats(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <h1 style={s.title}>COMMAND CENTER</h1>
      <p style={s.sub}>Welcome, {user?.full_name || user?.email}</p>
      <div style={s.kpiGrid}>
        {[{l:'Active Tier',v:stats.current_tier?.toUpperCase()||'FULL',c:'#0EA5E9'},{l:'Modules',v:stats.tiers?.find(t=>t.is_active)?.modules?.length||'-',c:'#10B981'},{l:'MCP Tools',v:'18',c:'#F59E0B'},{l:'Portals',v:'3',c:'#A855F7'}].map((k,i)=>(
          <div key={i} style={s.kpi}><div style={{...s.kpiV,color:k.c}}>{k.v}</div><div style={s.kpiL}>{k.l}</div></div>
        ))}
      </div>
      <div style={s.grid}>
        <div style={s.sec}>
          <h2 style={s.secT}>QUICK ACTIONS</h2>
          <div style={s.aGrid}>
            {[{l:'Request Quote',h:'/logistics/shipper'},{l:'Find Loads',h:'/logistics/carrier'},{l:'Upload Document',h:'/logistics/documents'},{l:'Verify Carrier',h:'/logistics/compliance'},{l:'Match Freight',h:'/logistics/matching'},{l:'MCP Tools',h:'/logistics/tools'}].map((a,i)=>(
              <a key={i} href={a.h} style={s.aCard}><span>{a.l}</span></a>
            ))}
          </div>
        </div>
        <div style={s.sec}>
          <h2 style={s.secT}>PLATFORM MODULES</h2>
          {[{n:'Shipper Portal',d:'Quote requests, shipment tracking, claims',t:'Professional',c:'#0EA5E9'},{n:'Carrier Portal',d:'Available loads, bidding, payments',t:'Professional',c:'#0EA5E9'},{n:'Document Vault',d:'BOLs, PODs, insurance, contracts',t:'Professional',c:'#0EA5E9'},{n:'FMCSA Compliance',d:'Authority, safety scores, insurance',t:'Enterprise',c:'#10B981'},{n:'Freight Matching',d:'AI-powered carrier matching',t:'Enterprise',c:'#10B981'},{n:'Carriers CRM',d:'15-module freight brokerage CRM',t:'Starter',c:'#8B949E'},{n:'Warehouse OPS',d:'Inventory + OEE monitoring',t:'Add-on',c:'#F59E0B'}].map((m,i)=>(
            <div key={i} style={s.mod}><div style={s.modN}>{m.n}</div><div style={s.modD}>{m.d}</div><span style={{...s.modT,color:m.c,borderColor:m.c}}>{m.t}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
const s={title:{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:'#0EA5E9',letterSpacing:2,marginBottom:4},sub:{color:'#8B949E',fontSize:14,marginBottom:24},kpiGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:16,marginBottom:28},kpi:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,padding:20,textAlign:'center'},kpiV:{fontSize:28,fontFamily:"'Bebas Neue',sans-serif"},kpiL:{fontSize:11,color:'#8B949E',marginTop:4,textTransform:'uppercase',letterSpacing:1},grid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(350px,1fr))',gap:20},sec:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,padding:20},secT:{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:'#E6EDF3',letterSpacing:1,marginBottom:16,borderBottom:'1px solid #21262D',paddingBottom:10},aGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10},aCard:{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',background:'#0D1117',border:'1px solid #21262D',borderRadius:8,color:'#E6EDF3',fontSize:13},mod:{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#0D1117',borderRadius:8,border:'1px solid #21262D',marginBottom:8},modN:{fontSize:14,fontWeight:600,minWidth:130},modD:{fontSize:12,color:'#8B949E',flex:1},modT:{padding:'2px 8px',border:'1px solid',borderRadius:10,fontSize:10,fontWeight:600,whiteSpace:'nowrap'}};

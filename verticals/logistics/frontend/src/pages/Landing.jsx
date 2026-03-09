import React from 'react';
const BASE = '/logistics';
export default function Landing() {
  return (
    <div style={s.wrapper}>
      <div style={s.hero}>
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="RinglyPro Logistics" style={s.logo} />
        <h1 style={s.title}>RINGLYPRO LOGISTICS</h1>
        <p style={s.sub}>Next-Generation Freight Brokerage & Warehouse Management Platform</p>
        <p style={s.desc}>AI-Powered Freight Matching | Voice AI Carrier Coverage | Real-Time Tracking | FMCSA Compliance | Document Management</p>
        <div style={s.tiers}>
          {[{name:'Freight CRM',tier:'Starter',desc:'Loads, Contacts, Calls, Billing, Analytics',c:'#8B949E'},{name:'Freight Pro',tier:'Professional',desc:'+ Shipper Portal, Carrier Portal, Document Vault',c:'#0EA5E9'},{name:'Logistics AI',tier:'Enterprise',desc:'+ FMCSA Compliance, Smart Freight Matching, AI Command Center',c:'#10B981'},{name:'Full Suite',tier:'Complete',desc:'All modules + Warehouse OPS + OEE Monitoring',c:'#F59E0B'}].map(t=>(
            <div key={t.tier} style={{...s.tierCard,borderColor:t.c}}><div style={{...s.tierName,color:t.c}}>{t.tier}</div><div style={s.tierProduct}>{t.name}</div><div style={s.tierDesc}>{t.desc}</div></div>
          ))}
        </div>
        <div style={s.actions}><a href={`${BASE}/login`} style={s.loginBtn}>Sign In</a><a href={`${BASE}/login`} style={s.regBtn}>Get Started Free</a></div>
        <div style={s.powered}>Powered by RinglyPro AI | MCP Tool Architecture | Rachel Voice AI</div>
      </div>
    </div>
  );
}
const s={wrapper:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0D1117 0%,#0c1525 50%,#0D1117 100%)',padding:20},hero:{textAlign:'center',maxWidth:900,width:'100%'},logo:{width:'100%',maxWidth:280,height:'auto',marginBottom:20},title:{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,color:'#0EA5E9',letterSpacing:5,marginBottom:8},sub:{fontSize:18,color:'#E6EDF3',marginBottom:8},desc:{fontSize:13,color:'#8B949E',marginBottom:40},tiers:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:40},tierCard:{background:'#161B22',border:'1px solid',borderRadius:10,padding:20,textAlign:'left'},tierName:{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:6},tierProduct:{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#E6EDF3',letterSpacing:1,marginBottom:8},tierDesc:{fontSize:12,color:'#8B949E',lineHeight:1.5},actions:{display:'flex',gap:16,justifyContent:'center',marginBottom:40},loginBtn:{padding:'12px 32px',background:'#0EA5E9',color:'#fff',borderRadius:8,fontSize:15,fontWeight:600},regBtn:{padding:'12px 32px',background:'transparent',border:'1px solid #0EA5E9',color:'#0EA5E9',borderRadius:8,fontSize:15,fontWeight:600},powered:{fontSize:11,color:'#30363D'}};

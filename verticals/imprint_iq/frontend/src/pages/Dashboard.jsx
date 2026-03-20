import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { authHeader } from '../services/auth';

const API = '/imprint_iq/api';

export default function Dashboard() {
  const [kpis, setKpis] = useState([]);
  const [neural, setNeural] = useState(null);
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/dashboard/kpis`, { headers: authHeader() }).then(r => setKpis(r.data.kpis)).catch(() => {}),
      axios.get(`${API}/neural/dashboard`).then(r => setNeural(r.data)).catch(() => {}),
      axios.get(`${API}/dashboard/recent-orders`, { headers: authHeader() }).then(r => setOrders(r.data.orders)).catch(() => {}),
      axios.get(`${API}/dashboard/recent-calls`, { headers: authHeader() }).then(r => setCalls(r.data.calls)).catch(() => {}),
      axios.get(`${API}/dashboard/agents`, { headers: authHeader() }).then(r => setAgents(r.data.agents)).catch(() => {})
    ]).finally(() => setLoading(false));
  }, []);

  const scoreColor = (s) => s >= 80 ? '#238636' : s >= 65 ? '#1A9FE0' : s >= 45 ? '#C8962A' : '#F85149';
  const stageColor = { received:'#1A9FE0', in_production:'#C8962A', qc_check:'#A371F7', shipped:'#238636', delivered:'#238636' };

  if (loading) return <div style={{ padding:40, color:'#8B949E', textAlign:'center' }}>Loading ImprintIQ Dashboard...</div>;

  return (
    <div>
      {/* KPI Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D' }}>
            <div style={{ fontSize:24, marginBottom:4 }}>{k.icon}</div>
            <div style={{ color:'#E6EDF3', fontSize:28, fontFamily:'Bebas Neue', letterSpacing:1 }}>{k.value}</div>
            <div style={{ color:'#8B949E', fontSize:12, marginTop:2 }}>{k.label}</div>
            <div style={{ color:'#484F58', fontSize:11, marginTop:4 }}>{k.detail}</div>
          </div>
        ))}
      </div>

      {/* Neural Score + Revenue Row */}
      {neural && (
        <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16, marginBottom:24 }}>
          <div style={{ background:'#161B22', borderRadius:12, padding:20, border:'1px solid #30363D', textAlign:'center' }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#21262D" strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={scoreColor(neural.healthScore)} strokeWidth="8"
                strokeDasharray={`${neural.healthScore * 3.27} 327`} strokeLinecap="round"
                transform="rotate(-90 60 60)" style={{ transition:'stroke-dasharray 1s ease' }} />
              <text x="60" y="55" textAnchor="middle" fill="#E6EDF3" fontSize="28" fontFamily="Bebas Neue">{neural.healthScore}</text>
              <text x="60" y="72" textAnchor="middle" fill="#8B949E" fontSize="10">{neural.scoreLabel}</text>
            </svg>
            <div style={{ color:'#8B949E', fontSize:11, marginTop:8 }}>NEURAL HEALTH SCORE</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {[
              { label:'Revenue at Risk', value:`$${(neural.revenueAtRisk||0).toLocaleString()}`, color:'#F85149' },
              { label:'Recovery Potential', value:`$${(neural.recoveryPotential||0).toLocaleString()}`, color:'#238636' },
              { label:'Pipeline Value', value:`$${Math.round(neural.pipelineValue||0).toLocaleString()}`, color:'#1A9FE0' },
              { label:'Won (30d)', value:`$${Math.round(neural.wonRevenue||0).toLocaleString()}`, color:'#C8962A' }
            ].map((m, i) => (
              <div key={i} style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D', borderLeft:`3px solid ${m.color}` }}>
                <div style={{ color:m.color, fontSize:22, fontFamily:'Bebas Neue' }}>{m.value}</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 Health Panels */}
      {neural && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:24 }}>
          {neural.panels?.map((p, i) => (
            <div key={i} style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ color:'#E6EDF3', fontSize:13, fontWeight:600 }}>{p.name}</span>
                <span style={{ color:scoreColor(p.score), fontSize:20, fontFamily:'Bebas Neue' }}>{p.score}</span>
              </div>
              <div style={{ background:'#21262D', borderRadius:4, height:6, overflow:'hidden' }}>
                <div style={{ background:scoreColor(p.score), height:'100%', width:`${p.score}%`, borderRadius:4, transition:'width 1s ease' }} />
              </div>
              <div style={{ color:'#8B949E', fontSize:11, marginTop:8, lineHeight:1.4 }}>{p.topFinding}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Agents Grid */}
      <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:12, letterSpacing:1 }}>AI AGENTS</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10, marginBottom:24 }}>
        {agents.map((a, i) => (
          <div key={i} style={{ background:'#161B22', borderRadius:10, padding:14, border:'1px solid #30363D', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:28 }}>{a.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600 }}>{a.name}</div>
              <div style={{ color:'#8B949E', fontSize:10, marginTop:2 }}>{a.description?.substring(0, 40)}...</div>
            </div>
            <div style={{ width:8, height:8, borderRadius:'50%', background: a.status === 'active' ? '#238636' : '#484F58' }} />
          </div>
        ))}
      </div>

      {/* Recent Orders + Calls */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D' }}>
          <h4 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:16, marginBottom:12 }}>RECENT ORDERS</h4>
          {orders.slice(0, 6).map((o, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i < 5 ? '1px solid #21262D' : 'none' }}>
              <div>
                <div style={{ color:'#E6EDF3', fontSize:13 }}>{o.order_number}</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>{o.company_name || o.title}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ color:'#C8962A', fontSize:13, fontFamily:'Bebas Neue' }}>${parseFloat(o.total_amount).toLocaleString()}</div>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:(stageColor[o.stage]||'#484F58')+'22', color:stageColor[o.stage]||'#8B949E' }}>{o.stage}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D' }}>
          <h4 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:16, marginBottom:12 }}>RECENT CALLS</h4>
          {calls.slice(0, 6).map((c, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i < 5 ? '1px solid #21262D' : 'none' }}>
              <div>
                <div style={{ color:'#E6EDF3', fontSize:13 }}>{c.company_name || c.phone_from || 'Unknown'}</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>{c.agent_name} &bull; {c.direction} &bull; {c.duration_sec}s</div>
              </div>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background: c.outcome === 'completed' ? '#23863622' : c.outcome === 'missed' ? '#F8514922' : '#484F5822', color: c.outcome === 'completed' ? '#238636' : c.outcome === 'missed' ? '#F85149' : '#8B949E' }}>{c.outcome}</span>
            </div>
          ))}
        </div>
      </div>

      {/* OBD Codes */}
      {neural?.obdCodes && (
        <div style={{ marginTop:24 }}>
          <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:12, letterSpacing:1 }}>ON-BOARD DIAGNOSTICS</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
            {neural.obdCodes.map((obd, i) => (
              <div key={i} style={{ background:'#161B22', borderRadius:10, padding:12, border:'1px solid #30363D', borderLeft:`3px solid ${obd.status === 'ok' ? '#238636' : '#C8962A'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color: obd.status === 'ok' ? '#238636' : '#C8962A', fontSize:11, fontWeight:700 }}>{obd.code}</span>
                  <span style={{ color:'#8B949E', fontSize:10 }}>{obd.reading}</span>
                </div>
                <div style={{ color:'#E6EDF3', fontSize:12, fontWeight:600 }}>{obd.system}</div>
                <div style={{ color:'#C8962A', fontSize:18, fontFamily:'Bebas Neue', marginTop:4 }}>{obd.value} <span style={{ fontSize:10, color:'#8B949E' }}>{obd.label}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = '/imprint_iq/api';

export default function NeuralIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activatedTreatments, setActivatedTreatments] = useState({});
  const [expandedTreatment, setExpandedTreatment] = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/neural/dashboard`).then(r => {
        setData(r.data);
        const map = {};
        r.data.findings?.forEach(f => { if (f.treatment?.active) map[f.treatment.treatment_type] = true; });
        setActivatedTreatments(map);
      }),
      axios.get(`${API}/neural/treatments`).then(r => {
        const map = {};
        r.data.treatments?.forEach(t => { if (t.is_active) map[t.treatment_type] = true; });
        setActivatedTreatments(prev => ({ ...prev, ...map }));
      })
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleTreatment = async (type) => {
    const newState = !activatedTreatments[type];
    setActivatedTreatments(prev => ({ ...prev, [type]: newState }));
    try {
      await axios.post(`${API}/neural/treatments/activate`, { treatment_type: type, active: newState });
    } catch (err) {
      setActivatedTreatments(prev => ({ ...prev, [type]: !newState }));
    }
  };

  const scoreColor = (s) => s >= 80 ? '#238636' : s >= 65 ? '#1A9FE0' : s >= 45 ? '#C8962A' : '#F85149';
  const sevColor = { CRITICAL:'#F85149', WARNING:'#C8962A', OPPORTUNITY:'#238636' };
  const badgeStyle = (type) => ({
    trigger: { background:'#1A4FA822', color:'#1A9FE0', border:'1px solid #1A4FA844' },
    condition: { background:'#A371F722', color:'#A371F7', border:'1px solid #A371F744' },
    action: { background:'#23863622', color:'#238636', border:'1px solid #23863644' }
  }[type] || {});

  if (loading) return <div style={{ padding:40, color:'#8B949E', textAlign:'center' }}>Loading Neural Intelligence...</div>;
  if (!data) return <div style={{ padding:40, color:'#F85149', textAlign:'center' }}>Failed to load Neural data</div>;

  return (
    <div>
      {/* Hero: Score Ring + Revenue Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:20, marginBottom:28 }}>
        <div style={{ background:'#161B22', borderRadius:16, padding:24, border:'1px solid #30363D', textAlign:'center' }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" fill="none" stroke="#21262D" strokeWidth="10" />
            <circle cx="70" cy="70" r="60" fill="none" stroke={scoreColor(data.healthScore)} strokeWidth="10"
              strokeDasharray={`${data.healthScore * 3.77} 377`} strokeLinecap="round"
              transform="rotate(-90 70 70)" style={{ transition:'stroke-dasharray 1.5s ease' }} />
            <text x="70" y="65" textAnchor="middle" fill="#E6EDF3" fontSize="36" fontFamily="Bebas Neue">{data.healthScore}</text>
            <text x="70" y="84" textAnchor="middle" fill={scoreColor(data.healthScore)} fontSize="11" fontWeight="600">{data.scoreLabel}</text>
          </svg>
          <div style={{ color:'#8B949E', fontSize:11, marginTop:8 }}>OVERALL HEALTH</div>
          {data.trend && <div style={{ color: data.trend.direction === 'up' ? '#238636' : '#F85149', fontSize:12, marginTop:6 }}>{data.trend.direction === 'up' ? '▲' : '▼'} {data.trend.points} pts ({data.trend.period})</div>}
        </div>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12 }}>
            {[
              { label:'Revenue at Risk', value:`$${(data.revenueAtRisk||0).toLocaleString()}`, color:'#F85149' },
              { label:'Recovery Potential', value:`$${(data.recoveryPotential||0).toLocaleString()}`, color:'#238636' },
              { label:'Pipeline', value:`$${Math.round(data.pipelineValue||0).toLocaleString()}`, color:'#1A9FE0' },
              { label:'Won Revenue (30d)', value:`$${Math.round(data.wonRevenue||0).toLocaleString()}`, color:'#C8962A' }
            ].map((m, i) => (
              <div key={i} style={{ background:'#161B22', borderRadius:12, padding:16, border:'1px solid #30363D', borderTop:`3px solid ${m.color}` }}>
                <div style={{ color:m.color, fontSize:24, fontFamily:'Bebas Neue' }}>{m.value}</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>{m.label}</div>
              </div>
            ))}
          </div>
          {/* Connection Badges */}
          <div style={{ display:'flex', gap:10 }}>
            {data.connections?.map((c, i) => (
              <div key={i} style={{ background:'#161B22', borderRadius:8, padding:'8px 14px', border:'1px solid #30363D', display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                <span>{c.icon}</span>
                <span style={{ color:'#E6EDF3' }}>{c.name}</span>
                <div style={{ width:8, height:8, borderRadius:'50%', background: c.status === 'connected' ? '#238636' : '#C8962A' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6 Health Panels */}
      <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:12, letterSpacing:1 }}>HEALTH PANELS</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginBottom:28 }}>
        {data.panels?.map((p, i) => (
          <div key={i} style={{ background:'#161B22', borderRadius:12, padding:18, border:'1px solid #30363D' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:600 }}>{p.name}</span>
              <span style={{ color:scoreColor(p.score), fontSize:24, fontFamily:'Bebas Neue' }}>{p.score}</span>
            </div>
            <div style={{ background:'#21262D', borderRadius:4, height:8, overflow:'hidden', marginBottom:10 }}>
              <div style={{ background:scoreColor(p.score), height:'100%', width:`${p.score}%`, borderRadius:4, transition:'width 1s ease' }} />
            </div>
            <div style={{ color:'#8B949E', fontSize:12, lineHeight:1.5 }}>{p.topFinding}</div>
          </div>
        ))}
      </div>

      {/* OBD Codes */}
      <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:12, letterSpacing:1 }}>ON-BOARD DIAGNOSTICS</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:28 }}>
        {data.obdCodes?.map((obd, i) => (
          <div key={i} style={{ background:'#161B22', borderRadius:10, padding:14, border:'1px solid #30363D', borderLeft:`3px solid ${obd.status === 'ok' ? '#238636' : '#C8962A'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color: obd.status === 'ok' ? '#238636' : '#C8962A', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>{obd.code}</span>
              <span style={{ color:'#8B949E', fontSize:10 }}>{obd.reading}</span>
            </div>
            <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600 }}>{obd.system}</div>
            <div style={{ color:'#C8962A', fontSize:20, fontFamily:'Bebas Neue', marginTop:6 }}>{obd.value} <span style={{ fontSize:10, color:'#8B949E' }}>{obd.label}</span></div>
          </div>
        ))}
      </div>

      {/* Findings + Treatments */}
      <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:12, letterSpacing:1 }}>DIAGNOSTIC FINDINGS</h3>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {data.findings?.map((f, i) => (
          <div key={i} style={{ background:'#161B22', borderRadius:12, padding:20, border:'1px solid #30363D', borderLeft:`4px solid ${sevColor[f.severity]||'#484F58'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:(sevColor[f.severity]||'#484F58')+'22', color:sevColor[f.severity], fontWeight:700, marginRight:8 }}>{f.severity}</span>
                <span style={{ fontSize:10, color:'#8B949E' }}>{f.source}</span>
              </div>
              <span style={{ color:'#F85149', fontSize:12, fontWeight:600 }}>{f.dollarImpact}</span>
            </div>
            <div style={{ color:'#E6EDF3', fontSize:16, fontWeight:600, marginBottom:6 }}>{f.title}</div>
            <div style={{ color:'#8B949E', fontSize:13, lineHeight:1.5, marginBottom:12 }}>{f.explanation}</div>

            {f.treatment && (
              <>
                <button onClick={() => setExpandedTreatment(expandedTreatment === f.id ? null : f.id)}
                  style={{ background:'none', border:'1px solid #30363D', borderRadius:6, padding:'6px 14px', color:'#C8962A', fontSize:12, cursor:'pointer', marginRight:8 }}>
                  {expandedTreatment === f.id ? 'Hide Treatment' : 'Show Treatment Workflow'}
                </button>

                {expandedTreatment === f.id && (
                  <div style={{ marginTop:12, padding:16, background:'#0D1117', borderRadius:10, border:'1px solid #21262D' }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                      {f.treatment.workflow?.map((step, si) => (
                        <div key={si} style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ ...badgeStyle(step.type), fontSize:10, padding:'3px 10px', borderRadius:6, fontWeight:600, minWidth:70, textAlign:'center', textTransform:'uppercase' }}>{step.type}</span>
                          <span style={{ color:'#C9D1D9', fontSize:12 }}>{step.text}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ color:'#238636', fontSize:12, marginBottom:12, padding:'8px 12px', background:'#23863611', borderRadius:6 }}>
                      Projected: {f.treatment.projection}
                    </div>
                    <button onClick={() => toggleTreatment(f.treatment.treatment_type)}
                      style={{
                        background: activatedTreatments[f.treatment.treatment_type] ? '#F8514933' : 'linear-gradient(135deg,#C8962A,#A67A1E)',
                        color: activatedTreatments[f.treatment.treatment_type] ? '#F85149' : '#fff',
                        border:'none', borderRadius:8, padding:'10px 24px', fontSize:13, fontWeight:600, cursor:'pointer'
                      }}>
                      {activatedTreatments[f.treatment.treatment_type] ? 'Deactivate Treatment' : 'Activate Treatment'}
                    </button>
                    {activatedTreatments[f.treatment.treatment_type] && (
                      <span style={{ color:'#C8962A', fontSize:11, marginLeft:12 }}>Treatment requires consulting license to execute</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {(!data.findings || data.findings.length === 0) && (
          <div style={{ background:'#161B22', borderRadius:12, padding:40, border:'1px solid #30363D', textAlign:'center', color:'#8B949E' }}>
            No diagnostic findings detected. All systems nominal.
          </div>
        )}
      </div>
    </div>
  );
}

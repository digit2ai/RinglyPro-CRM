import React, { useState, useEffect } from 'react';
import api from '../services/api';
export default function CarrierPortal() {
  const [tab, setTab] = useState('loads');
  const [loads, setLoads] = useState([]);
  const [bids, setBids] = useState([]);
  const [bf, setBf] = useState({load_id:'',rate:'',notes:''});
  useEffect(()=>{load();}, []);
  const load = async () => {
    const [r1,r2] = await Promise.all([api.get('/carrier/loads').catch(()=>({data:{data:[]}})),api.get('/carrier/bids').catch(()=>({data:{data:[]}}))]);
    setLoads(r1.data?.data||[]); setBids(r2.data?.data||[]);
  };
  const submitBid = async (e) => {
    e.preventDefault(); try { await api.post('/carrier/bids',bf); alert('Bid submitted!'); setBf({load_id:'',rate:'',notes:''}); load(); } catch(e){alert(e.response?.data?.error||'Failed');}
  };
  return (<div>
    <h1 style={S.title}>CARRIER PORTAL</h1>
    <div style={S.tabs}>{['loads','bid','bids'].map(t=>(<button key={t} onClick={()=>setTab(t)} style={tab===t?S.tabA:S.tab}>{t==='bid'?'Submit Bid':t.charAt(0).toUpperCase()+t.slice(1)}</button>))}</div>
    {tab==='loads'&&<div style={S.tw}><table style={S.table}><thead><tr><th style={S.th}>REF</th><th style={S.th}>ORIGIN</th><th style={S.th}>DEST</th><th style={S.th}>FREIGHT</th><th style={S.th}>RATE</th><th style={S.th}>BIDS</th><th style={S.th}>ACTION</th></tr></thead><tbody>{loads.map(l=>(<tr key={l.id} style={S.tr}><td style={S.td}>{l.load_ref}</td><td style={S.td}>{l.origin}</td><td style={S.td}>{l.destination}</td><td style={S.td}>{l.freight_type}</td><td style={S.td}>${l.rate_usd||'-'}</td><td style={S.td}>{l.total_bids||0}</td><td style={S.td}><button style={S.sm} onClick={()=>{setBf({load_id:l.id,rate:l.rate_usd||'',notes:''});setTab('bid');}}>Bid</button></td></tr>))}{loads.length===0&&<tr><td colSpan={7} style={{...S.td,textAlign:'center',color:'#8B949E'}}>No loads</td></tr>}</tbody></table></div>}
    {tab==='bid'&&<div style={S.fc}><h3 style={S.ft}>Submit a Bid</h3><form onSubmit={submitBid}><input style={S.input} type="number" placeholder="Load ID" value={bf.load_id} onChange={e=>setBf({...bf,load_id:e.target.value})} required /><input style={S.input} type="number" step="0.01" placeholder="Rate ($)" value={bf.rate} onChange={e=>setBf({...bf,rate:e.target.value})} required /><textarea style={{...S.input,height:60}} placeholder="Notes" value={bf.notes} onChange={e=>setBf({...bf,notes:e.target.value})} /><button style={S.btn} type="submit">Submit Bid</button></form></div>}
    {tab==='bids'&&<div style={S.tw}><table style={S.table}><thead><tr><th style={S.th}>LOAD</th><th style={S.th}>LANE</th><th style={S.th}>BID</th><th style={S.th}>STATUS</th><th style={S.th}>DATE</th></tr></thead><tbody>{bids.map(b=>(<tr key={b.id} style={S.tr}><td style={S.td}>{b.load_ref||b.load_id}</td><td style={S.td}>{b.origin} → {b.destination}</td><td style={S.td}>${b.offered_rate}</td><td style={S.td}><span style={S.badge}>{b.status}</span></td><td style={S.td}>{new Date(b.created_at).toLocaleDateString()}</td></tr>))}</tbody></table></div>}
  </div>);
}
const S={title:{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#0EA5E9',letterSpacing:2,marginBottom:16},tabs:{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'},tab:{padding:'8px 16px',background:'none',border:'1px solid #30363D',color:'#8B949E',borderRadius:6,cursor:'pointer',fontSize:13},tabA:{padding:'8px 16px',background:'#0EA5E922',border:'1px solid #0EA5E9',color:'#0EA5E9',borderRadius:6,cursor:'pointer',fontSize:13,fontWeight:600},tw:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,overflow:'auto'},table:{width:'100%',borderCollapse:'collapse',minWidth:600},th:{padding:'12px 14px',textAlign:'left',fontSize:11,color:'#8B949E',fontWeight:600,letterSpacing:1,borderBottom:'1px solid #21262D'},tr:{borderBottom:'1px solid #21262D'},td:{padding:'10px 14px',fontSize:13},badge:{padding:'3px 8px',borderRadius:10,fontSize:11,fontWeight:600,textTransform:'uppercase',background:'#30363D',color:'#8B949E'},fc:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,padding:24,maxWidth:500},ft:{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'#E6EDF3',marginBottom:16},input:{width:'100%',padding:'10px 12px',marginBottom:12,background:'#0D1117',border:'1px solid #30363D',borderRadius:6,color:'#E6EDF3',fontSize:13,outline:'none'},btn:{padding:'10px 24px',background:'#0EA5E9',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer'},sm:{padding:'4px 10px',background:'#0EA5E9',color:'#fff',border:'none',borderRadius:4,fontSize:11,cursor:'pointer'}};

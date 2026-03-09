import React, { useState, useEffect } from 'react';
import api from '../services/api';
export default function MCPTools() {
  const [tools, setTools] = useState([]);
  const [sel, setSel] = useState(null);
  const [inp, setInp] = useState('{}');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{api.get('/tools/list').then(r=>setTools(r.data?.tools||[])).catch(()=>{});}, []);
  const call = async () => { if(!sel) return; setLoading(true); setRes(null); try { const i=JSON.parse(inp); const {data}=await api.post('/tools/call',{tool:sel.name,input:i}); setRes(data); } catch(e){setRes({error:e.response?.data?.error||e.message});} setLoading(false); };
  const mc = {shipper:'#0EA5E9',carrier:'#10B981',documents:'#F59E0B',fmcsa:'#EF4444',matching:'#A855F7'};
  return (<div>
    <h1 style={S.title}>MCP TOOL CONSOLE</h1>
    <p style={{color:'#8B949E',fontSize:13,marginBottom:20}}>{tools.length} tools available</p>
    <div style={S.grid}>
      <div style={S.list}><h3 style={S.st}>TOOLS</h3>{tools.map(t=>(<div key={t.name} onClick={()=>{setSel(t);setInp(JSON.stringify(Object.fromEntries(t.parameters.map(p=>[p,''])),null,2));setRes(null);}} style={{...S.ti,...(sel?.name===t.name?S.tia:{})}}><div style={{fontSize:13,fontWeight:600,color:'#E6EDF3',fontFamily:'monospace'}}>{t.name}</div><div style={{fontSize:11,color:'#8B949E',marginTop:3}}>{t.description}</div><span style={{fontSize:10,fontWeight:600,textTransform:'uppercase',color:mc[t.module]||'#8B949E'}}>{t.module}</span></div>))}</div>
      <div style={S.exec}>{sel?(<><h3 style={S.st}>{sel.name}</h3><p style={{color:'#8B949E',fontSize:13,marginBottom:16}}>{sel.description}</p><div style={{fontSize:12,color:'#8B949E',marginBottom:6,fontWeight:600}}>Input JSON:</div><textarea style={S.ta} value={inp} onChange={e=>setInp(e.target.value)} rows={8} /><button style={S.btn} onClick={call} disabled={loading}>{loading?'Executing...':'Execute Tool'}</button>{res&&<div style={S.rb}><div style={S.rh}>Result {res.duration_ms?`(${res.duration_ms}ms)`:''}</div><pre style={S.pre}>{JSON.stringify(res,null,2)}</pre></div>}</>):(<div style={{color:'#8B949E',padding:40,textAlign:'center'}}>Select a tool</div>)}</div>
    </div>
  </div>);
}
const S={title:{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#0EA5E9',letterSpacing:2,marginBottom:4},grid:{display:'grid',gridTemplateColumns:'320px 1fr',gap:20},list:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,padding:16,maxHeight:'75vh',overflowY:'auto'},st:{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:'#E6EDF3',letterSpacing:1,marginBottom:12},ti:{padding:'10px 12px',borderRadius:6,border:'1px solid #21262D',marginBottom:8,cursor:'pointer'},tia:{borderColor:'#0EA5E9',background:'#0EA5E911'},exec:{background:'#161B22',border:'1px solid #21262D',borderRadius:10,padding:20},ta:{width:'100%',padding:12,background:'#0D1117',border:'1px solid #30363D',borderRadius:6,color:'#E6EDF3',fontSize:13,fontFamily:'monospace',outline:'none',resize:'vertical',marginBottom:12},btn:{padding:'10px 24px',background:'#0EA5E9',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer'},rb:{marginTop:16,background:'#0D1117',border:'1px solid #21262D',borderRadius:8,overflow:'hidden'},rh:{padding:'8px 12px',background:'#161B22',borderBottom:'1px solid #21262D',fontSize:12,color:'#8B949E',fontWeight:600},pre:{padding:12,fontSize:12,color:'#E6EDF3',fontFamily:'monospace',overflow:'auto',maxHeight:400,whiteSpace:'pre-wrap'}};

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../services/auth';

const BASE = '/imprint_iq';

export default function Landing() {
  const nav = useNavigate();
  useEffect(() => { if (isAuthenticated()) nav(`${BASE}/pitch`); }, []);

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #0D1117 0%, #161B22 50%, #1A1F2B 100%)' }}>
      <div style={{ textAlign:'center', maxWidth:520, padding:40 }}>
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="ImprintIQ" style={{ width:80, height:80, marginBottom:16, borderRadius:12 }} />
        <h1 style={{ fontFamily:'Bebas Neue', fontSize:56, color:'#E6EDF3', letterSpacing:3, margin:0 }}>IMPRINT<span style={{ color:'#C8962A' }}>IQ</span></h1>
        <p style={{ color:'#8B949E', fontSize:14, marginTop:4, letterSpacing:2, textTransform:'uppercase' }}>Intelligence for Every Impression</p>
        <div style={{ margin:'32px 0', padding:24, background:'#161B22', borderRadius:12, border:'1px solid #30363D' }}>
          <p style={{ color:'#C9D1D9', fontSize:15, lineHeight:1.7 }}>
            AI-powered ecosystem for promotional products operations.
            <br />11 autonomous agents. 6 neural health panels. 15 diagnostic analyzers.
          </p>
        </div>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:24 }}>
          {['Quote Engine','Art Director','Production','Supply Chain','QC Vision','Voice AI','Sales Intel','Finance','Compliance','Catalog','Fulfillment'].map(a => (
            <span key={a} style={{ background:'#21262D', color:'#8B949E', fontSize:11, padding:'4px 10px', borderRadius:20, border:'1px solid #30363D' }}>{a}</span>
          ))}
        </div>
        <button onClick={() => nav(`${BASE}/login`)} style={{ background:'linear-gradient(135deg,#C8962A,#A67A1E)', color:'#fff', border:'none', borderRadius:8, padding:'14px 48px', fontSize:16, fontWeight:600, cursor:'pointer', letterSpacing:1 }}>
          ENTER DASHBOARD
        </button>
        <p style={{ color:'#484F58', fontSize:11, marginTop:24 }}>Powered by Digit2AI &bull; RinglyPro Ecosystem</p>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, isAuthenticated } from '../services/auth';

const BASE = '/imprint_iq';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isAuthenticated()) nav(`${BASE}/pitch`); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      nav(`${BASE}/pitch`);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
    setLoading(false);
  };

  const input = { width:'100%', padding:'12px 16px', background:'#0D1117', border:'1px solid #30363D', borderRadius:8, color:'#E6EDF3', fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D1117' }}>
      <form onSubmit={handleSubmit} style={{ width:380, padding:40, background:'#161B22', borderRadius:16, border:'1px solid #30363D' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="ImprintIQ" style={{ width:48, height:48, borderRadius:8 }} />
          <h1 style={{ fontFamily:'Bebas Neue', fontSize:32, color:'#E6EDF3', margin:'8px 0 0' }}>IMPRINT<span style={{ color:'#C8962A' }}>IQ</span></h1>
        </div>
        {error && <div style={{ background:'#F8514922', color:'#F85149', padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>{error}</div>}
        <div style={{ marginBottom:16 }}>
          <label style={{ color:'#8B949E', fontSize:12, marginBottom:6, display:'block' }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" style={input} required />
        </div>
        <div style={{ marginBottom:24 }}>
          <label style={{ color:'#8B949E', fontSize:12, marginBottom:6, display:'block' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" style={input} required />
        </div>
        <button type="submit" disabled={loading} style={{ width:'100%', padding:'14px', background: loading ? '#484F58' : 'linear-gradient(135deg,#C8962A,#A67A1E)', color:'#fff', border:'none', borderRadius:8, fontSize:15, fontWeight:600, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        {/* credentials hint removed for client-facing */}
      </form>
    </div>
  );
}

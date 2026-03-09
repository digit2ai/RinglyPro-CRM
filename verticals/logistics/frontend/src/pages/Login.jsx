import React, { useState } from 'react';
import api from '../services/api';
import { login as saveLogin } from '../services/auth';
const BASE = '/logistics';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login');
  const [reg, setReg] = useState({ full_name: '', company_name: '', phone: '', role: 'shipper' });

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const { data } = await api.post('/auth/login', { email, password }); if (data.success) { saveLogin(data.token, data.user); window.location.href = `${BASE}/dashboard`; } }
    catch (err) { setError(err.response?.data?.error || 'Login failed'); }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const { data } = await api.post('/auth/register', { email, password, ...reg }); if (data.success) { saveLogin(data.token, data.user); window.location.href = `${BASE}/dashboard`; } }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    setLoading(false);
  };

  return (
    <div style={s.wrapper}>
      <div style={s.card}>
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6884f40a6d2fd3fed0b84613.png" alt="RinglyPro" style={s.logo} />
        <h1 style={s.title}>LOGISTICS</h1>
        <p style={s.sub}>Next-Gen Freight & Warehouse Management</p>
        <div style={s.tabs}><button onClick={() => setMode('login')} style={mode==='login'?s.tabA:s.tab}>Sign In</button><button onClick={() => setMode('register')} style={mode==='register'?s.tabA:s.tab}>Register</button></div>
        {error && <div style={s.err}>{error}</div>}
        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <input style={s.input} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input style={s.input} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
            <button style={s.btn} type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <input style={s.input} placeholder="Full Name" value={reg.full_name} onChange={e=>setReg({...reg,full_name:e.target.value})} required />
            <input style={s.input} placeholder="Company Name" value={reg.company_name} onChange={e=>setReg({...reg,company_name:e.target.value})} />
            <input style={s.input} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input style={s.input} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
            <select style={s.input} value={reg.role} onChange={e=>setReg({...reg,role:e.target.value})}><option value="shipper">Shipper</option><option value="carrier">Carrier</option><option value="driver">Driver</option></select>
            <button style={s.btn} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
          </form>
        )}
        <div style={s.demo}><strong>Demo:</strong> Admin: mstagg@ringlypro.com / Palindrome@7 | Shipper: shipper@demo.com / ShipperDemo2026! | Carrier: carrier@demo.com / CarrierDemo2026!</div>
      </div>
    </div>
  );
}
const s={wrapper:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0D1117 0%,#161B22 50%,#0D1117 100%)',padding:20},card:{background:'#161B22',border:'1px solid #21262D',borderRadius:12,padding:40,width:'100%',maxWidth:420,textAlign:'center'},logo:{height:36,marginBottom:16},title:{fontFamily:"'Bebas Neue',sans-serif",fontSize:42,color:'#0EA5E9',letterSpacing:4,marginBottom:4},sub:{color:'#8B949E',fontSize:13,marginBottom:24},tabs:{display:'flex',gap:8,marginBottom:20},tab:{flex:1,padding:'8px 0',background:'none',border:'1px solid #30363D',color:'#8B949E',borderRadius:6,cursor:'pointer',fontSize:13},tabA:{flex:1,padding:'8px 0',background:'#0EA5E922',border:'1px solid #0EA5E9',color:'#0EA5E9',borderRadius:6,cursor:'pointer',fontSize:13,fontWeight:600},input:{width:'100%',padding:'12px 14px',marginBottom:12,background:'#0D1117',border:'1px solid #30363D',borderRadius:8,color:'#E6EDF3',fontSize:14,outline:'none'},btn:{width:'100%',padding:12,background:'#0EA5E9',color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:600,cursor:'pointer',marginTop:4},err:{background:'#EF444422',border:'1px solid #EF4444',color:'#EF4444',padding:'8px 12px',borderRadius:6,marginBottom:12,fontSize:13},demo:{marginTop:24,padding:12,background:'#0D1117',borderRadius:8,fontSize:11,color:'#8B949E',textAlign:'left',lineHeight:1.6}};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/auth';

export default function Login() {
  const [email, setEmail] = useState('cwcarriers@ringlypro.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/cw_carriers/dashboard');
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="CW Carriers" style={styles.logoImg} />
          <h1 style={styles.logoText}>CW CARRIERS</h1>
          <p style={styles.logoSub}>USA, Inc. — Logistics CRM</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} placeholder="cwcarriers@ringlypro.com" required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} placeholder="Enter password" required />
          </div>
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={styles.footer}>Powered by RinglyPro AI</p>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0D1117' },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 40, width: 400, maxWidth: '90vw' },
  logoSection: { textAlign: 'center', marginBottom: 32 },
  logoImg: { width: 120, height: 'auto', marginBottom: 16, borderRadius: 8 },
  logoText: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#C8962A', letterSpacing: 3 },
  logoSub: { fontSize: 14, color: '#8B949E', marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, color: '#8B949E', fontWeight: 500 },
  input: { padding: '10px 14px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, color: '#E6EDF3', fontSize: 14, outline: 'none' },
  btn: { padding: '12px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  error: { background: '#f8514922', color: '#f85149', padding: '8px 12px', borderRadius: 6, fontSize: 13 },
  footer: { textAlign: 'center', color: '#484F58', fontSize: 12, marginTop: 24 }
};

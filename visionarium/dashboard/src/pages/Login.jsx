import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await auth.login(email, password);
      onLogin(data.user);
      const dest = data.user.role === 'admin' ? '/admin' : data.user.role === 'mentor' ? '/mentor' : data.user.role === 'sponsor' ? '/sponsor' : '/fellow';
      navigate(dest);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-card w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-24" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Sign In</h1>
        <p className="text-white/50 text-sm mb-6 text-center">Visionarium Foundation Portal</p>
        {error && <div className="bg-coral/20 border border-coral text-coral px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" required />
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="text-white/40 text-sm mt-4 text-center">
          No account? <Link to="/register" className="text-teal-neon hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}

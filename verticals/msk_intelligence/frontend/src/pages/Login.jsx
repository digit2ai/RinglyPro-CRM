import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.login(email, password);
      onLogin(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-5 mb-6">
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="MSK Intelligence" className="w-20 h-20 rounded-xl shadow-2xl object-contain" />
            <div className="text-left ml-1">
              <h1 className="text-2xl font-bold text-white">MSK Intelligence</h1>
              <p className="text-sm text-msk-400">Diagnostics Platform</p>
            </div>
          </Link>
          <h2 className="text-2xl font-bold text-white">Welcome back</h2>
          <p className="text-dark-400 mt-2">Sign in to access your dashboard</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter password"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-dark-400 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-msk-400 hover:text-msk-300 font-medium">
                Register
              </Link>
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-dark-700">
            <p className="text-dark-500 text-xs text-center mb-3">Demo Accounts</p>
            <div className="space-y-2 text-xs text-dark-400">
              <p><strong className="text-dark-300">Admin:</strong> admin@msk-intelligence.com</p>
              <p><strong className="text-dark-300">Radiologist:</strong> radiologist@msk-intelligence.com</p>
              <p><strong className="text-dark-300">Patient:</strong> athlete@msk-intelligence.com</p>
              <p className="text-dark-500">Password for all: MSKIntel2026!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

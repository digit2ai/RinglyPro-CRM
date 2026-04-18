import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MFAChallenge from './MFAChallenge';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e2cb1b50b9a3263ab4677c.png';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaState, setMfaState] = useState(null); // { tempToken }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.login(email, password);
      if (data.mfaRequired) {
        setMfaState({ tempToken: data.tempToken });
      } else {
        onLogin(data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSuccess = (data) => {
    api.completeMfaLogin(data);
    onLogin(data.user);
    navigate('/dashboard');
  };

  // Show MFA challenge screen
  if (mfaState) {
    return (
      <MFAChallenge
        tempToken={mfaState.tempToken}
        onSuccess={handleMfaSuccess}
        onCancel={() => setMfaState(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-6">
            <img src={mskLogo} alt="ImagingMind AI Diagnostics" className="h-48 sm:h-56 w-auto object-contain mx-auto" />
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

          {import.meta.env.VITE_MSK_DEMO_MODE === 'true' && (
            <div className="mt-6 pt-6 border-t border-dark-700">
              <details>
                <summary className="text-dark-500 text-xs text-center cursor-pointer hover:text-dark-300 transition-colors">Demo Access</summary>
                <div className="space-y-2 text-xs text-dark-400 mt-3">
                  <p><strong className="text-dark-300">Admin:</strong> {import.meta.env.VITE_MSK_DEMO_EMAIL_ADMIN || 'admin@imagingmind.com'}</p>
                  <p><strong className="text-dark-300">Radiologist:</strong> {import.meta.env.VITE_MSK_DEMO_EMAIL_RAD || 'radiologist@imagingmind.com'}</p>
                  <p><strong className="text-dark-300">Patient:</strong> {import.meta.env.VITE_MSK_DEMO_EMAIL_PATIENT || 'athlete@imagingmind.com'}</p>
                  <p className="text-dark-500">Password: {import.meta.env.VITE_MSK_DEMO_PASSWORD || '********'}</p>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Powered by — bottom of page */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2">
        <span className="text-[10px] tracking-[3px] uppercase text-white/30 font-mono">Powered by</span>
        <img src={mskLogo} alt="Digit2ai" className="h-32 w-auto object-contain opacity-80" />
      </div>
    </div>
  );
}

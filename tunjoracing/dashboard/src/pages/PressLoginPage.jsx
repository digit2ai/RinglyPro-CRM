import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ChevronLeft, Newspaper } from 'lucide-react';

export default function PressLoginPage() {
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
      const res = await fetch('/tunjoracing/api/v1/press/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('tunjo_press_token', data.token);
        localStorage.setItem('tunjo_press_info', JSON.stringify(data.press_user));
        navigate('/press/portal');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-1 text-slate-400 hover:text-white mb-8 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back to TunjoRacing
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-racing font-bold">
            <span className="gradient-text">TUNJO</span>
            <span className="text-white">RACING</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Newspaper className="h-4 w-4 text-cyan-400" />
            <p className="text-slate-400">Press & Media Portal</p>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">Press Sign In</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="press@media.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="••••••••"
                />
              </div>
              <div className="text-right mt-1">
                <Link to="/press/forgot-password" className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-slate-500 text-sm text-center mt-6">
            Need press access?{' '}
            <Link to="/press/request-access" className="text-cyan-400 hover:text-cyan-300">
              Request credentials
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ChevronLeft, User } from 'lucide-react';

export default function FanLoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/tunjoracing/api/v1/fans/register' : '/tunjoracing/api/v1/fans/login';
      const body = isRegister
        ? { email, password, first_name: firstName, last_name: lastName }
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('tunjo_fan_token', data.token);
        localStorage.setItem('tunjo_fan_info', JSON.stringify(data.fan));
        navigate('/fan/dashboard');
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <a href="https://tunjoracing.com" className="flex items-center gap-1 text-slate-400 hover:text-white mb-8 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back to TunjoRacing
        </a>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-racing font-bold">
            <span className="gradient-text">TUNJO</span>
            <span className="text-white">RACING</span>
          </h1>
          <p className="text-slate-400 mt-2">Fan Community Portal</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isRegister ? 'Join the Fan Community' : 'Fan Sign In'}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="First"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Last"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="fan@email.com"
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
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="••••••••"
                />
              </div>
              {isRegister && (
                <p className="text-slate-500 text-xs mt-1">Minimum 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? (isRegister ? 'Creating Account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800/50 text-slate-500">or</span>
            </div>
          </div>

          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="w-full py-3 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : 'New here? Create an Account'}
          </button>

          {/* Benefits Preview */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-slate-400 text-sm mb-3">Fan Community Benefits:</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-slate-300">
                <span className="text-red-500">✓</span> 10% discount on merchandise
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <span className="text-red-500">✓</span> Exclusive behind-the-scenes content
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <span className="text-red-500">✓</span> Race updates & newsletter
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <span className="text-red-500">✓</span> Direct Q&A with driver
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

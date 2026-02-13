import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, ChevronLeft, CheckCircle, AlertCircle, Newspaper } from 'lucide-react';

export default function PressResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-3">Invalid Reset Link</h2>
          <p className="text-slate-400 mb-6">This password reset link is invalid or has expired.</p>
          <Link
            to="/press/login"
            className="inline-block px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/press/reset-password-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password');
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
        <Link to="/press/login" className="flex items-center gap-1 text-slate-400 hover:text-white mb-8 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back to Sign In
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
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-3">Password Set!</h2>
              <p className="text-slate-400 mb-6">Your password has been updated. You can now sign in with your new password.</p>
              <Link
                to="/press/login"
                className="inline-block px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Set New Password</h2>
              <p className="text-slate-400 text-sm mb-6">Enter your new password below.</p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="••••••••"
                    />
                  </div>
                  <p className="text-slate-500 text-xs mt-1">Minimum 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Setting Password...' : 'Set Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ChevronLeft, CheckCircle, Key, Copy, Newspaper } from 'lucide-react';

export default function PressForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const linkRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/press/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (data.success) {
        setResetLink(data.resetLink);
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(resetLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleReset = () => {
    setResetLink('');
    setEmail('');
    setError('');
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
          {resetLink ? (
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Reset Your Password</h2>
              <p className="text-slate-400 mb-2">
                Click the button below to reset your password for:
              </p>
              <p className="text-cyan-400 font-semibold mb-5">{email}</p>

              <div className="mb-5">
                <input
                  ref={linkRef}
                  type="text"
                  value={resetLink}
                  readOnly
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm font-mono text-slate-400 mb-3"
                />
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <p className="text-slate-500 text-sm mb-5">
                This link will expire in 1 hour for security reasons.
              </p>

              <div className="space-y-3">
                <a
                  href={resetLink}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
                >
                  <Key className="h-4 w-4" />
                  Reset Password Now
                </a>
                <button
                  onClick={handleReset}
                  className="w-full py-3 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Try Another Email
                </button>
              </div>

              <div className="mt-6 p-4 bg-slate-900/50 border border-slate-700 rounded-lg text-left">
                <p className="text-sm font-semibold text-slate-300 mb-2">How to use your reset link:</p>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>- Click "Reset Password Now" to open the reset page</li>
                  <li>- Or copy the link and paste it in your browser</li>
                  <li>- Link expires in 1 hour for security</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Forgot Password?</h2>
              <p className="text-slate-400 text-sm mb-6">Enter your email and we'll instantly generate a password reset link for you.</p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="press@media.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Key className="h-4 w-4" />
                  {loading ? 'Generating...' : 'Generate Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

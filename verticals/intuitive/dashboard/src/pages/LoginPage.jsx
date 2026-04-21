import React, { useState } from 'react'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { setError('Email and password required'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/intuitive/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('intuitive_token', data.token)
      localStorage.setItem('intuitive_user', JSON.stringify(data.user))
      // Reload to ensure all components pick up the token
      window.location.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png"
            alt="SurgicalMind AI"
            className="w-48 mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-white mb-2">SurgicalMind AI</h1>
          <p className="text-slate-400 text-sm">Business Planning Platform for da Vinci Robotic Surgery</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900/80 border border-slate-700 rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-6">Sign In</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-intuitive-600 focus:border-transparent text-sm"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-intuitive-600 focus:border-transparent text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-intuitive-600 hover:bg-intuitive-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-slate-500 text-xs mt-6">
            Powered by Digit2AI | Claude Sonnet 4
          </p>
        </form>
      </div>
    </div>
  )
}

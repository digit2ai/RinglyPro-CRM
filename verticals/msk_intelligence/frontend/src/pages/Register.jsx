import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Register({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }

    setLoading(true);
    try {
      const data = await api.register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password
      });
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
          <Link to="/" className="inline-flex items-center gap-3 mb-6">
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="MSK Intelligence" className="w-20 h-20 rounded-xl shadow-2xl object-cover" />
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">MSK Intelligence</h1>
              <p className="text-xs text-msk-400">Diagnostics Platform</p>
            </div>
          </Link>
          <h2 className="text-2xl font-bold text-white">Create Account</h2>
          <p className="text-dark-400 mt-2">Get specialist-grade diagnostics</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">First Name</label>
                <input type="text" value={form.firstName} onChange={handleChange('firstName')} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Last Name</label>
                <input type="text" value={form.lastName} onChange={handleChange('lastName')} className="input-field" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={handleChange('email')} className="input-field" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={handleChange('phone')} className="input-field" />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Password</label>
              <input type="password" value={form.password} onChange={handleChange('password')} className="input-field" required minLength={8} />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={handleChange('confirmPassword')} className="input-field" required />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-dark-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-msk-400 hover:text-msk-300 font-medium">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

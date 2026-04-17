import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png';

export default function Register({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', confirmPassword: '',
    dateOfBirth: '', gender: '',
    insuranceProvider: '', policyNumber: '', groupNumber: '',
    hipaaConsent: false
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    if (!form.hipaaConsent) {
      return setError('You must consent to HIPAA privacy practices to create an account');
    }

    setLoading(true);
    try {
      const data = await api.register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        insuranceProvider: form.insuranceProvider || undefined,
        policyNumber: form.policyNumber || undefined,
        groupNumber: form.groupNumber || undefined,
        hipaaConsent: form.hipaaConsent
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
          <Link to="/" className="inline-flex flex-col items-center mb-6">
            <img src={mskLogo} alt="ImagingMind" className="h-44 w-auto object-contain drop-shadow-2xl" />
            <div className="text-center -mt-4">
              <h1 className="text-3xl font-bold text-white">ImagingMind</h1>
              <p className="text-sm text-msk-400">AI Diagnostics Platform</p>
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
              <input type="tel" value={form.phone} onChange={handleChange('phone')} className="input-field" placeholder="(555) 123-4567" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={handleChange('dateOfBirth')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Gender</label>
                <select value={form.gender} onChange={handleChange('gender')} className="input-field">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>

            {/* Insurance (optional for self-registration) */}
            <div className="border-t border-dark-700 pt-4">
              <p className="text-sm font-medium text-dark-300 mb-3">Insurance Information (optional)</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Insurance Provider</label>
                  <input type="text" value={form.insuranceProvider} onChange={handleChange('insuranceProvider')} className="input-field" placeholder="e.g., Blue Cross Blue Shield" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Policy Number</label>
                    <input type="text" value={form.policyNumber} onChange={handleChange('policyNumber')} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Group Number</label>
                    <input type="text" value={form.groupNumber} onChange={handleChange('groupNumber')} className="input-field" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Password</label>
              <input type="password" value={form.password} onChange={handleChange('password')} className="input-field" required minLength={8} />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={handleChange('confirmPassword')} className="input-field" required />
            </div>

            {/* HIPAA Consent */}
            <div className="border-t border-dark-700 pt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hipaaConsent}
                  onChange={handleChange('hipaaConsent')}
                  className="mt-1 w-5 h-5 rounded border-dark-600 bg-dark-800 text-msk-500 focus:ring-msk-500"
                  required
                />
                <span className="text-sm text-dark-300">
                  <span className="font-medium text-white">HIPAA Consent *</span>
                  <br />
                  I have been informed of HIPAA privacy practices and consent to electronic health records management.
                </span>
              </label>
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

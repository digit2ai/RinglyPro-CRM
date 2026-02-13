import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Newspaper, CheckCircle, User, Building, Globe, Mail, Phone, FileText } from 'lucide-react';

export default function PressRequestAccessPage() {
  const [form, setForm] = useState({
    full_name: '',
    media_outlet: '',
    role: '',
    email: '',
    country: '',
    website: '',
    phone: '',
    message: ''
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/press/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <Link to="/press/login" className="flex items-center gap-1 text-slate-400 hover:text-white mb-8 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back to Press Sign In
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
            <div className="text-center py-6">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-3">Request Submitted!</h2>
              <p className="text-slate-400 mb-2">
                Thank you for your interest in TunjoRacing media content.
              </p>
              <p className="text-slate-400 mb-6">
                Our team will review your request and send you login credentials once approved.
              </p>
              <Link
                to="/press/login"
                className="inline-block px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Request Press Access</h2>
              <p className="text-slate-400 text-sm mb-6">Fill out the form below and our team will review your credentials.</p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={handleChange('full_name')}
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="John Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Media Outlet *</label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={form.media_outlet}
                        onChange={handleChange('media_outlet')}
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Motorsport Weekly"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                    <select
                      value={form.role}
                      onChange={handleChange('role')}
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select role</option>
                      <option value="Journalist">Journalist</option>
                      <option value="Editor">Editor</option>
                      <option value="Photographer">Photographer</option>
                      <option value="Videographer">Videographer</option>
                      <option value="Content Creator">Content Creator</option>
                      <option value="Broadcaster">Broadcaster</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={handleChange('email')}
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="press@media.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={form.country}
                        onChange={handleChange('country')}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="United States"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="url"
                        value={form.website}
                        onChange={handleChange('website')}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="https://media.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={handleChange('phone')}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="+1 555-0123"
                      />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">Additional Information</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <textarea
                        value={form.message}
                        onChange={handleChange('message')}
                        rows={3}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                        placeholder="Tell us about your coverage plans..."
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? 'Submitting...' : 'Submit Access Request'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function RegisterPatient() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    insuranceProvider: '',
    policyNumber: '',
    groupNumber: '',
    subscriberName: '',
    hipaaConsent: false
  });

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.firstName || !form.lastName || !form.email) {
      return setError('First name, last name, and email are required');
    }
    if (!form.hipaaConsent) {
      return setError('HIPAA consent is required to register a patient');
    }

    setLoading(true);
    try {
      const data = await api.registerPatient(form);
      setSuccess(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm({
      firstName: '', lastName: '', email: '', phone: '',
      dateOfBirth: '', gender: '', insuranceProvider: '',
      policyNumber: '', groupNumber: '', subscriberName: '',
      hipaaConsent: false
    });
    setSuccess(null);
    setError('');
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Patient Registered</h1>
        <p className="text-dark-400 mb-8">The patient has been successfully added to the system.</p>

        <div className="card space-y-4">
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-green-400 font-medium">Patient registered successfully</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-dark-400">Name</span>
              <p className="text-white mt-1">{success.firstName} {success.lastName}</p>
            </div>
            <div>
              <span className="text-dark-400">Email</span>
              <p className="text-white mt-1">{success.email}</p>
            </div>
            {success.dateOfBirth && (
              <div>
                <span className="text-dark-400">Date of Birth</span>
                <p className="text-white mt-1">{new Date(success.dateOfBirth).toLocaleDateString()}</p>
              </div>
            )}
            {success.insuranceProvider && (
              <div>
                <span className="text-dark-400">Insurance</span>
                <p className="text-white mt-1">{success.insuranceProvider}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => navigate('/cases/new', { state: { selectedPatient: success } })}
              className="btn-primary"
            >
              Open Case for This Patient
            </button>
            <button onClick={handleReset} className="btn-secondary">
              Register Another Patient
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Register Patient</h1>
      <p className="text-dark-400 mb-8">Add a new patient to the ImagingMind system</p>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">First Name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={handleChange('firstName')}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={handleChange('lastName')}
                className="input-field"
                required
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={handleChange('phone')}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Demographics */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={handleChange('dateOfBirth')}
                className="input-field"
              />
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

          {/* Insurance section */}
          <div className="border-t border-dark-700 pt-5">
            <h3 className="text-lg font-semibold text-white mb-4">Insurance Information</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Insurance Provider</label>
                <input
                  type="text"
                  value={form.insuranceProvider}
                  onChange={handleChange('insuranceProvider')}
                  className="input-field"
                  placeholder="e.g., Blue Cross Blue Shield"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Policy Number</label>
                  <input
                    type="text"
                    value={form.policyNumber}
                    onChange={handleChange('policyNumber')}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Group Number</label>
                  <input
                    type="text"
                    value={form.groupNumber}
                    onChange={handleChange('groupNumber')}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Subscriber Name <span className="text-dark-500">(if different from patient)</span>
                </label>
                <input
                  type="text"
                  value={form.subscriberName}
                  onChange={handleChange('subscriberName')}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* HIPAA Consent */}
          <div className="border-t border-dark-700 pt-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hipaaConsent}
                onChange={handleChange('hipaaConsent')}
                className="mt-1 w-5 h-5 rounded border-dark-600 bg-dark-800 text-msk-500 focus:ring-msk-500"
              />
              <span className="text-sm text-dark-300">
                <span className="font-medium text-white">HIPAA Consent *</span>
                <br />
                Patient has been informed of HIPAA privacy practices and consents to electronic health records management.
              </span>
            </label>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

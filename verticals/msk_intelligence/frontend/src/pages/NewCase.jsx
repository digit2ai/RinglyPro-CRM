import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const BODY_REGIONS = [
  'Knee - Left', 'Knee - Right', 'Shoulder - Left', 'Shoulder - Right',
  'Hip - Left', 'Hip - Right', 'Ankle - Left', 'Ankle - Right',
  'Elbow - Left', 'Elbow - Right', 'Wrist - Left', 'Wrist - Right',
  'Cervical Spine', 'Thoracic Spine', 'Lumbar Spine',
  'Foot - Left', 'Foot - Right', 'Hand - Left', 'Hand - Right',
  'Pelvis', 'Sacroiliac Joint', 'Other'
];

export default function NewCase() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    chiefComplaint: '',
    painLocation: '',
    injuryMechanism: '',
    onsetDate: '',
    durationDescription: '',
    severity: 5,
    functionalLimitations: '',
    sportContext: '',
    priorImagingHistory: '',
    caseType: 'general',
    urgency: 'routine',
    pricingTier: 'imaging_review'
  });

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async () => {
    if (!form.chiefComplaint) return setError('Please describe your chief complaint');

    setLoading(true);
    setError('');
    try {
      const data = await api.post('/cases', form);
      navigate(`/cases/${data.data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">New Diagnostic Case</h1>
      <p className="text-dark-400 mb-8">Provide details about your musculoskeletal concern</p>

      {/* Progress */}
      <div className="flex items-center gap-4 mb-8">
        {['Symptoms', 'Context', 'Review'].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${step > i + 1 ? 'bg-msk-600 text-white' : step === i + 1 ? 'bg-msk-600/20 text-msk-400 ring-2 ring-msk-500' : 'bg-dark-700 text-dark-400'}`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`text-sm font-medium ${step === i + 1 ? 'text-white' : 'text-dark-400'}`}>{label}</span>
            {i < 2 && <div className="w-12 h-px bg-dark-700" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-6">{error}</div>
      )}

      {/* Step 1: Symptoms */}
      {step === 1 && (
        <div className="card space-y-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Chief Complaint *</label>
            <textarea value={form.chiefComplaint} onChange={handleChange('chiefComplaint')} className="input-field h-24" placeholder="Describe your primary concern — e.g., 'Right knee pain after basketball game, sharp pain on inner side'" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Pain Location</label>
            <select value={form.painLocation} onChange={handleChange('painLocation')} className="input-field">
              <option value="">Select body region</option>
              {BODY_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Injury Mechanism</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'trauma', label: 'Trauma', desc: 'Specific incident or impact' },
                { value: 'overuse', label: 'Overuse', desc: 'Repetitive strain over time' },
                { value: 'acute', label: 'Acute', desc: 'Sudden onset, recent' },
                { value: 'chronic', label: 'Chronic', desc: 'Long-standing issue' }
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, injuryMechanism: opt.value })}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${form.injuryMechanism === opt.value
                      ? 'border-msk-500 bg-msk-600/10 text-white'
                      : 'border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500'}`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-dark-400 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Pain Severity: {form.severity}/10</label>
            <input type="range" min="1" max="10" value={form.severity} onChange={handleChange('severity')} className="w-full" />
            <div className="flex justify-between text-xs text-dark-500 mt-1">
              <span>Mild</span><span>Moderate</span><span>Severe</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="btn-primary">Next: Context</button>
          </div>
        </div>
      )}

      {/* Step 2: Context */}
      {step === 2 && (
        <div className="card space-y-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">When did symptoms start?</label>
            <input type="date" value={form.onsetDate} onChange={handleChange('onsetDate')} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Duration & Progression</label>
            <textarea value={form.durationDescription} onChange={handleChange('durationDescription')} className="input-field h-20" placeholder="e.g., 'Started 3 weeks ago, gradually worsening, now limits running'" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Functional Limitations</label>
            <textarea value={form.functionalLimitations} onChange={handleChange('functionalLimitations')} className="input-field h-20" placeholder="What activities are affected? e.g., 'Cannot run, difficulty going down stairs, pain while driving'" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Sport / Activity Context</label>
            <input type="text" value={form.sportContext} onChange={handleChange('sportContext')} className="input-field" placeholder="e.g., 'Professional basketball, point guard, 6 games/week'" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Prior Imaging History</label>
            <textarea value={form.priorImagingHistory} onChange={handleChange('priorImagingHistory')} className="input-field h-20" placeholder="Any previous X-rays, MRIs, or ultrasounds for this issue?" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Case Type</label>
            <select value={form.caseType} onChange={handleChange('caseType')} className="input-field">
              <option value="general">General</option>
              <option value="joint">Joint</option>
              <option value="spine">Spine</option>
              <option value="soft_tissue">Soft Tissue</option>
              <option value="fracture">Fracture</option>
              <option value="post_surgical">Post-Surgical</option>
            </select>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
            <button onClick={() => setStep(3)} className="btn-primary">Next: Review</button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="card space-y-5">
          <h3 className="text-lg font-bold text-white">Review Your Case</h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-dark-400">Chief Complaint</span>
              <p className="text-white mt-1">{form.chiefComplaint}</p>
            </div>
            <div>
              <span className="text-dark-400">Pain Location</span>
              <p className="text-white mt-1">{form.painLocation || 'Not specified'}</p>
            </div>
            <div>
              <span className="text-dark-400">Injury Mechanism</span>
              <p className="text-white mt-1 capitalize">{form.injuryMechanism || 'Not specified'}</p>
            </div>
            <div>
              <span className="text-dark-400">Severity</span>
              <p className="text-white mt-1">{form.severity}/10</p>
            </div>
            <div>
              <span className="text-dark-400">Sport Context</span>
              <p className="text-white mt-1">{form.sportContext || 'Not specified'}</p>
            </div>
            <div>
              <span className="text-dark-400">Case Type</span>
              <p className="text-white mt-1 capitalize">{form.caseType.replace('_', ' ')}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Service Tier</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'imaging_review', label: 'Imaging Review', price: 'From $299' },
                { value: 'full_diagnostic', label: 'Full Diagnostic', price: 'From $799' },
                { value: 'elite_concierge', label: 'Elite Concierge', price: '$2,999/mo' }
              ].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, pricingTier: t.value })}
                  className={`p-4 rounded-lg border text-center transition-all
                    ${form.pricingTier === t.value
                      ? 'border-msk-500 bg-msk-600/10'
                      : 'border-dark-600 bg-dark-800 hover:border-dark-500'}`}
                >
                  <div className="font-medium text-white text-sm">{t.label}</div>
                  <div className="text-xs text-msk-400 mt-1">{t.price}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary">
              {loading ? 'Submitting...' : 'Submit Case'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

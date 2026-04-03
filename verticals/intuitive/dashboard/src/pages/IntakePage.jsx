import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const HOSPITAL_TYPES = ['academic', 'community', 'rural', 'specialty', 'VA', 'military']
const BUDGET_RANGES = ['<1M', '1-2M', '2-3M', '3M+']
const ACQUISITION_MODELS = ['purchase', 'lease', 'usage_based']
const GOALS = ['volume_growth', 'cost_reduction', 'competitive', 'quality', 'recruitment']
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function IntakePage({ onProjectCreated, currentProject }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    hospital_name: '', contact_name: '', contact_email: '', contact_title: '',
    hospital_type: '', bed_count: '', state: '', country: 'United States',
    annual_surgical_volume: '', current_robotic_cases: '0', current_system: 'none',
    current_system_count: '0', current_system_age_years: '',
    specialty_urology: '', specialty_gynecology: '', specialty_general: '',
    specialty_thoracic: '', specialty_colorectal: '', specialty_head_neck: '', specialty_cardiac: '',
    credentialed_robotic_surgeons: '0', surgeons_interested: '', convertible_lap_cases: '',
    total_or_count: '', robot_ready_ors: '', or_sqft: '', ceiling_height_ft: '',
    capital_budget: '', acquisition_preference: '', avg_los_days: '',
    complication_rate_pct: '', readmission_rate_pct: '',
    payer_medicare_pct: '', payer_commercial_pct: '', payer_medicaid_pct: '',
    payer_self_pay_pct: '', value_based_contract_pct: '',
    competitor_robot_nearby: false, competitor_details: '',
    target_go_live: '', primary_goal: '', notes: ''
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }
  function num(v) { return v === '' ? undefined : Number(v) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.hospital_name) { setError('Hospital name is required'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        ...form,
        bed_count: num(form.bed_count),
        annual_surgical_volume: num(form.annual_surgical_volume),
        current_robotic_cases: num(form.current_robotic_cases),
        current_system_count: num(form.current_system_count),
        current_system_age_years: num(form.current_system_age_years),
        specialty_urology: num(form.specialty_urology),
        specialty_gynecology: num(form.specialty_gynecology),
        specialty_general: num(form.specialty_general),
        specialty_thoracic: num(form.specialty_thoracic),
        specialty_colorectal: num(form.specialty_colorectal),
        specialty_head_neck: num(form.specialty_head_neck),
        specialty_cardiac: num(form.specialty_cardiac),
        credentialed_robotic_surgeons: num(form.credentialed_robotic_surgeons),
        surgeons_interested: num(form.surgeons_interested),
        convertible_lap_cases: num(form.convertible_lap_cases),
        total_or_count: num(form.total_or_count),
        robot_ready_ors: num(form.robot_ready_ors),
        or_sqft: num(form.or_sqft),
        ceiling_height_ft: num(form.ceiling_height_ft),
        avg_los_days: num(form.avg_los_days),
        complication_rate_pct: num(form.complication_rate_pct),
        readmission_rate_pct: num(form.readmission_rate_pct),
        payer_medicare_pct: num(form.payer_medicare_pct),
        payer_commercial_pct: num(form.payer_commercial_pct),
        payer_medicaid_pct: num(form.payer_medicaid_pct),
        payer_self_pay_pct: num(form.payer_self_pay_pct),
        value_based_contract_pct: num(form.value_based_contract_pct),
      }
      const { project } = await api.createProject(payload)
      onProjectCreated(project.id)

      // Auto-run analysis
      await api.runAnalysis(project.id)
      navigate(`/analysis/${project.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-intuitive-600 focus:border-transparent'
  const selectCls = inputCls + ' appearance-none'
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5'
  const sectionCls = 'bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6'

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">Hospital Assessment Intake</h1>
      <p className="text-slate-400 text-sm mb-8">
        Enter hospital data to match the optimal da Vinci system configuration, calculate ROI, and generate a placement recommendation.
      </p>

      {/* Demo Generation Card */}
      <div className="bg-gradient-to-r from-intuitive-900/40 to-slate-900/60 border border-intuitive-700/40 rounded-xl p-5 mb-8 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Demo Mode -- Generate Sample Hospitals</h3>
          <p className="text-slate-400 text-sm mt-1">Generate 5 realistic hospital profiles (academic, community, specialty, VA) with full analysis and da Vinci system matching.</p>
        </div>
        <button
          type="button"
          disabled={demoLoading}
          onClick={async () => {
            setDemoLoading(true); setError(null)
            try {
              const res = await api.generateDemo()
              if (res.projects?.length > 0) {
                onProjectCreated(res.projects[0].id)
                navigate(`/analysis/${res.projects[0].id}`)
              }
            } catch (err) { setError(err.message) }
            finally { setDemoLoading(false) }
          }}
          className="bg-intuitive-600 hover:bg-intuitive-700 text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-all whitespace-nowrap disabled:opacity-50"
        >
          {demoLoading ? 'Generating...' : 'Generate Demo'}
        </button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-6 text-red-300 text-sm">{error}</div>}

      <form onSubmit={handleSubmit}>

        {/* 1. Hospital Information */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">1</span>
            <h2 className="text-lg font-semibold text-white">Hospital Information</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Hospital Name <span className="text-red-400">*</span></label>
              <input className={inputCls} placeholder="e.g. Memorial Regional Medical Center" value={form.hospital_name} onChange={e => set('hospital_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Contact Name</label>
              <input className={inputCls} placeholder="e.g. Dr. James Wilson" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Contact Email</label>
              <input className={inputCls} type="email" placeholder="jwilson@memorial.org" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Contact Title</label>
              <input className={inputCls} placeholder="e.g. VP of Surgical Services" value={form.contact_title} onChange={e => set('contact_title', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Hospital Type</label>
              <select className={selectCls} value={form.hospital_type} onChange={e => set('hospital_type', e.target.value)}>
                <option value="">Select type...</option>
                {HOSPITAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bed Count</label>
              <input className={inputCls} type="number" placeholder="e.g. 350" value={form.bed_count} onChange={e => set('bed_count', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <select className={selectCls} value={form.state} onChange={e => set('state', e.target.value)}>
                <option value="">Select state...</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 2. Surgical Profile */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">2</span>
            <h2 className="text-lg font-semibold text-white">Surgical Profile</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Annual Surgical Volume (total)</label>
              <input className={inputCls} type="number" placeholder="e.g. 5000" value={form.annual_surgical_volume} onChange={e => set('annual_surgical_volume', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Current Robotic Cases/Year</label>
              <input className={inputCls} type="number" placeholder="0" value={form.current_robotic_cases} onChange={e => set('current_robotic_cases', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Current System</label>
              <select className={selectCls} value={form.current_system} onChange={e => set('current_system', e.target.value)}>
                <option value="none">No robotic system</option>
                <option value="dV5">da Vinci 5</option>
                <option value="Xi">da Vinci Xi</option>
                <option value="X">da Vinci X</option>
                <option value="SP">da Vinci SP</option>
                <option value="Si">da Vinci Si (legacy)</option>
                <option value="competitor">Competitor system</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Convertible Laparoscopic Cases</label>
              <input className={inputCls} type="number" placeholder="Cases that could go robotic" value={form.convertible_lap_cases} onChange={e => set('convertible_lap_cases', e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-400 mb-3 mt-6">Specialty Mix (% of surgical volume)</p>
          <div className="grid grid-cols-4 gap-3">
            {[['Urology','urology'],['Gynecology','gynecology'],['General','general'],['Thoracic','thoracic'],['Colorectal','colorectal'],['Head & Neck','head_neck'],['Cardiac','cardiac']].map(([label, key]) => (
              <div key={key}>
                <label className={labelCls}>{label} %</label>
                <input className={inputCls} type="number" min="0" max="100" placeholder="0" value={form[`specialty_${key}`]} onChange={e => set(`specialty_${key}`, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* 3. Workforce */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">3</span>
            <h2 className="text-lg font-semibold text-white">Surgical Workforce</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Credentialed Robotic Surgeons</label>
              <input className={inputCls} type="number" placeholder="0" value={form.credentialed_robotic_surgeons} onChange={e => set('credentialed_robotic_surgeons', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Surgeons Interested in Training</label>
              <input className={inputCls} type="number" placeholder="e.g. 5" value={form.surgeons_interested} onChange={e => set('surgeons_interested', e.target.value)} />
            </div>
          </div>
        </div>

        {/* 4. Infrastructure */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">4</span>
            <h2 className="text-lg font-semibold text-white">OR Infrastructure</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Total OR Count</label>
              <input className={inputCls} type="number" placeholder="e.g. 12" value={form.total_or_count} onChange={e => set('total_or_count', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Robot-Ready ORs</label>
              <input className={inputCls} type="number" placeholder="e.g. 2" value={form.robot_ready_ors} onChange={e => set('robot_ready_ors', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>OR Size (sq ft)</label>
              <input className={inputCls} type="number" placeholder="e.g. 700" value={form.or_sqft} onChange={e => set('or_sqft', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Ceiling Height (ft)</label>
              <input className={inputCls} type="number" step="0.5" placeholder="e.g. 10.5" value={form.ceiling_height_ft} onChange={e => set('ceiling_height_ft', e.target.value)} />
            </div>
          </div>
        </div>

        {/* 5. Financial */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">5</span>
            <h2 className="text-lg font-semibold text-white">Financial Profile</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Capital Budget Range</label>
              <select className={selectCls} value={form.capital_budget} onChange={e => set('capital_budget', e.target.value)}>
                <option value="">Select range...</option>
                {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Acquisition Preference</label>
              <select className={selectCls} value={form.acquisition_preference} onChange={e => set('acquisition_preference', e.target.value)}>
                <option value="">Select model...</option>
                {ACQUISITION_MODELS.map(m => <option key={m} value={m}>{m === 'usage_based' ? 'Usage-Based (Pay-Per-Procedure)' : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Avg Length of Stay (days)</label>
              <input className={inputCls} type="number" step="0.1" placeholder="e.g. 2.5" value={form.avg_los_days} onChange={e => set('avg_los_days', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Complication Rate (%)</label>
              <input className={inputCls} type="number" step="0.1" placeholder="e.g. 4.5" value={form.complication_rate_pct} onChange={e => set('complication_rate_pct', e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-400 mb-3 mt-4">Payer Mix (%)</p>
          <div className="grid grid-cols-5 gap-3">
            {[['Medicare','payer_medicare_pct'],['Commercial','payer_commercial_pct'],['Medicaid','payer_medicaid_pct'],['Self-Pay','payer_self_pay_pct'],['Value-Based','value_based_contract_pct']].map(([label, key]) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input className={inputCls} type="number" min="0" max="100" placeholder="0" value={form[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* 6. Competitive & Goals */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-7 h-7 rounded-full bg-intuitive-600 flex items-center justify-center text-white text-xs font-bold">6</span>
            <h2 className="text-lg font-semibold text-white">Competitive Landscape & Goals</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Competitor Robot Nearby?</label>
              <select className={selectCls} value={form.competitor_robot_nearby ? 'yes' : 'no'} onChange={e => set('competitor_robot_nearby', e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Competitor Details</label>
              <input className={inputCls} placeholder="e.g. St. Mary's has a Mako" value={form.competitor_details} onChange={e => set('competitor_details', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Primary Goal</label>
              <select className={selectCls} value={form.primary_goal} onChange={e => set('primary_goal', e.target.value)}>
                <option value="">Select goal...</option>
                {GOALS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Target Go-Live</label>
              <input className={inputCls} type="date" value={form.target_go_live} onChange={e => set('target_go_live', e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>Notes</label>
            <textarea className={inputCls + ' h-20 resize-none'} placeholder="Additional context..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-intuitive-600 hover:bg-intuitive-700 text-white font-semibold py-3.5 px-6 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing Hospital Profile...' : 'Run da Vinci System Match'}
        </button>
      </form>
    </div>
  )
}

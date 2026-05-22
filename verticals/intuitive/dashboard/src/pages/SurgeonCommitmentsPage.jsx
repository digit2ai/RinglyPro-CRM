import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// ─── 3-Tab Surgeon Commitment Editor (Deck 3 Slides 9/10/11 pattern) ───
//
// Three commitment categories, each with different math:
//   1. Open-to-MIS Conversion — converting existing open volume to robotic (Slide 9)
//   2. Pull-Forward / Capacity — proficient surgeons blocked by access (Slide 10)
//   3. Training Pipeline — untrained surgeons needing TR200 (Slide 11)

const fmt = (n) => n != null ? Number(n).toLocaleString() : '0'
const fmtMoney = (n) => n != null ? '$' + Number(n).toLocaleString() : '$0'

const SPECIALTIES = [
  'General Surgery', 'Urology', 'Gynecology', 'Colorectal',
  'Thoracic', 'Cardiac', 'Head & Neck', 'Surgical Oncology',
  'Bariatric', 'Transplant', 'HPB', 'ACS',
]

const PROCEDURE_LADDERS = {
  'General Surgery': [
    { name: 'Cholecystectomy', drg: '418', rate: 9800 },
    { name: 'Inguinal Hernia', drg: '352', rate: 8200 },
    { name: 'Ventral Hernia', drg: '350', rate: 15800 },
  ],
  Urology: [
    { name: 'Radical Prostatectomy', drg: '707', rate: 14500 },
    { name: 'Partial Nephrectomy', drg: '653', rate: 19800 },
    { name: 'Cystectomy', drg: '654', rate: 31200 },
  ],
  Gynecology: [
    { name: 'Hysterectomy (Benign)', drg: '743', rate: 13200 },
    { name: 'Hysterectomy (Malignant)', drg: '736', rate: 21400 },
    { name: 'Myomectomy', drg: '744', rate: 10500 },
  ],
  Colorectal: [
    { name: 'Colon Resection', drg: '329', rate: 22400 },
    { name: 'Rectal Resection', drg: '331', rate: 25600 },
  ],
  Thoracic: [
    { name: 'Lobectomy', drg: '163', rate: 26000 },
    { name: 'Thymectomy', drg: '163', rate: 24500 },
    { name: 'Esophagectomy', drg: '326', rate: 41200 },
  ],
  Cardiac: [
    { name: 'CABG', drg: '236', rate: 35000 },
  ],
  Bariatric: [
    { name: 'Gastric Bypass', drg: '619', rate: 27258 },
    { name: 'Sleeve Gastrectomy', drg: '620', rate: 17886 },
  ],
}

function pickProcedures(specialty) {
  return PROCEDURE_LADDERS[specialty] || PROCEDURE_LADDERS['General Surgery']
}

// ─── Add/Edit Surgeon Form ───
function SurgeonForm({ initial, category, onSave, onCancel, planId }) {
  const [s, setS] = useState(initial || {
    surgeon_name: '',
    surgeon_specialty: 'General Surgery',
    commitment_category: category,
    trained: category !== 'training_pipeline',
    training_needs: category === 'training_pipeline' ? 'TR200 — initial credentialing' : '',
    proctoring_needed: category === 'training_pipeline',
    current_weekly_volume: category === 'pull_forward' ? 2 : null,
    target_weekly_volume: category === 'pull_forward' ? 4 : null,
    backlog_weeks: category === 'pull_forward' ? 6 : null,
    free_text_intel: '',
    procedures: pickProcedures('General Surgery').map(p => ({
      procedure_type: p.name,
      procedure_name: p.name,
      drg_code: p.drg,
      patient_source: category === 'open_to_mis' ? 'existing' : 'incremental',
      pct_converted_from_open: category === 'open_to_mis' ? 20 : null,
      incremental_cases_monthly: 0,
      reimbursement_rate: p.rate,
    })),
  })
  const [saving, setSaving] = useState(false)

  function setProcedure(i, key, val) {
    const procs = [...s.procedures]
    procs[i] = { ...procs[i], [key]: val }
    setS({ ...s, procedures: procs })
  }

  function changeSpecialty(spec) {
    const newProcs = pickProcedures(spec).map(p => ({
      procedure_type: p.name,
      procedure_name: p.name,
      drg_code: p.drg,
      patient_source: category === 'open_to_mis' ? 'existing' : 'incremental',
      pct_converted_from_open: category === 'open_to_mis' ? 20 : null,
      incremental_cases_monthly: 0,
      reimbursement_rate: p.rate,
    }))
    setS({ ...s, surgeon_specialty: spec, procedures: newProcs })
  }

  // Live total preview (mirrors backend math)
  const previewCases = s.procedures.reduce((tot, p) => {
    const monthly = parseFloat(p.incremental_cases_monthly || 0)
    if (p.patient_source === 'existing') {
      const pct = parseFloat(p.pct_converted_from_open || 20) / 100
      return tot + Math.round(monthly * 12 * pct)
    }
    return tot + Math.round(monthly * 12)
  }, 0)
  const previewRevenue = s.procedures.reduce((tot, p) => {
    const monthly = parseFloat(p.incremental_cases_monthly || 0)
    const rate = parseFloat(p.reimbursement_rate || 0)
    if (p.patient_source === 'existing') {
      const pct = parseFloat(p.pct_converted_from_open || 20) / 100
      return tot + Math.round(monthly * 12 * pct * rate)
    }
    return tot + Math.round(monthly * 12 * rate)
  }, 0)

  async function save() {
    if (saving) return
    if (!s.surgeon_name.trim()) { alert('Surgeon name required'); return }
    setSaving(true)
    try {
      if (initial?.id) {
        await api.updateSurgeon(planId, initial.id, s)
      } else {
        await api.addSurgeon(planId, s)
      }
      onSave()
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Surgeon Name</label>
          <input
            type="text"
            value={s.surgeon_name}
            onChange={e => setS({ ...s, surgeon_name: e.target.value })}
            placeholder="Dr. Jane Smith"
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Specialty</label>
          <select
            value={s.surgeon_specialty}
            onChange={e => changeSpecialty(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
          >
            {SPECIALTIES.map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </select>
        </div>
      </div>

      {/* Category-specific fields */}
      {category === 'open_to_mis' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={s.trained} onChange={e => setS({ ...s, trained: e.target.checked })} />
            Trained
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={s.proctoring_needed} onChange={e => setS({ ...s, proctoring_needed: e.target.checked })} />
            Proctoring needed
          </label>
          <input
            type="text"
            placeholder="Training needs (e.g., Advanced Colorectal)"
            value={s.training_needs || ''}
            onChange={e => setS({ ...s, training_needs: e.target.value })}
            className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
          />
        </div>
      )}

      {category === 'pull_forward' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Current Cases/Wk</label>
            <input
              type="number"
              value={s.current_weekly_volume || ''}
              onChange={e => setS({ ...s, current_weekly_volume: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Target Cases/Wk</label>
            <input
              type="number"
              value={s.target_weekly_volume || ''}
              onChange={e => setS({ ...s, target_weekly_volume: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Backlog (Weeks)</label>
            <input
              type="number"
              value={s.backlog_weeks || ''}
              onChange={e => setS({ ...s, backlog_weeks: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
        </div>
      )}

      {category === 'training_pipeline' && (
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Training Pathway</label>
          <input
            type="text"
            placeholder="TR200, Luminary Training, etc."
            value={s.training_needs || ''}
            onChange={e => setS({ ...s, training_needs: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
          />
        </div>
      )}

      {/* Procedures editor */}
      <div className="mb-4">
        <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">Procedures</label>
        <table className="w-full text-sm border border-slate-700">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left p-2">Procedure</th>
              <th className="text-left p-2">Patient Source</th>
              <th className="text-right p-2">% from Open</th>
              <th className="text-right p-2">Cases/Mo</th>
              <th className="text-right p-2">$/Case</th>
              <th className="text-right p-2">Annual</th>
            </tr>
          </thead>
          <tbody>
            {s.procedures.map((p, i) => {
              const monthly = parseFloat(p.incremental_cases_monthly || 0)
              const pct = parseFloat(p.pct_converted_from_open || 20) / 100
              const annual = p.patient_source === 'existing'
                ? Math.round(monthly * 12 * pct)
                : Math.round(monthly * 12)
              return (
                <tr key={i} className="border-t border-slate-700">
                  <td className="p-2 text-slate-200">{p.procedure_name}</td>
                  <td className="p-2">
                    <select
                      value={p.patient_source || 'existing'}
                      onChange={e => setProcedure(i, 'patient_source', e.target.value)}
                      className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                    >
                      <option value="existing">Existing (convert open)</option>
                      <option value="incremental">Incremental (net-new)</option>
                    </select>
                  </td>
                  <td className="p-2">
                    {p.patient_source === 'existing' ? (
                      <input
                        type="number"
                        value={p.pct_converted_from_open ?? 20}
                        onChange={e => setProcedure(i, 'pct_converted_from_open', parseFloat(e.target.value) || 0)}
                        className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
                      />
                    ) : <span className="text-slate-500 text-xs">—</span>}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={p.incremental_cases_monthly || 0}
                      onChange={e => setProcedure(i, 'incremental_cases_monthly', parseFloat(e.target.value) || 0)}
                      className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={p.reimbursement_rate || 0}
                      onChange={e => setProcedure(i, 'reimbursement_rate', parseFloat(e.target.value) || 0)}
                      className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
                    />
                  </td>
                  <td className="p-2 text-right text-emerald-300 font-semibold">{fmt(annual)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Free-Text Intel (CSR notes)</label>
        <textarea
          value={s.free_text_intel || ''}
          onChange={e => setS({ ...s, free_text_intel: e.target.value })}
          placeholder="e.g., Started October 2025, needs 1 day/week, 6 month backlog..."
          rows={2}
          className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-700">
        <div className="text-sm">
          <span className="text-slate-400">Live total: </span>
          <strong className="text-emerald-300">{fmt(previewCases)} cases/yr</strong>
          <span className="text-slate-500"> · </span>
          <strong className="text-cyan-300">{fmtMoney(previewRevenue)}</strong>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded">
            {saving ? 'Saving...' : 'Save Commitment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Surgeon Row (read-only display) ───
function SurgeonRow({ s, category, onEdit, onDelete }) {
  const cases = s.total_incremental_annual || 0
  const revenue = parseFloat(s.total_revenue_impact || 0)
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-2 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">{s.surgeon_name}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400">{s.surgeon_specialty}</span>
          {s.trained === false && <span className="text-[10px] uppercase font-bold bg-amber-900/50 text-amber-300 px-1.5 py-0.5 rounded">Untrained</span>}
          {s.proctoring_needed && <span className="text-[10px] uppercase font-bold bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">Needs Proctoring</span>}
        </div>
        {s.training_needs && <div className="text-[11px] text-slate-500 mt-0.5">Training: {s.training_needs}</div>}
        {category === 'pull_forward' && s.current_weekly_volume && (
          <div className="text-[11px] text-cyan-400 mt-0.5">
            {s.current_weekly_volume}/wk → {s.target_weekly_volume}/wk
            {s.backlog_weeks ? ` (${s.backlog_weeks}-wk backlog)` : ''}
          </div>
        )}
        {s.free_text_intel && <div className="text-[10px] text-slate-500 italic mt-1 truncate">{s.free_text_intel}</div>}
      </div>
      <div className="text-right">
        <div className="font-bold text-emerald-300">{fmt(cases)}</div>
        <div className="text-[10px] text-slate-500">cases/yr</div>
      </div>
      <div className="text-right">
        <div className="font-bold text-cyan-300">{revenue >= 1000 ? '$' + (revenue / 1000).toFixed(0) + 'K' : fmtMoney(revenue)}</div>
        <div className="text-[10px] text-slate-500">revenue</div>
      </div>
      <div className="flex gap-1">
        <button onClick={onEdit} className="text-xs text-slate-400 hover:text-white px-2">Edit</button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 px-2">Delete</button>
      </div>
    </div>
  )
}

// ─── Tab Panel ───
function TabPanel({ category, title, description, surgeons, plan, planId, onChange }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = surgeons.filter(s => (s.commitment_category || 'open_to_mis') === category)
  const totalCases = filtered.reduce((t, s) => t + (s.total_incremental_annual || 0), 0)
  const totalRevenue = filtered.reduce((t, s) => t + parseFloat(s.total_revenue_impact || 0), 0)

  async function handleDelete(id) {
    if (!confirm('Delete this surgeon commitment?')) return
    try {
      await api.deleteSurgeon(planId, id)
      onChange()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-sm text-slate-400 mb-3">{description}</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
            <div className="text-2xl font-bold text-white">{filtered.length}</div>
            <div className="text-[11px] text-slate-500">Surgeons</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
            <div className="text-2xl font-bold text-emerald-300">{fmt(totalCases)}</div>
            <div className="text-[11px] text-slate-500">Cases/yr</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
            <div className="text-2xl font-bold text-cyan-300">{fmtMoney(totalRevenue)}</div>
            <div className="text-[11px] text-slate-500">Revenue impact</div>
          </div>
        </div>
      </div>

      {editing !== null && (
        <SurgeonForm
          initial={surgeons.find(s => s.id === editing)}
          category={category}
          planId={planId}
          onSave={() => { setEditing(null); onChange() }}
          onCancel={() => setEditing(null)}
        />
      )}

      {adding && (
        <SurgeonForm
          category={category}
          planId={planId}
          onSave={() => { setAdding(false); onChange() }}
          onCancel={() => setAdding(false)}
        />
      )}

      {!adding && editing === null && (
        <button onClick={() => setAdding(true)} className="mb-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          + Add Surgeon Commitment
        </button>
      )}

      <div>
        {filtered.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No surgeons in this category yet.</div>
        ) : (
          filtered.map(s => (
            <SurgeonRow
              key={s.id}
              s={s}
              category={category}
              onEdit={() => setEditing(s.id)}
              onDelete={() => handleDelete(s.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───
export default function SurgeonCommitmentsPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [surgeons, setSurgeons] = useState([])
  const [activeTab, setActiveTab] = useState('open_to_mis')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    if (!id) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const plansRes = await api.listBusinessPlans(id)
      const plans = plansRes.data || []
      if (!plans.length) {
        setError('No business plan found. Generate a plan first from the Analysis page.')
        setLoading(false)
        return
      }
      const latestPlan = plans[0]
      setPlan(latestPlan)
      const surgRes = await api.listSurgeons(latestPlan.id)
      setSurgeons(surgRes.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading commitments...</div>
  if (error) return <div className="p-10 text-red-400">{error}</div>

  const TABS = [
    { key: 'open_to_mis', label: 'Open-to-MIS Conversion', description: 'Surgeons converting their EXISTING open volume to robotic. Bed-day savings driver. (Deck 3 Slide 9)', color: 'border-red-500' },
    { key: 'pull_forward', label: 'Pull-Forward / Capacity', description: 'Proficient surgeons blocked by access. "Currently 2/wk, can do 4/wk if granted access." Incremental volume driver. (Deck 3 Slide 10)', color: 'border-cyan-500' },
    { key: 'training_pipeline', label: 'Training Pipeline', description: 'Untrained surgeons needing TR200. Future incremental volume after credentialing. (Deck 3 Slide 11)', color: 'border-violet-500' },
  ]

  const grandTotalCases = surgeons.reduce((t, s) => t + (s.total_incremental_annual || 0), 0)
  const grandTotalRevenue = surgeons.reduce((t, s) => t + parseFloat(s.total_revenue_impact || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Surgeon Commitments</h1>
          <p className="text-sm text-slate-400">3-category CFO-grade tracking · {plan?.plan_name || 'Plan ' + plan?.id}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/business-plan/${id}`)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            Business Plan
          </button>
          <button onClick={() => navigate(`/executive/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded font-semibold">
            View Executive Brief →
          </button>
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded p-4">
          <div className="text-3xl font-bold text-white">{surgeons.length}</div>
          <div className="text-xs text-slate-400">Total Surgeons</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded p-4">
          <div className="text-3xl font-bold text-emerald-300">{fmt(grandTotalCases)}</div>
          <div className="text-xs text-slate-400">Total Cases/yr</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded p-4">
          <div className="text-3xl font-bold text-cyan-300">{fmtMoney(grandTotalRevenue)}</div>
          <div className="text-xs text-slate-400">Total Revenue Impact</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-700 mb-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const count = surgeons.filter(s => (s.commitment_category || 'open_to_mis') === t.key).length
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${active ? t.color + ' text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                {t.label} <span className={`ml-2 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active tab */}
      <TabPanel
        category={activeTab}
        title={TABS.find(t => t.key === activeTab).label}
        description={TABS.find(t => t.key === activeTab).description}
        surgeons={surgeons}
        plan={plan}
        planId={plan?.id}
        onChange={load}
      />
    </div>
  )
}

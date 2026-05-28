import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import PageNotes from '../components/PageNotes'

const COLOR_OPEN_TO_MIS = '#dc2626'
const COLOR_PULL_FORWARD = '#0891b2'
const COLOR_TRAINING = '#7c3aed'
const COLOR_EMERALD = '#10b981'
const COLOR_CYAN = '#06b6d4'
const COLOR_AMBER = '#f59e0b'

const categoryColor = (cat) => {
  if (cat === 'pull_forward') return COLOR_PULL_FORWARD
  if (cat === 'training_pipeline') return COLOR_TRAINING
  return COLOR_OPEN_TO_MIS
}
const categoryLabel = (cat) => {
  if (cat === 'pull_forward') return 'Pull-Forward'
  if (cat === 'training_pipeline') return 'Training Pipeline'
  return 'Open-to-MIS'
}

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
      pct_converted_from_open: category === 'open_to_mis' ? 15 : null,
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
      pct_converted_from_open: category === 'open_to_mis' ? 15 : null,
      incremental_cases_monthly: 0,
      reimbursement_rate: p.rate,
    }))
    setS({ ...s, surgeon_specialty: spec, procedures: newProcs })
  }

  // Per-procedure annual cases (mirrors backend math):
  //   CONVERTED ('existing')  = OPEN cases/mo × 12 × % converted (laparoscopic NEVER counted)
  //   INCREMENTAL ('incremental') = direct annual figure the capital manager entered
  const procAnnual = (p) => {
    if (p.patient_source === 'existing') {
      const monthly = parseFloat(p.incremental_cases_monthly || 0)
      const pct = parseFloat(p.pct_converted_from_open || 15) / 100
      return Math.round(monthly * 12 * pct)
    }
    return Math.round(parseFloat(p.incremental_cases_annual || 0))
  }
  // Live totals — Converted and Incremental kept SEPARATE (2026-05-26 review)
  const convertedCases = s.procedures.filter(p => p.patient_source === 'existing').reduce((t, p) => t + procAnnual(p), 0)
  const incrementalCases = s.procedures.filter(p => p.patient_source === 'incremental').reduce((t, p) => t + procAnnual(p), 0)
  const previewCases = convertedCases + incrementalCases
  const previewRevenue = s.procedures.reduce((tot, p) => tot + procAnnual(p) * parseFloat(p.reimbursement_rate || 0), 0)

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
        <div className="text-[11px] text-slate-400 mb-2 space-y-0.5">
          <div><span className="text-red-300 font-semibold">CONVERTED</span> (Existing): system auto-calculates <strong>OPEN volume only</strong> × the % below. Laparoscopic is NEVER counted. Default 15%. Enter OPEN cases/mo.</div>
          <div><span className="text-cyan-300 font-semibold">INCREMENTAL</span> (Net-new): capital manager enters the surgeon-committed <strong>net-new cases/yr</strong> directly (volume brought from another hospital). No conversion %.</div>
        </div>
        <table className="w-full text-sm border border-slate-700">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left p-2">Procedure</th>
              <th className="text-left p-2">Type</th>
              <th className="text-right p-2" title="Percent of OPEN volume only — laparoscopic excluded">% of OPEN</th>
              <th className="text-right p-2">Open Cases/Mo</th>
              <th className="text-right p-2" title="Surgeon-committed net-new cases per year (manual entry)">Net-new/Yr</th>
              <th className="text-right p-2">$/Case</th>
              <th className="text-right p-2">Annual</th>
            </tr>
          </thead>
          <tbody>
            {s.procedures.map((p, i) => {
              const isInc = p.patient_source === 'incremental'
              const annual = procAnnual(p)
              return (
                <tr key={i} className="border-t border-slate-700">
                  <td className="p-2 text-slate-200">{p.procedure_name}</td>
                  <td className="p-2">
                    <select
                      value={p.patient_source || 'existing'}
                      onChange={e => setProcedure(i, 'patient_source', e.target.value)}
                      className={`bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs ${isInc ? 'text-cyan-300' : 'text-red-300'}`}
                    >
                      <option value="existing">Converted (open)</option>
                      <option value="incremental">Incremental (net-new)</option>
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    {!isInc ? (
                      <input
                        type="number"
                        value={p.pct_converted_from_open ?? 15}
                        onChange={e => setProcedure(i, 'pct_converted_from_open', parseFloat(e.target.value) || 0)}
                        title="% of OPEN volume only. Laparoscopic cases are NEVER counted."
                        className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
                      />
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="p-2 text-right">
                    {!isInc ? (
                      <input
                        type="number"
                        value={p.incremental_cases_monthly || 0}
                        onChange={e => setProcedure(i, 'incremental_cases_monthly', parseFloat(e.target.value) || 0)}
                        className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
                      />
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="p-2 text-right">
                    {isInc ? (
                      <input
                        type="number"
                        value={p.incremental_cases_annual || 0}
                        onChange={e => setProcedure(i, 'incremental_cases_annual', parseFloat(e.target.value) || 0)}
                        title="Surgeon-committed net-new cases per year — manual entry by capital manager"
                        className="w-20 bg-slate-900 border border-cyan-700 rounded px-2 py-1 text-cyan-200 text-xs text-right"
                      />
                    ) : <span className="text-slate-600 text-xs">—</span>}
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
          <div className="text-[11px] text-slate-500 mt-0.5">
            <span className="text-red-300">{fmt(convertedCases)} converted</span> + <span className="text-cyan-300">{fmt(incrementalCases)} incremental (net-new)</span>
          </div>
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
  const incrementalCases = (Array.isArray(s.procedures) ? s.procedures : [])
    .filter(p => p.patient_source === 'incremental')
    .reduce((t, p) => t + (parseInt(p.incremental_cases_annual || 0) || 0), 0)
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
        <div className="font-bold text-violet-300">{fmt(incrementalCases)}</div>
        <div className="text-[10px] text-slate-500">incremental</div>
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
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

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

  async function loadEnrichment() {
    if (!id) return
    setEnrichmentLoading(true)
    try {
      const r = await api.getSurgeonCommitmentsEnrichment(id)
      setEnrichment(r.data)
    } catch (e) { console.error('commitments enrichment:', e) }
    finally { setEnrichmentLoading(false) }
  }

  useEffect(() => { load(); loadEnrichment() }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading commitments...</div>
  if (error) return <div className="p-10 text-red-400">{error}</div>

  const TABS = [
    { key: 'open_to_mis', label: 'Open-to-MIS Conversion', description: 'Surgeons converting their EXISTING OPEN volume (not laparoscopic) to robotic at 15% default. Bed-day savings driver. (Deck 3 Slide 9)', color: 'border-red-500' },
    { key: 'pull_forward', label: 'Pull-Forward / Capacity', description: 'Proficient surgeons blocked by access. "Currently 2/wk, can do 4/wk if granted access." Incremental volume driver. (Deck 3 Slide 10)', color: 'border-cyan-500' },
    { key: 'training_pipeline', label: 'Training Pipeline', description: 'Untrained surgeons needing TR200. Future incremental volume after credentialing. (Deck 3 Slide 11)', color: 'border-violet-500' },
  ]

  const grandTotalCases = surgeons.reduce((t, s) => t + (s.total_incremental_annual || 0), 0)
  const grandTotalRevenue = surgeons.reduce((t, s) => t + parseFloat(s.total_revenue_impact || 0), 0)
  // Converted vs Incremental split across the whole roster (computed from stored procedures)
  const splitTotals = surgeons.reduce((acc, s) => {
    for (const p of (Array.isArray(s.procedures) ? s.procedures : [])) {
      const a = parseInt(p.incremental_cases_annual || 0)
      if (p.patient_source === 'incremental') acc.incremental += a
      else acc.converted += a
    }
    return acc
  }, { converted: 0, incremental: 0 })

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 7 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Surgeon Commitments — {plan?.plan_name || 'Plan ' + plan?.id}</h1>
          <p className="text-sm text-slate-400">3-category CFO-grade tracking · Open-to-MIS / Pull-Forward / Training Pipeline</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/clinical-overlay/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Clinical Overlay</button>
          <button onClick={() => navigate(`/executive/${id}`)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            View Executive Brief
          </button>
          <button onClick={() => navigate(`/business-plan/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
            Next: Business Plan →
          </button>
        </div>
      </div>

      {/* Conversion vs Incremental — plain-language explainer (2026-05-26 review) */}
      <div className="grid md:grid-cols-2 gap-3 mb-5">
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <div className="text-sm font-bold text-red-300 mb-1">Conversion (existing surgeons, this hospital)</div>
          <div className="text-xs text-slate-300 leading-relaxed">
            Existing surgeons moving their <strong>own OPEN cases</strong> to robotic — volume the hospital
            <strong> already has</strong>. The system estimates it as <strong>open volume × 15%</strong>.
            This is the <strong>goal expectation</strong> from the current roster and needs <strong>no survey</strong>.
            Drives clinical savings (shorter stays, fewer complications) + conversion revenue.
          </div>
        </div>
        <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-lg p-4">
          <div className="text-sm font-bold text-cyan-300 mb-1">Incremental (net-new from another hospital)</div>
          <div className="text-xs text-slate-300 leading-relaxed">
            <strong>New</strong> cases a surgeon commits to <strong>bring from another hospital</strong> if given access —
            volume the hospital <strong>does not have today</strong>. Source: <strong>surgeon survey &amp; commitment</strong>
            (the ASM conversation), typically <strong>20–40 cases/yr</strong> each. Entered manually. Drives incremental revenue.
          </div>
        </div>
      </div>

      {/* Grand totals — Converted and Incremental are SEPARATE cards (2026-05-26 review) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded p-4">
          <div className="text-3xl font-bold text-white">{surgeons.length}</div>
          <div className="text-xs text-slate-400">Total Surgeons</div>
          <div className="text-[11px] text-slate-500 mt-1">{fmt(grandTotalCases)} total cases/yr</div>
        </div>
        <div className="bg-slate-800/60 border border-red-700/40 rounded p-4">
          <div className="text-3xl font-bold text-red-300">{fmt(splitTotals.converted)}</div>
          <div className="text-xs text-slate-400">Converted Cases/yr</div>
          <div className="text-[11px] text-slate-500 mt-1">Existing OPEN × % · auto</div>
        </div>
        <div className="bg-slate-800/60 border border-cyan-700/40 rounded p-4">
          <div className="text-3xl font-bold text-cyan-300">{fmt(splitTotals.incremental)}</div>
          <div className="text-xs text-slate-400">Incremental Cases/yr</div>
          <div className="text-[11px] text-slate-500 mt-1">Net-new · manually entered</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded p-4">
          <div className="text-3xl font-bold text-emerald-300">{fmtMoney(grandTotalRevenue)}</div>
          <div className="text-xs text-slate-400">Total Revenue Impact</div>
        </div>
      </div>

      {/* ═══ ADDITION #4: Aggregated Commitment Summary ═══ */}
      {enrichment?.summary && (
        <div className="bg-gradient-to-br from-emerald-900/30 via-cyan-900/20 to-slate-900/40 border-2 border-emerald-700/40 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">Executive Summary</h3>
            <span className="text-xs text-emerald-300 font-bold">Combined Impact: ${(enrichment.summary.total_combined_impact / 1e6).toFixed(1)}M</span>
          </div>
          <p className="text-xs text-slate-300 mb-4">{enrichment.summary.headline}</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Surgeons</div>
              <div className="text-2xl font-bold text-white mt-1">{enrichment.summary.total_surgeons}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cases/Yr</div>
              <div className="text-2xl font-bold text-cyan-300 mt-1">{enrichment.summary.total_incremental_cases.toLocaleString()}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Revenue</div>
              <div className="text-2xl font-bold text-amber-300 mt-1">${(enrichment.summary.total_revenue_impact / 1e6).toFixed(1)}M</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Bed Days Saved</div>
              <div className="text-2xl font-bold text-emerald-300 mt-1">{enrichment.summary.total_bed_days_saved.toLocaleString()}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cost Avoidance</div>
              <div className="text-2xl font-bold text-violet-300 mt-1">${(enrichment.summary.total_bed_day_value / 1e6).toFixed(1)}M</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INFOGRAPHIC #4: Commitment Composition Donut + Bed Days top contributors ═══ */}
      {enrichment?.summary && enrichment?.per_surgeon_bed_days && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Composition donut */}
          {enrichment.summary.composition.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
              <h3 className="font-bold text-white mb-1">Commitment Composition</h3>
              <p className="text-xs text-slate-500 mb-4">Surgeon distribution across the 3 categories</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={enrichment.summary.composition}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      label={(e) => `${e.value} (${e.cases} cases)`}
                      labelLine={true}
                      style={{ fontSize: 10, fill: '#cbd5e1' }}
                    >
                      {enrichment.summary.composition.map((c, i) => (
                        <Cell key={i} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-Surgeon Bed Days bars */}
          {enrichment.per_surgeon_bed_days.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
              <h3 className="font-bold text-white mb-1">Per-Surgeon Bed Days Saved</h3>
              <p className="text-xs text-slate-500 mb-4">Top contributors · cases × LOS delta per procedure</p>
              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={enrichment.per_surgeon_bed_days.slice(0, 10)}
                    layout="vertical"
                    margin={{ left: 110, right: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                    <YAxis dataKey="surgeon_name" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={105} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Bar dataKey="bed_days_saved" name="Bed Days Saved">
                      {enrichment.per_surgeon_bed_days.slice(0, 10).map((s, i) => (
                        <Cell key={i} fill={categoryColor(s.commitment_category)} />
                      ))}
                      <LabelList dataKey="bed_days_saved" position="right" style={{ fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ADDITION #3 + INFOGRAPHIC #3: Pull-Forward Capacity Visualization (Deck 3 Slide 10) ═══ */}
      {enrichment?.pull_forward_capacity?.length > 0 && enrichment.pull_forward_capacity.reduce((s, p) => s + (p.additional_annual_cases || 0), 0) > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Pull-Forward Capacity — Current vs Target Weekly Volume</h3>
          <p className="text-xs text-slate-500 mb-4">
            Surgeons blocked by access. Sorted by urgency (backlog weeks + capacity gap).
            Total additional annual cases if access granted: <strong className="text-cyan-300">{enrichment.pull_forward_capacity.reduce((s, p) => s + p.additional_annual_cases, 0).toLocaleString()}</strong>
          </p>
          <div style={{ height: Math.max(280, enrichment.pull_forward_capacity.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={enrichment.pull_forward_capacity}
                layout="vertical"
                margin={{ left: 130, right: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} unit=" cases/wk" />
                <YAxis dataKey="surgeon_name" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={125} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="current_weekly" fill="#64748b" name="Current Cases/Wk">
                  <LabelList dataKey="current_weekly" position="right" style={{ fill: '#94a3b8', fontSize: 10 }} />
                </Bar>
                <Bar dataKey="target_weekly" fill={COLOR_CYAN} name="Target Cases/Wk (with access)">
                  <LabelList dataKey="target_weekly" position="right" style={{ fill: '#06b6d4', fontSize: 10, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            {enrichment.pull_forward_capacity.filter(p => p.backlog_weeks > 0).length} surgeons have patient backlog &gt; 0 weeks — the strongest urgency signal.
          </div>
        </div>
      )}

      {/* ═══ ADDITION #1 + INFOGRAPHIC #1: Master Surgeon Table (Deck 1 Slide 11) ═══ */}
      {enrichment?.master_table?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Master Surgeon Table — All Categories</h3>
          <p className="text-xs text-slate-500 mb-4">
            Deck 1 Slide 11 format · All {enrichment.master_table.length} surgeons consolidated · Converted (open×%) and Incremental (net-new) shown separately
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left pb-2">Surgeon Name</th>
                  <th className="text-left pb-2">Specialty</th>
                  <th className="text-center pb-2">Trained</th>
                  <th className="text-left pb-2">Training Needs</th>
                  <th className="text-right pb-2">Conversion Cases/Yr</th>
                  <th className="text-right pb-2">Incremental Cases/Yr</th>
                  <th className="text-left pb-2">Category</th>
                </tr>
              </thead>
              <tbody>
                {enrichment.master_table.map((s, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="py-2 text-white font-semibold">{s.surgeon_name}</td>
                    <td className="py-2 text-slate-300">{s.specialty}</td>
                    <td className="py-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.trained ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>
                        {s.trained ? 'Trained' : 'Untrained'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400 text-xs">{s.training_needs || '—'}</td>
                    <td className="py-2 text-right text-red-300 font-bold">{(s.converted_cases_yr || 0).toLocaleString()}</td>
                    <td className="py-2 text-right text-cyan-300 font-bold">{(s.incremental_cases_yr || 0).toLocaleString()}</td>
                    <td className="py-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: categoryColor(s.commitment_category) + '40', color: categoryColor(s.commitment_category) }}>
                        {categoryLabel(s.commitment_category)}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-500 font-bold">
                  <td className="py-2 text-white">Total</td>
                  <td colSpan="3"></td>
                  <td className="py-2 text-right text-red-300">{enrichment.master_table.reduce((s, r) => s + (r.converted_cases_yr || 0), 0).toLocaleString()}</td>
                  <td className="py-2 text-right text-cyan-300">{enrichment.master_table.reduce((s, r) => s + (r.incremental_cases_yr || 0), 0).toLocaleString()}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #2 + INFOGRAPHIC #2: Per-Surgeon Bed Days Detail (Deck 3 Slide 9) ═══ */}
      {enrichment?.per_surgeon_bed_days?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Per-Surgeon Bed Days Detail</h3>
          <p className="text-xs text-slate-500 mb-4">
            Deck 3 Slide 9 format · {enrichment.per_surgeon_bed_days.reduce((s, p) => s + p.bed_days_saved, 0).toLocaleString()} total bed days saved across {enrichment.per_surgeon_bed_days.length} converting surgeons
          </p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Surgeon</th>
                <th className="text-left pb-2">Specialty</th>
                <th className="text-right pb-2">Total Cases</th>
                <th className="text-right pb-2">Bed Days Saved</th>
                <th className="text-right pb-2">$ Value</th>
                <th className="text-left pb-2">Procedure Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {enrichment.per_surgeon_bed_days.map((s, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white font-semibold">{s.surgeon_name}</td>
                  <td className="py-2 text-slate-400">{s.specialty || '—'}</td>
                  <td className="py-2 text-right text-cyan-300">{s.total_cases}</td>
                  <td className="py-2 text-right text-emerald-300 font-bold">{s.bed_days_saved.toLocaleString()}</td>
                  <td className="py-2 text-right text-amber-300">${(s.dollar_value / 1000).toFixed(0)}K</td>
                  <td className="py-2 text-[11px] text-slate-400">
                    {s.procedure_breakdown.map(p => `${p.procedure} (${p.cases}×${p.los_delta_days}d=${p.bed_days_saved})`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading deck-aligned visualizations (Master Table · Bed Days · Pull-Forward · Composition)...</div>
        </div>
      )}

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

      <PageNotes title="Surgeon Commitments">
        <p className="mb-2"><span className="text-white font-semibold">What this answers:</span> exactly how many extra cases each surgeon commits to bring, and what that is worth. This page is the <span className="text-white font-semibold">canonical source</span> of the program's volume and revenue.</p>
        <ul className="list-disc pl-5 space-y-1 mb-2">
          <li>Numbers here are <span className="text-white font-semibold">entered by the rep from the surgeons' own commitments</span> (not modeled). Each surgeon's committed cases are split into <span className="text-cyan-300">Converted</span> (an existing OPEN surgery switched to da Vinci — same case, new technique) and <span className="text-cyan-300">Incremental (net-new)</span> (additional cases recruited from elsewhere or grown).</li>
          <li><span className="text-amber-300">Incremental = net-new revenue volume.</span> These extra cases are the <span className="text-white font-semibold">new revenue</span> that flows into the Business Plan and drives IRR / NPV / payback.</li>
          <li><span className="text-emerald-300">Converted cases create cost avoidance, not new revenue</span> — value comes from bed-days saved (case count × the open→robotic length-of-stay delta per procedure, e.g. ~5 days for prostatectomy) at the state's bed-day cost.</li>
          <li>Three commitment categories: <span className="text-white font-semibold">Open-to-MIS</span> (conversions), <span className="text-white font-semibold">Pull-Forward</span> (capacity/backlog relief — extra weekly cases × ~50 weeks), and <span className="text-white font-semibold">Training Pipeline</span> (surgeons being onboarded).</li>
        </ul>
        <p><span className="text-white font-semibold">Bottom line:</span> the <span className="text-amber-300">revenue</span> total is money the hospital earns from net-new cases; the <span className="text-emerald-300">bed-day cost avoidance</span> total is money it stops losing. They are shown separately and are never added into one ROI figure.</p>
      </PageNotes>
    </div>
  )
}

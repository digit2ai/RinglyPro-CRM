import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// ─── Helpers ──────────────────────────────────────────────────

const fmt = (n) => n != null ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'
const fmtDollar = (n) => n != null ? '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'
const fmtMonths = (n) => n != null ? `${Number(n).toFixed(1)} mo` : '--'

const SYSTEM_TYPES = ['Xi', 'Xi Dual Console', 'dV5', 'dV5 Dual Console', 'SP', 'X']
const ACQUISITION_MODELS = ['Purchase', 'Lease', 'Usage-Based']

const CLINICAL_SPECIALTIES = [
  'Urology', 'Gynecology', 'General Surgery', 'Colorectal',
  'Thoracic', 'Head & Neck', 'Cardiac'
]

// ─── Shared UI ────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = false }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center hover:border-slate-600 transition-all">
      <div className={`text-2xl font-black ${accent ? 'text-green-400' : 'text-intuitive-400'}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-300 mt-1.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

function CollapsibleSection({ title, subtitle, defaultOpen = false, actions, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-800/80 transition-colors"
      >
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {actions && <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">{actions}</div>}
          <svg className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-6 pb-6 border-t border-slate-700/50">{children}</div>}
    </div>
  )
}

function InputField({ label, type = 'text', value, onChange, placeholder, prefix, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>}
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-600 focus:border-intuitive-500 focus:ring-1 focus:ring-intuitive-500 outline-none transition-colors ${prefix ? 'pl-7' : ''}`}
        />
      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-intuitive-500 focus:ring-1 focus:ring-intuitive-500 outline-none transition-colors"
      >
        <option value="">Select...</option>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, className = '' }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-sm' }
  const variants = {
    primary: 'bg-intuitive-600 hover:bg-intuitive-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    danger: 'bg-red-900/60 hover:bg-red-900/80 text-red-300 border border-red-800',
    success: 'bg-green-900/60 hover:bg-green-900/80 text-green-300 border border-green-800',
    ghost: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Spinner({ text = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <svg className="animate-spin w-10 h-10 text-intuitive-500 mx-auto mb-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400">{text}</p>
      </div>
    </div>
  )
}

// ─── Create Plan Form ─────────────────────────────────────────

function CreatePlanForm({ projectId, onCreated }) {
  const [form, setForm] = useState({
    plan_name: '', system_type: '', system_price: '', annual_service_cost: '',
    system_quantity: 1, acquisition_model: 'Purchase', prepared_by: '', prepared_for: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate() {
    if (!form.plan_name || !form.system_type) {
      setError('Plan name and system type are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.createBusinessPlan({
        project_id: projectId,
        ...form,
        system_price: form.system_price || 0,
        annual_service_cost: form.annual_service_cost || 0,
        system_quantity: form.system_quantity || 1,
      })
      onCreated(res.business_plan || res.data || res)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <SectionHeader title="Create Business Plan" subtitle="Define the system proposal parameters for this project" />
      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InputField label="Plan Name" value={form.plan_name} onChange={v => set('plan_name', v)} placeholder="e.g. Memorial Health Xi Proposal" className="lg:col-span-2" />
        <SelectField label="System Type" value={form.system_type} onChange={v => set('system_type', v)} options={SYSTEM_TYPES} />
        <InputField label="System Price" type="number" value={form.system_price} onChange={v => set('system_price', v)} prefix="$" placeholder="0" />
        <InputField label="Annual Service Cost" type="number" value={form.annual_service_cost} onChange={v => set('annual_service_cost', v)} prefix="$" placeholder="0" />
        <InputField label="System Quantity" type="number" value={form.system_quantity} onChange={v => set('system_quantity', v)} placeholder="1" />
        <SelectField label="Acquisition Model" value={form.acquisition_model} onChange={v => set('acquisition_model', v)} options={ACQUISITION_MODELS} />
        <InputField label="Prepared By" value={form.prepared_by} onChange={v => set('prepared_by', v)} placeholder="Your name" />
        <InputField label="Prepared For" value={form.prepared_for} onChange={v => set('prepared_for', v)} placeholder="Hospital / decision maker" />
      </div>

      <div className="mt-6 flex justify-end">
        <Btn onClick={handleCreate} disabled={saving} size="lg">
          {saving ? 'Creating...' : 'Create Business Plan'}
        </Btn>
      </div>
    </div>
  )
}

// ─── Plan Header (Edit Mode) ─────────────────────────────────

function PlanHeader({ plan, onUpdate, onRecalculate, recalculating }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    if (plan) setForm({
      plan_name: plan.plan_name || '',
      system_type: plan.system_type || '',
      system_price: plan.system_price || 0,
      annual_service_cost: plan.annual_service_cost || 0,
      system_quantity: plan.system_quantity || 1,
      acquisition_model: plan.acquisition_model || 'Purchase',
      prepared_by: plan.prepared_by || '',
      prepared_for: plan.prepared_for || '',
    })
  }, [plan])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    await onUpdate(form)
    setEditing(false)
  }

  const statusColors = {
    draft: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    finalized: 'bg-green-900/40 text-green-300 border-green-800',
    archived: 'bg-slate-700 text-slate-400 border-slate-600',
  }
  const statusClass = statusColors[plan.status] || statusColors.draft

  if (!editing) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">{plan.plan_name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusClass}`}>
                {plan.status || 'draft'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400 mt-2">
              <span>System: <strong className="text-slate-200">da Vinci {plan.system_type}</strong></span>
              <span>Price: <strong className="text-slate-200">{fmtDollar(plan.system_price)}</strong></span>
              <span>Service: <strong className="text-slate-200">{fmtDollar(plan.annual_service_cost)}/yr</strong></span>
              <span>Qty: <strong className="text-slate-200">{plan.system_quantity || 1}</strong></span>
              <span>Model: <strong className="text-slate-200">{plan.acquisition_model}</strong></span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 mt-1">
              {plan.prepared_by && <span>By: {plan.prepared_by}</span>}
              {plan.prepared_for && <span>For: {plan.prepared_for}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Btn>
            <Btn size="sm" onClick={onRecalculate} disabled={recalculating}>
              {recalculating ? 'Calculating...' : 'Recalculate'}
            </Btn>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-intuitive-600 rounded-xl p-6">
      <SectionHeader title="Edit Business Plan" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InputField label="Plan Name" value={form.plan_name} onChange={v => set('plan_name', v)} className="lg:col-span-2" />
        <SelectField label="System Type" value={form.system_type} onChange={v => set('system_type', v)} options={SYSTEM_TYPES} />
        <InputField label="System Price" type="number" value={form.system_price} onChange={v => set('system_price', v)} prefix="$" />
        <InputField label="Annual Service Cost" type="number" value={form.annual_service_cost} onChange={v => set('annual_service_cost', v)} prefix="$" />
        <InputField label="System Quantity" type="number" value={form.system_quantity} onChange={v => set('system_quantity', v)} />
        <SelectField label="Acquisition Model" value={form.acquisition_model} onChange={v => set('acquisition_model', v)} options={ACQUISITION_MODELS} />
        <InputField label="Prepared By" value={form.prepared_by} onChange={v => set('prepared_by', v)} />
        <InputField label="Prepared For" value={form.prepared_for} onChange={v => set('prepared_for', v)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn>
        <Btn onClick={handleSave}>Save Changes</Btn>
      </div>
    </div>
  )
}

// ─── ROI Summary Cards ────────────────────────────────────────

function ROISummary({ plan }) {
  const totals = plan.calculated_totals || plan.totals || {}
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard label="Incremental Cases/Year" value={fmt(totals.total_annual_cases || 0)} />
      <MetricCard label="Incremental Revenue" value={fmtDollar(totals.total_revenue || 0)} accent />
      <MetricCard label="Clinical Outcome Savings" value={fmtDollar(totals.total_clinical_savings || 0)} accent />
      <MetricCard label="Combined ROI" value={totals.combined_roi_pct != null ? `${Number(totals.combined_roi_pct).toFixed(1)}%` : '--'} />
      <MetricCard label="Payback Period" value={fmtMonths(totals.payback_months)} />
    </div>
  )
}

// ─── Surgeon Commitments ──────────────────────────────────────

function SurgeonCommitmentsSection({ planId, surgeons, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ surgeon_name: '', email: '', phone: '', specialty: '', procedures: [{ procedure_type: '', incremental_cases_month: 1, drg_reimbursement: 0 }] })
  const [drgProcedures, setDrgProcedures] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.listDRGProcedures().then(res => setDrgProcedures(res.procedures || res.data || [])).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function setProcedure(idx, key, value) {
    setForm(f => {
      const procs = [...f.procedures]
      procs[idx] = { ...procs[idx], [key]: value }
      return { ...f, procedures: procs }
    })
  }

  function addProcedureRow() {
    setForm(f => ({ ...f, procedures: [...f.procedures, { procedure_type: '', incremental_cases_month: 1, drg_reimbursement: 0 }] }))
  }

  function removeProcedureRow(idx) {
    setForm(f => ({ ...f, procedures: f.procedures.filter((_, i) => i !== idx) }))
  }

  async function handleDRGLookup(idx) {
    const procType = form.procedures[idx]?.procedure_type
    if (!procType) return
    try {
      const res = await api.lookupDRG(procType)
      const rate = res.reimbursement_rate || res.data?.reimbursement_rate || res.average_reimbursement || 0
      setProcedure(idx, 'drg_reimbursement', rate)
    } catch { /* ignore */ }
  }

  function resetForm() {
    setForm({ surgeon_name: '', email: '', phone: '', specialty: '', procedures: [{ procedure_type: '', incremental_cases_month: 1, drg_reimbursement: 0 }] })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(surgeon) {
    setForm({
      surgeon_name: surgeon.surgeon_name || '',
      email: surgeon.email || '',
      phone: surgeon.phone || '',
      specialty: surgeon.specialty || '',
      procedures: surgeon.procedures?.length ? surgeon.procedures : [{ procedure_type: '', incremental_cases_month: 1, drg_reimbursement: 0 }],
    })
    setEditingId(surgeon.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.surgeon_name) { setError('Surgeon name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await api.updateSurgeon(planId, editingId, form)
      } else {
        await api.addSurgeon(planId, form)
      }
      resetForm()
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(surgeonId) {
    try {
      await api.deleteSurgeon(planId, surgeonId)
      onRefresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const procedureOptions = drgProcedures.map(p => ({
    value: p.procedure_type || p.name || p,
    label: p.procedure_type || p.name || p,
  }))

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <SectionHeader
        title="Surgeon Commitments"
        subtitle="Track individual surgeon case volume and revenue commitments"
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => { /* navigate to surveys */ }}>Import from Survey</Btn>
            <Btn size="sm" onClick={() => { resetForm(); setShowForm(true) }}>+ Add Surgeon</Btn>
          </div>
        }
      />

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

      {/* Inline Add/Edit Form */}
      {showForm && (
        <div className="mb-6 p-5 bg-slate-900/70 border border-slate-600 rounded-xl">
          <h4 className="text-sm font-bold text-white mb-3">{editingId ? 'Edit Surgeon' : 'Add Surgeon'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <InputField label="Surgeon Name" value={form.surgeon_name} onChange={v => set('surgeon_name', v)} placeholder="Dr. Jane Smith" />
            <InputField label="Email" value={form.email} onChange={v => set('email', v)} placeholder="jsmith@hospital.org" />
            <InputField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="(555) 123-4567" />
            <InputField label="Specialty" value={form.specialty} onChange={v => set('specialty', v)} placeholder="e.g. Urology" />
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-400">Procedures</span>
              <Btn variant="ghost" size="sm" onClick={addProcedureRow}>+ Add Procedure</Btn>
            </div>
            {form.procedures.map((proc, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                <div className="col-span-5">
                  {procedureOptions.length > 0 ? (
                    <SelectField
                      label={idx === 0 ? 'Procedure Type' : undefined}
                      value={proc.procedure_type}
                      onChange={v => { setProcedure(idx, 'procedure_type', v); }}
                      options={procedureOptions}
                    />
                  ) : (
                    <InputField
                      label={idx === 0 ? 'Procedure Type' : undefined}
                      value={proc.procedure_type}
                      onChange={v => setProcedure(idx, 'procedure_type', v)}
                      placeholder="e.g. Prostatectomy"
                    />
                  )}
                </div>
                <div className="col-span-2">
                  <InputField
                    label={idx === 0 ? 'Cases/Mo' : undefined}
                    type="number"
                    value={proc.incremental_cases_month}
                    onChange={v => setProcedure(idx, 'incremental_cases_month', v)}
                  />
                </div>
                <div className="col-span-3">
                  <InputField
                    label={idx === 0 ? 'DRG Reimb. Rate' : undefined}
                    type="number"
                    value={proc.drg_reimbursement}
                    onChange={v => setProcedure(idx, 'drg_reimbursement', v)}
                    prefix="$"
                  />
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <Btn variant="ghost" size="sm" onClick={() => handleDRGLookup(idx)} className="text-intuitive-400 text-[10px]">DRG</Btn>
                </div>
                <div className="col-span-1 flex items-center">
                  {form.procedures.length > 1 && (
                    <Btn variant="ghost" size="sm" onClick={() => removeProcedureRow(idx)} className="text-red-400">X</Btn>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Btn variant="secondary" size="sm" onClick={resetForm}>Cancel</Btn>
            <Btn size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save'}</Btn>
          </div>
        </div>
      )}

      {/* Table */}
      {surgeons.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          No surgeon commitments yet. Add surgeons to build the revenue projection.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-700">
                <th className="pb-3 pr-3">Name</th>
                <th className="pb-3 pr-3">Specialty</th>
                <th className="pb-3 pr-3">Procedures</th>
                <th className="pb-3 pr-3 text-right">Mo. Cases</th>
                <th className="pb-3 pr-3 text-right">Annual Cases</th>
                <th className="pb-3 pr-3 text-right">Revenue Impact</th>
                <th className="pb-3 pr-3">Source</th>
                <th className="pb-3 pr-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {surgeons.map(s => {
                const procs = s.procedures || []
                const monthlyCases = procs.reduce((sum, p) => sum + (p.incremental_cases_month || 0), 0)
                const annualCases = monthlyCases * 12
                const revenue = procs.reduce((sum, p) => sum + ((p.incremental_cases_month || 0) * 12 * (p.drg_reimbursement || 0)), 0)
                return (
                  <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 pr-3 text-white font-medium">{s.surgeon_name}</td>
                    <td className="py-3 pr-3 text-slate-400">{s.specialty || '--'}</td>
                    <td className="py-3 pr-3 text-slate-400">{procs.map(p => p.procedure_type).filter(Boolean).join(', ') || '--'}</td>
                    <td className="py-3 pr-3 text-right text-slate-300">{fmt(monthlyCases)}</td>
                    <td className="py-3 pr-3 text-right text-slate-300">{fmt(annualCases)}</td>
                    <td className="py-3 pr-3 text-right text-green-400 font-semibold">{fmtDollar(revenue)}</td>
                    <td className="py-3 pr-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">{s.source || 'manual'}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        s.status === 'confirmed' ? 'bg-green-900/40 text-green-300' :
                        s.status === 'pending' ? 'bg-yellow-900/40 text-yellow-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>{s.status || 'draft'}</span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="ghost" size="sm" onClick={() => startEdit(s)}>Edit</Btn>
                        <Btn variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-red-400">Del</Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Clinical Outcome Dollarization ───────────────────────────

function ClinicalDollarizationSection({ planId, plan }) {
  const [caseData, setCaseData] = useState(
    CLINICAL_SPECIALTIES.map(s => ({
      specialty: s,
      annual_cases: 0,
      pct_open: 0,
      pct_laparoscopic: 0,
      pct_robotic: 0,
    }))
  )
  const [results, setResults] = useState(null)
  const [citations, setCitations] = useState([])
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisLoaded, setAnalysisLoaded] = useState(false)
  const [error, setError] = useState(null)

  // Map analysis specialty keys to display names
  const SPEC_MAP = {
    urology: 'Urology',
    gynecology: 'Gynecology',
    general: 'General Surgery',
    thoracic: 'Thoracic',
    colorectal: 'Colorectal',
    head_neck: 'Head & Neck',
    cardiac: 'Cardiac'
  }

  // Load from Analysis results (auto or manual)
  const loadFromAnalysis = useCallback(async () => {
    const projectId = plan?.project_id
    if (!projectId) return false
    setLoadingAnalysis(true)
    try {
      const res = await api.getResults(projectId)
      const analysisResults = res.results || res
      const volProj = analysisResults?.volume_projection
      if (!volProj?.bySpecialty) {
        setLoadingAnalysis(false)
        return false
      }

      const totalVol = volProj.total_surgical || 0
      setCaseData(prev => prev.map(row => {
        // Find matching specialty in analysis data
        const specKey = Object.keys(SPEC_MAP).find(k => SPEC_MAP[k] === row.specialty)
        const specData = specKey ? volProj.bySpecialty[specKey] : null
        if (!specData || !specData.total_volume) return row

        const total = specData.total_volume
        const pctOpen = total > 0 ? Math.round((specData.current_open / total) * 100) : 0
        const pctLap = total > 0 ? Math.round((specData.current_lap / total) * 100) : 0
        const pctRobotic = total > 0 ? Math.round((specData.current_robotic / total) * 100) : 0

        return {
          ...row,
          annual_cases: total,
          pct_open: pctOpen,
          pct_laparoscopic: pctLap,
          pct_robotic: pctRobotic
        }
      }))
      setAnalysisLoaded(true)
      setLoadingAnalysis(false)
      return true
    } catch (e) {
      console.error('Failed to load analysis for dollarization:', e)
      setLoadingAnalysis(false)
      return false
    }
  }, [plan?.project_id])

  // Load existing outcomes on mount, then auto-populate from analysis if empty
  useEffect(() => {
    if (!planId) return
    api.getClinicalOutcomes(planId)
      .then(res => {
        const data = res.outcomes || res.data
        if (data?.results) setResults(data.results)
        if (data?.citations) setCitations(data.citations)
        if (data?.hospital_case_data && data.hospital_case_data.length > 0) {
          // Existing dollarization data -- use it
          setCaseData(prev => {
            const map = {}
            ;(data.hospital_case_data || []).forEach(d => { map[d.specialty] = d })
            return prev.map(s => map[s.specialty] ? { ...s, ...map[s.specialty] } : s)
          })
        } else {
          // No existing data -- auto-load from analysis
          loadFromAnalysis()
        }
      })
      .catch(() => {
        // No outcomes saved yet -- auto-load from analysis
        loadFromAnalysis()
      })
  }, [planId, loadFromAnalysis])

  function updateCase(idx, key, value) {
    setCaseData(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value }
      return next
    })
  }

  async function handleCalculate() {
    const nonEmpty = caseData.filter(c => c.annual_cases > 0)
    if (nonEmpty.length === 0) { setError('Enter case data for at least one specialty.'); return }
    setCalculating(true)
    setError(null)
    try {
      const dollarRes = await api.dollarize(nonEmpty)
      const dollarData = dollarRes.data || dollarRes
      setResults(dollarData.results || dollarData.specialties || dollarData)
      setCitations(dollarData.citations || [])

      // Save to plan
      setSaving(true)
      await api.saveClinicalOutcomes(planId, nonEmpty, dollarData, {})
    } catch (err) {
      setError(err.message)
    } finally {
      setCalculating(false)
      setSaving(false)
    }
  }

  const totalSavings = results
    ? (Array.isArray(results)
        ? results.reduce((sum, r) => sum + (r.total_savings || r.annual_savings || 0), 0)
        : results.total_savings || 0
      )
    : 0

  return (
    <CollapsibleSection
      title="Clinical Outcome Dollarization"
      subtitle="Quantify clinical savings from robotic surgery adoption"
    >
      {error && <div className="mt-4 p-3 bg-red-900/40 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

      {analysisLoaded && (
        <div className="mt-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-300 text-sm flex items-center justify-between">
          <span>Case data auto-populated from hospital analysis (Step 2). You can adjust values if needed.</span>
          <button onClick={loadFromAnalysis} disabled={loadingAnalysis}
            className="ml-3 px-3 py-1 text-xs bg-emerald-800 hover:bg-emerald-700 rounded text-emerald-200 whitespace-nowrap">
            {loadingAnalysis ? 'Loading...' : 'Reload from Analysis'}
          </button>
        </div>
      )}

      {!analysisLoaded && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={loadFromAnalysis} disabled={loadingAnalysis}
            className="px-4 py-2 text-sm bg-intuitive-600 hover:bg-intuitive-500 disabled:opacity-50 rounded-lg text-white font-semibold transition-colors">
            {loadingAnalysis ? 'Loading...' : 'Auto-Fill from Hospital Analysis'}
          </button>
          <span className="text-xs text-slate-500">or enter case data manually below</span>
        </div>
      )}

      {/* Case Data Input */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-700">
              <th className="pb-3 pr-3">Specialty</th>
              <th className="pb-3 pr-3 text-right">Annual Cases</th>
              <th className="pb-3 pr-3 text-right">% Open</th>
              <th className="pb-3 pr-3 text-right">% Laparoscopic</th>
              <th className="pb-3 pr-3 text-right">% Robotic</th>
            </tr>
          </thead>
          <tbody>
            {caseData.map((row, idx) => (
              <tr key={row.specialty} className="border-b border-slate-800">
                <td className="py-2 pr-3 text-slate-300 font-medium">{row.specialty}</td>
                <td className="py-2 pr-3">
                  <input type="number" value={row.annual_cases || ''} onChange={e => updateCase(idx, 'annual_cases', Number(e.target.value) || 0)}
                    className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm" placeholder="0" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" value={row.pct_open || ''} onChange={e => updateCase(idx, 'pct_open', Number(e.target.value) || 0)}
                    className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm" placeholder="0" min="0" max="100" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" value={row.pct_laparoscopic || ''} onChange={e => updateCase(idx, 'pct_laparoscopic', Number(e.target.value) || 0)}
                    className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm" placeholder="0" min="0" max="100" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" value={row.pct_robotic || ''} onChange={e => updateCase(idx, 'pct_robotic', Number(e.target.value) || 0)}
                    className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm" placeholder="0" min="0" max="100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Btn onClick={handleCalculate} disabled={calculating || saving}>
          {calculating ? 'Calculating...' : saving ? 'Saving...' : 'Calculate Savings'}
        </Btn>
        {totalSavings > 0 && (
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Total Clinical Savings</div>
            <div className="text-2xl font-black text-green-400">{fmtDollar(totalSavings)}</div>
          </div>
        )}
      </div>

      {/* Results Table */}
      {results && Array.isArray(results) && results.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-bold text-white mb-3">Savings by Specialty</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-700">
                  <th className="pb-3 pr-3">Specialty</th>
                  <th className="pb-3 pr-3 text-right">LOS Reduction</th>
                  <th className="pb-3 pr-3 text-right">Complication Savings</th>
                  <th className="pb-3 pr-3 text-right">Readmission Savings</th>
                  <th className="pb-3 pr-3 text-right">Blood/Transfusion</th>
                  <th className="pb-3 pr-3 text-right">Total Savings</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-2.5 pr-3 text-slate-300 font-medium">{r.specialty || r.name}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-400">{fmtDollar(r.los_savings || r.length_of_stay_savings || 0)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-400">{fmtDollar(r.complication_savings || 0)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-400">{fmtDollar(r.readmission_savings || 0)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-400">{fmtDollar(r.blood_savings || r.transfusion_savings || 0)}</td>
                    <td className="py-2.5 pr-3 text-right text-green-400 font-semibold">{fmtDollar(r.total_savings || r.annual_savings || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <div className="mt-5 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Clinical Evidence Citations</h4>
          <ul className="space-y-1">
            {citations.map((c, i) => (
              <li key={i} className="text-xs text-slate-500">
                [{i + 1}] {typeof c === 'string' ? c : `${c.authors || ''} ${c.title || ''} ${c.journal || ''} ${c.year || ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleSection>
  )
}

// ─── Plan Actions ─────────────────────────────────────────────

function PlanActions({ plan, onFinalize, onRecalculate, recalculating, finalizing }) {
  const navigate = useNavigate()

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <SectionHeader title="Plan Actions" subtitle="Finalize or continue building the business plan" />
      <div className="flex flex-wrap gap-3">
        <Btn onClick={onRecalculate} disabled={recalculating}>
          {recalculating ? 'Calculating...' : 'Recalculate Totals'}
        </Btn>
        <Btn variant="success" onClick={onFinalize} disabled={finalizing || plan.status === 'finalized'}>
          {finalizing ? 'Finalizing...' : plan.status === 'finalized' ? 'Already Finalized' : 'Finalize Plan'}
        </Btn>
        <Btn variant="secondary" onClick={() => navigate(`/tracking/${plan.id}`)}>
          Track Actuals
        </Btn>
        <Btn variant="secondary" onClick={() => navigate(`/surveys?project_id=${plan.project_id}`)}>
          Surveys
        </Btn>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function BusinessPlanPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()

  const [plan, setPlan] = useState(null)
  const [plans, setPlans] = useState([])
  const [surgeons, setSurgeons] = useState([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState(null)

  const loadPlan = useCallback(async () => {
    if (!id) { setLoading(false); return }
    try {
      const res = await api.listBusinessPlans(id)
      const list = res.business_plans || res.data || []
      setPlans(list)
      if (list.length > 0) {
        const active = list.find(p => p.status !== 'archived') || list[0]
        setPlan(active)
        const sRes = await api.listSurgeons(active.id)
        setSurgeons(sRes.surgeons || sRes.data || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadPlan() }, [loadPlan])

  async function handleCreated(newPlan) {
    setPlan(newPlan)
    setSurgeons([])
    setPlans(prev => [...prev, newPlan])
  }

  async function handleUpdate(data) {
    try {
      const res = await api.updateBusinessPlan(plan.id, data)
      setPlan(res.business_plan || res.data || { ...plan, ...data })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const res = await api.calculatePlan(plan.id)
      setPlan(res.business_plan || res.data || plan)
    } catch (err) {
      setError(err.message)
    } finally {
      setRecalculating(false)
    }
  }

  async function handleFinalize() {
    setFinalizing(true)
    try {
      const res = await api.updateBusinessPlan(plan.id, { status: 'finalized' })
      setPlan(res.business_plan || res.data || { ...plan, status: 'finalized' })
    } catch (err) {
      setError(err.message)
    } finally {
      setFinalizing(false)
    }
  }

  async function refreshSurgeons() {
    if (!plan) return
    try {
      const sRes = await api.listSurgeons(plan.id)
      setSurgeons(sRes.surgeons || sRes.data || [])
    } catch { /* ignore */ }
  }

  if (!id) {
    return (
      <div className="p-10 text-slate-400">
        No project selected. Complete the hospital intake form first.
      </div>
    )
  }

  if (loading) return <Spinner text="Loading business plan..." />

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Business Plan Builder</h1>
        <p className="text-sm text-slate-500 mt-1">
          Build a comprehensive business case with surgeon commitments, clinical savings, and ROI analysis
        </p>
      </div>

      {/* Global Error */}
      {error && (
        <div className="p-3 bg-red-900/40 border border-red-800 rounded-lg text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-3">dismiss</button>
        </div>
      )}

      {/* Plan Selector (if multiple plans exist) */}
      {plans.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Plan:</span>
          {plans.map(p => (
            <button
              key={p.id}
              onClick={async () => {
                setPlan(p)
                const sRes = await api.listSurgeons(p.id)
                setSurgeons(sRes.surgeons || sRes.data || [])
              }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                plan?.id === p.id
                  ? 'bg-intuitive-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {p.plan_name || `Plan #${p.id}`}
            </button>
          ))}
        </div>
      )}

      {/* Section 1: Create or Header */}
      {!plan ? (
        <CreatePlanForm projectId={id} onCreated={handleCreated} />
      ) : (
        <PlanHeader
          plan={plan}
          onUpdate={handleUpdate}
          onRecalculate={handleRecalculate}
          recalculating={recalculating}
        />
      )}

      {/* Section 2: ROI Summary */}
      {plan && <ROISummary plan={plan} />}

      {/* Section 3: Surgeon Commitments */}
      {plan && (
        <SurgeonCommitmentsSection
          planId={plan.id}
          surgeons={surgeons}
          onRefresh={refreshSurgeons}
        />
      )}

      {/* Section 4: Clinical Dollarization */}
      {plan && (
        <ClinicalDollarizationSection planId={plan.id} plan={plan} />
      )}

      {/* Section 5: Plan Actions */}
      {plan && (
        <PlanActions
          plan={plan}
          onFinalize={handleFinalize}
          onRecalculate={handleRecalculate}
          recalculating={recalculating}
          finalizing={finalizing}
        />
      )}
    </div>
  )
}

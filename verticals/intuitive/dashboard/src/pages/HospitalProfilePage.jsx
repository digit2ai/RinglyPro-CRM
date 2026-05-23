import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 1 — Hospital Profile: beds, financials, academic status, total cases
// Mirrors Deck 1 Slide 1 (Academic Hospital Strategic Pillars) + Slide 5 (Da Vinci Impact)

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoney = (n) => n != null ? '$' + Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '--'
  const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

function KpiTile({ label, value, sub }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function PillarCard({ title, value, items, color }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
      <div className="flex items-baseline gap-2 mb-3 pb-2 border-b border-slate-700">
        <h3 className="font-bold text-white text-sm">{title}</h3>
        {value && <span className="text-xs ml-auto px-2 py-0.5 rounded" style={{ backgroundColor: color + '30', color }}>{value}</span>}
      </div>
      <ul className="space-y-1.5 text-xs text-slate-400">
        {items.map((it, i) => <li key={i} className="flex gap-2"><span style={{ color }}>•</span>{it}</li>)}
      </ul>
    </div>
  )
}

export default function HospitalProfilePage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id).then(r => setProject(r.project)).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected. Pick one from the Dashboard.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading hospital profile...</div>
  if (!project) return <div className="p-10 text-slate-400">Hospital not found.</div>

  const beds = parseInt(project.bed_count || 0)
  const isAcademic = /academic|teaching|university/i.test(project.hospital_type || '') ||
                    /university|medical center/i.test(project.hospital_name || '')

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 1 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">{project.hospital_name}</h1>
          <p className="text-sm text-slate-400">{project.hospital_type || '--'} · {project.state || '--'} · {project.project_code}</p>
        </div>
        <button onClick={() => navigate(`/surgeon-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Surgeon Profile →
        </button>
      </div>

      {/* Core KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Total Beds" value={fmt(beds)} sub={isAcademic ? 'Academic Medical Center' : 'Community Hospital'} />
        <KpiTile label="Annual Surgical Volume" value={fmt(project.annual_surgical_volume)} sub="all cases" />
        <KpiTile label="Total OR Count" value={fmt(project.total_or_count)} sub={`${fmt(project.robot_ready_ors)} robot-ready`} />
        <KpiTile label="Operating Margin" value={project.operating_margin_pct != null ? `${parseFloat(project.operating_margin_pct).toFixed(1)}%` : '--'} sub="(HCRIS)" />
      </div>

      {/* Financial profile */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-3">Financial Profile</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-slate-500">Total Revenue</span><div className="text-white font-semibold">{fmtMoneyShort(project.total_revenue)}</div></div>
          <div><span className="text-slate-500">Net Patient Revenue</span><div className="text-white font-semibold">{fmtMoneyShort(project.net_patient_revenue)}</div></div>
          <div><span className="text-slate-500">Operating Income</span><div className="text-white font-semibold">{fmtMoneyShort(project.operating_income)}</div></div>
          <div><span className="text-slate-500">Total Assets</span><div className="text-white font-semibold">{fmtMoneyShort(project.total_assets)}</div></div>
          <div><span className="text-slate-500">Medicare Mix</span><div className="text-white font-semibold">{project.medicare_pct ? `${project.medicare_pct}%` : '--'}</div></div>
          <div><span className="text-slate-500">Medicaid Mix</span><div className="text-white font-semibold">{project.medicaid_pct ? `${project.medicaid_pct}%` : '--'}</div></div>
          <div><span className="text-slate-500">Commercial Mix</span><div className="text-white font-semibold">{project.commercial_pct ? `${project.commercial_pct}%` : '--'}</div></div>
          <div><span className="text-slate-500">Ownership</span><div className="text-white font-semibold">{project.hospital_ownership || '--'}</div></div>
        </div>
      </div>

      {/* Academic strategic pillars (Deck 1 Slide 1) */}
      {isAcademic && (
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Academic Medical Center Focus</h2>
          <p className="text-sm text-slate-500 mb-4">Six strategic pillars (Deck 1 Slide 1 pattern). Aligning with what matters most to academic hospitals.</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <PillarCard title="Better Outcomes" color="#3b82f6" items={['Length of stay', 'Complications', 'Surgical-site infections', 'Return to OR', 'Readmission']} />
            <PillarCard title="Better Patient Experience" color="#10b981" items={['Recovery', 'Conversions', 'Outpatient vs inpatient']} />
            <PillarCard title="Health Equity" color="#06b6d4" items={['Access', 'Education & empowerment', 'Equitable quality care']} />
            <PillarCard title="Lower Total Cost of Care" color="#f59e0b" items={['Clinical cost', 'Direct costs', 'Clinical variation']} />
            <PillarCard title="Research & Innovation" color="#8b5cf6" items={['State-of-the-art patient care', 'Publications', 'Grants']} />
            <PillarCard title="World-class Training" color="#ec4899" items={['Future generation of surgeons', 'Teaching consoles', 'Residency programs']} />
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate('/intake')} className="text-sm text-slate-400 hover:text-slate-200">← Back to Hospital Intake</button>
        <button onClick={() => navigate(`/surgeon-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Surgeon Profile →
        </button>
      </div>
    </div>
  )
}

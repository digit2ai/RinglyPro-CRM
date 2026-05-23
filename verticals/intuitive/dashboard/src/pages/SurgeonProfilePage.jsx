import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 2 — Surgeon Profile: credentialed surgeons, volume per surgeon, open/lap/robotic split

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'

const SPECIALTY_COLORS = {
  general: '#1e40af', generalsurgery: '#1e40af',
  gynecology: '#8b5cf6', gyn: '#8b5cf6',
  urology: '#06b6d4',
  cardiac: '#1f2937',
  thoracic: '#10b981',
  colorectal: '#f59e0b',
  bariatric: '#ec4899',
  transplant: '#84cc16',
  default: '#94a3b8',
}
const colorFor = (s) => {
  if (!s) return SPECIALTY_COLORS.default
  const k = String(s).toLowerCase().replace(/\s|&|-/g, '')
  for (const key of Object.keys(SPECIALTY_COLORS)) {
    if (k.includes(key)) return SPECIALTY_COLORS[key]
  }
  return SPECIALTY_COLORS.default
}

export default function SurgeonProfilePage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [surgeons, setSurgeons] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([
      api.getProject(id),
      api.surgeonsByHospital({ hospital_name: '' }).catch(() => ({ data: { surgeons: [] } })),
    ]).then(([projRes, surgRes]) => {
      const proj = projRes.project
      setProject(proj)
      // Try to fetch surgeons at this specific hospital
      if (proj?.hospital_name) {
        api.surgeonsByHospital({ hospital_name: proj.hospital_name }).then(res => {
          setSurgeons(res?.data?.surgeons || res?.surgeons || [])
        }).catch(() => setSurgeons([]))
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading surgeon profile...</div>

  // Group by specialty
  const bySpecialty = {}
  for (const s of surgeons) {
    const sp = (s.specialty || s.surgeon_specialty || 'General').split(/[/,]/)[0].trim()
    if (!bySpecialty[sp]) bySpecialty[sp] = []
    bySpecialty[sp].push(s)
  }

  const filtered = filter === 'all' ? surgeons : surgeons.filter(s => {
    const sp = (s.specialty || s.surgeon_specialty || '').toLowerCase()
    return sp.includes(filter.toLowerCase())
  })

  const totalRoboticVol = surgeons.reduce((t, s) => t + parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0), 0)
  const trainedCount = surgeons.filter(s => (s.robotic_cases_last_yr || 0) > 0).length

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 2 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Surgeon Profile — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Credentialed surgeons · Volume per surgeon · Open / Lap / Robotic split</p>
        </div>
        <button onClick={() => navigate(`/robotics-program/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Robotics Program →
        </button>
      </div>

      {/* Aggregate KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Surgeons at Hospital</div>
          <div className="text-2xl font-bold text-white mt-1">{surgeons.length}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Trained on Robotics</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{trainedCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{surgeons.length > 0 ? Math.round(trainedCount / surgeons.length * 100) : 0}% of roster</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Robotic Vol (last yr)</div>
          <div className="text-2xl font-bold text-cyan-300 mt-1">{fmt(totalRoboticVol)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Specialties</div>
          <div className="text-2xl font-bold text-white mt-1">{Object.keys(bySpecialty).length}</div>
        </div>
      </div>

      {/* Filter by specialty */}
      {Object.keys(bySpecialty).length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setFilter('all')} className={`text-xs px-3 py-1.5 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            All ({surgeons.length})
          </button>
          {Object.entries(bySpecialty).map(([sp, list]) => (
            <button key={sp} onClick={() => setFilter(sp)} className={`text-xs px-3 py-1.5 rounded flex items-center gap-1.5 ${filter === sp ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorFor(sp) }}></span>
              {sp} ({list.length})
            </button>
          ))}
        </div>
      )}

      {/* Surgeon list */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic">No surgeon roster data for this hospital yet. Run Hospital Intake first or check NPPES sync.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left p-3">Surgeon</th>
                <th className="text-left p-3">Specialty</th>
                <th className="text-right p-3">Annual Vol</th>
                <th className="text-right p-3">Open</th>
                <th className="text-right p-3">Lap</th>
                <th className="text-right p-3">Robotic</th>
                <th className="text-left p-3">NPI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const robotic = parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0)
                const open = parseInt(s.open_cases || 0)
                const lap = parseInt(s.lap_cases || 0)
                const total = robotic + open + lap
                return (
                  <tr key={i} className="border-t border-slate-700 hover:bg-slate-800/30">
                    <td className="p-3 font-semibold text-white">{s.full_name || s.surgeon_name || s.first_name + ' ' + s.last_name}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorFor(s.specialty) }}></span>
                        {s.specialty || s.surgeon_specialty || 'General'}
                      </span>
                    </td>
                    <td className="p-3 text-right text-white font-semibold">{fmt(total || robotic)}</td>
                    <td className="p-3 text-right text-slate-400">{open ? fmt(open) : '--'}</td>
                    <td className="p-3 text-right text-slate-400">{lap ? fmt(lap) : '--'}</td>
                    <td className="p-3 text-right text-emerald-300 font-semibold">{robotic ? fmt(robotic) : '--'}</td>
                    <td className="p-3 text-[11px] text-slate-500 font-mono">{s.npi || '--'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/hospital-profile/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Hospital Profile</button>
        <button onClick={() => navigate(`/robotics-program/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Robotics Program →
        </button>
      </div>
    </div>
  )
}

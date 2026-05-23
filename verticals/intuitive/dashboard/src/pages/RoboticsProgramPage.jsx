import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 3 — Robotics Program Profile: current systems, utilization, specialty mix
// Mirrors Deck 1 Slide 6 (System Utilization by Quarter)

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'

export default function RoboticsProgramPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([api.getProject(id), api.getResults(id).catch(() => ({ results: {} }))])
      .then(([projRes, aRes]) => { setProject(projRes.project); setAnalysis(aRes.results || {}) })
      .catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading robotics program...</div>

  const systems = parseInt(project?.current_system_count || 0)
  const systemModel = project?.current_system || 'None'
  const util = analysis.utilization_forecast || {}
  const pareto = analysis.procedure_pareto || {}
  const designDay = analysis.design_day_analysis || {}

  // Specialty mix from project
  const specialties = []
  if (project?.specialty_urology) specialties.push({ name: 'Urology', pct: parseInt(project.specialty_urology), color: '#06b6d4' })
  if (project?.specialty_gynecology) specialties.push({ name: 'Gynecology', pct: parseInt(project.specialty_gynecology), color: '#8b5cf6' })
  if (project?.specialty_general) specialties.push({ name: 'General', pct: parseInt(project.specialty_general), color: '#1e40af' })
  if (project?.specialty_thoracic) specialties.push({ name: 'Thoracic', pct: parseInt(project.specialty_thoracic), color: '#10b981' })
  if (project?.specialty_colorectal) specialties.push({ name: 'Colorectal', pct: parseInt(project.specialty_colorectal), color: '#f59e0b' })
  if (project?.specialty_head_neck) specialties.push({ name: 'Head & Neck', pct: parseInt(project.specialty_head_neck), color: '#ec4899' })
  if (project?.specialty_cardiac) specialties.push({ name: 'Cardiac', pct: parseInt(project.specialty_cardiac), color: '#1f2937' })

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 3 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Robotics Program — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Current systems · Utilization · Specialty mix</p>
        </div>
        <button onClick={() => navigate(`/market-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Market Profile →
        </button>
      </div>

      {/* Current installed base */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-4">Current Installed Base</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Systems Installed</div>
            <div className="text-3xl font-bold text-white mt-1">{systems}</div>
            <div className="text-[11px] text-slate-500">{systemModel === 'None' ? 'no current systems' : systemModel}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Projected Utilization</div>
            <div className={`text-3xl font-bold mt-1 ${(util.projected_utilization_pct || 0) > 85 ? 'text-red-300' : (util.projected_utilization_pct || 0) > 70 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {util.projected_utilization_pct || '--'}%
            </div>
            <div className="text-[11px] text-slate-500">{(util.projected_utilization_pct || 0) > 85 ? 'oversaturated' : (util.projected_utilization_pct || 0) > 70 ? 'high' : 'healthy'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Design Day (P75)</div>
            <div className="text-3xl font-bold text-cyan-300 mt-1">{designDay.design_day || '--'}</div>
            <div className="text-[11px] text-slate-500">cases per day</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Systems Needed</div>
            <div className="text-3xl font-bold text-violet-300 mt-1">{util.systems_needed || '--'}</div>
            <div className="text-[11px] text-slate-500">recommended</div>
          </div>
        </div>
      </div>

      {/* Specialty mix */}
      {specialties.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-3">Specialty Mix</h3>
          <div className="space-y-2">
            {specialties.sort((a, b) => b.pct - a.pct).map(sp => (
              <div key={sp.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sp.color }}></span>
                    {sp.name}
                  </span>
                  <span className="text-slate-400">{sp.pct}% of mix</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(sp.pct, 100)}%`, backgroundColor: sp.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top procedures */}
      {pareto.top_procedures?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
          <h3 className="font-bold text-white mb-3">Top Procedures (ABC Analysis)</h3>
          <div className="text-[11px] text-slate-500 mb-3">Gini coefficient: {pareto.gini_coefficient?.toFixed(3) || '--'} · Total: {fmt(pareto.total_procedures)}</div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="text-left pb-2">#</th><th className="text-left pb-2">Procedure</th><th className="text-right pb-2">Cases</th><th className="text-right pb-2">% of Total</th><th className="text-right pb-2">Class</th></tr>
            </thead>
            <tbody>
              {pareto.top_procedures.slice(0, 10).map((p, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-slate-500">{i + 1}</td>
                  <td className="py-2 text-white">{p.name || p.procedure}</td>
                  <td className="py-2 text-right text-white">{fmt(p.cases || p.count)}</td>
                  <td className="py-2 text-right text-slate-400">{p.pct || p.percentage}%</td>
                  <td className="py-2 text-right">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.abc_class === 'A' ? 'bg-emerald-900/40 text-emerald-300' : p.abc_class === 'B' ? 'bg-amber-900/40 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                      Class {p.abc_class || p.class}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/surgeon-profile/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Surgeon Profile</button>
        <button onClick={() => navigate(`/market-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Market Profile →
        </button>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'

export default function RecommendationsPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id)
      .then(res => setProject(res.project))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading recommendations...</div>
  if (!project) return <div className="p-10 text-slate-400">Project not found.</div>

  const recs = project.recommendations || []
  const primary = recs.find(r => r.is_primary)
  const alternatives = recs.filter(r => !r.is_primary)

  const fmt = n => n != null ? Number(n).toLocaleString() : '--'
  const fmtM = n => n != null ? `$${(Number(n) / 1e6).toFixed(1)}M` : '--'

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">{project.hospital_name} -- System Recommendation</h1>
      <p className="text-slate-400 text-sm mb-8">Project {project.project_code} | {project.hospital_type ? project.hospital_type.charAt(0).toUpperCase() + project.hospital_type.slice(1) : ''} | {project.bed_count || '?'} beds | {project.state || ''}</p>

      {/* Primary Recommendation */}
      {primary && (
        <div className="bg-gradient-to-br from-intuitive-900/40 to-slate-900/60 border-2 border-intuitive-600 rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-intuitive-400 mb-2">Primary Recommendation</div>
              <h2 className="text-3xl font-black text-white">{primary.system_model === 'dV5' ? 'da Vinci 5' : primary.system_model === 'Xi' ? 'da Vinci Xi' : primary.system_model === 'X' ? 'da Vinci X' : 'da Vinci SP'}</h2>
              <p className="text-slate-400 text-sm mt-1">Quantity: {primary.quantity} system{primary.quantity > 1 ? 's' : ''}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-intuitive-400">{primary.fit_score}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Fit Score</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-white">{fmtM(primary.estimated_price)}</div>
              <div className="text-[10px] text-slate-400">System Price</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-amber-400">{fmt(primary.projected_annual_cases)}</div>
              <div className="text-[10px] text-slate-400">Projected Cases/Yr</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-green-400">{primary.projected_utilization_pct}%</div>
              <div className="text-[10px] text-slate-400">Utilization</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-emerald-400">{primary.five_year_roi_pct}%</div>
              <div className="text-[10px] text-slate-400">5-Year ROI</div>
            </div>
          </div>

          <div className="bg-slate-800/30 rounded-lg p-4 mb-4">
            <div className="text-xs font-bold text-intuitive-400 uppercase mb-2">Rationale</div>
            <p className="text-sm text-slate-300 leading-relaxed">{primary.rationale}</p>
          </div>

          {primary.details?.warnings?.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/30 rounded-lg p-4">
              <div className="text-xs font-bold text-amber-400 uppercase mb-2">Considerations</div>
              <ul className="space-y-1">
                {primary.details.warnings.map((w, i) => <li key={i} className="text-sm text-amber-200/80">- {w}</li>)}
              </ul>
            </div>
          )}

          {primary.specialties_served?.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {primary.specialties_served.map(s => (
                <span key={s} className="px-3 py-1 bg-intuitive-900/50 border border-intuitive-700 rounded-full text-[10px] font-semibold text-intuitive-300 uppercase">{s}</span>
              ))}
            </div>
          )}

          {primary.risk_factors?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold text-red-400 uppercase mb-2">Risk Factors</div>
              <ul className="space-y-1">
                {primary.risk_factors.map((r, i) => <li key={i} className="text-xs text-red-300/80">- {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Alternative */}
      {alternatives.map(alt => (
        <div key={alt.id} className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Alternative</div>
              <h3 className="text-xl font-bold text-white">{alt.system_model === 'Xi' ? 'da Vinci Xi' : alt.system_model === 'X' ? 'da Vinci X' : alt.system_model === 'dV5' ? 'da Vinci 5' : 'da Vinci SP'}</h3>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-400">{alt.fit_score}</div>
              <div className="text-[10px] text-slate-500">Fit Score</div>
            </div>
          </div>
          <p className="text-sm text-slate-400">{alt.rationale}</p>
          <p className="text-xs text-slate-500 mt-2">Estimated price: {fmtM(alt.estimated_price)}</p>
        </div>
      ))}

      {recs.length === 0 && <div className="text-slate-400 text-center py-10">No recommendations generated yet. Run the analysis first.</div>}
    </div>
  )
}

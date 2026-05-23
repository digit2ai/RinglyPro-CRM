import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 6 — Clinical Benefit Overlay with $ ROI (THE MOAT)
// Wires existing /api/v1/clinical-evidence/dollarize endpoint

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '$0'
  const v = Number(n)
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

const SPECIALTIES = ['urology', 'gynecology', 'general', 'colorectal', 'thoracic', 'head_neck']

export default function ClinicalOverlayPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [caseData, setCaseData] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id).then(r => {
      const p = r.project
      setProject(p)
      // Seed default case mix from project specialty splits
      const annual = parseInt(p.annual_surgical_volume) || 1000
      const defaults = {}
      const specialtyMap = {
        urology: parseInt(p.specialty_urology || 0),
        gynecology: parseInt(p.specialty_gynecology || 0),
        general: parseInt(p.specialty_general || 0),
        colorectal: parseInt(p.specialty_colorectal || 0),
        thoracic: parseInt(p.specialty_thoracic || 0),
        head_neck: parseInt(p.specialty_head_neck || 0),
      }
      const totalPct = Object.values(specialtyMap).reduce((s, v) => s + v, 0) || 100
      for (const [spec, pct] of Object.entries(specialtyMap)) {
        if (pct > 0) {
          const cases = Math.round(annual * pct / Math.max(totalPct, 100))
          defaults[spec] = { annual_cases: cases, open_pct: 35, lap_pct: 35, robotic_pct: 30 }
        }
      }
      // Fallback if no specialty mix
      if (Object.keys(defaults).length === 0) {
        defaults.general = { annual_cases: Math.round(annual * 0.4), open_pct: 35, lap_pct: 40, robotic_pct: 25 }
        defaults.urology = { annual_cases: Math.round(annual * 0.2), open_pct: 25, lap_pct: 25, robotic_pct: 50 }
      }
      setCaseData(defaults)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  async function runDollarization() {
    if (!Object.keys(caseData).length) { alert('No case data to compute'); return }
    setComputing(true); setError(null)
    try {
      const r = await api.dollarize(caseData, { projected_robotic_pct: 60 })
      setResults(r?.data || r)
    } catch (e) {
      setError(e.message)
    } finally {
      setComputing(false)
    }
  }

  function updateCaseData(spec, field, val) {
    setCaseData({ ...caseData, [spec]: { ...caseData[spec], [field]: parseFloat(val) || 0 } })
  }

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading clinical benefit overlay...</div>

  const totalSavings = results?.total_clinical_savings_annual || 0
  const bySpecialty = results?.by_specialty || {}

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Step 6 of 9 · THE MOAT</div>
          <h1 className="text-2xl font-bold text-white">Clinical Benefit Overlay — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Dollarized clinical outcomes that Intuitive cannot produce internally · sourced from peer-reviewed literature</p>
        </div>
        <button onClick={() => navigate(`/commitments/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Surgeon Commitments →
        </button>
      </div>

      <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4 mb-6 text-sm text-emerald-200">
        <strong>The moat.</strong> This module shows the dollarized clinical improvement from converting open/lap volume to robotic. Reduced infection rates, reduced LOS, fewer complications — all multiplied by published cost-per-event. AcuityMD cannot produce this slide. <strong>Intuitive cannot produce this slide.</strong> We can.
      </div>

      {/* Case mix input */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-3">Case Mix Inputs</h3>
        <p className="text-xs text-slate-500 mb-4">Auto-populated from hospital specialty mix. Adjust if you have more accurate data. Target conversion: 60% robotic share.</p>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left pb-2">Specialty</th>
              <th className="text-right pb-2">Annual Cases</th>
              <th className="text-right pb-2">% Open</th>
              <th className="text-right pb-2">% Lap</th>
              <th className="text-right pb-2">% Robotic</th>
              <th className="text-right pb-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(caseData).map(([spec, d]) => {
              const total = d.open_pct + d.lap_pct + d.robotic_pct
              return (
                <tr key={spec} className="border-t border-slate-700">
                  <td className="py-2 text-white capitalize">{spec.replace('_', ' ')}</td>
                  <td className="py-2"><input type="number" value={d.annual_cases} onChange={e => updateCaseData(spec, 'annual_cases', e.target.value)} className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.open_pct} onChange={e => updateCaseData(spec, 'open_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.lap_pct} onChange={e => updateCaseData(spec, 'lap_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.robotic_pct} onChange={e => updateCaseData(spec, 'robotic_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className={`py-2 text-right text-xs ${Math.abs(total - 100) > 1 ? 'text-red-300' : 'text-slate-400'}`}>{total}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button onClick={runDollarization} disabled={computing} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded">
            {computing ? 'Computing...' : 'Run Dollarization'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-6 text-sm text-red-300">{error}</div>}

      {/* Results */}
      {results && (
        <>
          <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800/40 border border-emerald-700/50 rounded-lg p-6 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Annual Cost Avoidance</div>
            <div className="text-5xl font-bold text-emerald-300">{fmtMoneyShort(totalSavings)}</div>
            <div className="text-sm text-slate-300 mt-2">Total dollarized clinical benefit from converting eligible open/lap volume to robotic, across {Object.keys(bySpecialty).length} specialties.</div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-3">Drivers by Specialty</h3>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="text-left pb-2">Specialty</th><th className="text-right pb-2">Cases Converted</th><th className="text-right pb-2">Annual Savings</th><th className="text-left pb-2">Top Driver</th></tr>
              </thead>
              <tbody>
                {Object.entries(bySpecialty).filter(([, v]) => v.total_specialty_savings > 0)
                  .sort((a, b) => b[1].total_specialty_savings - a[1].total_specialty_savings)
                  .map(([spec, data]) => {
                    const topMetric = Object.values(data.savings_by_metric || {})
                      .filter(m => m.savings > 0)
                      .sort((a, b) => b.savings - a.savings)[0]
                    return (
                      <tr key={spec} className="border-t border-slate-700">
                        <td className="py-2 text-white capitalize">{spec.replace('_', ' ')}</td>
                        <td className="py-2 text-right text-cyan-300">{fmt(data.cases_converted_to_robotic)}</td>
                        <td className="py-2 text-right text-emerald-300 font-semibold">{fmtMoneyShort(data.total_specialty_savings)}</td>
                        <td className="py-2 text-[11px] text-slate-400">{topMetric ? `${topMetric.metric_name} (${fmtMoneyShort(topMetric.savings)})` : '--'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500 mt-3 italic">{results.methodology}</div>
          </div>

          {results.all_citations?.length > 0 && (
            <div className="mt-6 bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Literature Citations ({results.all_citations.length})</h4>
              <ul className="text-[11px] text-slate-400 space-y-1">
                {results.all_citations.slice(0, 8).map((c, i) => (
                  <li key={i}>[{i + 1}] {c.authors || c.author || 'Unknown'}. {c.title}. {c.journal} {c.year ? `(${c.year})` : ''}</li>
                ))}
                {results.all_citations.length > 8 && <li className="italic text-slate-500">+ {results.all_citations.length - 8} more citations</li>}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Clinical Outcomes</button>
        <button onClick={() => navigate(`/commitments/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Surgeon Commitments →
        </button>
      </div>
    </div>
  )
}

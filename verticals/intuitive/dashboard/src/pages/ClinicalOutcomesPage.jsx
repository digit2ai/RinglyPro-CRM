import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 5 — Current Clinical Outcomes baseline (CMS Hospital Compare quality measures)

const fmt = (n) => n != null ? (typeof n === 'number' ? n.toFixed(2) : n) : '--'

function MetricRow({ label, value, unit, vsNational, source }) {
  const better = vsNational != null && vsNational < 0
  const worse = vsNational != null && vsNational > 0
  return (
    <tr className="border-t border-slate-700">
      <td className="py-3 text-white">{label}</td>
      <td className="py-3 text-right text-white font-semibold">{value != null ? value + (unit || '') : '--'}</td>
      <td className="py-3 text-right">
        {vsNational != null && (
          <span className={`text-xs font-bold ${better ? 'text-emerald-300' : worse ? 'text-red-300' : 'text-slate-400'}`}>
            {vsNational > 0 ? '+' : ''}{vsNational.toFixed(2)}{unit || ''} vs national
          </span>
        )}
      </td>
      <td className="py-3 text-[11px] text-slate-500">{source}</td>
    </tr>
  )
}

export default function ClinicalOutcomesPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [cms, setCms] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)

  async function loadCms() {
    if (!id) return
    try {
      const r = await api.getCMSMetrics(id)
      setCms(r?.data || r?.metrics || null)
    } catch (e) { console.error('CMS load:', e) }
  }

  async function fetchCms() {
    if (!id || !project) return
    setFetching(true)
    try {
      await api.fetchCMSMetrics(id, project.hospital_name, project.state)
      await loadCms()
    } catch (e) { alert('CMS fetch failed: ' + e.message) }
    finally { setFetching(false) }
  }

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id).then(r => {
      setProject(r.project)
      return loadCms()
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading clinical outcomes...</div>

  const m = cms || {}

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 5 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Current Clinical Outcomes — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Infection · Readmission · Surgical complications · Wound complications · Hernia recurrence baselines</p>
        </div>
        <div className="flex gap-2">
          {!cms && (
            <button onClick={fetchCms} disabled={fetching} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded">
              {fetching ? 'Fetching CMS data...' : 'Fetch CMS Quality Metrics'}
            </button>
          )}
          <button onClick={() => navigate(`/clinical-overlay/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
            Next: Clinical Benefit Overlay →
          </button>
        </div>
      </div>

      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 mb-6 text-sm text-amber-200">
        <strong>This is the BASELINE.</strong> These are the hospital's CURRENT clinical outcome rates from CMS Hospital Compare — the starting point. The dollarized improvement from converting open/lap volume to robotic is computed in <strong>Step 6 (Clinical Benefit Overlay) — the moat slide</strong>.
      </div>

      {!cms ? (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center">
          <h3 className="text-white font-semibold mb-2">No CMS quality data loaded yet</h3>
          <p className="text-sm text-slate-400 mb-4">Click "Fetch CMS Quality Metrics" above to pull the latest Hospital Compare measures.</p>
        </div>
      ) : (
        <>
          {/* Star ratings */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Overall Star Rating</div>
              <div className="text-3xl font-bold text-amber-300 mt-1">{m.overall_rating || '--'}★</div>
              <div className="text-[10px] text-slate-500">CMS Hospital Compare</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Patient Experience</div>
              <div className="text-3xl font-bold text-cyan-300 mt-1">{m.patient_experience_rating || '--'}★</div>
              <div className="text-[10px] text-slate-500">HCAHPS</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Safety of Care</div>
              <div className="text-3xl font-bold text-emerald-300 mt-1">{m.safety_rating || '--'}★</div>
              <div className="text-[10px] text-slate-500">CMS Safety Group</div>
            </div>
          </div>

          {/* Outcomes table */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-4">Clinical Outcomes Baseline</h3>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="text-left pb-2">Measure</th><th className="text-right pb-2">Current</th><th className="text-right pb-2">vs National</th><th className="text-left pb-2">Source</th></tr>
              </thead>
              <tbody>
                <MetricRow label="30-day Readmission Rate (all-cause)" value={fmt(m.readmission_30day_pct)} unit="%" vsNational={m.readmission_vs_national} source="CMS Hospital Compare" />
                <MetricRow label="Surgical Site Infection (SSI)" value={fmt(m.ssi_rate)} unit="%" vsNational={m.ssi_vs_national} source="CMS HACRP" />
                <MetricRow label="Average Length of Stay" value={fmt(m.avg_los_days)} unit=" days" vsNational={m.los_vs_national} source="MedPAR" />
                <MetricRow label="Hospital-Acquired Conditions" value={fmt(m.hac_score)} unit="" vsNational={m.hac_vs_national} source="CMS HACRP" />
                <MetricRow label="Mortality Rate (composite)" value={fmt(m.mortality_pct)} unit="%" vsNational={m.mortality_vs_national} source="CMS Hospital Compare" />
                <MetricRow label="C. Difficile Rate" value={fmt(m.cdiff_rate)} unit="" vsNational={null} source="NHSN" />
                <MetricRow label="MRSA Rate" value={fmt(m.mrsa_rate)} unit="" vsNational={null} source="NHSN" />
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/market-profile/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Market Profile</button>
        <button onClick={() => navigate(`/clinical-overlay/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Clinical Benefit Overlay (THE MOAT) →
        </button>
      </div>
    </div>
  )
}

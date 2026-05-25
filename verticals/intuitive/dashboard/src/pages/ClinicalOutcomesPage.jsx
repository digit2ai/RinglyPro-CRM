import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
  ReferenceLine,
} from 'recharts'

// Step 5 — Current Clinical Outcomes baseline (CMS Hospital Compare quality measures)
// Mirrors Deck 1 p10 (UNC LOS Variability) + HCAHPS + PSI national benchmarks

const COLOR_OPEN = '#94a3b8'    // gray
const COLOR_MIS = '#3b82f6'     // blue
const COLOR_DV = '#1e40af'      // dark blue
const COLOR_OPPORTUNITY = '#ef4444' // red
const COLOR_HOSPITAL = '#06b6d4'
const COLOR_NATIONAL = '#94a3b8'
const COLOR_TOP_DECILE = '#10b981'

const fmt = (n) => n != null ? (typeof n === 'number' ? n.toFixed(2) : n) : '--'

function MetricRow({ label, value, unit, vsNational, source }) {
  // vsNational may be a numeric delta (negative = better) OR a string
  // label ('better' / 'worse' / 'avg'). Handle both without crashing.
  const isNum = typeof vsNational === 'number'
  const str = typeof vsNational === 'string' ? vsNational.toLowerCase() : null
  const better = (isNum && vsNational < 0) || str === 'better'
  const worse = (isNum && vsNational > 0) || str === 'worse'
  return (
    <tr className="border-t border-slate-700">
      <td className="py-3 text-white">{label}</td>
      <td className="py-3 text-right text-white font-semibold">{value != null ? value + (unit || '') : '--'}</td>
      <td className="py-3 text-right">
        {vsNational != null && (
          <span className={`text-xs font-bold ${better ? 'text-emerald-300' : worse ? 'text-red-300' : 'text-slate-400'}`}>
            {isNum ? `${vsNational > 0 ? '+' : ''}${vsNational.toFixed(2)}${unit || ''} vs national` : `${str === 'better' ? '↓ better' : str === 'worse' ? '↑ worse' : str} vs national`}
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
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

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

    setEnrichmentLoading(true)
    api.getClinicalOutcomesEnrichment(id)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('clinical outcomes enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading clinical outcomes...</div>

  // The live CMS metrics endpoint returns a row-per-measure array (and is empty
  // until Care Compare is ingested). Prefer a flat cms object stored on the
  // project (extended_data.cms), which carries the verified star ratings + the
  // baseline measures. Fall back to the array endpoint only if it's a flat object.
  const m = (project?.extended_data?.cms && Object.keys(project.extended_data.cms).length)
    ? project.extended_data.cms
    : (cms && !Array.isArray(cms) ? cms : {})
  const hasCms = m && Object.keys(m).length > 0

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

      {/* ═══ ADDITION #1 + INFOGRAPHIC #1: LOS Variability by Procedure (Deck 1 p10) ═══ */}
      {enrichment?.los_variability && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">LOS Variability — Open vs MIS vs Da Vinci</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.los_variability.headline}</p>

          {/* Chart: Open vs MIS LOS per procedure */}
          <div style={{ height: Math.max(400, enrichment.los_variability.procedures.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={enrichment.los_variability.procedures.map(p => ({
                  procedure: p.procedure,
                  Open: p.open_los_days,
                  MIS: p.mis_los_days,
                  daVinci: p.davinci_los_days,
                  opportunity: p.opportunity,
                }))}
                layout="vertical"
                margin={{ left: 100, right: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} unit=" days" />
                <YAxis dataKey="procedure" type="category" stroke="#64748b" style={{ fontSize: 11 }} width={95} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Open" fill={COLOR_OPEN} name="Open LOS Days">
                  <LabelList dataKey="Open" position="right" style={{ fill: '#94a3b8', fontSize: 10 }} />
                </Bar>
                <Bar dataKey="MIS" fill={COLOR_MIS} name="MIS LOS Days">
                  <LabelList dataKey="MIS" position="right" style={{ fill: '#3b82f6', fontSize: 10 }} />
                </Bar>
                <Bar dataKey="daVinci" fill={COLOR_DV} name="da Vinci LOS Days">
                  <LabelList dataKey="daVinci" position="right" style={{ fill: '#1e40af', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Opportunity callout */}
          {enrichment.los_variability.opportunity_procedures.length > 0 && (
            <div className="mt-3 bg-red-950/30 border border-red-700/40 rounded p-3 text-xs text-red-200">
              <strong>Opportunity procedures ({enrichment.los_variability.opportunity_procedures.length}):</strong>{' '}
              {enrichment.los_variability.opportunity_procedures.join(', ')}
              {' — '}largest open-to-robotic LOS deltas; biggest bed-day savings if converted.
            </div>
          )}

          {/* Detail table */}
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">LOS Days by Modality (Medicare Inpatient)</div>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left pb-2">Procedure</th>
                  <th className="text-right pb-2">Open</th>
                  <th className="text-right pb-2">MIS</th>
                  <th className="text-right pb-2">da Vinci</th>
                  <th className="text-right pb-2">Open→dV Delta</th>
                  <th className="text-right pb-2">Opportunity?</th>
                </tr>
              </thead>
              <tbody>
                {enrichment.los_variability.procedures.map((p, i) => (
                  <tr key={i} className={`border-t border-slate-700 ${p.opportunity ? 'bg-red-950/20' : ''}`}>
                    <td className="py-2 text-white">{p.procedure}</td>
                    <td className="py-2 text-right text-slate-400">{p.open_los_days}</td>
                    <td className="py-2 text-right text-blue-300">{p.mis_los_days}</td>
                    <td className="py-2 text-right text-cyan-300 font-semibold">{p.davinci_los_days}</td>
                    <td className="py-2 text-right text-emerald-300 font-bold">{p.open_to_davinci_delta} days</td>
                    <td className="py-2 text-right">{p.opportunity && <span className="text-[10px] font-bold bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">HIGH</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.los_variability.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #4 + INFOGRAPHIC #2: Outcomes Benchmark Comparison + Radar Chart ═══ */}
      {enrichment?.outcomes_benchmark && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Outcomes Benchmark — Hospital vs National vs Top-Decile</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.outcomes_benchmark.headline}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Radar chart */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Outcomes Radar (Higher = Better)</div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={enrichment.outcomes_benchmark.radar_data}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#cbd5e1' }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: '#64748b' }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Radar name="Top-Decile" dataKey="top_decile" stroke={COLOR_TOP_DECILE} fill={COLOR_TOP_DECILE} fillOpacity={0.15} strokeWidth={1.5} />
                    <Radar name="National Avg" dataKey="national" stroke={COLOR_NATIONAL} fill={COLOR_NATIONAL} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="3 3" />
                    <Radar name="Hospital" dataKey="hospital" stroke={COLOR_HOSPITAL} fill={COLOR_HOSPITAL} fillOpacity={0.3} strokeWidth={2.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Benchmark table */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Detailed Benchmark</div>
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-widest text-slate-500">
                  <tr><th className="text-left pb-1">Metric</th><th className="text-right pb-1">You</th><th className="text-right pb-1">Nat'l</th><th className="text-right pb-1">Top 10%</th><th className="text-center pb-1">vs Nat'l</th></tr>
                </thead>
                <tbody>
                  {enrichment.outcomes_benchmark.benchmark_table.map((r, i) => (
                    <tr key={i} className="border-t border-slate-700">
                      <td className="py-1.5 text-slate-300">{r.metric}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{r.hospital}{r.unit}</td>
                      <td className="py-1.5 text-right text-slate-500">{r.national}{r.unit}</td>
                      <td className="py-1.5 text-right text-emerald-400">{r.top_decile}{r.unit}</td>
                      <td className="py-1.5 text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.vs_national === 'better' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                          {r.vs_national === 'better' ? '↓ better' : '↑ worse'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.outcomes_benchmark.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #2 + INFOGRAPHIC #3: HCAHPS Patient Experience ═══ */}
      {enrichment?.hcahps && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">HCAHPS Patient Experience</h3>
            <div className="flex gap-3 text-xs">
              <span><span className="text-slate-500">Composite:</span> <strong className="text-cyan-300">{enrichment.hcahps.composite_hospital}</strong></span>
              <span><span className="text-slate-500">National:</span> <strong className="text-slate-400">{enrichment.hcahps.composite_national}</strong></span>
              <span><span className="text-slate-500">Top decile:</span> <strong className="text-emerald-300">{enrichment.hcahps.composite_top_decile}</strong></span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">{enrichment.hcahps.headline}</p>

          <div className="h-80 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichment.hcahps.dimensions} layout="vertical" margin={{ left: 130, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis dataKey="dimension" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={125} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="hospital" fill={COLOR_HOSPITAL} name="Hospital">
                  <LabelList dataKey="hospital" position="right" style={{ fill: '#06b6d4', fontSize: 10 }} />
                </Bar>
                <Bar dataKey="national_avg" fill={COLOR_NATIONAL} name="National Avg" fillOpacity={0.5} />
                <Bar dataKey="top_decile" fill={COLOR_TOP_DECILE} name="Top Decile" fillOpacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.hcahps.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #3 + INFOGRAPHIC #4: Patient Safety Indicators (PSI-90) ═══ */}
      {enrichment?.psi && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Patient Safety Indicators (PSI-90)</h3>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-300">↓ {enrichment.psi.better_than_national_count} better</span>
              <span className="text-red-300">↑ {enrichment.psi.worse_than_national_count} worse</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">{enrichment.psi.headline}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PSI rates bar */}
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrichment.psi.indicators.slice(1).map(i => ({
                  code: i.code,
                  Hospital: i.hospital,
                  National: i.national,
                  delta: i.delta_vs_national,
                  better: i.performance === 'better',
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="code" stroke="#64748b" style={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Hospital" fill={COLOR_HOSPITAL} />
                  <Bar dataKey="National" fill={COLOR_NATIONAL} fillOpacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* PSI table */}
            <div className="overflow-y-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-widest text-slate-500 sticky top-0 bg-slate-800/90">
                  <tr><th className="text-left pb-1">Code</th><th className="text-left pb-1">Indicator</th><th className="text-right pb-1">Hospital</th><th className="text-right pb-1">National</th><th className="text-center pb-1">Performance</th></tr>
                </thead>
                <tbody>
                  {enrichment.psi.indicators.map((p, i) => (
                    <tr key={i} className="border-t border-slate-700">
                      <td className="py-1.5 text-slate-400 font-mono">{p.code}</td>
                      <td className="py-1.5 text-slate-300">{p.name}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{p.hospital.toFixed(2)}</td>
                      <td className="py-1.5 text-right text-slate-500">{p.national.toFixed(2)}</td>
                      <td className="py-1.5 text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.performance === 'better' ? 'bg-emerald-900/50 text-emerald-300' : p.performance === 'worse' ? 'bg-red-900/50 text-red-300' : 'bg-slate-700 text-slate-400'}`}>
                          {p.performance === 'better' ? '↓ better' : p.performance === 'worse' ? '↑ worse' : 'avg'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.psi.methodology}</div>
        </div>
      )}

      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading clinical outcome benchmarks (LOS Variability · HCAHPS · PSI-90 · Outcomes Radar)...</div>
        </div>
      )}

      {!hasCms ? (
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
            <h3 className="font-bold text-white mb-1">Clinical Outcomes Baseline</h3>
            {m.basis && <p className="text-[11px] text-slate-500 mb-3">{m.basis}</p>}
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

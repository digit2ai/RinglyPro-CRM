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
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

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

    // Kick off the 4 deck-aligned enrichments in parallel
    setEnrichmentLoading(true)
    api.getSurgeonProfileEnrichment(id)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('surgeon enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
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

      {/* ─── ADDITION #1: Training Pipeline (Deck p11) ─── */}
      {enrichment?.training_pipeline && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Training Pipeline</h3>
            <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">
              {enrichment.training_pipeline.total_committed_cases.toLocaleString()} committed cases/yr
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">{enrichment.training_pipeline.headline}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Trained</div>
              <div className="text-3xl font-bold text-emerald-300 mt-1">{enrichment.training_pipeline.trained.length}</div>
              <div className="text-[10px] text-emerald-200 mb-2">credentialed surgeons</div>
              {enrichment.training_pipeline.trained.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[11px] text-slate-300 truncate">• {s.surgeon_name} ({s.cases_annual} cases)</div>
              ))}
            </div>
            <div className="bg-amber-950/30 border border-amber-700/50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">In Training Pipeline</div>
              <div className="text-3xl font-bold text-amber-300 mt-1">{enrichment.training_pipeline.untrained.length}</div>
              <div className="text-[10px] text-amber-200 mb-2">need TR200 / luminary training</div>
              {enrichment.training_pipeline.untrained.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[11px] text-slate-300 truncate">• {s.surgeon_name} {s.training_needs ? `(${s.training_needs})` : ''}</div>
              ))}
            </div>
            <div className="bg-cyan-950/30 border border-cyan-700/50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Pull-Forward (Need Access)</div>
              <div className="text-3xl font-bold text-cyan-300 mt-1">{enrichment.training_pipeline.pull_forward.length}</div>
              <div className="text-[10px] text-cyan-200 mb-2">blocked by capacity</div>
              {enrichment.training_pipeline.pull_forward.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[11px] text-slate-300 truncate">
                  • {s.surgeon_name} {s.current_weekly_volume ? `(${s.current_weekly_volume}→${s.target_weekly_volume}/wk)` : ''}
                </div>
              ))}
            </div>
          </div>
          {enrichment.training_pipeline.needs_proctoring.length > 0 && (
            <div className="mt-3 text-xs text-blue-300 bg-blue-950/30 border border-blue-800/40 rounded p-2">
              <strong>{enrichment.training_pipeline.needs_proctoring.length} surgeons need proctoring:</strong>{' '}
              {enrichment.training_pipeline.needs_proctoring.slice(0, 5).map(s => s.surgeon_name).join(', ')}
              {enrichment.training_pipeline.needs_proctoring.length > 5 ? '...' : ''}
            </div>
          )}
        </div>
      )}

      {/* ─── ADDITION #2: CSR Intel Panel (Deck p12, p18) ─── */}
      {enrichment?.csr_intel && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">New Surgeons with Access Needs</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.csr_intel.headline}</p>
          {enrichment.csr_intel.items.length > 0 ? (
            <ul className="space-y-2.5">
              {enrichment.csr_intel.items.map((it, i) => (
                <li key={i} className="flex gap-3 pb-2 border-b border-slate-700/50 last:border-0">
                  <span className="text-blue-400 mt-0.5">▶</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-white">{it.surgeon_name}</strong>
                      <span className="text-xs text-slate-400">{it.specialty}</span>
                      {it.commitment_category === 'pull_forward' && it.current_weekly && (
                        <span className="text-[10px] uppercase font-bold bg-cyan-900/50 text-cyan-300 px-1.5 py-0.5 rounded">
                          {it.current_weekly}→{it.target_weekly}/wk
                        </span>
                      )}
                      {it.backlog_weeks && (
                        <span className="text-[10px] uppercase font-bold bg-amber-900/50 text-amber-300 px-1.5 py-0.5 rounded">
                          {it.backlog_weeks}wk backlog
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-300 mt-1">{it.intel}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-500 italic">
              Use the Surgeon Commitments page (Step 7) to capture offline intel like "Dr. Ha-Thor started October 2025 - 1 day/week" or "Mazzola needs 1 day/wk - booking 5 months out".
            </div>
          )}
        </div>
      )}

      {/* ─── ADDITION #3: KOL Signal Strip (composite ranking) ─── */}
      {enrichment?.kol_signals && enrichment.kol_signals.top_kols?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Top KOLs by Composite Signal</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.kol_signals.headline}</p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">#</th>
                <th className="text-left pb-2">Surgeon</th>
                <th className="text-left pb-2">Specialty</th>
                <th className="text-right pb-2">Robotic Vol</th>
                <th className="text-right pb-2">Commitments</th>
                <th className="text-right pb-2">Publications (5yr)</th>
                <th className="text-right pb-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {enrichment.kol_signals.top_kols.map((k, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-slate-500">{i + 1}</td>
                  <td className="py-2 text-white font-semibold">{k.surgeon_name}</td>
                  <td className="py-2 text-slate-400">{k.specialty || '--'}</td>
                  <td className="py-2 text-right text-cyan-300">{k.robotic_vol.toLocaleString()}</td>
                  <td className="py-2 text-right text-emerald-300">{k.commitment_cases.toLocaleString()}</td>
                  <td className="py-2 text-right text-violet-300">{k.publications_5yr}</td>
                  <td className="py-2 text-right text-white font-bold">{k.composite_score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-slate-500 italic mt-2">{enrichment.kol_signals.methodology}</div>
        </div>
      )}

      {/* ─── ADDITION #4: Industry Payment Leaders (CMS Open Payments) ─── */}
      {enrichment?.payment_leaders && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Intuitive Industry Payment Leaders</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.payment_leaders.headline}</p>
          {enrichment.payment_leaders.top_payments?.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">Surgeon</th>
                  <th className="text-left pb-2">Specialty</th>
                  <th className="text-right pb-2">Payments Received</th>
                  <th className="text-right pb-2"># Payments</th>
                  <th className="text-right pb-2">Latest Year</th>
                </tr>
              </thead>
              <tbody>
                {enrichment.payment_leaders.top_payments.map((p, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="py-2 text-slate-500">{i + 1}</td>
                    <td className="py-2 text-white font-semibold">{p.surgeon_name}</td>
                    <td className="py-2 text-slate-400">{p.specialty || '--'}</td>
                    <td className="py-2 text-right text-amber-300 font-bold">${p.total_amount.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-400">{p.payment_count}</td>
                    <td className="py-2 text-right text-slate-400">{p.latest_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-slate-500 italic">
              No CMS Open Payments data ingested for these NPIs yet. Run ingest-open-payments.js to populate.
            </div>
          )}
          <div className="text-[10px] text-slate-500 italic mt-2">{enrichment.payment_leaders.methodology}</div>
        </div>
      )}

      {/* Loading state for enrichment */}
      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading deck-aligned enrichments (Training Pipeline · CSR Intel · KOL Signals · Payment Leaders)...</div>
          <div className="text-[10px] text-slate-500 mt-1">PubMed queries for top 15 surgeons may take 5-10 seconds</div>
        </div>
      )}

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

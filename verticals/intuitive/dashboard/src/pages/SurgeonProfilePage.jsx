import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, PieChart, Pie, ScatterChart, Scatter, FunnelChart, Funnel,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, LabelList, Label,
} from 'recharts'
import PageNotes from '../components/PageNotes'

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

  // The live surgeonsByHospital API needs the NPPES affiliation roster, which
  // isn't ingested in this DB, so it returns []. Fall back to the enrichment
  // (commitment-based) so the headline KPIs match the funnel/pipeline below.
  const tp = enrichment?.training_pipeline || {}
  const rosterFromEnrich = (tp.trained?.length || 0) + (tp.untrained?.length || 0) + (tp.pull_forward?.length || 0)
  const surgeonsAtHospital = surgeons.length || rosterFromEnrich
  const trainedDisplay = surgeons.length ? trainedCount : (tp.trained?.length || 0)
  const trainedPct = surgeonsAtHospital > 0 ? Math.round(trainedDisplay / surgeonsAtHospital * 100) : 0
  const roboticVolDisplay = totalRoboticVol || parseInt(project?.current_robotic_cases || 0)
  const enrichSpecialties = new Set([
    ...[...(tp.trained || []), ...(tp.untrained || []), ...(tp.pull_forward || [])]
        .map(s => (s.specialty || s.surgeon_specialty || '').split(/[/,]/)[0].trim()).filter(Boolean),
    ...((enrichment?.kol_signals?.top_kols) || [])
        .map(k => k.specialty).filter(s => s && s !== 'Research KOL'),
  ])
  const specialtyCountDisplay = Object.keys(bySpecialty).length || enrichSpecialties.size

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
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Surgeons Tracked</div>
          <div className="text-2xl font-bold text-white mt-1">{surgeonsAtHospital}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Trained on Robotics</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{trainedDisplay}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{trainedPct}% of roster</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hospital Robotic Vol (last yr)</div>
          <div className="text-2xl font-bold text-cyan-300 mt-1">{fmt(roboticVolDisplay)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Specialties</div>
          <div className="text-2xl font-bold text-white mt-1">{specialtyCountDisplay}</div>
        </div>
      </div>

      {/* ═══ INFOGRAPHICS: 4-chart grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* ── Chart 1: Specialty Distribution Donut ── */}
        {Object.keys(bySpecialty).length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">Specialty Distribution</h3>
            <p className="text-xs text-slate-500 mb-4">{surgeons.length} surgeons across {Object.keys(bySpecialty).length} specialties</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(bySpecialty).map(([sp, list]) => ({ name: sp, value: list.length, color: colorFor(sp) }))}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    label={(e) => `${e.name}: ${e.value}`}
                    labelLine={true}
                    style={{ fontSize: 10, fill: '#cbd5e1' }}
                  >
                    {Object.entries(bySpecialty).map(([sp], i) => (
                      <Cell key={i} fill={colorFor(sp)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Chart 3: KOL Scatter Quadrant (volume vs publications) ── */}
        {enrichment?.kol_signals?.top_kols?.length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">KOL Quadrant (Volume × Publications)</h3>
            <p className="text-xs text-slate-500 mb-4">Top-right = high-volume KOLs · dot size = commitment cases</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="robotic_vol"
                    name="Robotic Volume"
                    stroke="#64748b"
                    style={{ fontSize: 10 }}
                    label={{ value: 'Robotic Volume (cases/yr)', fill: '#64748b', fontSize: 10, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="publications_5yr"
                    name="Publications"
                    stroke="#64748b"
                    style={{ fontSize: 10 }}
                    label={{ value: 'Publications (5yr)', fill: '#64748b', fontSize: 10, angle: -90, position: 'insideLeft' }}
                  />
                  <ZAxis type="number" dataKey="commitment_cases" range={[60, 600]} name="Commitment" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: 8 }}>
                          <div className="text-white font-bold">{d.surgeon_name}</div>
                          <div className="text-xs text-slate-400">{d.specialty}</div>
                          <div className="text-xs text-cyan-300">Robotic: {d.robotic_vol}</div>
                          <div className="text-xs text-violet-300">Publications: {d.publications_5yr}</div>
                          <div className="text-xs text-emerald-300">Commitment: {d.commitment_cases}</div>
                          <div className="text-xs text-amber-300">Score: {d.composite_score}</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={enrichment.kol_signals.top_kols} fill="#8b5cf6">
                    {enrichment.kol_signals.top_kols.map((k, i) => (
                      <Cell key={i} fill={colorFor(k.specialty)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Chart 4: Top Surgeon Modality Mix (Open / Lap / Robotic) ── */}
        {surgeons.length > 0 && (() => {
          const top10 = [...surgeons]
            .map(s => ({
              name: (s.full_name || s.surgeon_name || '').slice(0, 22),
              robotic: parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0),
              lap: parseInt(s.lap_cases || 0),
              open: parseInt(s.open_cases || 0),
              total: parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0) + parseInt(s.lap_cases || 0) + parseInt(s.open_cases || 0),
            }))
            .filter(s => s.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
          if (!top10.length) return null
          return (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
              <h3 className="font-bold text-white mb-1">Top 10 Surgeons — Modality Mix</h3>
              <p className="text-xs text-slate-500 mb-4">Open / Lap / Robotic case split per surgeon (MPUP-sourced)</p>
              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top10} layout="vertical" margin={{ left: 100, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={95} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="robotic" stackId="a" fill="#1e40af" name="Robotic" />
                    <Bar dataKey="lap" stackId="a" fill="#93c5fd" name="Lap" />
                    <Bar dataKey="open" stackId="a" fill="#1f2937" name="Open" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Trained</div>
              <div className="text-3xl font-bold text-emerald-300 mt-1">{enrichment.training_pipeline.trained.length}</div>
              <div className="text-[10px] text-emerald-200 mb-2">credentialed surgeons</div>
              {enrichment.training_pipeline.trained.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[11px] text-slate-300 truncate">• {s.surgeon_name} ({s.cases_annual} cases)</div>
              ))}
            </div>
            <div className="bg-cyan-950/30 border border-cyan-700/50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Splitter</div>
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

      <PageNotes title="Surgeon Profile">
        <p className="mb-2"><span className="text-white font-semibold">What this answers:</span> who the credentialed surgeons are at this hospital and how much each one operates, split by technique (open / laparoscopic / robotic).</p>
        <ul className="list-disc pl-5 space-y-1 mb-2">
          <li>Surgeon names and IDs come from the <span className="text-cyan-300">NPI Registry (NPPES)</span> — the public federal directory of providers. This is <span className="text-white font-semibold">real, not modeled</span>.</li>
          <li>Per-surgeon case volumes come from <span className="text-cyan-300">CMS Medicare physician claims</span> (MPUP). The robotic-vs-open-vs-lap split is the surgeon's actual claims-derived volume; where a surgeon has no claims match, captured commitment cases are used as a fallback.</li>
          <li>The <span className="text-cyan-300">Training Pipeline</span> and CSR intel panels only show surgeons reached through the CSR system (survey, call, or a captured access note) — they reflect real contact, not the full roster.</li>
        </ul>
        <p><span className="text-white font-semibold">Bottom line:</span> this is the factual operator roster. A large <span className="text-white font-semibold">open</span> caseload is the pool that could be <span className="text-cyan-300">converted</span> to da Vinci later (cost avoidance); it does not by itself create <span className="text-amber-300">new revenue</span>. Net-new revenue is committed on the Surgeon Commitments page.</p>
      </PageNotes>

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/hospital-profile/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Hospital Profile</button>
        <button onClick={() => navigate(`/robotics-program/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Robotics Program →
        </button>
      </div>
    </div>
  )
}

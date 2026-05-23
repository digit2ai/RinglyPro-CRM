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
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id).then(r => setProject(r.project)).catch(console.error).finally(() => setLoading(false))
    // Kick off enrichment in parallel (PubMed call can take a few seconds)
    setEnrichmentLoading(true)
    api.getHospitalProfileEnrichment(id)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
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

      {/* ─── ADDITION #1: Strategic Impact Summary (Deck p3) ─── */}
      {enrichment?.strategic_impact && (
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Projected Strategic Impact</div>
            <h3 className="text-lg font-bold text-white">{enrichment.strategic_impact.headline}</h3>
          </div>
          <div className="space-y-2">
            {enrichment.strategic_impact.metrics.map((m, i) => (
              <div key={i} className="flex items-baseline gap-3 py-1.5 border-b border-slate-700/50 last:border-0">
                <span className="text-sm text-slate-400 flex-1">{m.label} =</span>
                <span className={`text-lg font-bold ${m.raw_value > 0 ? 'text-emerald-300' : 'text-slate-600'}`}>{m.value}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.strategic_impact.methodology}</div>
        </div>
      )}

      {/* ─── ADDITION #2: Capital Snapshot (Deck p2) ─── */}
      {enrichment?.capital_snapshot && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Capital Snapshot</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.capital_snapshot.headline}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current</div>
              <div className="text-3xl font-bold text-white mt-1">{enrichment.capital_snapshot.current.systems}</div>
              <div className="text-xs text-slate-400 mt-0.5">{enrichment.capital_snapshot.current.model} systems installed today</div>
            </div>
            {enrichment.capital_snapshot.planned_phase_1 && (
              <div className="bg-blue-950/40 rounded-lg p-4 border border-blue-700/60">
                <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Phase 1 · {enrichment.capital_snapshot.planned_phase_1.year}</div>
                <div className="text-3xl font-bold text-blue-300 mt-1">+{enrichment.capital_snapshot.planned_phase_1.systems}</div>
                <div className="text-xs text-blue-200 mt-0.5">{enrichment.capital_snapshot.planned_phase_1.note}</div>
              </div>
            )}
            {enrichment.capital_snapshot.planned_phase_2 && (
              <div className="bg-violet-950/40 rounded-lg p-4 border border-violet-700/60">
                <div className="text-[10px] uppercase tracking-widest text-violet-400 font-bold">Phase 2 · {enrichment.capital_snapshot.planned_phase_2.year}</div>
                <div className="text-3xl font-bold text-violet-300 mt-1">+{enrichment.capital_snapshot.planned_phase_2.systems}</div>
                <div className="text-xs text-violet-200 mt-0.5">{enrichment.capital_snapshot.planned_phase_2.note}</div>
              </div>
            )}
          </div>
          <div className="mt-3 text-sm text-slate-400">
            Total fleet after recommended placement: <strong className="text-white">{enrichment.capital_snapshot.total_after_plan} systems</strong>
          </div>
        </div>
      )}

      {/* ─── ADDITION #3: AMP Peer Benchmark (Deck p34) ─── */}
      {enrichment?.peer_benchmark && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-white">AMP Peer Benchmark</h3>
              <p className="text-xs text-slate-500">Ranked vs Intuitive AMP Honor Roll academic medical centers</p>
            </div>
            <div className={`text-right ${enrichment.peer_benchmark.gap_to_peer_avg > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold">Rank</div>
              <div className="text-2xl font-bold">#{enrichment.peer_benchmark.rank} of {enrichment.peer_benchmark.total_ranked}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">You</div>
              <div className="text-2xl font-bold text-white mt-1">{enrichment.peer_benchmark.current_systems}<span className="text-sm text-slate-500 ml-1">systems</span></div>
              <div className="text-xs text-slate-400">{enrichment.peer_benchmark.current_teaching_consoles} teaching consoles</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Peer Average</div>
              <div className="text-2xl font-bold text-slate-300 mt-1">{enrichment.peer_benchmark.peer_avg_systems}<span className="text-sm text-slate-500 ml-1">systems</span></div>
              <div className="text-xs text-slate-400">{enrichment.peer_benchmark.peer_avg_teaching_consoles} teaching consoles avg</div>
            </div>
          </div>
          <div className="text-sm font-semibold mb-2 mt-4 text-slate-400">Ranked Peers</div>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="text-left pb-1">#</th><th className="text-left pb-1">Institution</th><th className="text-right pb-1">Systems</th><th className="text-right pb-1">Teaching Consoles</th></tr>
            </thead>
            <tbody>
              {enrichment.peer_benchmark.peers_ranked.map((p, i) => (
                <tr key={i} className={`border-t border-slate-700 ${p.is_target ? 'bg-blue-900/30 font-bold' : ''}`}>
                  <td className="py-1.5 text-slate-500">{i + 1}</td>
                  <td className={`py-1.5 ${p.is_target ? 'text-blue-300' : 'text-slate-300'}`}>{p.name}</td>
                  <td className="py-1.5 text-right text-white">{p.systems}</td>
                  <td className="py-1.5 text-right text-slate-400">{p.teaching_consoles}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {enrichment.peer_benchmark.gap_to_peer_avg > 0 && (
            <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded p-2">
              <strong>Gap:</strong> {enrichment.peer_benchmark.gap_to_peer_avg} systems below AMP peer average. This is the motivational data point that drives capital expansion conversations.
            </div>
          )}
        </div>
      )}

      {/* ─── ADDITION #4: Research Profile (Deck p20-23, condensed) ─── */}
      {enrichment?.research_profile && enrichment.research_profile.total_all_publications > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Research Profile</h3>
          <p className="text-xs text-slate-500 mb-4">PubMed publications affiliated with {enrichment.research_profile.hospital_name}</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">All-Time Publications</div>
              <div className="text-3xl font-bold text-white mt-1">{(enrichment.research_profile.total_all_publications || 0).toLocaleString()}</div>
              <div className="text-[10px] text-slate-500">all topics, since indexing began</div>
            </div>
            <div className="bg-blue-950/30 rounded-lg p-4 border border-blue-700/60">
              <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Robotic Surgery Papers</div>
              <div className="text-3xl font-bold text-blue-300 mt-1">{(enrichment.research_profile.robotic_publications || 0).toLocaleString()}</div>
              <div className="text-[10px] text-blue-200">robotic / da Vinci affiliated</div>
            </div>
            <div className="bg-emerald-950/30 rounded-lg p-4 border border-emerald-700/60">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Last 12 Months</div>
              <div className="text-3xl font-bold text-emerald-300 mt-1">{(enrichment.research_profile.last_12_months || 0).toLocaleString()}</div>
              <div className="text-[10px] text-emerald-200">papers across all topics</div>
            </div>
          </div>
          {enrichment.research_profile.source_url && (
            <a href={enrichment.research_profile.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
              View full robotic-surgery bibliography on PubMed →
            </a>
          )}
          <div className="text-[10px] text-slate-500 italic mt-2">{enrichment.research_profile.methodology}</div>
        </div>
      )}

      {/* Loading state for enrichment */}
      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading deck-aligned enrichment (Strategic Impact, Capital Snapshot, Peer Benchmark, Research Profile)...</div>
          <div className="text-[10px] text-slate-500 mt-1">PubMed lookup may take 3-5 seconds</div>
        </div>
      )}

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

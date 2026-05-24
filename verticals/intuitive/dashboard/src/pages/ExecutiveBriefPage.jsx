import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, Area, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts'

// ─── Executive Brief (Step 10 of 10) — Comprehensive consolidated report ────
//
// Includes ALL content from Steps 1-9 in one printable document, plus a
// "Generate Executive Presentation" button that launches the slide+voice deck.
//
// Mirrors the MyIntuitive+ branded format Eddie Serene sees internally at
// Intuitive. White background, royal-blue cover, locked Intuitive specialty
// color palette, every infographic from every step rendered inline.

const fmt = (n) => n != null ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'
const fmtMoney = (n) => n != null ? '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$0'
const fmtMoneyShort = (n) => {
  if (n == null) return '$0'
  const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

// Intuitive's locked color palette
const C = {
  blue: '#1e40af', cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b',
  violet: '#8b5cf6', red: '#ef4444', slate: '#94a3b8', dark: '#1f2937',
  lap: '#93c5fd', open: '#1f2937', benchmark: '#94a3b8',
  inHours: '#22c55e', afterHours: '#ef4444',
}

const SPECIALTY_COLORS = {
  general: C.blue, gynecology: '#8b5cf6', urology: C.cyan, cardiac: C.dark,
  thoracic: C.emerald, colorectal: C.amber, bariatric: '#ec4899', default: C.slate,
}
const colorForSpecialty = (s) => {
  if (!s) return SPECIALTY_COLORS.default
  const k = String(s).toLowerCase().replace(/\s|&|-/g, '')
  for (const key of Object.keys(SPECIALTY_COLORS)) {
    if (key === 'default') continue
    if (k.includes(key)) return SPECIALTY_COLORS[key]
  }
  return SPECIALTY_COLORS.default
}

// ─── Shared section/visual primitives ───
function Section({ id, stepNum, label, title, subtitle, children }) {
  return (
    <section id={id} className="bg-white border border-slate-200 rounded-lg p-8 mb-6 shadow-sm print:shadow-none print:break-inside-avoid">
      <div className="mb-6 pb-3 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: C.blue }}>{label}</div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function KPI({ label, value, sub, color }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
      <div className="text-2xl font-bold" style={{ color: color || C.blue }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: 6 }
const labelStyle = { color: '#1f2937' }

// ─── Main page ────────────────────────────────────────────────────────
export default function ExecutiveBriefPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [d, setD] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const magicLinkUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/intuitive/proposal/${id}`

  function copyMagicLink() {
    navigator.clipboard.writeText(magicLinkUrl).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea')
      ta.value = magicLinkUrl
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000) } catch (e) {}
      document.body.removeChild(ta)
    })
  }

  useEffect(() => {
    if (!id) { setLoading(false); return }
    setLoading(true); setError(null)
    Promise.all([
      api.getProject(id),
      api.getExecutiveBrief(id).catch(() => ({ data: null })),
      api.getHospitalProfileEnrichment(id).catch(() => ({ data: null })),
      api.getSurgeonProfileEnrichment(id).catch(() => ({ data: null })),
      api.getRoboticsProgramEnrichment(id).catch(() => ({ data: null })),
      api.getMarketProfileEnrichment(id).catch(() => ({ data: null })),
      api.getClinicalOutcomesEnrichment(id).catch(() => ({ data: null })),
      api.getClinicalOverlayEnrichment(id, 50).catch(() => ({ data: null })),
      api.getSurgeonCommitmentsEnrichment(id).catch(() => ({ data: null })),
      api.getBusinessPlanEnrichment(id).catch(() => ({ data: null })),
      api.getPerformanceTrackingEnrichment(id).catch(() => ({ data: null })),
    ]).then(([proj, eb, hp, sp, rp, mp, co, cb, sc, bp, pt]) => {
      setProject(proj.project)
      setD({
        executive: eb.data,
        hospital: hp.data,
        surgeon: sp.data,
        robotics: rp.data,
        market: mp.data,
        clinicalOutcomes: co.data,
        clinicalBenefit: cb.data,
        commitments: sc.data,
        businessPlan: bp.data,
        tracking: pt.data,
      })
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Building comprehensive Executive Brief...</div>
  if (error) return <div className="p-10 text-red-400">{error}</div>
  if (!project) return <div className="p-10 text-slate-400">Project not found.</div>

  const eb = d.executive || {}
  const hp = d.hospital || {}
  const sp = d.surgeon || {}
  const rp = d.robotics || {}
  const mp = d.market || {}
  const co = d.clinicalOutcomes || {}
  const cb = d.clinicalBenefit || {}
  const sc = d.commitments || {}
  const bp = d.businessPlan || {}
  const pt = d.tracking || {}

  return (
    <div className="bg-slate-100 min-h-screen pb-12">
      {/* ─── Action bar (hidden in print) ─── */}
      <div className="bg-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10 print:hidden flex-wrap gap-2">
        <div className="text-white">
          <div className="text-xs uppercase tracking-widest text-slate-400">Step 10 of 10 · MyIntuitive+ Format · Comprehensive Brief</div>
          <div className="text-sm font-semibold">{project.hospital_name} · Strategic Alignment Opportunity</div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Magic Link share button — public proposal URL, no login */}
          <button
            onClick={copyMagicLink}
            className={`text-sm font-bold px-4 py-2 rounded flex items-center gap-2 shadow transition-colors ${linkCopied ? 'bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
            title="Copy public shareable link (no login required) — sends CFOs to the slide+voice presentation"
          >
            {linkCopied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Magic Link Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Share Magic Link
              </>
            )}
          </button>

          {/* Generate Executive Presentation — opens the public proposal in a new tab */}
          <a
            href={`/intuitive/proposal/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-bold px-5 py-2 rounded flex items-center gap-2 shadow-lg"
            title="Launch the slide+voice presentation (with Rachel narration)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Executive Presentation
          </a>

          {/* PDF export — opens print-optimized proposal in new tab (much better than browser print of React page) */}
          <a
            href={`/intuitive/proposal/${id}#print`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded"
            title="Open print-friendly version (better PDF quality than React page)"
          >
            Export PDF
          </a>

          <button onClick={() => navigate(`/tracking/${id}`)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            ← Performance Tracking
          </button>
        </div>
      </div>

      {/* Magic link confirmation toast (also visible) */}
      {linkCopied && (
        <div className="fixed top-20 right-6 bg-emerald-600 text-white px-5 py-3 rounded shadow-xl z-50 max-w-md print:hidden">
          <div className="font-bold text-sm mb-1">✓ Magic link copied to clipboard</div>
          <div className="text-xs opacity-90 break-all">{magicLinkUrl}</div>
          <div className="text-[10px] opacity-75 mt-1">Send this to your CFO · no login required · plays Rachel narration</div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 pt-6">

        {/* ─── COVER SLIDE ─── */}
        <section className="rounded-lg p-12 mb-6 text-white shadow-md print:break-after-page" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" className="h-10 mb-12 brightness-0 invert" />
          <h1 className="text-4xl font-bold mb-3">{project.hospital_name}</h1>
          <p className="text-xl opacity-90 mb-12">{eb.cover?.subtitle || 'Strategic Alignment Opportunity'}</p>
          <div className="text-sm opacity-90 space-y-1">
            <div>Prepared for: <strong>{eb.cover?.prepared_for || 'Executive Leadership'}</strong></div>
            <div>Prepared by: <strong>{eb.cover?.prepared_by || 'SurgicalMind AI · Digit2AI'}</strong></div>
            <div>Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="text-[10px] opacity-60 mt-16">CONFIDENTIAL · For internal review and customer discussion</div>
        </section>

        {/* ─── TABLE OF CONTENTS ─── */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm print:hidden">
          <h3 className="text-lg font-bold text-slate-900 mb-3">Table of Contents</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {[
              ['exec-summary', 'Executive Summary'],
              ['diagnostic', 'Diagnostic Frame'],
              ['scoreboard', 'Da Vinci Impact Scoreboard'],
              ['step-1', '1. Hospital Profile'],
              ['step-2', '2. Surgeon Profile'],
              ['step-3', '3. Robotics Program'],
              ['step-4', '4. Market Profile'],
              ['step-5', '5. Clinical Outcomes'],
              ['step-6', '6. Clinical Benefit Overlay (THE MOAT)'],
              ['step-7', '7. Surgeon Commitments'],
              ['step-8', '8. Business Plan'],
              ['step-9', '9. Performance Tracking'],
              ['peers', 'Peer Case Study'],
              ['next-steps', 'Recommendation & Next Steps'],
            ].map(([anchor, label]) => (
              <a key={anchor} href={`#${anchor}`} className="text-blue-600 hover:text-blue-800 hover:underline">{label}</a>
            ))}
          </div>
        </section>

        {/* ─── EXECUTIVE SUMMARY KPIs + SCOREBOARD ─── */}
        <Section id="exec-summary" stepNum={0} label="Executive Summary" title={`${project.hospital_name} at a glance`}>
          {eb.kpi_header && (
            <div className="grid grid-cols-4 gap-3 mb-6 pb-4 border-b border-slate-200">
              {[
                { ...eb.kpi_header.systems, key: 'system' },
                { ...eb.kpi_header.surgeons, key: 'surgeon' },
                { ...eb.kpi_header.specialties, key: 'specialty' },
                { ...eb.kpi_header.patients, key: 'patient' },
              ].map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: C.blue }}>{c.key[0].toUpperCase()}</div>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: C.blue }}>{fmt(c.value)}</div>
                    <div className="text-xs text-slate-600 leading-tight">{c.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ─── DIAGNOSTIC ─── */}
        {eb.diagnostic && (
          <Section id="diagnostic" stepNum={0} label="Diagnostic Frame" title="Challenges & Strategic Questions">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="text-base font-bold mb-3 pb-2 border-b border-slate-300" style={{ color: C.blue }}>Challenges and Constraints</h4>
                <div className="space-y-4">
                  {eb.diagnostic.challenges.map((c, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="font-bold mt-0.5" style={{ color: C.blue }}>▶</span>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{c.title}</div>
                        <div className="text-sm text-slate-700 mt-0.5">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold mb-3 pb-2 border-b border-slate-300" style={{ color: C.blue }}>What we would like to better understand…</h4>
                <div className="space-y-4">
                  {eb.diagnostic.questions.map((q, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="font-bold mt-0.5" style={{ color: C.blue }}>▶</span>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{q.title}</div>
                        <div className="text-sm text-slate-700 mt-0.5">{q.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ─── 4-COLUMN SCOREBOARD ─── */}
        {eb.scoreboard && (
          <Section id="scoreboard" stepNum={0} label="Da Vinci Impact" title="Clinical / Financial / Operational / Strategic Scoreboard">
            <div className="grid grid-cols-4 gap-4">
              {[
                { key: 'clinical', label: 'Clinical', color: C.red },
                { key: 'financial', label: 'Financial', color: C.emerald },
                { key: 'operational', label: 'Operational', color: C.cyan },
                { key: 'strategic', label: 'Strategic', color: C.violet },
              ].map(col => (
                <div key={col.key} className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-widest font-bold mb-3 pb-2 border-b" style={{ color: col.color, borderColor: col.color }}>{col.label}</div>
                  <div className="space-y-4">
                    {(eb.scoreboard[col.key] || []).map((cell, i) => (
                      <div key={i}>
                        <div className="text-2xl font-bold" style={{ color: cell.highlight ? C.red : C.blue }}>{cell.value}</div>
                        <div className="text-xs text-slate-600 leading-tight mt-1">{cell.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── STEP 1: HOSPITAL PROFILE ─── */}
        {(hp || project) && (
          <Section id="step-1" stepNum={1} label="Step 1 · Hospital Profile" title={`${project.hospital_name} — Profile`} subtitle={`${project.hospital_type || ''} · ${project.state || ''}`}>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <KPI label="Total Beds" value={fmt(project.bed_count)} />
              <KPI label="Annual Surgical Volume" value={fmt(project.annual_surgical_volume)} />
              <KPI label="Total OR Count" value={fmt(project.total_or_count)} sub={`${fmt(project.robot_ready_ors)} robot-ready`} />
              <KPI label="Operating Margin" value={project.operating_margin_pct != null ? `${parseFloat(project.operating_margin_pct).toFixed(1)}%` : '--'} />
            </div>
            {hp?.strategic_impact && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: C.blue }}>Projected Strategic Impact</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hp.strategic_impact.metrics.filter(m => m.raw_value > 0).map(m => ({ label: m.label, value: m.raw_value, display: m.value }))} layout="vertical" margin={{ left: 180, right: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis dataKey="label" type="category" stroke="#64748b" style={{ fontSize: 11 }} width={170} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} formatter={(v, n, p) => [p.payload.display, '']} />
                      <Bar dataKey="value" fill={C.emerald}>
                        <LabelList dataKey="display" position="right" style={{ fill: C.emerald, fontSize: 11, fontWeight: 'bold' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {hp?.peer_benchmark && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>AMP Peer Benchmark · Rank #{hp.peer_benchmark.rank} of {hp.peer_benchmark.total_ranked}</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hp.peer_benchmark.peers_ranked} layout="vertical" margin={{ left: 140, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" style={{ fontSize: 11 }} width={130} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <ReferenceLine x={hp.peer_benchmark.peer_avg_systems} stroke={C.amber} strokeDasharray="4 4" />
                      <Bar dataKey="systems" name="Systems Installed">
                        {hp.peer_benchmark.peers_ranked.map((p, i) => <Cell key={i} fill={p.is_target ? C.red : C.blue} />)}
                        <LabelList dataKey="systems" position="right" style={{ fill: '#1f2937', fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {hp?.research_profile?.by_year?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Research Profile · {hp.research_profile.total_all_publications?.toLocaleString()} total publications</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hp.research_profile.by_year}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Line type="monotone" dataKey="count" stroke={C.violet} strokeWidth={3} dot={{ r: 5, fill: C.violet }}>
                        <LabelList dataKey="count" position="top" style={{ fill: C.violet, fontSize: 11, fontWeight: 'bold' }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 2: SURGEON PROFILE ─── */}
        {sp && (
          <Section id="step-2" stepNum={2} label="Step 2 · Surgeon Profile" title="Surgeon Roster, KOLs & Industry Payments">
            {sp.training_pipeline && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <KPI label="Trained" value={sp.training_pipeline.trained.length} color={C.emerald} />
                <KPI label="In Training Pipeline" value={sp.training_pipeline.untrained.length} color={C.amber} />
                <KPI label="Pull-Forward (Access)" value={sp.training_pipeline.pull_forward.length} color={C.cyan} />
              </div>
            )}
            {sp.kol_signals?.top_kols?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Top KOLs — Volume × Publications Quadrant</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" dataKey="robotic_vol" stroke="#64748b" style={{ fontSize: 10 }} label={{ value: 'Robotic Volume (cases/yr)', fill: '#64748b', fontSize: 10, position: 'insideBottom', offset: -10 }} />
                      <YAxis type="number" dataKey="publications_5yr" stroke="#64748b" style={{ fontSize: 10 }} label={{ value: 'Publications (5yr)', fill: '#64748b', fontSize: 10, angle: -90, position: 'insideLeft' }} />
                      <ZAxis type="number" dataKey="commitment_cases" range={[60, 600]} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null
                        const dd = payload[0].payload
                        return (
                          <div style={tooltipStyle} className="p-2">
                            <div className="font-bold">{dd.surgeon_name}</div>
                            <div className="text-xs">{dd.specialty}</div>
                            <div className="text-xs">Robotic: {dd.robotic_vol} · Pubs: {dd.publications_5yr} · Score: {dd.composite_score}</div>
                          </div>
                        )
                      }} />
                      <Scatter data={sp.kol_signals.top_kols}>
                        {sp.kol_signals.top_kols.map((k, i) => <Cell key={i} fill={colorForSpecialty(k.specialty)} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {sp.payment_leaders?.top_payments?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Industry Payment Leaders (last 2 fiscal years)</div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left pb-1">Surgeon</th><th className="text-left pb-1">Specialty</th><th className="text-right pb-1">Payments</th></tr></thead>
                  <tbody>
                    {sp.payment_leaders.top_payments.map((p, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="py-1.5 font-semibold">{p.surgeon_name}</td>
                        <td className="py-1.5">{p.specialty || '—'}</td>
                        <td className="py-1.5 text-right" style={{ color: C.amber }}><strong>${p.total_amount.toLocaleString()}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 3: ROBOTICS PROGRAM ─── */}
        {rp && (
          <Section id="step-3" stepNum={3} label="Step 3 · Robotics Program" title="Installed Base, Utilization & Modality Mix">
            {rp.system_utilization && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <KPI label="Current Avg/Qtr" value={fmt(rp.system_utilization.current_avg_per_system_qtr)} color={C.emerald} />
                <KPI label="Academic Avg" value={fmt(rp.system_utilization.academic_avg_per_qtr)} />
                <KPI label="Delta vs Academic" value={(rp.system_utilization.delta_vs_academic >= 0 ? '+' : '') + rp.system_utilization.delta_vs_academic} color={rp.system_utilization.delta_vs_academic >= 0 ? C.emerald : C.amber} />
              </div>
            )}
            {rp.system_utilization?.procedure_volume_by_qtr?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Procedure Volume — In-Hours vs After-Hours</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rp.system_utilization.procedure_volume_by_qtr}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="quarter" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="in_hours" stackId="a" fill={C.inHours} name="In-Hours" />
                      <Bar dataKey="after_hours" stackId="a" fill={C.afterHours} name="After-Hours" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {rp.modality_by_year && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Modality Mix vs National Academic Peers</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={rp.modality_by_year.trend_by_year}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" style={{ fontSize: 10 }} unit="%" />
                        <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="davinci_pct" stroke={C.blue} strokeWidth={2.5} name="Da Vinci" />
                        <Line type="monotone" dataKey="lap_pct" stroke={C.lap} strokeWidth={2.5} name="Lap" />
                        <Line type="monotone" dataKey="open_pct" stroke="#cbd5e1" strokeWidth={2.5} name="Open" strokeDasharray="3 3" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center text-center">
                    <div className="text-sm text-slate-600 mb-2">vs National Academic Peers (N={rp.modality_by_year.peer_benchmark.n.toLocaleString()})</div>
                    <div className="text-5xl font-bold" style={{ color: rp.modality_by_year.delta_vs_peer_davinci > 0 ? C.red : C.emerald }}>
                      {Math.abs(rp.modality_by_year.delta_vs_peer_davinci)}% Delta
                    </div>
                    <div className="text-xs text-slate-600 mt-2">{rp.modality_by_year.headline}</div>
                  </div>
                </div>
              </div>
            )}
            {rp.tech_generation_mix && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Tech Generation Mix Over Time</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rp.tech_generation_mix.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="S" stackId="a" fill="#3b82f6" name="S" />
                      <Bar dataKey="Si" stackId="a" fill="#f59e0b" name="Si" />
                      <Bar dataKey="Xi" stackId="a" fill="#22c55e" name="Xi" />
                      <Bar dataKey="dV5" stackId="a" fill={C.blue} name="dV5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 4: MARKET PROFILE ─── */}
        {mp && (
          <Section id="step-4" stepNum={4} label="Step 4 · Market Profile" title="Market Share & Remaining Opportunity">
            {mp.procedure_market_share && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <KPI label="Current Mkt Share" value={mp.procedure_market_share.blended_market_share_pct + '%'} color={C.cyan} />
                <KPI label="Hospital Volume" value={fmt(mp.procedure_market_share.total_hospital_volume)} />
                <KPI label="Remaining Opportunity" value={fmt(mp.procedure_market_share.total_remaining_opportunity)} color={C.red} />
              </div>
            )}
            {mp.growth_math?.scenarios?.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {mp.growth_math.scenarios.map((s, i) => (
                  <div key={i} className="border border-slate-200 rounded p-3 text-center">
                    <div className="text-xs text-slate-500 font-bold">{s.name}</div>
                    <div className="text-xl font-bold mt-1" style={{ color: C.emerald }}>{fmtMoneyShort(s.dollars)}</div>
                    <div className="text-[10px] text-slate-500">{fmt(s.cases_added)} cases captured</div>
                  </div>
                ))}
              </div>
            )}
            {mp.procedure_market_share?.procedures && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Procedure-Level Market Share</div>
                <div style={{ height: Math.max(400, mp.procedure_market_share.procedures.length * 28) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mp.procedure_market_share.procedures} layout="vertical" margin={{ left: 110, right: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis dataKey="procedure" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={100} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="hospital_volume" fill={C.cyan} name="Hospital" />
                      <Bar dataKey="market_volume" fill={C.benchmark} name="Total Market" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 5: CLINICAL OUTCOMES ─── */}
        {co && (
          <Section id="step-5" stepNum={5} label="Step 5 · Clinical Outcomes" title="Current Baseline">
            {co.outcomes_benchmark?.benchmark_table && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Outcomes vs National Avg vs Top-Decile</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={co.outcomes_benchmark.radar_data}>
                      <PolarGrid stroke="#cbd5e1" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#475569' }} />
                      <PolarRadiusAxis tick={{ fontSize: 9, fill: '#64748b' }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Radar name="Top-Decile" dataKey="top_decile" stroke={C.emerald} fill={C.emerald} fillOpacity={0.15} strokeWidth={1.5} />
                      <Radar name="National Avg" dataKey="national" stroke={C.slate} fill={C.slate} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="3 3" />
                      <Radar name="Hospital" dataKey="hospital" stroke={C.cyan} fill={C.cyan} fillOpacity={0.3} strokeWidth={2.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {co.los_variability?.procedures && (
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>LOS Open vs MIS vs Da Vinci · {co.los_variability.opportunity_procedures?.length || 0} opportunity procedures</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={co.los_variability.procedures.map(p => ({ procedure: p.procedure, Open: p.open_los_days, MIS: p.mis_los_days, dV: p.davinci_los_days }))} layout="vertical" margin={{ left: 100, right: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} unit=" days" />
                      <YAxis dataKey="procedure" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={95} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Open" fill={C.benchmark} />
                      <Bar dataKey="MIS" fill={C.lap} />
                      <Bar dataKey="dV" fill={C.blue} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 6: CLINICAL BENEFIT OVERLAY (THE MOAT) ─── */}
        {cb && (
          <Section id="step-6" stepNum={6} label="Step 6 · THE MOAT" title="Clinical Benefit Overlay — Dollarized $ ROI">
            {cb.bed_days_savings && (
              <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border-2 border-emerald-300 rounded-lg p-6 mb-4 text-center">
                <div className="text-xs uppercase tracking-widest font-bold" style={{ color: C.emerald }}>Annual Cost Avoidance Opportunity</div>
                <div className="text-6xl font-bold mt-2" style={{ color: C.emerald }}>{fmtMoneyShort(cb.bed_days_savings.total_dollar_savings)}</div>
                <div className="text-sm text-slate-700 mt-2">@ ${cb.bed_days_savings.bed_day_cost_used.toLocaleString()}/day · {cb.bed_days_savings.conversion_pct_assumed}% conversion · {fmt(cb.bed_days_savings.total_bed_days_saved)} bed days saved</div>
              </div>
            )}
            {cb.investment_payback && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <KPI label="Project IRR" value={cb.investment_payback.project_irr_pct + '%'} color={C.emerald} />
                <KPI label="Payback" value={cb.investment_payback.estimated_payback_years ? cb.investment_payback.estimated_payback_years + ' yrs' : '5+'} color={C.cyan} />
                <KPI label="Annual Net Benefit" value={fmtMoneyShort(cb.investment_payback.annual_net_benefit)} color={C.violet} />
                <KPI label="Capital Expense" value={fmtMoneyShort(cb.investment_payback.capital_expenditure)} color={C.amber} />
              </div>
            )}
            {cb.investment_payback?.cumulative_return_5yr && (
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Cumulative Return vs Investment Breakeven</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cb.investment_payback.cumulative_return_5yr}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} tickFormatter={(v) => '$' + (v / 1e6).toFixed(1) + 'M'} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} formatter={(v) => '$' + Number(v).toLocaleString()} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="cumulative_return" stroke={C.emerald} strokeWidth={3} dot={{ r: 5, fill: C.emerald }} name="Cumulative Return" />
                      <Line type="monotone" dataKey="breakeven" stroke={C.red} strokeWidth={2} strokeDasharray="6 4" dot={false} name="Breakeven" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {cb.cost_of_waiting && (
              <div className="mt-4 bg-red-50 border-2 border-red-300 rounded p-4 text-center">
                <div className="text-xs uppercase tracking-widest font-bold" style={{ color: C.red }}>Cost of Waiting</div>
                <div className="text-3xl font-bold" style={{ color: C.red }}>({fmtMoneyShort(cb.cost_of_waiting.monthly_cost_of_waiting)}) per month</div>
                <div className="text-xs text-slate-600 mt-1">Every month of delay forfeits 1/12 of the {fmtMoneyShort(cb.cost_of_waiting.annual_total_opportunity)} annual opportunity</div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 7: SURGEON COMMITMENTS ─── */}
        {sc && (
          <Section id="step-7" stepNum={7} label="Step 7 · Surgeon Commitments" title="3-Category CFO-Grade Commitment Book">
            {sc.summary && (
              <div className="grid grid-cols-5 gap-3 mb-4">
                <KPI label="Surgeons" value={sc.summary.total_surgeons} />
                <KPI label="Cases/Yr" value={fmt(sc.summary.total_incremental_cases)} color={C.cyan} />
                <KPI label="Revenue" value={fmtMoneyShort(sc.summary.total_revenue_impact)} color={C.violet} />
                <KPI label="Bed Days Saved" value={fmt(sc.summary.total_bed_days_saved)} color={C.emerald} />
                <KPI label="Combined Impact" value={fmtMoneyShort(sc.summary.total_combined_impact)} color={C.red} />
              </div>
            )}
            {sc.summary?.composition?.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sc.summary.composition} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={(e) => `${e.value}`} style={{ fontSize: 10, fill: '#1f2937' }}>
                        {sc.summary.composition.map((c, i) => <Cell key={i} fill={c.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {sc.per_surgeon_bed_days?.length > 0 && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sc.per_surgeon_bed_days.slice(0, 8)} layout="vertical" margin={{ left: 100, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                        <YAxis dataKey="surgeon_name" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={95} />
                        <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
                        <Bar dataKey="bed_days_saved" name="Bed Days Saved" fill={C.emerald} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
            {sc.master_table?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Master Surgeon Table</div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left pb-1">Surgeon</th><th className="text-left pb-1">Specialty</th><th className="text-center pb-1">Trained</th><th className="text-left pb-1">Training Needs</th><th className="text-right pb-1">Cases/Yr</th></tr></thead>
                  <tbody>
                    {sc.master_table.slice(0, 15).map((s, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="py-1.5 font-semibold">{s.surgeon_name}</td>
                        <td className="py-1.5">{s.specialty}</td>
                        <td className="py-1.5 text-center">{s.trained ? '✓' : '○'}</td>
                        <td className="py-1.5 text-slate-600">{s.training_needs || '—'}</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: C.emerald }}>{fmt(s.incremental_cases_yr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 8: BUSINESS PLAN ─── */}
        {bp && (
          <Section id="step-8" stepNum={8} label="Step 8 · Business Plan" title="5-Year Proforma & Capital Placement">
            {bp.proforma?.investment_summary && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <KPI label="Project IRR" value={bp.proforma.investment_summary.project_irr + '%'} color={C.emerald} />
                <KPI label="Payback" value={bp.proforma.investment_summary.estimated_payback_years ? bp.proforma.investment_summary.estimated_payback_years + ' yrs' : '5+'} color={C.cyan} />
                <KPI label="5yr Cost Avoidance" value={fmtMoneyShort(bp.proforma.investment_summary.total_cost_avoidance_5yr)} color={C.amber} />
                <KPI label="5yr Inc. Revenue" value={fmtMoneyShort(bp.proforma.investment_summary.incremental_revenue_5yr)} color={C.violet} />
              </div>
            )}
            {bp.proforma?.yearly && (
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Annual P&L Breakdown</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bp.proforma.yearly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} tickFormatter={(v) => '$' + (v / 1e6).toFixed(1) + 'M'} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} formatter={(v) => '$' + Number(v).toLocaleString()} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" stackId="ret" fill={C.violet} name="Revenue" />
                      <Bar dataKey="cost_avoidance" stackId="ret" fill={C.emerald} name="Cost Avoidance" />
                      <Bar dataKey="capital_expense" stackId="exp" fill={C.red} name="Capital Expense" />
                      <Bar dataKey="operating_expense" stackId="exp" fill={C.amber} name="Operating Expense" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {bp.two_phase_placement && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>Two-Phase Capital Placement</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 border-l-4 rounded p-4" style={{ borderColor: C.emerald }}>
                    <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.emerald }}>Phase 1</div>
                    <div className="text-base font-bold mt-1">{bp.two_phase_placement.phase_1?.title}</div>
                    <div className="text-xs text-slate-600 mt-2">{bp.two_phase_placement.phase_1?.new_trainings_required} trainings · {fmt(bp.two_phase_placement.phase_1?.bed_days_saved)}+ bed days</div>
                  </div>
                  {bp.two_phase_placement.phase_2 && (
                    <div className="bg-violet-50 border-l-4 rounded p-4" style={{ borderColor: C.violet }}>
                      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.violet }}>Phase 2</div>
                      <div className="text-base font-bold mt-1">{bp.two_phase_placement.phase_2.title}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {bp.or_room_recommendations?.primary_assignments && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.blue }}>OR Room Recommendations</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {bp.or_room_recommendations.primary_assignments.map((r, i) => (
                    <div key={i} className="bg-blue-50 border-2 rounded-lg p-3" style={{ borderColor: C.blue }}>
                      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.blue }}>{r.system_type}</div>
                      <div className="text-lg font-bold text-slate-900">{r.or_room}</div>
                      <div className="text-xs font-semibold" style={{ color: C.cyan }}>{r.specialty}</div>
                      <div className="text-[10px] text-slate-600 mt-1">{fmt(r.annual_cases)} cases · {r.surgeons_assigned} surgeons</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── STEP 9: PERFORMANCE TRACKING ─── */}
        {pt && (
          <Section id="step-9" stepNum={9} label="Step 9 · Performance Tracking" title="Post-Go-Live Monitoring Framework">
            {pt.plan_vs_actual?.metrics && (
              <div>
                <p className="text-sm text-slate-600 mb-3">{pt.plan_vs_actual.headline}</p>
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left pb-2">Metric</th><th className="text-right pb-2">Plan</th><th className="text-right pb-2">Actual</th><th className="text-right pb-2">Var %</th><th className="text-center pb-2">Status</th></tr></thead>
                  <tbody>
                    {pt.plan_vs_actual.metrics.map((m, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="py-1.5">{m.metric}</td>
                        <td className="py-1.5 text-right text-slate-500">{m.unit === '$' ? '$' + (m.plan / 1000).toFixed(0) + 'K' : fmt(m.plan)}</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: C.cyan }}>{m.unit === '$' ? '$' + (m.actual / 1000).toFixed(0) + 'K' : fmt(m.actual)}</td>
                        <td className="py-1.5 text-right font-bold" style={{ color: m.variance_pct >= 0 ? C.emerald : C.red }}>{m.variance_pct >= 0 ? '+' : ''}{m.variance_pct}%</td>
                        <td className="py-1.5 text-center">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{
                            backgroundColor: m.status === 'green' ? '#d1fae5' : m.status === 'yellow' ? '#fef3c7' : m.status === 'red_under' || m.status === 'red_over' ? '#fee2e2' : '#f1f5f9',
                            color: m.status === 'green' ? C.emerald : m.status === 'yellow' ? C.amber : m.status === 'red_under' || m.status === 'red_over' ? C.red : '#64748b',
                          }}>
                            {m.status === 'green' ? 'ON TRACK' : m.status === 'yellow' ? 'AT RISK' : m.status === 'red_under' ? 'OFF TRACK ↓' : m.status === 'red_over' ? 'OFF TRACK ↑' : 'BASELINE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pt.watch_list?.alerts?.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: C.red }}>⚠ Variance Watch List</div>
                <div className="space-y-2">
                  {pt.watch_list.alerts.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex gap-3 p-2 rounded border-l-4 text-sm" style={{ borderColor: a.severity === 'critical' ? C.red : C.amber, backgroundColor: a.severity === 'critical' ? '#fee2e2' : '#fef3c7' }}>
                      <span style={{ color: a.severity === 'critical' ? C.red : C.amber }}>{a.severity === 'critical' ? '⚠' : '⚡'}</span>
                      <div>
                        <strong>{a.target}</strong>
                        {a.variance_pct != null && <span className="ml-2 text-xs font-bold" style={{ color: a.variance_pct < 0 ? C.red : C.amber }}>{a.variance_pct >= 0 ? '+' : ''}{a.variance_pct}%</span>}
                        <div className="text-xs text-slate-700">{a.recommendation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ─── PEER CASE STUDY ─── */}
        {eb.peer_case_study?.peer_hospitals?.length > 0 && (
          <Section id="peers" stepNum={null} label="Peer Case Study" title="What comparable hospitals have achieved">
            <p className="text-sm text-slate-600 mb-3">{eb.peer_case_study.headline}</p>
            <div className="grid grid-cols-3 gap-4">
              {eb.peer_case_study.peer_hospitals.map((p, i) => (
                <div key={i} className="border border-slate-200 rounded p-4">
                  <div className="font-bold text-slate-900">{p.hospital_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.state} · {fmt(p.beds)} beds</div>
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="text-2xl font-bold" style={{ color: C.emerald }}>{fmt(p.bed_days_saved_estimated)}</div>
                    <div className="text-[11px] text-slate-600">bed days saved/yr</div>
                  </div>
                  <div className="mt-2">
                    <div className="text-lg font-semibold">{fmtMoneyShort(p.dollar_savings_estimated)}</div>
                    <div className="text-[11px] text-slate-600">@ ${fmt(p.bed_day_cost_used)}/bed-day</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ─── RECOMMENDATION & NEXT STEPS ─── */}
        <Section id="next-steps" stepNum={null} label="Closer" title="Recommendation & Next Steps">
          {eb.recommendation && (
            <div className="bg-blue-50 border-l-4 rounded p-4 mb-4" style={{ borderColor: C.blue }}>
              <div className="text-xs uppercase tracking-widest font-bold" style={{ color: C.blue }}>Recommendation</div>
              <div className="text-lg font-bold mt-1">Place {eb.recommendation.total_systems} {eb.recommendation.primary_system} systems in two phases</div>
            </div>
          )}
          <div className="bg-emerald-50 border-l-4 rounded p-4" style={{ borderColor: C.emerald }}>
            <div className="text-xs uppercase tracking-widest font-bold" style={{ color: C.emerald }}>Next Steps</div>
            <ol className="list-decimal list-inside text-sm mt-2 space-y-2 text-slate-700">
              <li><strong>IT Security Review</strong> — platform infrastructure (Render/AWS, Anthropic-grade)</li>
              <li><strong>Surgeon Survey Distribution</strong> — confirm commitment volumes with selected surgeons</li>
              <li><strong>Free Trial Period</strong> — 2-6 months, zero risk on cost / security / data</li>
              <li><strong>Capital Placement</strong> — timing aligned to Phase 1 / Phase 2 plan</li>
              <li><strong>Performance Tracking Setup</strong> — monthly actuals ingest cadence + variance alerting thresholds</li>
            </ol>
          </div>
        </Section>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 mt-8 mb-4 text-center italic">
          Comprehensive Executive Brief · SurgicalMind AI · Digit2AI · Generated {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  )
}

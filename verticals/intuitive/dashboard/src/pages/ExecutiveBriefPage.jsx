import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// ─── MyIntuitive+ Branded Format (Deck 2 Slide 16-17 + Deck 1 Slide 5 + Deck 3) ───
//
// This is THE Thursday deliverable. White background, clean blue header,
// 4-KPI top strip, 4-column scoreboard, two-column diagnostic, peer case study,
// 3-bucket surgeon commitments, two-phase placement recommendation.
//
// Mirrors the exact format Eddie Serene (VP Finance, Intuitive) sees internally.

const fmt = (n) => n != null ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'
const fmtMoney = (n) => n != null ? '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$0'
const fmtMoneyShort = (n) => {
  if (n == null) return '$0'
  const v = Number(n)
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

// Intuitive's official specialty color palette (locked from deck analysis)
const SPECIALTY_COLORS = {
  general: '#1e3a8a', generalsurgery: '#1e3a8a',
  gynecology: '#8b5cf6',
  urology: '#06b6d4',
  cardiac: '#1f2937',
  thoracic: '#10b981',
  headneck: '#ec4899', 'head&neck': '#ec4899', 'head_neck': '#ec4899',
  vascular: '#22c55e',
  colorectal: '#f59e0b',
  other: '#94a3b8',
}
const colorForSpecialty = (s) => {
  if (!s) return SPECIALTY_COLORS.other
  const k = String(s).toLowerCase().replace(/\s|&|-/g, '')
  return SPECIALTY_COLORS[k] || SPECIALTY_COLORS.other
}

// ─── Slide-style section card (white background, MyIntuitive+ visual register) ───
function Slide({ children, className = '' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-8 mb-6 shadow-sm print:shadow-none print:break-inside-avoid ${className}`}>
      {children}
    </section>
  )
}

function SlideTitle({ title, subtitle, yellowSubtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      {yellowSubtitle && (
        <p className="text-sm font-semibold mt-1" style={{ color: '#ca8a04', backgroundColor: '#fef9c3', padding: '4px 12px', display: 'inline-block', borderRadius: '4px' }}>
          {yellowSubtitle}
        </p>
      )}
    </div>
  )
}

// ─── KPI Header Strip (Deck 2 Slide 16 — 4-KPI strip) ───
function KpiHeaderStrip({ kpi }) {
  if (!kpi) return null
  const icons = {
    system: 'M', surgeon: 'Sx', specialty: '+', patient: 'P',
  }
  const cells = [
    { ...kpi.systems, iconKey: 'system' },
    { ...kpi.surgeons, iconKey: 'surgeon' },
    { ...kpi.specialties, iconKey: 'specialty' },
    { ...kpi.patients, iconKey: 'patient' },
  ]
  return (
    <div className="grid grid-cols-4 gap-3 mb-6 pb-4 border-b border-slate-200">
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: '#1e40af' }}>
            {icons[c.iconKey]}
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: '#1e40af' }}>{fmt(c.value)}</div>
            <div className="text-xs text-slate-600 leading-tight">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Two-Column Diagnostic Opening (Deck 3 Slide 2) ───
function DiagnosticFrame({ diagnostic, hospitalName }) {
  if (!diagnostic) return null
  return (
    <Slide>
      <div className="text-center mb-6">
        <h2 className="text-xl italic font-semibold text-slate-700">
          {hospitalName} priorities for robotic surgery program
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h3 className="text-base font-bold mb-3 pb-2 border-b border-slate-300" style={{ color: '#1e40af' }}>
            Challenges and Constraints
          </h3>
          <div className="space-y-4">
            {diagnostic.challenges.map((c, i) => (
              <div key={i} className="flex gap-3">
                <span className="font-bold mt-0.5" style={{ color: '#1e40af' }}>▶</span>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{c.title}</div>
                  <div className="text-sm text-slate-700 mt-0.5">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold mb-3 pb-2 border-b border-slate-300" style={{ color: '#1e40af' }}>
            What we would like to better understand…
          </h3>
          <div className="space-y-4">
            {diagnostic.questions.map((q, i) => (
              <div key={i} className="flex gap-3">
                <span className="font-bold mt-0.5" style={{ color: '#1e40af' }}>▶</span>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{q.title}</div>
                  <div className="text-sm text-slate-700 mt-0.5">{q.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  )
}

// ─── 4-Column Executive Scoreboard (Deck 1 Slide 5 — THE landing visual) ───
function ExecutiveScoreboard({ scoreboard }) {
  if (!scoreboard) return null

  const columns = [
    { key: 'clinical', label: 'Clinical', color: '#dc2626' },
    { key: 'financial', label: 'Financial', color: '#059669' },
    { key: 'operational', label: 'Operational', color: '#0891b2' },
    { key: 'strategic', label: 'Strategic', color: '#7c3aed' },
  ]

  return (
    <Slide>
      <SlideTitle title="Da Vinci Impact" subtitle="Clinical / Financial / Operational / Strategic scoreboard" />
      <div className="grid grid-cols-4 gap-4">
        {columns.map(col => (
          <div key={col.key} className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs uppercase tracking-widest font-bold mb-3 pb-2 border-b" style={{ color: col.color, borderColor: col.color }}>
              {col.label}
            </div>
            <div className="space-y-4">
              {(scoreboard[col.key] || []).map((cell, i) => (
                <div key={i}>
                  <div className={`text-2xl font-bold ${cell.highlight ? 'text-red-600 ring-2 ring-red-300 ring-offset-2 rounded px-1 inline-block' : ''}`} style={{ color: cell.highlight ? '#dc2626' : '#1e40af' }}>
                    {cell.value}
                  </div>
                  <div className="text-xs text-slate-600 leading-tight mt-1">{cell.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  )
}

// ─── Clinical Benefit Overlay (the MOAT — what Intuitive can't produce internally) ───
function ClinicalOverlayCard({ overlay }) {
  if (!overlay) return null
  const total = parseFloat(overlay.total_clinical_savings || 0)
  return (
    <Slide>
      <SlideTitle
        title="Clinical Benefit Overlay"
        subtitle="The moat — dollarized clinical outcomes Intuitive cannot produce internally"
      />
      {total > 0 ? (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1">
            <div className="text-5xl font-bold" style={{ color: '#059669' }}>{fmtMoneyShort(total)}</div>
            <div className="text-sm text-slate-700 mt-2 leading-relaxed">
              Annual cost avoidance from converting open/laparoscopic volume to robotic — sourced from peer-reviewed clinical literature.
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3">Drivers by Specialty</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-600 border-b border-slate-300">
                <tr><th className="text-left py-2">Specialty</th><th className="text-right">Cases Converted</th><th className="text-right">Annual Savings</th></tr>
              </thead>
              <tbody>
                {(overlay.drivers || []).map((d, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 capitalize">{d.specialty}</td>
                    <td className="text-right">{fmt(d.cases_converted)}</td>
                    <td className="text-right font-semibold" style={{ color: '#059669' }}>{fmtMoneyShort(d.savings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-900">
          {overlay.note || 'Clinical outcomes not yet computed.'} Run the Clinical Benefit Overlay tool from the Business Plan to dollarize this section.
        </div>
      )}
    </Slide>
  )
}

// ─── 3-Bucket Surgeon Commitment Summary (Deck 3 Slides 9/10/11) ───
function SurgeonCommitmentSummary({ commitments }) {
  if (!commitments) return null
  const buckets = [
    { key: 'open_to_mis', label: 'Open-to-MIS Conversion', desc: 'Converting existing open volume to robotic', color: '#dc2626' },
    { key: 'pull_forward', label: 'Pull-Forward / Capacity', desc: 'Proficient surgeons wanting more access', color: '#0891b2' },
    { key: 'training_pipeline', label: 'Training Pipeline', desc: 'Untrained surgeons needing TR200', color: '#7c3aed' },
  ]

  return (
    <Slide>
      <SlideTitle
        title="Surgeon Commitments"
        subtitle="Three categories driving the business plan — Deck 3 Slides 9/10/11 pattern"
        yellowSubtitle={`${fmt(commitments.totals?.cases)} total cases · ${fmt(commitments.totals?.surgeons)} surgeons committed`}
      />
      <div className="grid grid-cols-3 gap-4">
        {buckets.map(b => {
          const bucket = commitments[b.key] || { surgeons: [] }
          return (
            <div key={b.key} className="border border-slate-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-widest font-bold mb-2 pb-2 border-b" style={{ color: b.color, borderColor: b.color }}>
                {b.label}
              </div>
              <div className="text-3xl font-bold" style={{ color: b.color }}>{fmt(bucket.total_cases || 0)}</div>
              <div className="text-[11px] text-slate-600 leading-tight">cases · {bucket.surgeon_count || 0} surgeons</div>
              <div className="text-xs text-slate-700 mt-2 mb-3">{bucket.headline}</div>
              <div className="space-y-1">
                {(bucket.surgeons || []).slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-800 truncate">{s.surgeon_name}</span>
                    <span className="text-slate-500 ml-2 whitespace-nowrap">{fmt(s.cases_annual)} cases</span>
                  </div>
                ))}
                {(bucket.surgeons || []).length > 5 && (
                  <div className="text-[10px] text-slate-500 italic pt-1">+ {bucket.surgeons.length - 5} more</div>
                )}
              </div>
              {b.key === 'pull_forward' && bucket.surgeons?.[0]?.current_weekly && (
                <div className="text-[10px] text-slate-500 mt-2 italic">
                  Avg: {fmt(bucket.surgeons[0].current_weekly)} → {fmt(bucket.surgeons[0].target_weekly || bucket.surgeons[0].current_weekly * 2)} cases/wk
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Slide>
  )
}

// ─── Two-Phase Capital Placement Recommendation (Deck 3 Slide 14) ───
function TwoPhaseRecommendation({ recommendation }) {
  if (!recommendation) return null
  return (
    <Slide>
      <SlideTitle
        title="Recommendation"
        subtitle={`Place ${recommendation.total_systems} ${recommendation.primary_system}${recommendation.total_systems > 1 ? 's' : ''} in two phases`}
      />

      {/* Phase 1 */}
      <div className="mb-6 border-l-4 pl-4" style={{ borderColor: '#1e40af' }}>
        <div className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#1e40af' }}>Phase 1</div>
        <h3 className="text-lg font-bold text-slate-900">{recommendation.phase_1?.title}</h3>
        <div className="grid grid-cols-3 gap-4 mt-3">
          {(recommendation.phase_1?.key_metrics || []).map((m, i) => (
            <div key={i} className="bg-slate-50 rounded p-3">
              <div className="text-lg font-bold" style={{ color: '#1e40af' }}>{m.value}</div>
              <div className="text-xs text-slate-600">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Room-level placement detail */}
        {recommendation.phase_1?.or_rooms?.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">Room Recommendations</div>
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-slate-50 text-xs">
                <tr>
                  <th className="text-left p-2">OR Room</th>
                  <th className="text-left p-2">Specialty</th>
                  <th className="text-left p-2">System</th>
                  <th className="text-right p-2">Annual Cases</th>
                  <th className="text-right p-2">Surgeons</th>
                </tr>
              </thead>
              <tbody>
                {recommendation.phase_1.or_rooms.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2 font-semibold">{r.or_room}</td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorForSpecialty(r.specialty) }}></span>
                        {r.specialty}
                      </span>
                    </td>
                    <td className="p-2 text-slate-700">{r.system_type}</td>
                    <td className="p-2 text-right">{fmt(r.annual_cases)}</td>
                    <td className="p-2 text-right">{r.surgeons_assigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recommendation.or_level_detail?.footnote && (
              <div className="text-[10px] text-slate-500 mt-1 italic">{recommendation.or_level_detail.footnote}</div>
            )}
          </div>
        )}
      </div>

      {/* Phase 2 */}
      <div className="border-l-4 pl-4" style={{ borderColor: '#7c3aed' }}>
        <div className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#7c3aed' }}>Phase 2</div>
        <h3 className="text-lg font-bold text-slate-900">{recommendation.phase_2?.title}</h3>
        <ul className="mt-3 space-y-1.5">
          {(recommendation.phase_2?.details || []).map((d, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-slate-400 mt-1">›</span>
              <span className="text-slate-800">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </Slide>
  )
}

// ─── Peer Case Study (Deck 3 Slide 19 — MUSC pattern) ───
function PeerCaseStudy({ peers }) {
  if (!peers || !peers.peer_hospitals?.length) {
    return (
      <Slide>
        <SlideTitle title="Peer Hospital Comparison" subtitle="What similar academic medical centers have achieved" />
        <div className="text-sm text-slate-600">Peer comparison data not yet available for this hospital's region/size tier.</div>
      </Slide>
    )
  }

  const totalDays = peers.peer_hospitals.reduce((s, p) => s + (p.bed_days_saved_estimated || 0), 0)
  const totalDollars = peers.peer_hospitals.reduce((s, p) => s + (p.dollar_savings_estimated || 0), 0)

  return (
    <Slide>
      <SlideTitle
        title="Peer Hospital Track Record"
        subtitle="Comparable academic / community medical centers and their robotic-program impact"
        yellowSubtitle={peers.headline}
      />
      <div className="grid grid-cols-3 gap-4 mb-4">
        {peers.peer_hospitals.map((p, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4">
            <div className="font-bold text-slate-900 leading-tight">{p.hospital_name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{p.state} · {fmt(p.beds)} beds</div>

            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-2xl font-bold" style={{ color: '#059669' }}>{fmt(p.bed_days_saved_estimated)}</div>
              <div className="text-[11px] text-slate-600">bed days saved (annual est.)</div>
            </div>
            <div className="mt-2">
              <div className="text-lg font-semibold text-slate-800">{fmtMoneyShort(p.dollar_savings_estimated)}</div>
              <div className="text-[11px] text-slate-600">@ {fmtMoney(p.bed_day_cost_used)}/bed-day ({p.state})</div>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              {fmt(p.robotic_procedures_estimated)} robotic-suitable procedures
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 italic">
        Methodology: {peers.methodology}
        <br />Source: {peers.citation}
      </div>
    </Slide>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function ExecutiveBriefPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    setLoading(true); setError(null)
    api.getExecutiveBrief(id)
      .then(r => setBrief(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Building Executive Brief...</div>
  if (error) return <div className="p-10 text-red-400">{error}</div>
  if (!brief) return <div className="p-10 text-slate-400">No brief data.</div>

  const { cover, diagnostic, kpi_header, scoreboard, clinical_overlay, surgeon_commitments, recommendation, peer_case_study } = brief

  return (
    <div className="bg-slate-100 min-h-screen pb-12">
      {/* Action bar (hidden in print) */}
      <div className="bg-slate-800 px-6 py-3 flex items-center justify-between print:hidden">
        <div className="text-white">
          <div className="text-xs uppercase tracking-widest text-slate-400">MyIntuitive+ Format</div>
          <div className="text-sm font-semibold">Executive Brief · Strategic Alignment Opportunity</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={() => navigate(`/business-plan/${id}`)}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
          >
            Back to Business Plan
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-6">
        {/* COVER SLIDE (Deck 3 Slide 1 — royal blue) */}
        <section className="rounded-lg p-12 mb-6 text-white shadow-md print:break-after-page" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" className="h-10 mb-12 brightness-0 invert" />
          <h1 className="text-4xl font-bold mb-3">{cover.hospital_name}</h1>
          <p className="text-xl opacity-90 mb-12">{cover.subtitle}</p>
          <div className="text-sm opacity-90 space-y-1">
            <div>Prepared for: <strong>{cover.prepared_for}</strong></div>
            <div>Prepared by: <strong>{cover.prepared_by}</strong></div>
            <div>Date: {cover.presentation_date}</div>
          </div>
          <div className="text-[10px] opacity-60 mt-16">{cover.confidential_marker}</div>
        </section>

        {/* DIAGNOSTIC OPENING (Deck 3 Slide 2) */}
        <DiagnosticFrame diagnostic={diagnostic} hospitalName={cover.hospital_name} />

        {/* KPI HEADER STRIP + EXECUTIVE SCOREBOARD */}
        <Slide>
          <KpiHeaderStrip kpi={kpi_header} />
          <SlideTitle
            title="Da Vinci Impact"
            subtitle="Clinical / Financial / Operational / Strategic"
          />
          <div className="grid grid-cols-4 gap-4">
            {[
              { key: 'clinical', label: 'Clinical', color: '#dc2626' },
              { key: 'financial', label: 'Financial', color: '#059669' },
              { key: 'operational', label: 'Operational', color: '#0891b2' },
              { key: 'strategic', label: 'Strategic', color: '#7c3aed' },
            ].map(col => (
              <div key={col.key} className="border border-slate-200 rounded-lg p-4">
                <div className="text-xs uppercase tracking-widest font-bold mb-3 pb-2 border-b" style={{ color: col.color, borderColor: col.color }}>
                  {col.label}
                </div>
                <div className="space-y-4">
                  {(scoreboard?.[col.key] || []).map((cell, i) => (
                    <div key={i}>
                      <div
                        className="text-2xl font-bold"
                        style={{
                          color: cell.highlight ? '#dc2626' : '#1e40af',
                          ...(cell.highlight ? { border: '2px solid #dc2626', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' } : {}),
                        }}
                      >
                        {cell.value}
                      </div>
                      <div className="text-xs text-slate-600 leading-tight mt-1">{cell.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Slide>

        {/* CLINICAL BENEFIT OVERLAY — THE MOAT */}
        <ClinicalOverlayCard overlay={clinical_overlay} />

        {/* SURGEON COMMITMENT 3-BUCKET SUMMARY */}
        <SurgeonCommitmentSummary commitments={surgeon_commitments} />

        {/* TWO-PHASE PLACEMENT RECOMMENDATION + OR-LEVEL DETAIL */}
        <TwoPhaseRecommendation recommendation={recommendation} />

        {/* PEER CASE STUDY (MUSC pattern) */}
        <PeerCaseStudy peers={peer_case_study} />

        {/* Footer */}
        <div className="text-[10px] text-slate-500 mt-8 mb-4 text-center italic">
          Executive Brief generated by SurgicalMind AI · Digit2AI · {new Date(brief.meta?.generated_at).toLocaleString()}
        </div>
      </div>
    </div>
  )
}

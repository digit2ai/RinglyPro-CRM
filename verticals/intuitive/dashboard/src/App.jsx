import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import IntakePage from './pages/IntakePage'
import AnalysisPage from './pages/AnalysisPage'
import RecommendationsPage from './pages/RecommendationsPage'
import PresentationPage from './pages/PresentationPage'

// Dynamic Rachel context builder -- generates presentation context from live project data
function buildPresentationContext(project, analysisData, recommendations) {
  const p = project || {}
  const a = analysisData || {}
  const fmt = n => n != null ? Number(n).toLocaleString() : '--'

  const procedurePareto = a.procedure_pareto || {}
  const monthlySeason = a.monthly_seasonality || {}
  const weekdayDist = a.weekday_distribution || {}
  const hourlyDist = a.hourly_distribution || {}
  const designDay = a.design_day_analysis || {}
  const robotCompat = a.robot_compatibility_matrix || {}
  const volProj = a.volume_projection || {}
  const financialDeep = a.financial_deep_dive || {}
  const growthExtrap = a.growth_extrapolation || {}
  const modelMatch = a.model_matching || {}
  const riskAssess = a.risk_assessment || {}
  const surgCap = a.surgeon_capacity || {}
  const roiCalc = a.roi_calculation || {}

  const topProcs = procedurePareto.top_procedures || []
  const yearlyProj = volProj.yearly_projections || volProj.projections || []
  const y5 = yearlyProj.find(yp => yp.year === 5) || yearlyProj[yearlyProj.length - 1] || {}
  const scenarios = growthExtrap.scenarios || []
  const tco = financialDeep.total_cost_of_ownership || financialDeep.tco || {}
  const riskFactors = riskAssess.risk_factors || riskAssess.factors || []
  const recs = Array.isArray(recommendations) ? recommendations : []

  const specialties = []
  if (p.specialty_urology) specialties.push(`Urology: ${p.specialty_urology}%`)
  if (p.specialty_gynecology) specialties.push(`Gynecology: ${p.specialty_gynecology}%`)
  if (p.specialty_general) specialties.push(`General: ${p.specialty_general}%`)
  if (p.specialty_thoracic) specialties.push(`Thoracic: ${p.specialty_thoracic}%`)
  if (p.specialty_colorectal) specialties.push(`Colorectal: ${p.specialty_colorectal}%`)
  if (p.specialty_head_neck) specialties.push(`Head & Neck: ${p.specialty_head_neck}%`)
  if (p.specialty_cardiac) specialties.push(`Cardiac: ${p.specialty_cardiac}%`)

  return `You are Rachel, the da Vinci System Matcher Voice AI assistant. You are presenting the System Assessment for ${p.hospital_name || 'the prospect hospital'}. Speak confidently, reference specific numbers. You represent the da Vinci robotic surgery platform by Intuitive Surgical.

Here is the full presentation content you should be able to discuss:

SLIDE 1 -- TITLE: da Vinci System Assessment for ${p.hospital_name || 'the prospect hospital'}.

SLIDE 2 -- HOSPITAL PROFILE:
- Hospital: ${p.hospital_name || '--'} (${p.hospital_type || '--'})
- Beds: ${fmt(p.bed_count)} | State: ${p.state || '--'} | Country: ${p.country || '--'}
- Annual Surgical Volume: ${fmt(p.annual_surgical_volume)}
- Current System: ${p.current_system || 'None'} (${fmt(p.current_system_count || 0)} units)
- Credentialed Surgeons: ${fmt(surgCap.credentialed_surgeons || p.credentialed_robotic_surgeons || 0)} | Interested: ${fmt(surgCap.interested_surgeons || p.surgeons_interested || 0)}
- Robot-Ready ORs: ${fmt(p.robot_ready_ors || 0)} of ${fmt(p.total_or_count || 0)} total
- Specialty Mix: ${specialties.join(', ') || 'N/A'}

SLIDE 3 -- PROCEDURE PARETO (ABC Analysis):
- Gini Coefficient: ${procedurePareto.gini_coefficient || procedurePareto.gini || '--'}
- Total Procedures: ${fmt(procedurePareto.total_procedures || procedurePareto.total || 0)}
${topProcs.slice(0, 10).map((tp, i) => `- #${i+1} ${tp.name || tp.procedure}: ${fmt(tp.cases || tp.count || 0)} cases (${tp.pct || tp.percentage || 0}%, Class ${tp.abc_class || tp.class || ''})`).join('\n')}

SLIDE 4 -- MONTHLY SEASONALITY:
- CoV: ${monthlySeason.coefficient_of_variation || monthlySeason.cov || '--'}
- Peak Month: ${monthlySeason.peak_month || '--'}
${(monthlySeason.months || []).map(m => `- ${m.month || m.label}: ${fmt(m.cases || m.volume || m.count || 0)} cases`).join('\n')}

SLIDE 5 -- WEEKDAY DISTRIBUTION:
- Peak Day: ${weekdayDist.peak_day || '--'}
${(weekdayDist.days || []).map(d => `- ${d.day || d.label}: ${fmt(d.cases || d.volume || d.count || 0)} cases`).join('\n')}

SLIDE 6 -- HOURLY OR UTILIZATION:
- Peak Hour: ${hourlyDist.peak_hour || '--'}

SLIDE 7 -- ROBOT COMPATIBILITY MATRIX:
- Best Overall Model: ${robotCompat.best_overall_model || '--'}
- Procedures Analyzed: ${(robotCompat.procedures || []).length}
${(robotCompat.procedures || []).slice(0, 10).map(pr => `- ${pr.name || pr.procedure}: dV5=${pr.dv5_score || pr.dV5 || 0}, Xi=${pr.xi_score || pr.Xi || 0}, X=${pr.x_score || pr.X || 0}, SP=${pr.sp_score || pr.SP || 0} -> Best: ${pr.best_model || pr.best_fit || ''}`).join('\n')}

SLIDE 8 -- DESIGN DAY ANALYSIS:
- P50: ${fmt((designDay.p50 || {}).cases || 0)} cases/day
- P75 (Design Day): ${fmt((designDay.p75 || {}).cases || 0)} cases/day
- P90: ${fmt((designDay.p90 || {}).cases || 0)} cases/day
- P95: ${fmt((designDay.p95 || {}).cases || 0)} cases/day

SLIDE 9 -- 5-YEAR VOLUME PROJECTION:
- Adoption Rate: ${volProj.adoption_rate || volProj.ramp_rate || '--'}%
${yearlyProj.map(yp => `- Year ${yp.year}: ${fmt(yp.total_cases || yp.robotic_cases || 0)} robotic cases`).join('\n')}

SLIDE 10 -- FINANCIAL DEEP DIVE:
- 5-Year TCO: $${fmt(Math.round((tco.five_year || 0) / 1000))}K
- Breakeven: ${financialDeep.breakeven_months || financialDeep.breakeven || '--'} months
- Per-Procedure Cost: $${fmt(Math.round(financialDeep.per_procedure_cost || financialDeep.cost_per_case || 0))}
- 5-Year ROI: ${financialDeep.five_year_roi_pct || financialDeep.roi_pct || roiCalc.five_year_roi_pct || '--'}%

SLIDE 11 -- GROWTH EXTRAPOLATION:
${scenarios.map(s => `- ${s.name || s.label}: Y1=${fmt(s.year1_cases || s.cases_y1 || 0)}, Y3=${fmt(s.year3_cases || s.cases_y3 || 0)}, Y5=${fmt(s.year5_cases || s.cases_y5 || 0)}`).join('\n')}

SLIDE 12 -- SYSTEM RECOMMENDATION:
- Primary Model: da Vinci ${modelMatch.primary_recommendation || modelMatch.recommended_model || '--'}
- Fit Score: ${Math.round(modelMatch.fit_score || modelMatch.overall_fit || 0)}/100
- Rationale: ${modelMatch.rationale || modelMatch.reasoning || 'N/A'}
${recs.map(r => `- ${r.system_model}: qty ${r.quantity}, fit ${Math.round(r.fit_score || 0)}/100, ${fmt(r.projected_annual_cases || 0)} annual cases`).join('\n')}
${riskFactors.length > 0 ? `- Risk Factors: ${riskFactors.slice(0, 5).map(r => r.name || r.factor || r).join(', ')}` : ''}

SLIDE 13 -- NEXT STEPS: 1) Clinical Workflow Assessment, 2) Infrastructure Survey, 3) Surgeon Training Timeline, 4) Financial Model Finalization, 5) Implementation Timeline.

SPEAKING GUIDELINES:
- Always say "da Vinci" when referring to the robotic surgery system
- Reference the specific numbers above -- they are from this hospital's actual data
- The P75 design day is the key planning metric for system capacity
- Emphasize the fit score and rationale for the recommended model
- When asked about procedures, explain the ABC classification and robotic conversion potential
- You can discuss any of the 13 slides in detail using the data above
`
}

const NAV_STEPS = [
  { to: '/', label: 'Hospital Intake', num: 1, icon: 'H' },
  { to: '/analysis', label: 'Analysis', num: 2, icon: 'A' },
  { to: '/recommendations', label: 'System Match', num: 3, icon: 'M' },
  { to: '/presentation', label: 'Presentation', num: 4, icon: 'P' },
]

export default function App() {
  const location = useLocation()
  const [currentProject, setCurrentProject] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('intuitive_project_id')
    if (saved) setCurrentProject(parseInt(saved))
  }, [])

  function selectProject(id) {
    setCurrentProject(id)
    localStorage.setItem('intuitive_project_id', id)
  }

  // Dynamically pass context to ElevenLabs widget based on current page
  useEffect(() => {
    const widget = document.querySelector('elevenlabs-convai')
    if (!widget) return

    const anyProjectId = location.pathname.match(/\/(?:analysis|recommendations|presentation)\/(\d+)/)?.[1]
    const pid = anyProjectId || currentProject

    if (pid) {
      Promise.all([
        fetch(`/intuitive/api/v1/projects/${pid}`).then(r => r.json()).catch(() => null),
        fetch(`/intuitive/api/v1/analysis/${pid}/all`).then(r => r.json()).catch(() => null),
      ]).then(([projRes, analysisRes]) => {
        const proj = projRes?.data || projRes
        let analysisMap = {}
        if (analysisRes?.data) {
          if (Array.isArray(analysisRes.data)) {
            for (const r of analysisRes.data) {
              analysisMap[r.analysis_type] = r.result_data
            }
          } else {
            analysisMap = analysisRes.data
          }
        }
        const ctx = buildPresentationContext(proj, analysisMap, [])
        widget.setAttribute('context', ctx)
      })
    } else {
      widget.removeAttribute('context')
    }
  }, [location.pathname, currentProject])

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0a1628] border-r border-slate-800 flex flex-col fixed h-full">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-intuitive-900 flex items-center justify-center">
              <span className="text-intuitive-400 font-bold text-xs">dV</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-tight">da Vinci</div>
              <div className="text-slate-500 text-[10px] tracking-widest uppercase">System Matcher</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_STEPS.map(step => (
            <NavLink
              key={step.to}
              to={step.to}
              end={step.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-intuitive-900/60 text-intuitive-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`
              }
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                location.pathname === step.to || (step.to !== '/' && location.pathname.startsWith(step.to))
                  ? 'bg-intuitive-600 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {step.num}
              </span>
              {step.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-600">
          Powered by Digit2AI<br />
          da Vinci System Matcher v1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56 min-h-screen">
        <Routes>
          <Route path="/" element={<IntakePage onProjectCreated={selectProject} currentProject={currentProject} />} />
          <Route path="/analysis" element={<AnalysisPage projectId={currentProject} />} />
          <Route path="/analysis/:projectId" element={<AnalysisPage />} />
          <Route path="/recommendations" element={<RecommendationsPage projectId={currentProject} />} />
          <Route path="/recommendations/:projectId" element={<RecommendationsPage />} />
          <Route path="/presentation" element={<PresentationPage />} />
          <Route path="/presentation/:projectId" element={<PresentationPage />} />
        </Routes>
      </main>

      {/* ElevenLabs Voice Agent Widget */}
      <elevenlabs-convai agent-id="agent_1801kjx55tabedbvx4y7x4eptbz4"></elevenlabs-convai>
    </div>
  )
}

import React, { useState, useEffect, Component } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('SurgicalMind Error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'40px',color:'#ef4444',background:'#1a1a2e',minHeight:'100vh'}}>
          <h2>Something went wrong</h2>
          <pre style={{color:'#94a3b8',marginTop:'16px',fontSize:'13px',whiteSpace:'pre-wrap'}}>{this.state.error?.toString()}</pre>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload() }} style={{marginTop:'16px',background:'#6366f1',color:'#fff',border:'none',padding:'8px 20px',borderRadius:'8px',cursor:'pointer'}}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
import DashboardPage from './pages/DashboardPage'
import IntakePage from './pages/IntakePage'
import AnalysisPage from './pages/AnalysisPage'
import RecommendationsPage from './pages/RecommendationsPage'
import PresentationPage from './pages/PresentationPage'
import BusinessPlanPage from './pages/BusinessPlanPage'
import SurveyManagerPage from './pages/SurveyManagerPage'
import TrackingDashboardPage from './pages/TrackingDashboardPage'
import ReportPage from './pages/ReportPage'
import AskPage from './pages/AskPage'
import SurgeonTargetingPage from './pages/SurgeonTargetingPage'
import ExecutiveBriefPage from './pages/ExecutiveBriefPage'
import ExecutivePresentationPage from './pages/ExecutivePresentationPage'
import SurgeonCommitmentsPage from './pages/SurgeonCommitmentsPage'
import HospitalProfilePage from './pages/HospitalProfilePage'
import SurgeonProfilePage from './pages/SurgeonProfilePage'
import RoboticsProgramPage from './pages/RoboticsProgramPage'
import MarketProfilePage from './pages/MarketProfilePage'
import ClinicalOutcomesPage from './pages/ClinicalOutcomesPage'
import ClinicalOverlayPage from './pages/ClinicalOverlayPage'
import ChatWidget from './components/ChatWidget'
import { api } from './lib/api'

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

// 9-step Hospital Workflow (locked from client meeting Section 4)
const NAV_STEPS = [
  // ─── System-wide ───
  { to: '/', label: 'Dashboard', num: 0, icon: 'D', section: 'main' },
  { to: '/ask', label: 'Ask', num: 0, icon: '?', section: 'main' },
  { to: '/surgeon-targeting', label: 'Surgeon Targeting', num: 0, icon: 'T', section: 'main' },
  { to: '/intake', label: 'Hospital Intake', num: 0, icon: 'H', section: 'main' },

  // ─── Hospital Workflow (the 9-step flow) ───
  { to: '/hospital-profile', label: 'Hospital Profile', num: 1, icon: '1', section: 'project' },
  { to: '/surgeon-profile', label: 'Surgeon Profile', num: 2, icon: '2', section: 'project' },
  { to: '/robotics-program', label: 'Robotics Program', num: 3, icon: '3', section: 'project' },
  { to: '/market-profile', label: 'Market Profile', num: 4, icon: '4', section: 'project' },
  { to: '/clinical-outcomes', label: 'Clinical Outcomes', num: 5, icon: '5', section: 'project' },
  { to: '/clinical-overlay', label: 'Clinical Benefit Overlay', num: 6, icon: '6', section: 'project' },
  { to: '/commitments', label: 'Surgeon Commitments', num: 7, icon: '7', section: 'project' },
  { to: '/business-plan', label: 'Business Plan', num: 8, icon: '8', section: 'project' },
  { to: '/tracking', label: 'Performance Tracking', num: 9, icon: '9', section: 'project' },
  { to: '/executive', label: 'Executive Brief', num: 10, icon: '10', section: 'project' },
]

// Process documentation -- shown when user clicks the (i) icon next to a step
const STEP_DOCS = {
  '/intake': {
    title: '1. Hospital Intake',
    purpose: 'Onboards a new prospect hospital and auto-enriches its profile from public + licensed data sources before any human research.',
    how: [
      'User enters hospital name + state. AI Research Agent searches the web and resolves the matching CMS facility.',
      'NPI Registry (NPPES) is queried live for the affiliated robotic surgeons (24h cache).',
      'CMS Hospital Compare provides bed count, ownership, quality star ratings.',
      'CMS HCRIS pulls the latest cost report (operating margin, total revenue, charity care).',
      'ProPublica Form 990 is hit live for tax-exempt financials (24h cache).',
      'CMS Open Payments enriches surgeon-level industry payment exposure.',
      'For Florida hospitals, AHCA quarterly utilization is overlaid for procedure-level discharge counts.',
      'Result is persisted as a Project record and used as the seed for every downstream step.',
    ],
    sources: [
      'CMS Hospital Compare (monthly refresh)',
      'CMS HCRIS cost reports (quarterly refresh)',
      'CMS Open Payments (annual, July refresh)',
      'CMS MPUP physician volume (annual, April refresh)',
      'NPI Registry / NPPES (live API, 24h cache)',
      'ProPublica Nonprofits Form 990 (live API, 24h cache)',
      'Florida AHCA hospital utilization (quarterly)',
      'AI Research Agent (Brave Search or DuckDuckGo fallback)',
    ],
  },
  '/surveys': {
    title: '2. Surgeon Surveys',
    purpose: 'Captures first-party surgeon intent, current caseload mix, and openness to robotic conversion -- the only signal not available from public data.',
    how: [
      'For each credentialed surgeon discovered in Hospital Intake, a magic-link survey invitation is generated.',
      'When SENDGRID_API_KEY + SENDGRID_FROM_EMAIL are set, invitations are auto-emailed via SendGrid; otherwise links are exposed for manual distribution.',
      'Surgeons answer caseload, specialty mix, robotic experience, and conversion intent on a public token-protected form.',
      'Responses feed the Surgeon Capacity model used by Analysis (interested vs credentialed counts) and System Match.',
    ],
    sources: [
      'Internal: surgeons table seeded from NPPES during Intake',
      'SendGrid Marketing API (outbound)',
      'Public survey portal (token-authenticated, no login required)',
    ],
  },
  '/analysis': {
    title: '3. Analysis',
    purpose: 'Runs 12+ analytical models against the hospital + surgeon data to produce the quantitative backbone of the recommendation.',
    how: [
      'Procedure Pareto -- ABC classification with Gini coefficient over the procedure mix.',
      'Monthly seasonality + weekday + hourly distributions -- coefficient of variation and peak windows.',
      'Design Day Analysis -- P50 / P75 / P90 / P95 cases per day for capacity planning.',
      'Robot Compatibility Matrix -- scores every procedure against dV5 / Xi / X / SP capabilities.',
      '5-Year Volume Projection with adoption ramp curve.',
      'Financial Deep Dive -- TCO, breakeven months, per-procedure cost, 5-year ROI.',
      'Growth Extrapolation across conservative / base / aggressive scenarios.',
      'Risk Assessment with weighted factor scoring.',
      'All results are cached per analysis_type so re-runs are incremental.',
    ],
    sources: [
      'Project record from Hospital Intake',
      'Surgeon survey responses',
      'CMS MPUP physician volume (procedure HCPCS counts)',
      'Florida AHCA discharge data (where applicable)',
      'Internal robot capability matrix (dV5/Xi/X/SP specs)',
      'DRG reimbursement table (Medicare base rates by MS-DRG)',
    ],
  },
  '/recommendations': {
    title: '4. System Match',
    purpose: 'Translates the analytical scores into a specific da Vinci model recommendation, quantity, and fit score with rationale.',
    how: [
      'System Matcher service ingests procedure mix, design-day capacity, and surgeon credentialing.',
      'Each candidate model (dV5, Xi, X, SP) is scored on procedural fit, capacity match, financial fit, and surgeon-readiness.',
      'Outputs primary recommendation + quantity, fit score 0-100, projected annual cases, and a plain-English rationale.',
      'May recommend a multi-system mix (e.g., one Xi + one SP) when specialty load justifies it.',
    ],
    sources: [
      'Analysis cache (Procedure Pareto, Design Day, Robot Compatibility)',
      'Internal model capability + price catalog',
      'Surgeon Capacity output from surveys',
    ],
  },
  '/presentation': {
    title: '5. Presentation',
    purpose: 'Auto-generates a 13-slide assessment deck for the prospect meeting and arms Rachel (Voice AI) with the live numbers.',
    how: [
      'Builds slides directly from the Project + Analysis cache so there is no manual copy-paste.',
      'Slides cover: title, hospital profile, procedure pareto, seasonality, weekday, hourly, robot matrix, design day, volume projection, financials, growth scenarios, system recommendation, next steps.',
      'On page load, the ElevenLabs convai widget is bound to a context string containing every slide value, so Rachel can answer ad-hoc questions during the presentation.',
    ],
    sources: [
      'Project record',
      'Analysis cache (all 12 models)',
      'System Match output',
      'ElevenLabs Conversational AI agent (Rachel)',
    ],
  },
  '/business-plan': {
    title: '6. Business Plan',
    purpose: 'Converts the recommendation into a financial proforma + execution roadmap the hospital CFO and OR director can sign off on.',
    how: [
      'Generates 5-year P&L (revenue by payer mix, direct cost, contribution margin, EBITDA) using DRG reimbursement + TCO from Analysis.',
      'Builds an implementation timeline (procurement, OR retrofit, surgeon training, go-live).',
      'Defines KPIs and milestones that Plan Tracking will measure against.',
      'Locks the assumptions into a baseline so post-go-live actuals can be compared.',
    ],
    sources: [
      'System Match output',
      'Financial Deep Dive (Analysis)',
      'CMS DRG reimbursement table',
      'Hospital payer mix from HCRIS',
    ],
  },
  '/tracking': {
    title: '7. Plan Tracking',
    purpose: 'Compares the locked Business Plan baseline against monthly actuals once the system is live, so variance is caught early.',
    how: [
      'Monthly actuals are ingested via CSV upload (proforma-tracking route) or wired from the hospital EHR.',
      'Dashboard renders plan vs actual for cases, revenue, contribution margin, and utilization.',
      'Variance > threshold triggers alerts to the account team for intervention.',
    ],
    sources: [
      'Business Plan baseline (locked at signoff)',
      'Hospital actuals CSV ingest (actuals-csv-ingester service)',
      'Optional EHR integration for case-level data',
    ],
  },
  '/report': {
    title: '8. Report',
    purpose: 'Final narrative + data export for executive sign-off, audit trail, or handoff to the post-sale clinical team.',
    how: [
      'Aggregates Project, Analysis, System Match, Business Plan, and latest Plan Tracking variance into a single document.',
      'Includes the bulletproof citation chain -- every quoted public-source figure is linked back to its CMS / NPPES / 990 record.',
      'Exportable as PDF for board packets and as JSON for downstream BI.',
    ],
    sources: [
      'All upstream step outputs',
      'Citation index (CMS, NPPES, ProPublica, AHCA records used)',
    ],
  },
}

export default function App() {
  const location = useLocation()
  const [currentProject, setCurrentProject] = useState(null)
  const [currentProjectName, setCurrentProjectName] = useState('')
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('intuitive_token')
    const savedUser = localStorage.getItem('intuitive_user')
    if (token && savedUser) {
      // Verify token is still valid
      fetch('/intuitive/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json()).then(data => {
        if (data.success && data.user) {
          setUser(data.user)
        } else {
          localStorage.removeItem('intuitive_token')
          localStorage.removeItem('intuitive_user')
        }
        setAuthChecked(true)
      }).catch(() => {
        localStorage.removeItem('intuitive_token')
        localStorage.removeItem('intuitive_user')
        setAuthChecked(true)
      })
    } else {
      setAuthChecked(true)
    }
  }, [])

  // Validate stored project on mount (after auth) — clear if it no longer exists
  useEffect(() => {
    if (!user) return
    const saved = localStorage.getItem('intuitive_project_id')
    if (!saved) return
    const pid = parseInt(saved)
    if (!pid) { localStorage.removeItem('intuitive_project_id'); return }
    const token = localStorage.getItem('intuitive_token')
    fetch(`/intuitive/api/v1/projects/${pid}`, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    }).then(r => r.ok ? r.json() : null).then(data => {
      const proj = data?.data || data?.project || data
      if (proj && (proj.id || proj.hospital_name)) {
        setCurrentProject(pid)
        setCurrentProjectName(proj.hospital_name || '')
      } else {
        localStorage.removeItem('intuitive_project_id')
        setCurrentProject(null)
        setCurrentProjectName('')
      }
    }).catch(() => {
      localStorage.removeItem('intuitive_project_id')
      setCurrentProject(null)
      setCurrentProjectName('')
    })
  }, [user])

  function selectProject(id, name) {
    setCurrentProject(id)
    if (name) setCurrentProjectName(name)
    localStorage.setItem('intuitive_project_id', id)
  }

  function handleLogin(userData, token) {
    setUser(userData)
  }

  function handleLogout() {
    setUser(null)
    localStorage.removeItem('intuitive_token')
    localStorage.removeItem('intuitive_user')
  }

  // Sync currentProject from URL whenever the user navigates to a project-specific page
  useEffect(() => {
    if (!user) return
    const m = location.pathname.match(/\/(?:analysis|recommendations|presentation|business-plan|surveys|report|commitments|executive|executive-presentation|hospital-profile|surgeon-profile|robotics-program|market-profile|clinical-outcomes|clinical-overlay|tracking)\/(\d+)/)
    if (!m) return
    const pid = parseInt(m[1])
    if (!pid || pid === currentProject) return
    const token = localStorage.getItem('intuitive_token')
    fetch(`/intuitive/api/v1/projects/${pid}`, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    }).then(r => r.ok ? r.json() : null).then(data => {
      const proj = data?.data || data?.project || data
      if (proj && (proj.id || proj.hospital_name)) {
        setCurrentProject(pid)
        setCurrentProjectName(proj.hospital_name || '')
        localStorage.setItem('intuitive_project_id', pid)
      }
    }).catch(() => {})
  }, [location.pathname, user, currentProject])

  // Dynamically pass context to ElevenLabs widget based on current page
  useEffect(() => {
    if (!user) return
    const widget = document.querySelector('elevenlabs-convai')
    if (!widget) return

    const anyProjectId = location.pathname.match(/\/(?:analysis|recommendations|presentation)\/(\d+)/)?.[1]
    const pid = anyProjectId || currentProject

    if (pid) {
      const token = localStorage.getItem('intuitive_token')
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {}
      Promise.all([
        fetch(`/intuitive/api/v1/projects/${pid}`, { headers }).then(r => r.json()).catch(() => null),
        fetch(`/intuitive/api/v1/analysis/${pid}/all`, { headers }).then(r => r.json()).catch(() => null),
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
  }, [location.pathname, currentProject, user])

  // Sidebar search state -- must be before early returns (React hooks rule)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [docOpen, setDocOpen] = useState(null) // path key into STEP_DOCS, or null
  const searchRef = React.useRef(null)
  const navigate = useNavigate()

  // Close mobile drawer on route change
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!user) return
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); setSearchOpen(false); return }
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchHospitals(searchQuery)
        setSearchResults(res.data || [])
        setSearchOpen(true)
      } catch (e) { setSearchResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, user])

  useEffect(() => {
    if (!user) return
    function handleClick(e) { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [user])

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-[#0a1628] border-b border-slate-800 flex items-center justify-between px-3 z-40">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800/60"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" className="h-7 w-auto" />
        <div className="w-10" />
      </div>

      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-60 bg-[#0a1628] border-r border-slate-800 flex flex-col fixed h-full z-50 transition-transform duration-200 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-4 border-b border-slate-800 flex justify-center">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" className="w-44 h-auto" />
        </div>

        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {NAV_STEPS.filter(s => s.section === 'main').map(step => {
            const hasDoc = !!STEP_DOCS[step.to]
            return (
              <NavLink key={step.to} to={step.to} end={step.to === '/'}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-intuitive-900/60 text-intuitive-300 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${location.pathname === step.to ? 'bg-intuitive-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{step.icon}</span>
                <span className="flex-1">{step.label}</span>
                {hasDoc && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocOpen(step.to) }}
                    className="ml-auto w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-800 text-slate-400 hover:bg-intuitive-700 hover:text-white transition-colors"
                    title={`How "${step.label}" works`}
                    aria-label={`How "${step.label}" works`}
                  >i</button>
                )}
              </NavLink>
            )
          })}

          <div className="border-t border-slate-800 my-2"></div>
          <div className="px-3 py-1 text-[9px] text-slate-600 uppercase tracking-widest">Hospital Workflow</div>
          {currentProjectName && (
            <div className="px-3 pb-1 text-[10px] text-intuitive-300 truncate" title={currentProjectName}>{currentProjectName}</div>
          )}
          {!currentProject && (
            <div className="px-3 pb-1 text-[10px] text-slate-500 italic">Pick a hospital from the Dashboard</div>
          )}
          {NAV_STEPS.filter(s => s.section === 'project').map(step => {
            const disabled = !currentProject
            const hasDoc = !!STEP_DOCS[step.to]
            const InfoBtn = hasDoc ? (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocOpen(step.to) }}
                className="ml-auto w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-800 text-slate-400 hover:bg-intuitive-700 hover:text-white transition-colors"
                title={`How "${step.label}" works`}
                aria-label={`How "${step.label}" works`}
              >i</button>
            ) : null
            const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${disabled ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`
            if (disabled) {
              return (
                <div key={step.to} className={cls} aria-disabled="true">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-800 text-slate-600">{step.num}</span>
                  <span className="flex-1">{step.label}</span>
                  {InfoBtn}
                </div>
              )
            }
            return (
              <NavLink key={step.to} to={step.to} end={false}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-intuitive-900/60 text-intuitive-300 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${location.pathname.startsWith(step.to) ? 'bg-intuitive-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{step.num}</span>
                <span className="flex-1">{step.label}</span>
                {InfoBtn}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3 pb-20 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-1 truncate">{user?.name || user?.email}</div>
          <button onClick={handleLogout} className="w-full text-left text-[10px] text-slate-500 hover:text-red-400 transition-colors">Sign Out</button>
        </div>
      </aside>

      {/* Process documentation modal */}
      {docOpen && STEP_DOCS[docOpen] && (
        <div
          className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
          onClick={() => setDocOpen(null)}
        >
          <div
            className="bg-[#0a1628] border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-slate-800 sticky top-0 bg-[#0a1628]">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-intuitive-400 mb-1">Process Step</div>
                <h2 className="text-xl font-bold text-slate-100">{STEP_DOCS[docOpen].title}</h2>
              </div>
              <button
                onClick={() => setDocOpen(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                aria-label="Close"
              >X</button>
            </div>
            <div className="p-5 space-y-5 text-sm">
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Purpose</h3>
                <p className="text-slate-300 leading-relaxed">{STEP_DOCS[docOpen].purpose}</p>
              </section>
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">How It Works</h3>
                <ol className="space-y-1.5 list-decimal list-inside text-slate-300">
                  {STEP_DOCS[docOpen].how.map((line, i) => (
                    <li key={i} className="leading-relaxed pl-1">{line}</li>
                  ))}
                </ol>
              </section>
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Source Systems</h3>
                <ul className="space-y-1 text-slate-300">
                  {STEP_DOCS[docOpen].sources.map((src, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-intuitive-400">&bull;</span>
                      <span>{src}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 ml-0 md:ml-60 pt-12 md:pt-0 min-h-screen relative">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<DashboardPage onSelectProject={selectProject} />} />
          <Route path="/intake" element={<IntakePage onProjectCreated={selectProject} currentProject={currentProject} />} />
          <Route path="/analysis" element={<AnalysisPage projectId={currentProject} />} />
          <Route path="/analysis/:projectId" element={<AnalysisPage />} />
          <Route path="/recommendations" element={<RecommendationsPage projectId={currentProject} />} />
          <Route path="/recommendations/:projectId" element={<RecommendationsPage />} />
          <Route path="/presentation" element={<PresentationPage />} />
          <Route path="/presentation/:projectId" element={<PresentationPage />} />
          <Route path="/business-plan" element={<BusinessPlanPage projectId={currentProject} />} />
          <Route path="/business-plan/:projectId" element={<BusinessPlanPage />} />
          <Route path="/commitments" element={<SurgeonCommitmentsPage projectId={currentProject} />} />
          <Route path="/commitments/:projectId" element={<SurgeonCommitmentsPage />} />
          <Route path="/executive" element={<ExecutiveBriefPage projectId={currentProject} />} />
          <Route path="/executive/:projectId" element={<ExecutiveBriefPage />} />
          <Route path="/executive-presentation" element={<ExecutivePresentationPage projectId={currentProject} />} />
          <Route path="/executive-presentation/:projectId" element={<ExecutivePresentationPage />} />
          {/* 9-step Hospital Workflow */}
          <Route path="/hospital-profile" element={<HospitalProfilePage projectId={currentProject} />} />
          <Route path="/hospital-profile/:projectId" element={<HospitalProfilePage />} />
          <Route path="/surgeon-profile" element={<SurgeonProfilePage projectId={currentProject} />} />
          <Route path="/surgeon-profile/:projectId" element={<SurgeonProfilePage />} />
          <Route path="/robotics-program" element={<RoboticsProgramPage projectId={currentProject} />} />
          <Route path="/robotics-program/:projectId" element={<RoboticsProgramPage />} />
          <Route path="/market-profile" element={<MarketProfilePage projectId={currentProject} />} />
          <Route path="/market-profile/:projectId" element={<MarketProfilePage />} />
          <Route path="/clinical-outcomes" element={<ClinicalOutcomesPage projectId={currentProject} />} />
          <Route path="/clinical-outcomes/:projectId" element={<ClinicalOutcomesPage />} />
          <Route path="/clinical-overlay" element={<ClinicalOverlayPage projectId={currentProject} />} />
          <Route path="/clinical-overlay/:projectId" element={<ClinicalOverlayPage />} />
          <Route path="/surveys" element={<SurveyManagerPage projectId={currentProject} />} />
          <Route path="/surveys/:projectId" element={<SurveyManagerPage />} />
          <Route path="/tracking" element={<TrackingDashboardPage />} />
          <Route path="/tracking/:planId" element={<TrackingDashboardPage />} />
          <Route path="/report" element={<ReportPage projectId={currentProject} />} />
          <Route path="/report/:projectId" element={<ReportPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/surgeon-targeting" element={<SurgeonTargetingPage />} />
        </Routes>
        <ChatWidget currentProjectId={currentProject} />
        </ErrorBoundary>
      </main>
    </div>
  )
}

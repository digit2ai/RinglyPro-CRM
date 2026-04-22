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

const NAV_STEPS = [
  { to: '/', label: 'Dashboard', num: 0, icon: 'D', section: 'main' },
  { to: '/intake', label: 'Hospital Intake', num: 1, icon: 'H', section: 'main' },
  { to: '/analysis', label: 'Analysis', num: 2, icon: 'A', section: 'project' },
  { to: '/recommendations', label: 'System Match', num: 3, icon: 'M', section: 'project' },
  { to: '/presentation', label: 'Presentation', num: 4, icon: 'P', section: 'project' },
  { to: '/business-plan', label: 'Business Plan', num: 5, icon: 'B', section: 'project' },
  { to: '/surveys', label: 'Surgeon Surveys', num: 6, icon: 'S', section: 'project' },
  { to: '/tracking', label: 'Plan Tracking', num: 7, icon: 'T', section: 'project' },
]

export default function App() {
  const location = useLocation()
  const [currentProject, setCurrentProject] = useState(null)
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

  useEffect(() => {
    const saved = localStorage.getItem('intuitive_project_id')
    if (saved) setCurrentProject(parseInt(saved))
  }, [])

  function selectProject(id) {
    setCurrentProject(id)
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
  const searchRef = React.useRef(null)
  const navigate = useNavigate()

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
      {/* Sidebar */}
      <aside className="w-60 bg-[#0a1628] border-r border-slate-800 flex flex-col fixed h-full z-50">
        <div className="p-4 border-b border-slate-800 flex justify-center">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" className="w-44 h-auto" />
        </div>

        {/* Search Bar */}
        <div className="px-3 pt-3 pb-1 relative" ref={searchRef}>
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  selectProject(searchResults[0].id)
                  navigate(`/analysis/${searchResults[0].id}`)
                  setSearchOpen(false); setSearchQuery('')
                } else if (e.key === 'Enter' && searchQuery.length >= 2 && searchResults.length === 0) {
                  navigate(`/intake?q=${encodeURIComponent(searchQuery)}`)
                  setSearchOpen(false); setSearchQuery('')
                } else if (e.key === 'Escape') { setSearchOpen(false) }
              }}
              placeholder="Search hospitals..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-intuitive-600 focus:border-transparent"
            />
          </div>
          {searchOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
              {searchResults.length > 0 ? searchResults.map(h => (
                <button key={h.id} onClick={() => { selectProject(h.id); navigate(`/analysis/${h.id}`); setSearchOpen(false); setSearchQuery('') }}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0">
                  <div className="text-xs text-white font-medium truncate">{h.hospital_name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{h.hospital_type} | {h.bed_count || '--'} beds | {h.state || '--'}</div>
                </button>
              )) : (
                <div className="p-3">
                  <div className="text-xs text-slate-400 mb-2">No hospitals found for "{searchQuery}"</div>
                  <button onClick={() => { navigate(`/intake?q=${encodeURIComponent(searchQuery)}`); setSearchOpen(false); setSearchQuery('') }}
                    className="w-full bg-intuitive-600 hover:bg-intuitive-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                    Generate Report for "{searchQuery}"
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 py-2 px-3 space-y-0.5 overflow-y-auto">
          {NAV_STEPS.filter(s => s.section === 'main').map(step => (
            <NavLink key={step.to} to={step.to} end={step.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-intuitive-900/60 text-intuitive-300 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${location.pathname === step.to ? 'bg-intuitive-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{step.icon}</span>
              {step.label}
            </NavLink>
          ))}

          {currentProject && (
            <>
              <div className="border-t border-slate-800 my-2"></div>
              <div className="px-3 py-1 text-[9px] text-slate-600 uppercase tracking-widest">Hospital Workflow</div>
              {NAV_STEPS.filter(s => s.section === 'project').map(step => (
                <NavLink key={step.to} to={step.to} end={false}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-intuitive-900/60 text-intuitive-300 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${location.pathname.startsWith(step.to) ? 'bg-intuitive-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{step.num}</span>
                  {step.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-3 pb-20 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-1 truncate">{user?.name || user?.email}</div>
          <button onClick={handleLogout} className="w-full text-left text-[10px] text-slate-500 hover:text-red-400 transition-colors">Sign Out</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 min-h-screen relative">
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
          <Route path="/surveys" element={<SurveyManagerPage projectId={currentProject} />} />
          <Route path="/surveys/:projectId" element={<SurveyManagerPage />} />
          <Route path="/tracking" element={<TrackingDashboardPage />} />
          <Route path="/tracking/:planId" element={<TrackingDashboardPage />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

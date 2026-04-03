import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import IntakePage from './pages/IntakePage'
import AnalysisPage from './pages/AnalysisPage'
import RecommendationsPage from './pages/RecommendationsPage'

const NAV_STEPS = [
  { to: '/', label: 'Hospital Intake', num: 1, icon: 'H' },
  { to: '/analysis', label: 'Analysis', num: 2, icon: 'A' },
  { to: '/recommendations', label: 'System Match', num: 3, icon: 'M' },
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
        </Routes>
      </main>
    </div>
  )
}

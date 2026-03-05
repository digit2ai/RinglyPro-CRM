import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ProductsPage from './pages/ProductsPage'
import BenefitsPage from './pages/BenefitsPage'
import ReportPage from './pages/ReportPage'
import ApiIntegrationPage from './pages/ApiIntegrationPage'
import ObservabilityPage from './pages/ObservabilityPage'
import UserGuidePage from './pages/UserGuidePage'
import OEEDashboardPage from './pages/OEEDashboardPage'
import StepIndicator from './components/StepIndicator'

const steps = [
  { path: '/', label: 'Upload', icon: UploadIcon },
  { path: '/analysis', label: 'Analysis', icon: ChartIcon },
  { path: '/products', label: 'Products', icon: BoxIcon },
  { path: '/benefits', label: 'ROI Projection', icon: TrendingUpIcon },
  { path: '/report', label: 'Report', icon: FileIcon },
  { path: '/api-integration', label: 'API Integration', icon: PlugIcon },
  { path: '/oee-dashboard', label: 'OEE Dashboard', icon: GaugeIcon, noProject: true },
  { path: '/user-guide', label: 'User Guide', icon: BookIcon, noProject: true },
  { path: '/proposals/PINAXIS-System-Architecture-Document.html', label: 'MCP Architecture', icon: ArchitectureIcon, external: true }
]

function UploadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function ChartIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

function BoxIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  )
}

function FileIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function TrendingUpIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  )
}

function PlugIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
}

function ArchitectureIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
    </svg>
  )
}

function PulseIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-9h5" />
    </svg>
  )
}

function GaugeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m10 8h-2M4 12H2m15.07-7.07l-1.41 1.41M6.34 6.34L4.93 4.93" />
    </svg>
  )
}

function BookIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

function CloseIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function App({ onLogout, userEmail }) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Extract projectId from current URL for sidebar navigation
  const getProjectId = () => {
    const match = location.pathname.match(/\/(analysis|products|benefits|report|api-integration|observability|user-guide)\/(\d+)/)
    return match ? match[2] : null
  }

  const getCurrentStep = () => {
    if (location.pathname.startsWith('/analysis')) return 1
    if (location.pathname.startsWith('/products')) return 2
    if (location.pathname.startsWith('/benefits')) return 3
    if (location.pathname.startsWith('/report')) return 4
    if (location.pathname.startsWith('/api-integration')) return 5
    if (location.pathname.startsWith('/oee-dashboard')) return 6
    if (location.pathname.startsWith('/observability')) return 7
    if (location.pathname.startsWith('/user-guide')) return 7
    return 0
  }

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-slate-800 border-r border-slate-700 flex flex-col fixed h-full z-30 transition-transform duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo + Close button on mobile */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="PINAXIS" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-white tracking-tight">PINAXIS</h1>
              <p className="text-xs text-slate-400">Warehouse Analytics</p>
            </div>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-1 text-slate-400 hover:text-white"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = getCurrentStep() === index

            if (step.external) {
              return (
                <a
                  key={step.path}
                  href={step.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  onClick={closeSidebar}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium bg-slate-700 text-slate-400 group-hover:bg-slate-600">
                    {index + 1}
                  </div>
                  <span className="font-medium">{step.label}</span>
                  <Icon className="w-4 h-4 ml-auto text-slate-600" />
                </a>
              )
            }

            const projectId = getProjectId()
            const basePath = index === 0 ? '/' : (projectId && index > 0 && !step.noProject ? `${step.path}/${projectId}` : step.path)

            return (
              <NavLink
                key={step.path}
                to={basePath}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? 'bg-pinaxis-600/20 text-pinaxis-500 border border-pinaxis-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'
                }`}>
                  {index + 1}
                </div>
                <span className="font-medium">{step.label}</span>
                <Icon className={`w-4 h-4 ml-auto ${isActive ? 'text-pinaxis-400' : 'text-slate-600'}`} />
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700">
          {userEmail && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 truncate">{userEmail}</span>
              <button
                onClick={onLogout}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
          <div className="text-xs text-slate-500 text-center">
            <p>Powered by RinglyPro</p>
            <p className="mt-1">PINAXIS Analytics v1.0</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-w-0">
        {/* Top Bar */}
        <header className="bg-slate-800/50 border-b border-slate-700 px-4 sm:px-8 py-4 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Hamburger button - mobile only */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="hidden sm:block flex-1">
              <StepIndicator currentStep={getCurrentStep()} steps={steps.map(s => s.label)} />
            </div>
            {/* Mobile: show current step name */}
            <span className="sm:hidden text-sm font-medium text-white">
              {steps[getCurrentStep()]?.label || 'PINAXIS'}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/analysis/:projectId" element={<AnalysisPage />} />
            <Route path="/products/:projectId" element={<ProductsPage />} />
            <Route path="/benefits/:projectId" element={<BenefitsPage />} />
            <Route path="/report/:projectId" element={<ReportPage />} />
            <Route path="/api-integration/:projectId" element={<ApiIntegrationPage />} />
            <Route path="/oee-dashboard" element={<OEEDashboardPage />} />
            <Route path="/observability/:projectId" element={<ObservabilityPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/user-guide" element={<UserGuidePage />} />
          </Routes>
        </div>
      </main>

      {/* ElevenLabs Voice Agent Widget */}
      <elevenlabs-convai agent-id="agent_1801kjx55tabedbvx4y7x4eptbz4"></elevenlabs-convai>
    </div>
  )
}

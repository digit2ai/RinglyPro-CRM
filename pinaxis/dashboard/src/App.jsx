import React, { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ProductsPage from './pages/ProductsPage'
import ReportPage from './pages/ReportPage'
import StepIndicator from './components/StepIndicator'

const steps = [
  { path: '/', label: 'Upload', icon: UploadIcon },
  { path: '/analysis', label: 'Analysis', icon: ChartIcon },
  { path: '/products', label: 'Products', icon: BoxIcon },
  { path: '/report', label: 'Report', icon: FileIcon },
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

function ArchitectureIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
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

  const getCurrentStep = () => {
    if (location.pathname.startsWith('/analysis')) return 1
    if (location.pathname.startsWith('/products')) return 2
    if (location.pathname.startsWith('/report')) return 3
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
            <div className="w-10 h-10 bg-pinaxis-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
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

            const basePath = index === 0 ? '/' : step.path

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
            <p>Powered by GEBHARDT</p>
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
            <Route path="/report/:projectId" element={<ReportPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

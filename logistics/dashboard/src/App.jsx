import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ProductsPage from './pages/ProductsPage'
import SimulationPage from './pages/SimulationPage'
import BenefitsPage from './pages/BenefitsPage'
import ReportPage from './pages/ReportPage'
import ApiIntegrationPage from './pages/ApiIntegrationPage'
import ObservabilityPage from './pages/ObservabilityPage'
import UserGuidePage from './pages/UserGuidePage'
import OEEDashboardPage from './pages/OEEDashboardPage'
import NDAPage from './pages/NDAPage'
import ContractBuilderPage from './pages/ContractBuilderPage'
import PresentationPage from './pages/PresentationPage'
import WarehouseMindPage from './pages/WarehouseMindPage'
const warehouseMindSubItems = [
  { path: '/warehousemind/command-center', label: 'MCP Command Center', icon: MCPIcon },
  { path: '/warehousemind/neural', label: 'Neural Intelligence', icon: NeuralIcon },
  { path: '/warehousemind/events', label: 'Event Automation', icon: EventIcon },
  { path: '/warehousemind/voice', label: 'Voice AI', icon: VoiceIcon },
  { path: '/oee-dashboard', label: 'OEE Dashboard', icon: GaugeIcon, noProject: true }
]

const docsSubItems = [
  { path: '/api-integration', label: 'API Integration', icon: PlugIcon },
  { path: '/user-guide', label: 'User Guide', icon: BookIcon, noProject: true },
  { path: '/proposals/LOGISTICS-System-Architecture-Document.html', label: 'MCP Architecture', icon: ArchitectureIcon, external: true },
  { path: '/nda', label: 'NDA', icon: NDAIcon, noProject: true },
  { path: '/contract-builder', label: 'Services Agreement', icon: ContractIcon, noProject: true }
]

const steps = [
  { path: '/warehousemind', label: 'WarehouseMind AI', icon: BrainIcon, noProject: true, collapsible: true, subItems: warehouseMindSubItems },
  { path: '/', label: 'Data Intake', icon: UploadIcon },
  { path: '/analysis', label: 'Analysis', icon: ChartIcon },
  { path: '/products', label: 'Concepts', icon: BoxIcon },
  { path: '/simulation', label: 'Simulation', icon: SimulationIcon },
  { path: '/benefits', label: 'Commercial', icon: TrendingUpIcon },
  { path: '/report', label: 'Proposal', icon: FileIcon },
  { path: '/presentation', label: 'Presentation', icon: PresentationIcon },
  { path: '/docs', label: 'Docs', icon: BookIcon, noProject: true, collapsible: true, subItems: docsSubItems }
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

function SimulationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
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

function NDAIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  )
}

function ContractIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function BrainIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function MCPIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  )
}

function NeuralIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EventIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

function VoiceIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  )
}

function PresentationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
    </svg>
  )
}

function ChevronIcon({ className, expanded }) {
  return (
    <svg className={`${className} transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [wmExpanded, setWmExpanded] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState(false)

  // Extract projectId from current URL for sidebar navigation
  const getProjectId = () => {
    const match = location.pathname.match(/\/(analysis|products|simulation|benefits|report|api-integration|observability|user-guide|nda|presentation)\/(\d+)/)
    return match ? match[2] : null
  }

  const getCurrentStep = () => {
    if (location.pathname.startsWith('/warehousemind')) return 0
    if (location.pathname === '/' || location.pathname.startsWith('/upload')) return 1
    if (location.pathname.startsWith('/analysis')) return 2
    if (location.pathname.startsWith('/products')) return 3
    if (location.pathname.startsWith('/simulation')) return 4
    if (location.pathname.startsWith('/benefits')) return 5
    if (location.pathname.startsWith('/report')) return 6
    if (location.pathname.startsWith('/presentation')) return 7
    if (location.pathname.startsWith('/oee-dashboard')) return 0
    // Docs group items
    if (location.pathname.startsWith('/api-integration')) return 8
    if (location.pathname.startsWith('/user-guide')) return 8
    if (location.pathname.startsWith('/observability')) return 8
    if (location.pathname.startsWith('/nda')) return 8
    if (location.pathname.startsWith('/contract-builder')) return 8
    return 1
  }

  const closeMenu = () => setMobileMenuOpen(false)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
        {/* Top row: brand + user */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2">
          <NavLink to="/" className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-tight">PINAXIS</h1>
            <span className="text-[10px] text-slate-500 hidden sm:inline">Warehouse Analytics</span>
          </NavLink>
          <div className="flex items-center gap-3">
            {userEmail && <span className="text-[11px] text-slate-500 hidden sm:inline truncate max-w-[160px]">{userEmail}</span>}
            {userEmail && (
              <button onClick={onLogout} className="text-[11px] text-slate-500 hover:text-red-400 transition-colors">
                Sign out
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
            >
              {mobileMenuOpen ? <CloseIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Nav row: horizontal steps (desktop) */}
        <nav className="hidden lg:flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-thin">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = getCurrentStep() === index
            const isWmSubActive = step.path === '/warehousemind' && location.pathname.startsWith('/warehousemind')
            const isDocsSubActive = step.path === '/docs' && ['/api-integration', '/user-guide', '/nda', '/contract-builder'].some(p => location.pathname.startsWith(p))

            if (step.collapsible) {
              const isWm = step.path === '/warehousemind'
              const expanded = isWm ? wmExpanded : docsExpanded
              const toggleExpanded = isWm ? () => setWmExpanded(!wmExpanded) : () => setDocsExpanded(!docsExpanded)
              const subActive = isWm ? isWmSubActive : isDocsSubActive

              return (
                <div key={step.path} className="relative group">
                  <button
                    onClick={toggleExpanded}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] whitespace-nowrap ${
                      subActive
                        ? (isWm ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-slate-700/40 text-slate-300 border border-slate-600/30')
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="font-medium">{step.label}</span>
                    <ChevronIcon className="w-2.5 h-2.5 text-slate-500" expanded={expanded} />
                  </button>
                  {expanded && (
                    <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
                      {step.subItems.map((sub) => {
                        const SubIcon = sub.icon
                        const subItemActive = location.pathname.startsWith(sub.path?.split('/')[1] ? '/' + sub.path.split('/')[1] : sub.path)
                        if (sub.external) {
                          return (
                            <a key={sub.path} href={sub.path} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 transition-all">
                              <SubIcon className="w-3 h-3 text-slate-600" />
                              <span>{sub.label}</span>
                            </a>
                          )
                        }
                        const projId = getProjectId()
                        const subPath = projId && !sub.noProject ? `${sub.path}/${projId}` : sub.path
                        return (
                          <NavLink key={sub.path} to={subPath} onClick={() => { setWmExpanded(false); setDocsExpanded(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 text-[11px] transition-all ${
                              subItemActive ? (isWm ? 'bg-purple-600/15 text-purple-400' : 'bg-logistics-600/15 text-logistics-400') : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                            }`}>
                            <SubIcon className={`w-3 h-3 ${subItemActive ? (isWm ? 'text-purple-400' : 'text-logistics-400') : 'text-slate-600'}`} />
                            <span>{sub.label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            if (step.external) {
              return (
                <a key={step.path} href={step.path} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 whitespace-nowrap">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="font-medium">{step.label}</span>
                </a>
              )
            }

            const projectId = getProjectId()
            const basePath = step.path === '/' ? '/' : (projectId && !step.noProject ? `${step.path}/${projectId}` : step.path)

            return (
              <NavLink key={step.path} to={basePath}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] whitespace-nowrap ${
                  isActive ? 'bg-logistics-600/20 text-logistics-500 border border-logistics-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}>
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-logistics-400' : 'text-slate-600'}`} />
                <span className="font-medium">{step.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-slate-700 px-3 py-2 space-y-0.5 max-h-[60vh] overflow-y-auto">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = getCurrentStep() === index

              if (step.collapsible) {
                const isWm = step.path === '/warehousemind'
                const expanded = isWm ? wmExpanded : docsExpanded
                const toggleExpanded = isWm ? () => setWmExpanded(!wmExpanded) : () => setDocsExpanded(!docsExpanded)
                return (
                  <div key={step.path}>
                    <button onClick={toggleExpanded}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="font-medium flex-1 text-left">{step.label}</span>
                      <ChevronIcon className="w-3 h-3 text-slate-500" expanded={expanded} />
                    </button>
                    {expanded && (
                      <div className="ml-6 pl-3 border-l border-slate-700/60 space-y-0.5 mt-0.5">
                        {step.subItems.map((sub) => {
                          const SubIcon = sub.icon
                          if (sub.external) {
                            return (
                              <a key={sub.path} href={sub.path} target="_blank" rel="noopener noreferrer" onClick={closeMenu}
                                className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-700/30">
                                <SubIcon className="w-3 h-3 text-slate-600" />
                                <span>{sub.label}</span>
                              </a>
                            )
                          }
                          const projId = getProjectId()
                          const subPath = projId && !sub.noProject ? `${sub.path}/${projId}` : sub.path
                          return (
                            <NavLink key={sub.path} to={subPath} onClick={closeMenu}
                              className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-700/30">
                              <SubIcon className="w-3 h-3 text-slate-600" />
                              <span>{sub.label}</span>
                            </NavLink>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              const projectId = getProjectId()
              const basePath = step.path === '/' ? '/' : (projectId && !step.noProject ? `${step.path}/${projectId}` : step.path)
              return (
                <NavLink key={step.path} to={basePath} onClick={closeMenu}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                    isActive ? 'bg-logistics-600/20 text-logistics-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}>
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-logistics-400' : 'text-slate-600'}`} />
                  <span className="font-medium">{step.label}</span>
                </NavLink>
              )
            })}
          </nav>
        )}
      </header>

      {/* Click-away to close dropdowns */}
      {(wmExpanded || docsExpanded) && (
        <div className="fixed inset-0 z-20" onClick={() => { setWmExpanded(false); setDocsExpanded(false); }} />
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/warehousemind" element={<WarehouseMindPage />} />
            <Route path="/warehousemind/:section" element={<WarehouseMindPage />} />
            <Route path="/" element={<UploadPage />} />
            <Route path="/analysis/:projectId" element={<AnalysisPage />} />
            <Route path="/products/:projectId" element={<ProductsPage />} />
            <Route path="/simulation/:projectId" element={<SimulationPage />} />
            <Route path="/benefits/:projectId" element={<BenefitsPage />} />
            <Route path="/report/:projectId" element={<ReportPage />} />
            <Route path="/api-integration/:projectId" element={<ApiIntegrationPage />} />
            <Route path="/oee-dashboard" element={<OEEDashboardPage />} />
            <Route path="/observability/:projectId" element={<ObservabilityPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/user-guide" element={<UserGuidePage />} />
            <Route path="/nda" element={<NDAPage />} />
            <Route path="/contract-builder" element={<ContractBuilderPage />} />
            <Route path="/presentation/:projectId" element={<PresentationPage />} />
            <Route path="/presentation" element={<PresentationPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

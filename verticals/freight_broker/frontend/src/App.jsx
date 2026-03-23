import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import IngestionWizardPage from './pages/IngestionWizardPage'
import ScanRunnerPage from './pages/ScanRunnerPage'
import FindingsPage from './pages/FindingsPage'
import FindingDetailPage from './pages/FindingDetailPage'
import PrescriptionsPage from './pages/PrescriptionsPage'
import CommandCenterPage from './pages/CommandCenterPage'
import PlaceholderPage from './pages/PlaceholderPage'
import UserGuidePage from './pages/UserGuidePage'

/* ---- SVG Icon Components ---- */

function ScannerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  )
}

function IngestIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function RunScanIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function FindingsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function PrescriptionIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )
}

function DashboardIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function TruckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function MoneyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function RouteIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  )
}

function MapPinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ClipboardIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  )
}

function WrenchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BuildingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="9" y1="6" x2="9" y2="6.01" />
      <line x1="15" y1="6" x2="15" y2="6.01" />
      <line x1="9" y1="10" x2="9" y2="10.01" />
      <line x1="15" y1="10" x2="15" y2="10.01" />
      <line x1="9" y1="14" x2="9" y2="14.01" />
      <line x1="15" y1="14" x2="15" y2="14.01" />
      <path d="M9 18h6" />
    </svg>
  )
}

function ServerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function BrainIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.28.44 2.46 1.17 3.39A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20h0" />
      <path d="M14.5 2A5.5 5.5 0 0 1 20 7.5c0 1.28-.44 2.46-1.17 3.39A5.5 5.5 0 0 1 20 14.5 5.5 5.5 0 0 1 14.5 20h0" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  )
}

function ChevronIcon({ className, open }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function MenuIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/* ---- Sidebar Navigation Data ---- */

const obdSubItems = [
  { path: '/obd/ingest', label: 'Ingestion Wizard', Icon: IngestIcon },
  { path: '/obd/scan', label: 'Run Scan', Icon: RunScanIcon },
  { path: '/obd/findings', label: 'Findings', Icon: FindingsIcon },
  { path: '/obd/prescriptions', label: 'Prescriptions', Icon: PrescriptionIcon },
  { path: '/obd/guide', label: 'User Guide', Icon: BookIcon },
]

function BookIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

const commandCenterSubItems = [
  { path: '/loads', label: 'Load Board', Icon: TruckIcon },
  { path: '/rates', label: 'Rate Engine', Icon: MoneyIcon },
  { path: '/dispatch', label: 'Dispatch', Icon: RouteIcon },
  { path: '/tracking', label: 'Tracking', Icon: MapPinIcon },
  { path: '/billing', label: 'Billing', Icon: MoneyIcon },
  { path: '/compliance', label: 'Compliance', Icon: ClipboardIcon },
  { path: '/maintenance', label: 'Fleet Maintenance', Icon: WrenchIcon },
  { path: '/drivers', label: 'Drivers', Icon: UserIcon },
  { path: '/tenants', label: 'Tenants', Icon: BuildingIcon },
  { path: '/mcp', label: 'MCP Status', Icon: ServerIcon },
  { path: '/neural', label: 'Neural Intelligence', Icon: BrainIcon },
]

/* ---- Section Label Map ---- */

function getSectionName(pathname) {
  if (pathname.startsWith('/obd')) {
    const sub = obdSubItems.find(s => pathname.startsWith(s.path))
    return sub ? sub.label : 'OBD Scanner'
  }
  if (pathname === '/') return 'Command Center'
  const item = mainNavItems.find(n => pathname.startsWith(n.path) && n.path !== '/')
  return item ? item.label : 'FreightMind AI'
}

/* ---- Sidebar Component ---- */

function Sidebar({ mobileOpen, onClose }) {
  const location = useLocation()
  const [obdExpanded, setObdExpanded] = useState(true)
  const [ccExpanded, setCcExpanded] = useState(false)

  useEffect(() => {
    if (location.pathname.startsWith('/obd')) {
      setObdExpanded(true)
    }
  }, [location.pathname])

  const isObdActive = (path) => {
    if (path === '/obd/findings') {
      return location.pathname.startsWith('/obd/findings')
    }
    return location.pathname === path
  }

  const isMainActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-64 bg-slate-800 border-r border-slate-700
          flex flex-col z-50 transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-700">
          <img
            src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png"
            alt="FreightMind AI"
            className="w-full max-w-[200px] mx-auto mb-2"
          />
          <p className="text-xs text-purple-400 font-semibold tracking-widest uppercase text-center">OBD Scanner</p>
        </div>

        {/* Close button (mobile) */}
        <button
          className="absolute top-4 right-3 lg:hidden text-slate-400 hover:text-white"
          onClick={onClose}
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          {/* OBD Scanner Group */}
          <div className="mb-1">
            <button
              onClick={() => setObdExpanded(!obdExpanded)}
              className={`
                w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium
                transition-colors duration-150
                ${location.pathname.startsWith('/obd')
                  ? 'text-purple-300 bg-purple-600/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }
              `}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded bg-purple-600/20 text-purple-400 text-[10px] font-bold">1</span>
              <ScannerIcon className="w-4 h-4 text-purple-400" />
              <span className="flex-1 text-left">OBD Scanner</span>
              <ChevronIcon className="w-4 h-4 text-slate-500" open={obdExpanded} />
            </button>
            {obdExpanded && (
              <div className="ml-5 border-l border-purple-600/30 pl-0">
                {obdSubItems.map((sub) => (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    onClick={onClose}
                    className={`
                      flex items-center gap-2.5 pl-8 pr-5 py-2 text-sm transition-colors duration-150
                      ${isObdActive(sub.path)
                        ? 'text-purple-300 bg-purple-600/10 border-l-2 border-purple-500 -ml-[1px]'
                        : 'text-slate-400 hover:text-purple-300 hover:bg-purple-600/5'
                      }
                    `}
                  >
                    <sub.Icon className="w-3.5 h-3.5" />
                    <span>{sub.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-5 my-2 border-t border-slate-700/60" />

          {/* Command Center — collapsible with agent modules */}
          <div>
            <div className="flex items-center">
              <Link
                to="/"
                onClick={onClose}
                className={`
                  flex-1 flex items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-150
                  ${location.pathname === '/'
                    ? 'text-freight-400 bg-freight-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }
                `}
              >
                <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-700/60 text-slate-500 text-[10px] font-bold">2</span>
                <DashboardIcon className="w-4 h-4" />
                <span>Command Center</span>
              </Link>
              <button
                onClick={() => setCcExpanded(!ccExpanded)}
                className="pr-4 pl-1 py-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ChevronIcon className="w-3.5 h-3.5" open={ccExpanded} />
              </button>
            </div>
            {ccExpanded && (
              <div className="ml-5 border-l border-slate-600/30 pl-0">
                {commandCenterSubItems.map((sub, idx) => (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    onClick={onClose}
                    className={`
                      flex items-center gap-2.5 pl-8 pr-5 py-2 text-sm transition-colors duration-150
                      ${location.pathname === sub.path
                        ? 'text-freight-400 bg-freight-500/10 border-l-2 border-freight-500 -ml-[1px]'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                      }
                    `}
                  >
                    <sub.Icon className="w-3.5 h-3.5" />
                    <span>{sub.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 text-center">
          <p className="text-[10px] text-slate-500">Powered by RinglyPro / FreightMind AI v1.0</p>
        </div>
      </aside>
    </>
  )
}

/* ---- Header ---- */

function Header({ onMenuOpen }) {
  const location = useLocation()
  const sectionName = getSectionName(location.pathname)
  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 px-4 lg:px-6 py-3 bg-slate-900/80 backdrop-blur border-b border-slate-700/60">
      <button
        className="lg:hidden text-slate-400 hover:text-white"
        onClick={onMenuOpen}
      >
        <MenuIcon className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">FreightMind</span>
        <span className="text-slate-600">/</span>
        <span className="text-sm font-medium text-white">{sectionName}</span>
      </div>
    </header>
  )
}

/* ---- App Root ---- */

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 lg:ml-64 min-h-screen flex flex-col">
        <Header onMenuOpen={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">
          <Routes>
            <Route path="/obd/ingest" element={<IngestionWizardPage />} />
            <Route path="/obd/scan" element={<ScanRunnerPage />} />
            <Route path="/obd/findings" element={<FindingsPage />} />
            <Route path="/obd/findings/:id" element={<FindingDetailPage />} />
            <Route path="/obd/prescriptions" element={<PrescriptionsPage />} />
            <Route path="/obd/guide" element={<UserGuidePage />} />
            <Route path="/" element={<CommandCenterPage />} />
            <Route path="/loads" element={<PlaceholderPage title="Load Board" />} />
            <Route path="/rates" element={<PlaceholderPage title="Rate Engine" />} />
            <Route path="/dispatch" element={<PlaceholderPage title="Dispatch AI" />} />
            <Route path="/tracking" element={<PlaceholderPage title="Tracking" />} />
            <Route path="/billing" element={<PlaceholderPage title="Billing" />} />
            <Route path="/compliance" element={<PlaceholderPage title="Compliance" />} />
            <Route path="/maintenance" element={<PlaceholderPage title="Fleet Maintenance" />} />
            <Route path="/drivers" element={<PlaceholderPage title="Drivers" />} />
            <Route path="/tenants" element={<PlaceholderPage title="Tenants" />} />
            <Route path="/mcp" element={<PlaceholderPage title="MCP Status" />} />
            <Route path="/neural" element={<PlaceholderPage title="Neural Intelligence" />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

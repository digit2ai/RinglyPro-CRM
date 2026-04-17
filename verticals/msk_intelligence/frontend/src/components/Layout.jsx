import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png';
import NotificationBell from './NotificationBell';

const NAV_ITEMS = {
  patient: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'My Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/messages', label: 'Messages', icon: '💬' },
    { path: '/appointments', label: 'Appointments', icon: '📅' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/proms', label: 'Assessments', icon: '📝' },
    { path: '/rehab', label: 'My Exercises', icon: '🏋️' },
    { path: '/rpm', label: 'Monitoring', icon: '📱' },
    { path: '/reports', label: 'Reports', icon: '📄' },
  ],
  radiologist: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'Case Queue', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/messages', label: 'Messages', icon: '💬' },
    { path: '/appointments', label: 'Schedule', icon: '📅' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
    { path: '/billing', label: 'Billing', icon: '💰' },
    { path: '/engagement', label: 'Engagement', icon: '📊' },
    { path: '/admin', label: 'Analytics', icon: '📈' },
  ],
  admin: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'All Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/messages', label: 'Messages', icon: '💬' },
    { path: '/appointments', label: 'Appointments', icon: '📅' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
    { path: '/billing', label: 'Billing', icon: '💰' },
    { path: '/engagement', label: 'Engagement', icon: '📊' },
    { path: '/admin', label: 'Admin', icon: '⚙️' },
  ],
  staff: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/messages', label: 'Messages', icon: '💬' },
    { path: '/appointments', label: 'Appointments', icon: '📅' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
  ]
};

export default function Layout({ children, user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Closed by default on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const items = NAV_ITEMS[user?.role] || NAV_ITEMS.patient;

  // Close drawer when navigating on mobile
  const handleNavClick = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — slide-in drawer on mobile, fixed on desktop */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        w-64 bg-dark-900 border-r border-dark-700 flex flex-col
        transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <Link to="/dashboard" onClick={handleNavClick} className="flex flex-col items-start min-w-0">
            <img src={mskLogo} alt="ImagingMind" className="h-24 w-auto object-contain drop-shadow-lg flex-shrink-0" />
            <div className="min-w-0 -mt-4">
              <h1 className="text-base font-bold text-white leading-tight">ImagingMind</h1>
              <p className="text-xs text-dark-400 truncate">AI Diagnostics</p>
            </div>
          </Link>
          {/* Close button on mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-dark-400 hover:text-white p-2"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {items.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-all duration-200
                  ${active
                    ? 'bg-msk-600/20 text-msk-400 border-l-2 border-msk-500'
                    : 'text-dark-300 hover:text-white hover:bg-dark-800'}`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-dark-700">
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-dark-400 capitalize">{user?.role}</p>
          </div>
          <Link to="/settings/mfa" onClick={handleNavClick} className="block text-sm text-dark-400 hover:text-msk-400 transition-colors mb-2">
            {user?.mfaEnabled ? '🔐 MFA Enabled' : '🔓 Setup MFA'}
          </Link>
          <button onClick={onLogout} className="w-full text-left text-sm text-dark-400 hover:text-red-400 transition-colors">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-dark-950 min-w-0">
        {/* Top bar with hamburger on mobile */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-white p-2 -ml-2"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {/* Mobile logo center */}
          <Link to="/dashboard" className="lg:hidden flex items-center gap-2">
            <img src={mskLogo} alt="MSK" className="h-9 w-auto object-contain" />
          </Link>
          <NotificationBell />
        </div>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

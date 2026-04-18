import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e2cb1b50b9a3263ab4677c.png';
import NotificationBell from './NotificationBell';

const NAV_ITEMS = {
  patient: [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/cases', label: 'My Cases' },
    { path: '/cases/new', label: 'New Case' },
    { path: '/messages', label: 'Messages' },
    { path: '/appointments', label: 'Appointments' },
    { path: '/consultations', label: 'Video Consults' },
    { path: '/proms', label: 'Assessments' },
    { path: '/rehab', label: 'My Exercises' },
    { path: '/rpm', label: 'Monitoring' },
    { path: '/reports', label: 'Reports' },
  ],
  radiologist: [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/cases', label: 'Case Queue' },
    { path: '/cases/new', label: 'New Case' },
    { path: '/patients/register', label: 'Register Patient' },
    { path: '/messages', label: 'Messages' },
    { path: '/appointments', label: 'Schedule' },
    { path: '/consultations', label: 'Video Consults' },
    { path: '/reports', label: 'Reports' },
    { path: '/billing', label: 'Billing' },
    { path: '/engagement', label: 'Engagement' },
    { path: '/admin', label: 'Analytics' },
  ],
  admin: [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/cases', label: 'All Cases' },
    { path: '/cases/new', label: 'New Case' },
    { path: '/patients/register', label: 'Register Patient' },
    { path: '/messages', label: 'Messages' },
    { path: '/appointments', label: 'Appointments' },
    { path: '/consultations', label: 'Video Consults' },
    { path: '/reports', label: 'Reports' },
    { path: '/billing', label: 'Billing' },
    { path: '/engagement', label: 'Engagement' },
    { path: '/admin', label: 'Admin' },
  ],
  staff: [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/cases', label: 'Cases' },
    { path: '/cases/new', label: 'New Case' },
    { path: '/patients/register', label: 'Register Patient' },
    { path: '/messages', label: 'Messages' },
    { path: '/appointments', label: 'Appointments' },
    { path: '/consultations', label: 'Video Consults' },
    { path: '/reports', label: 'Reports' },
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
          <Link to="/dashboard" onClick={handleNavClick} className="min-w-0">
            <img src={mskLogo} alt="ImagingMind AI Diagnostics" className="h-32 w-auto object-contain drop-shadow-lg" />
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
            {user?.mfaEnabled ? 'MFA Enabled' : 'Setup MFA'}
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
            <img src={mskLogo} alt="ImagingMind" className="h-24 w-auto object-contain" />
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

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = {
  patient: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'My Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
  ],
  radiologist: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'Case Queue', icon: '📋' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
    { path: '/admin', label: 'Analytics', icon: '📈' },
  ],
  admin: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'All Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
    { path: '/admin', label: 'Admin', icon: '⚙️' },
  ],
  staff: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'Cases', icon: '📋' },
    { path: '/cases/new', label: 'New Case', icon: '➕' },
    { path: '/consultations', label: 'Video Consults', icon: '📹' },
    { path: '/reports', label: 'Reports', icon: '📄' },
  ]
};

export default function Layout({ children, user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const items = NAV_ITEMS[user?.role] || NAV_ITEMS.patient;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-dark-900 border-r border-dark-700 flex flex-col transition-all duration-300`}>
        {/* Logo */}
        <div className="p-4 border-b border-dark-700">
          <Link to="/dashboard" className="flex items-center gap-4">
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="MSK Intelligence" className="w-20 h-20 rounded-lg shadow-lg object-contain" />
            {sidebarOpen && (
              <div className="ml-1">
                <h1 className="text-lg font-bold text-white leading-tight">MSK Intel</h1>
                <p className="text-xs text-dark-400">Diagnostics Platform</p>
              </div>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {items.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-all duration-200
                  ${active
                    ? 'bg-msk-600/20 text-msk-400 border-l-2 border-msk-500'
                    : 'text-dark-300 hover:text-white hover:bg-dark-800'}`}
              >
                <span className="text-lg">{item.icon}</span>
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-dark-700">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-dark-400 capitalize">{user?.role}</p>
            </div>
          )}
          <button onClick={onLogout} className="w-full text-left text-sm text-dark-400 hover:text-red-400 transition-colors">
            {sidebarOpen ? 'Sign Out' : '🚪'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-dark-950">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

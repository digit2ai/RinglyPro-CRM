import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { auth } from './api';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/admin/Dashboard';
import AdminCohorts from './pages/admin/Cohorts';
import AdminFellows from './pages/admin/Fellows';
import AdminMentors from './pages/admin/Mentors';
import AdminSponsors from './pages/admin/Sponsors';
import AdminApplications from './pages/admin/Applications';
import AdminEvents from './pages/admin/Events';
import AdminBadges from './pages/admin/Badges';
import AdminOpportunities from './pages/admin/Opportunities';
import AdminLina from './pages/admin/Lina';
import FellowDashboard from './pages/fellow/Dashboard';
import MentorDashboard from './pages/mentor/Dashboard';
import SponsorDashboard from './pages/sponsor/Dashboard';

function ProtectedRoute({ children, roles }) {
  const user = auth.getUser();
  if (!user || !auth.getToken()) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function Sidebar({ user }) {
  const location = useLocation();
  const isActive = (path) => location.pathname.startsWith(path) ? 'active' : '';

  if (user?.role === 'admin') {
    return (
      <aside className="w-64 min-h-screen bg-navy-dark/50 border-r border-white/5 p-4 flex flex-col">
        <div className="mb-8">
          <Link to="/" className="text-teal-neon font-bold text-lg tracking-wider">VISIONARIUM</Link>
          <div className="text-white/40 text-xs mt-1">Admin Console</div>
        </div>
        <nav className="flex-1 space-y-1">
          <Link to="/admin" className={`sidebar-link ${isActive('/admin') && location.pathname === '/admin' ? 'active' : ''}`}>Dashboard</Link>
          <Link to="/admin/cohorts" className={`sidebar-link ${isActive('/admin/cohorts')}`}>Cohorts</Link>
          <Link to="/admin/applications" className={`sidebar-link ${isActive('/admin/applications')}`}>Applications</Link>
          <Link to="/admin/fellows" className={`sidebar-link ${isActive('/admin/fellows')}`}>Fellows</Link>
          <Link to="/admin/mentors" className={`sidebar-link ${isActive('/admin/mentors')}`}>Mentors</Link>
          <Link to="/admin/sponsors" className={`sidebar-link ${isActive('/admin/sponsors')}`}>Sponsors</Link>
          <Link to="/admin/events" className={`sidebar-link ${isActive('/admin/events')}`}>Events</Link>
          <Link to="/admin/badges" className={`sidebar-link ${isActive('/admin/badges')}`}>Badges</Link>
          <Link to="/admin/opportunities" className={`sidebar-link ${isActive('/admin/opportunities')}`}>Marketplace</Link>
          <Link to="/admin/lina" className={`sidebar-link ${isActive('/admin/lina')}`}>Lina AI</Link>
        </nav>
        <button onClick={() => auth.logout()} className="sidebar-link text-coral mt-4">Logout</button>
      </aside>
    );
  }
  return null;
}

export default function App() {
  const [user, setUser] = useState(auth.getUser());
  const [lang, setLang] = useState(localStorage.getItem('visionarium_lang') || 'en');

  const toggleLang = () => {
    const next = lang === 'en' ? 'es' : 'en';
    setLang(next);
    localStorage.setItem('visionarium_lang', next);
  };

  const handleLogin = (userData) => setUser(userData);

  const showSidebar = user && ['admin'].includes(user.role);

  return (
    <div className="flex min-h-screen">
      {showSidebar && <Sidebar user={user} />}
      <main className={`flex-1 ${showSidebar ? '' : ''}`}>
        {/* Top bar */}
        {user && (
          <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-navy-dark/30">
            <div className="text-white/60 text-sm">
              {user.first_name || user.contact_name || 'User'} ({user.role})
            </div>
            <div className="flex items-center gap-4">
              <button onClick={toggleLang} className="text-xs font-bold text-gold border border-gold rounded-full px-3 py-1 hover:bg-gold/10">{lang.toUpperCase()}</button>
              <button onClick={() => auth.logout()} className="text-xs text-white/40 hover:text-coral">Logout</button>
            </div>
          </header>
        )}
        <Routes>
          <Route path="/" element={user ? <Navigate to={`/${user.role === 'community' ? 'fellow' : user.role}`} /> : <Landing lang={lang} toggleLang={toggleLang} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register lang={lang} />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/cohorts" element={<ProtectedRoute roles={['admin']}><AdminCohorts /></ProtectedRoute>} />
          <Route path="/admin/fellows" element={<ProtectedRoute roles={['admin']}><AdminFellows /></ProtectedRoute>} />
          <Route path="/admin/mentors" element={<ProtectedRoute roles={['admin']}><AdminMentors /></ProtectedRoute>} />
          <Route path="/admin/sponsors" element={<ProtectedRoute roles={['admin']}><AdminSponsors /></ProtectedRoute>} />
          <Route path="/admin/applications" element={<ProtectedRoute roles={['admin']}><AdminApplications /></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute roles={['admin']}><AdminEvents /></ProtectedRoute>} />
          <Route path="/admin/badges" element={<ProtectedRoute roles={['admin']}><AdminBadges /></ProtectedRoute>} />
          <Route path="/admin/opportunities" element={<ProtectedRoute roles={['admin']}><AdminOpportunities /></ProtectedRoute>} />
          <Route path="/admin/lina" element={<ProtectedRoute roles={['admin']}><AdminLina /></ProtectedRoute>} />

          {/* Fellow */}
          <Route path="/fellow" element={<ProtectedRoute roles={['fellow', 'community']}><FellowDashboard /></ProtectedRoute>} />

          {/* Mentor */}
          <Route path="/mentor" element={<ProtectedRoute roles={['mentor']}><MentorDashboard /></ProtectedRoute>} />

          {/* Sponsor */}
          <Route path="/sponsor" element={<ProtectedRoute roles={['sponsor']}><SponsorDashboard /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

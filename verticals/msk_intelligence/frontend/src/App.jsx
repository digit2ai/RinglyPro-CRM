import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api from './services/api';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CaseList from './pages/CaseList';
import CaseDetail from './pages/CaseDetail';
import NewCase from './pages/NewCase';
import Reports from './pages/Reports';
import AdminDashboard from './pages/AdminDashboard';
import Layout from './components/Layout';

function ProtectedRoute({ children, allowedRoles }) {
  const user = api.getUser();
  if (!api.isAuthenticated() || !user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(api.getUser());

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
  };

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login onLogin={handleLogin} />} />
      <Route path="/register" element={<Register onLogin={handleLogin} />} />

      <Route path="/*" element={
        <ProtectedRoute>
          <Layout user={user} onLogout={handleLogout}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/cases/new" element={<NewCase />} />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

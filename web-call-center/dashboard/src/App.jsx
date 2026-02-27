import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CallsPage } from './pages/CallsPage';
import { WidgetPage } from './pages/WidgetPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { UsagePage } from './pages/UsagePage';

function App() {
  const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html?redirect=/webcallcenter/';
      return;
    }

    // Decode JWT to check it has a clientId and isn't expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.clientId || (payload.exp && payload.exp * 1000 < Date.now())) {
        localStorage.removeItem('token');
        window.location.href = '/login.html?redirect=/webcallcenter/';
        return;
      }
      setIsAuthenticated(true);
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/login.html?redirect=/webcallcenter/';
    }
  }, []);

  // Show nothing while checking auth (prevents flash of dashboard)
  if (isAuthenticated === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter basename={basename}>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/widget" element={<WidgetPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

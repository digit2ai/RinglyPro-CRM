import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CallsPage } from './pages/CallsPage';
import { WidgetPage } from './pages/WidgetPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { UsagePage } from './pages/UsagePage';

function App() {
  // Get base path from Vite config (removes trailing slash if present)
  const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

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

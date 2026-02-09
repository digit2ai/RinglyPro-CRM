import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { StoreDetailPage } from './pages/StoreDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { TasksPage } from './pages/TasksPage';

function App() {
  // Get base path from Vite config (removes trailing slash if present)
  const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

  return (
    <BrowserRouter basename={basename}>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/stores/:id" element={<StoreDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

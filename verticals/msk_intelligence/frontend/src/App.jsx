import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import VoiceIntake from './pages/VoiceIntake';
import VideoRoom from './pages/VideoRoom';
import Consultations from './pages/Consultations';
import MFASetup from './pages/MFASetup';
import Messaging from './pages/Messaging';
import ScheduleAppointment from './pages/ScheduleAppointment';
import MyAppointments from './pages/MyAppointments';
import PROMs from './pages/PROMs';
import Billing from './pages/Billing';
import EngagementDashboard from './pages/EngagementDashboard';
import MyRehab from './pages/MyRehab';
import CreateHEP from './pages/CreateHEP';
import RPMDashboard from './pages/RPMDashboard';
import RegisterPatient from './pages/RegisterPatient';
import PACSSettings from './pages/PACSSettings';
import ReferringProviders from './pages/ReferringProviders';
import TeleradiologyQueue from './pages/TeleradiologyQueue';
import NotFound from './pages/NotFound';
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
      <Route path="/voice" element={<VoiceIntake />} />
      <Route path="/video/:meetingId" element={
        <ProtectedRoute>
          <VideoRoom />
        </ProtectedRoute>
      } />

      <Route path="/*" element={
        <ProtectedRoute>
          <Layout user={user} onLogout={handleLogout}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/cases/new" element={<NewCase />} />
              <Route path="/patients/register" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist', 'staff']}>
                  <RegisterPatient />
                </ProtectedRoute>
              } />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/consultations" element={<Consultations />} />
              <Route path="/messages" element={<Messaging />} />
              <Route path="/messages/:caseId" element={<Messaging />} />
              <Route path="/appointments" element={<MyAppointments />} />
              <Route path="/appointments/schedule" element={<ScheduleAppointment />} />
              <Route path="/proms" element={<PROMs />} />
              <Route path="/rehab" element={<MyRehab />} />
              <Route path="/rehab/create" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist', 'staff']}>
                  <CreateHEP />
                </ProtectedRoute>
              } />
              <Route path="/rpm" element={<RPMDashboard />} />
              <Route path="/pacs-settings" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist']}>
                  <PACSSettings />
                </ProtectedRoute>
              } />
              <Route path="/referring-providers" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist', 'staff']}>
                  <ReferringProviders />
                </ProtectedRoute>
              } />
              <Route path="/teleradiology" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist']}>
                  <TeleradiologyQueue />
                </ProtectedRoute>
              } />
              <Route path="/settings/mfa" element={<MFASetup />} />
              <Route path="/billing" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist', 'staff']}>
                  <Billing />
                </ProtectedRoute>
              } />
              <Route path="/engagement" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist']}>
                  <EngagementDashboard />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin', 'radiologist']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

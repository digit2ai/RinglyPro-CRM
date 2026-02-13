import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

// Pages
import HomePage from './pages/HomePage';
import StorePage from './pages/StorePage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import SchedulePage from './pages/SchedulePage';
import SponsorsPage from './pages/SponsorsPage';
import SponsorshipPage from './pages/SponsorshipPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboard from './pages/AdminDashboard';
import FansPage from './pages/FansPage';
import SponsorLoginPage from './pages/SponsorLoginPage';
import SponsorForgotPasswordPage from './pages/SponsorForgotPasswordPage';
import SponsorResetPasswordPage from './pages/SponsorResetPasswordPage';
import SponsorDashboard from './pages/SponsorDashboard';
import FanLoginPage from './pages/FanLoginPage';
import FanForgotPasswordPage from './pages/FanForgotPasswordPage';
import FanResetPasswordPage from './pages/FanResetPasswordPage';
import FanDashboard from './pages/FanDashboard';
import PressLoginPage from './pages/PressLoginPage';
import PressRequestAccessPage from './pages/PressRequestAccessPage';
import PressForgotPasswordPage from './pages/PressForgotPasswordPage';
import PressResetPasswordPage from './pages/PressResetPasswordPage';
import PressPortalPage from './pages/PressPortalPage';
import PressMediaPostPage from './pages/PressMediaPostPage';
import PressAdminPage from './pages/PressAdminPage';

function App() {
  return (
    <BrowserRouter basename="/tunjoracing">
      <Routes>
        {/* Public Pages */}
        <Route path="/" element={<HomePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/partners" element={<SponsorsPage />} />
        <Route path="/sponsorship" element={<SponsorshipPage />} />

        {/* Store Pages */}
        <Route path="/store" element={<StorePage />} />
        <Route path="/store/product/:slug" element={<ProductPage />} />
        <Route path="/store/cart" element={<CartPage />} />
        <Route path="/store/order/success" element={<CheckoutSuccessPage />} />

        {/* Sponsor Portal */}
        <Route path="/sponsor/login" element={<SponsorLoginPage />} />
        <Route path="/sponsor/forgot-password" element={<SponsorForgotPasswordPage />} />
        <Route path="/sponsor/reset-password" element={<SponsorResetPasswordPage />} />
        <Route path="/sponsor/dashboard" element={<SponsorDashboard />} />

        {/* Fan Portal */}
        <Route path="/fan/login" element={<FanLoginPage />} />
        <Route path="/fan/forgot-password" element={<FanForgotPasswordPage />} />
        <Route path="/fan/reset-password" element={<FanResetPasswordPage />} />
        <Route path="/fan/dashboard" element={<FanDashboard />} />

        {/* Press & Media Portal */}
        <Route path="/press/login" element={<PressLoginPage />} />
        <Route path="/press/request-access" element={<PressRequestAccessPage />} />
        <Route path="/press/forgot-password" element={<PressForgotPasswordPage />} />
        <Route path="/press/reset-password" element={<PressResetPasswordPage />} />
        <Route path="/press/portal" element={<PressPortalPage />} />
        <Route path="/press/media/:slug" element={<PressMediaPostPage />} />

        {/* Admin Portal */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/fans" element={<FansPage />} />
        <Route path="/admin/press" element={<PressAdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

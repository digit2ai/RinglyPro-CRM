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
import SponsorLoginPage from './pages/SponsorLoginPage';
import SponsorDashboard from './pages/SponsorDashboard';

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
        <Route path="/sponsor/dashboard" element={<SponsorDashboard />} />

        {/* Admin Portal */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

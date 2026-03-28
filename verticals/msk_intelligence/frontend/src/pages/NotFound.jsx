import React from 'react';
import { Link } from 'react-router-dom';
import mskLogo from '../assets/msk-logo.png';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <img src={mskLogo} alt="MSK Intelligence" className="w-24 h-24 rounded-xl shadow-lg object-contain mx-auto mb-6" />
        <h1 className="text-6xl font-bold text-msk-400 mb-4">404</h1>
        <h2 className="text-xl font-bold text-white mb-2">Page Not Found</h2>
        <p className="text-dark-400 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/dashboard" className="btn-primary inline-block">Return to Dashboard</Link>
      </div>
    </div>
  );
}

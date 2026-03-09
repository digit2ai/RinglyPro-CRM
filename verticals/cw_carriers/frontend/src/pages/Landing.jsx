import React from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../services/auth';

const BASE = '/cw_carriers';

export default function Landing() {
  const navigate = useNavigate();

  // If already logged in, go to dashboard
  if (isAuthenticated()) {
    navigate(`${BASE}/dashboard`, { replace: true });
    return null;
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        {/* RinglyPro Logo */}
        <div style={s.ringlyProSection}>
          <img
            src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6884f40a6d2fd3fed0b84613.png"
            alt="RinglyPro"
            style={s.ringlyProLogo}
          />
          <div style={s.poweredBy}>Powered by RinglyPro AI</div>
        </div>

        {/* Divider */}
        <div style={s.divider} />

        {/* CW Carriers Logo + Branding */}
        <div style={s.cwSection}>
          <img
            src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png"
            alt="CW Carriers"
            style={s.cwLogo}
          />
          <h1 style={s.title}>CW CARRIERS</h1>
          <p style={s.subtitle}>USA, Inc. — Logistics CRM</p>
          <p style={s.desc}>
            Full-Stack AI + HubSpot Integration Platform
          </p>
        </div>

        {/* Login Button */}
        <button
          onClick={() => navigate(`${BASE}/login`)}
          style={s.loginBtn}
        >
          Login to CRM Dashboard
        </button>

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerText}>Voice AI &middot; MCP Layer &middot; HubSpot Sync &middot; Analytics</span>
          <span style={s.footerText}>Digit2AI LLC / RinglyPro</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: '#0D1117',
  },
  card: {
    background: '#161B22',
    border: '1px solid #21262D',
    borderRadius: 16,
    padding: '48px 48px 36px',
    width: 480,
    maxWidth: '92vw',
    textAlign: 'center',
  },
  ringlyProSection: {
    marginBottom: 24,
  },
  ringlyProLogo: {
    height: 48,
    width: 'auto',
    marginBottom: 8,
  },
  poweredBy: {
    fontSize: 12,
    color: '#8B949E',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, #30363D, transparent)',
    margin: '20px 0',
  },
  cwSection: {
    marginBottom: 32,
  },
  cwLogo: {
    width: 120,
    height: 'auto',
    marginBottom: 12,
    borderRadius: 8,
  },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 42,
    color: '#C8962A',
    letterSpacing: 3,
    lineHeight: 1,
  },
  subtitle: {
    fontSize: 15,
    color: '#8B949E',
    marginTop: 4,
  },
  desc: {
    fontSize: 13,
    color: '#58A6FF',
    marginTop: 12,
    fontWeight: 500,
  },
  loginBtn: {
    width: '100%',
    padding: '14px 24px',
    background: '#1A4FA8',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: '#484F58',
  },
};

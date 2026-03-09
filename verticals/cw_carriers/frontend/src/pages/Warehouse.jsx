import React, { useState } from 'react';

export default function Warehouse() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', url: '/logistics/' },
    { id: 'oee', label: 'OEE Tracking', url: '/logistics/oee-dashboard' },
    { id: 'guide', label: 'User Guide', url: '/logistics/user-guide' },
  ];

  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>WAREHOUSE ANALYTICS</h2>
          <div style={s.subtitle}>Powered by Logistics &mdash; Inventory, Orders, OEE &amp; Equipment Intelligence</div>
        </div>
        <a href="/logistics/" target="_blank" rel="noopener noreferrer" style={s.openBtn}>
          Open Full App &rarr;
        </a>
      </div>

      <div style={s.tabBar}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{ ...s.tab, ...(activeTab === t.id ? s.tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={s.features}>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\uD83D\uDCE6'}</div>
          <div style={s.featureTitle}>Inventory & SKU</div>
          <div style={s.featureDesc}>Upload item master, track stock levels, ABC classification</div>
        </div>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\uD83D\uDCCA'}</div>
          <div style={s.featureTitle}>Order Analytics</div>
          <div style={s.featureDesc}>Throughput patterns, order structure, time-series analysis</div>
        </div>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\u2699\uFE0F'}</div>
          <div style={s.featureTitle}>OEE Monitoring</div>
          <div style={s.featureDesc}>Machine availability, performance, quality — real-time tracking</div>
        </div>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\uD83D\uDCC4'}</div>
          <div style={s.featureTitle}>PDF Reports</div>
          <div style={s.featureDesc}>Generate comprehensive warehouse analysis reports on demand</div>
        </div>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\uD83D\uDD17'}</div>
          <div style={s.featureTitle}>Production API</div>
          <div style={s.featureDesc}>REST API with key auth for live data ingest from WMS / PLC</div>
        </div>
        <div style={s.featureCard}>
          <div style={s.featureIcon}>{'\uD83C\uDF99\uFE0F'}</div>
          <div style={s.featureTitle}>Voice AI Briefing</div>
          <div style={s.featureDesc}>Ask Rachel for spoken warehouse KPI summaries</div>
        </div>
      </div>

      <div style={s.iframeWrap}>
        <iframe
          key={activeTab}
          src={currentTab.url}
          style={s.iframe}
          title={`Logistics - ${currentTab.label}`}
          allow="microphone"
        />
      </div>
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, color: '#C8962A' },
  subtitle: { fontSize: 13, color: '#8B949E', marginTop: 4 },
  openBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: { padding: '8px 16px', background: '#21262D', border: 'none', borderRadius: 6, color: '#8B949E', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#1A4FA8', color: '#fff' },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 },
  featureCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: 14, textAlign: 'center' },
  featureIcon: { fontSize: 22, marginBottom: 6 },
  featureTitle: { fontSize: 13, fontWeight: 600, color: '#E6EDF3', marginBottom: 4 },
  featureDesc: { fontSize: 11, color: '#8B949E', lineHeight: 1.4 },
  iframeWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'hidden' },
  iframe: { width: '100%', height: 'calc(100vh - 340px)', minHeight: 500, border: 'none', background: '#0D1117' },
};

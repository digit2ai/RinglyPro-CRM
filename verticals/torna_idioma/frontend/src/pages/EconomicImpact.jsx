import React, { useState, useEffect } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Economic Impact', sub: 'Measuring the economic returns of Spanish language education in Makati City.', liveTitle: 'Live Impact Dashboard', totalPlaced: 'BPO Placements', annualIncome: 'Annual Income Increase', avgIncrease: 'Avg Salary Increase', taxRevenue: 'Est. Tax Revenue', keyMetrics: 'Key Economic Indicators', metric1Title: 'BPO Salary Premium', metric1: 'Spanish-speaking agents earn 25-40% more than English-only counterparts, creating a measurable income uplift for every program graduate.', metric2Title: 'Employment Pipeline', metric2: 'The Torna Idioma program creates a direct pipeline from education to employment, with partner BPO companies offering preferential hiring.', metric3Title: 'Economic Multiplier', metric3: 'Every ₱1 invested in Spanish education generates an estimated ₱4.50 in economic returns through higher wages, tax revenue, and consumer spending.', metric4Title: 'International Trade', metric4: 'Spanish proficiency opens trade corridors to 20+ Spanish-speaking countries, benefiting Makati\'s export and services sectors.', projTitle: 'Projected Impact (5-Year)', proj1: '10,000 Spanish-proficient workers', proj2: '₱2.1B annual salary increase across BPO sector', proj3: '₱315M additional tax revenue for Makati', proj4: 'First Spanish-enabled city in Asia', proj5: '45+ international partnerships', noData: 'Economic impact data will appear as the program grows.' },
  es: { title: 'Impacto Económico', sub: 'Midiendo los retornos económicos de la educación en español en Makati.', liveTitle: 'Panel de Impacto en Vivo', totalPlaced: 'Colocaciones BPO', annualIncome: 'Aumento Anual de Ingresos', avgIncrease: 'Aumento Salarial Prom.', taxRevenue: 'Ingresos Fiscales Est.', keyMetrics: 'Indicadores Económicos Clave', metric1Title: 'Prima Salarial BPO', metric1: 'Los agentes hispanohablantes ganan 25-40% más, creando un aumento medible para cada graduado.', metric2Title: 'Pipeline de Empleo', metric2: 'El programa crea un pipeline directo de educación a empleo con empresas BPO asociadas.', metric3Title: 'Multiplicador Económico', metric3: 'Cada ₱1 invertido genera ₱4.50 en retornos económicos.', metric4Title: 'Comercio Internacional', metric4: 'El español abre corredores comerciales a 20+ países hispanohablantes.', projTitle: 'Impacto Proyectado (5 Años)', proj1: '10,000 trabajadores competentes en español', proj2: '₱2.1B aumento salarial anual en BPO', proj3: '₱315M ingresos fiscales adicionales para Makati', proj4: 'Primera ciudad hispanohablante de Asia', proj5: '45+ alianzas internacionales', noData: 'Los datos aparecerán a medida que crezca el programa.' },
  fil: { title: 'Epekto sa Ekonomiya', sub: 'Sinusukat ang mga ekonomikong benepisyo ng edukasyon sa Espanyol sa Makati.', liveTitle: 'Live Impact Dashboard', totalPlaced: 'Mga BPO Placement', annualIncome: 'Taunang Pagtaas ng Kita', avgIncrease: 'Ave. Pagtaas ng Sahod', taxRevenue: 'Est. Kita sa Buwis', keyMetrics: 'Mga Pangunahing Tagapagpahiwatig', metric1Title: 'BPO Salary Premium', metric1: 'Kumikita ng 25-40% higit pa ang mga nagsasalita ng Espanyol sa BPO.', metric2Title: 'Employment Pipeline', metric2: 'Direktang pipeline mula edukasyon hanggang trabaho.', metric3Title: 'Economic Multiplier', metric3: 'Bawat ₱1 na investment ay nagbubunga ng ₱4.50 sa returns.', metric4Title: 'International Trade', metric4: 'Binubuksan ng Espanyol ang kalakalan sa 20+ bansa.', projTitle: 'Projected Impact (5 Taon)', proj1: '10,000 Spanish-proficient workers', proj2: '₱2.1B taunang pagtaas ng sahod sa BPO', proj3: '₱315M karagdagang buwis para sa Makati', proj4: 'Unang Spanish-enabled city sa Asia', proj5: '45+ international partnerships', noData: 'Lalabas ang data habang lumalaki ang programa.' },
};

export default function EconomicImpact() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/economic-impact').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  const live = data?.live_impact || {};
  const fmtPHP = (v) => v ? `₱${Math.round(v).toLocaleString()}` : '₱0';

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Live impact */}
        <h2 style={s.sectionTitle}>{L.liveTitle}</h2>
        <div style={s.liveGrid}>
          {[
            { val: live.total_placed || 0, label: L.totalPlaced, color: '#1B2A4A' },
            { val: fmtPHP(live.annual_income_increase_php), label: L.annualIncome, color: '#10B981' },
            { val: live.avg_salary_increase_pct ? `+${Math.round(live.avg_salary_increase_pct)}%` : '—', label: L.avgIncrease, color: '#C9A84C' },
            { val: fmtPHP(live.estimated_tax_revenue_php), label: L.taxRevenue, color: '#8B6914' },
          ].map((k, i) => (
            <div key={i} style={{ ...s.liveCard, borderBottomColor: k.color }}>
              <div style={{ ...s.liveVal, color: k.color }}>{k.val}</div>
              <div style={s.liveLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Key metrics */}
        <h2 style={s.sectionTitle}>{L.keyMetrics}</h2>
        <div style={s.metricGrid}>
          {[
            { icon: '💰', title: L.metric1Title, desc: L.metric1 },
            { icon: '🔗', title: L.metric2Title, desc: L.metric2 },
            { icon: '📊', title: L.metric3Title, desc: L.metric3 },
            { icon: '🌍', title: L.metric4Title, desc: L.metric4 },
          ].map((m, i) => (
            <div key={i} style={s.metricCard}>
              <div style={s.metricIcon}>{m.icon}</div>
              <h3 style={s.metricTitle}>{m.title}</h3>
              <p style={s.metricDesc}>{m.desc}</p>
            </div>
          ))}
        </div>

        {/* 5-year projection */}
        <div style={s.projSection}>
          <h2 style={s.sectionTitle}>{L.projTitle}</h2>
          <div style={s.projList}>
            {[L.proj1, L.proj2, L.proj3, L.proj4, L.proj5].map((p, i) => (
              <div key={i} style={s.projItem}>
                <div style={s.projBullet}>{i + 1}</div>
                <span style={s.projText}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic' },
  body: { padding: '24px 32px 48px', maxWidth: 1000 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  liveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 36 },
  liveCard: { background: '#fff', padding: '24px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  liveVal: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, marginBottom: 4 },
  liveLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 36 },
  metricCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '3px solid #C9A84C' },
  metricIcon: { fontSize: 32, marginBottom: 8 },
  metricTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 8 },
  metricDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 },
  projSection: { background: '#0F1A2E', padding: 32, borderRadius: 12 },
  projList: { display: 'flex', flexDirection: 'column', gap: 16 },
  projItem: { display: 'flex', alignItems: 'center', gap: 16 },
  projBullet: { width: 36, height: 36, borderRadius: '50%', background: '#C9A84C', color: '#0F1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 800, flexShrink: 0 },
  projText: { fontSize: 15, color: '#E8D48B', fontWeight: 500 },
};

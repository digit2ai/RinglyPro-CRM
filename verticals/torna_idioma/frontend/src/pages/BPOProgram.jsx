import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLang } from '../services/auth';
import api from '../services/api';

const BASE = '/Torna_Idioma';

const T = {
  en: { title: 'BPO Training Program', sub: 'Spanish-enabled careers in the Philippines\' BPO industry — higher salaries, better opportunities.', statsTitle: 'Program Impact', companies: 'Partner Companies', positions: 'Spanish Positions', placements: 'Active Placements', avgIncrease: 'Avg Salary Increase', openJobs: 'Open Positions', partnersTitle: 'BPO Partner Companies', hiring: 'Hiring', active: 'Active', viewJobs: 'View Open Jobs', noCompanies: 'BPO partner companies coming soon.', positionsLabel: 'positions', salaryIncrease: 'avg salary increase', whyTitle: 'Why Spanish in BPO?', why1Title: 'Higher Salaries', why1: 'Spanish-speaking BPO agents earn 25-40% more than English-only agents in the Philippines.', why2Title: 'Growing Demand', why2: 'Latin American markets are expanding — demand for Spanish-speaking agents grows 15% yearly.', why3Title: 'Career Growth', why3: 'Bilingual agents advance to team lead and QA roles faster, with clearer promotion paths.', why4Title: 'Global Opportunities', why4: 'Spanish opens doors to nearshore centers serving Spain, Mexico, Colombia, Argentina, and more.' },
  es: { title: 'Programa de Entrenamiento BPO', sub: 'Carreras habilitadas en español en la industria BPO de Filipinas.', statsTitle: 'Impacto del Programa', companies: 'Empresas Aliadas', positions: 'Posiciones en Español', placements: 'Colocaciones Activas', avgIncrease: 'Aumento Salarial Prom.', openJobs: 'Vacantes Abiertas', partnersTitle: 'Empresas BPO Aliadas', hiring: 'Contratando', active: 'Activo', viewJobs: 'Ver Vacantes', noCompanies: 'Empresas BPO próximamente.', positionsLabel: 'posiciones', salaryIncrease: 'aumento salarial prom.', whyTitle: '¿Por qué Español en BPO?', why1Title: 'Mejores Salarios', why1: 'Los agentes BPO hispanohablantes ganan 25-40% más que los que solo hablan inglés.', why2Title: 'Demanda Creciente', why2: 'Los mercados latinoamericanos se expanden — la demanda crece 15% anual.', why3Title: 'Crecimiento Profesional', why3: 'Los agentes bilingües avanzan más rápido a roles de liderazgo.', why4Title: 'Oportunidades Globales', why4: 'El español abre puertas a centros que atienden España, México, Colombia y más.' },
  fil: { title: 'BPO Training Program', sub: 'Mga karera na may kakayahang Espanyol sa industriya ng BPO sa Pilipinas.', statsTitle: 'Epekto ng Programa', companies: 'Mga Kumpanyang Kasosyo', positions: 'Mga Posisyon sa Espanyol', placements: 'Aktibong Placements', avgIncrease: 'Ave. na Pagtaas ng Sahod', openJobs: 'Mga Bukas na Posisyon', partnersTitle: 'Mga Kasosyong Kumpanya sa BPO', hiring: 'Nag-hire', active: 'Aktibo', viewJobs: 'Tingnan ang mga Trabaho', noCompanies: 'Mga BPO na kumpanya ay paparating.', positionsLabel: 'posisyon', salaryIncrease: 'avg pagtaas ng sahod', whyTitle: 'Bakit Espanyol sa BPO?', why1Title: 'Mas Mataas na Sahod', why1: 'Ang mga BPO agent na nagsasalita ng Espanyol ay kumikita ng 25-40% higit pa.', why2Title: 'Lumalaking Demand', why2: 'Ang mga merkado ng Latin America ay lumalaki — 15% taon-taon.', why3Title: 'Career Growth', why3: 'Mas mabilis na nag-a-advance ang bilingual agents sa leadership roles.', why4Title: 'Global na Pagkakataon', why4: 'Binubuksan ng Espanyol ang mga pinto sa buong mundo.' },
};

export default function BPOProgram() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const nav = useNavigate();
  const [stats, setStats] = useState({});
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/bpo/stats').then(r => setStats(r.data.stats || {})),
      api.get('/bpo/companies').then(r => setCompanies(r.data.companies || [])),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Why Spanish in BPO */}
        <div style={s.whySection}>
          <h2 style={s.sectionTitle}>{L.whyTitle}</h2>
          <div style={s.whyGrid}>
            {[
              { icon: '💰', title: L.why1Title, desc: L.why1 },
              { icon: '📈', title: L.why2Title, desc: L.why2 },
              { icon: '🚀', title: L.why3Title, desc: L.why3 },
              { icon: '🌍', title: L.why4Title, desc: L.why4 },
            ].map((w, i) => (
              <div key={i} style={s.whyCard}>
                <div style={s.whyIcon}>{w.icon}</div>
                <h3 style={s.whyCardTitle}>{w.title}</h3>
                <p style={s.whyCardDesc}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <h2 style={s.sectionTitle}>{L.statsTitle}</h2>
        <div style={s.statsGrid}>
          {[
            { val: stats.total_companies || 0, label: L.companies, color: '#1B2A4A' },
            { val: stats.total_positions || 0, label: L.positions, color: '#C9A84C' },
            { val: stats.active_placements || 0, label: L.placements, color: '#10B981' },
            { val: stats.avg_salary_increase ? `${Math.round(stats.avg_salary_increase)}%` : '—', label: L.avgIncrease, color: '#8B6914' },
            { val: stats.open_jobs || 0, label: L.openJobs, color: '#C41E3A' },
          ].map((k, i) => (
            <div key={i} style={{ ...s.statCard, borderBottomColor: k.color }}>
              <div style={{ ...s.statVal, color: k.color }}>{k.val}</div>
              <div style={s.statLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Companies */}
        <h2 style={s.sectionTitle}>{L.partnersTitle}</h2>
        {companies.length === 0 ? (
          <div style={s.empty}>{L.noCompanies}</div>
        ) : (
          <div style={s.companyGrid}>
            {companies.map(c => (
              <div key={c.id} style={s.companyCard}>
                <div style={s.companyTop}>
                  <h3 style={s.companyName}>{c.name}</h3>
                  <span style={{ ...s.statusBadge, background: c.partnership_status === 'hiring' ? '#C41E3A' : '#10B981' }}>
                    {c.partnership_status === 'hiring' ? L.hiring : L.active}
                  </span>
                </div>
                <div style={s.companyIndustry}>{c.industry}</div>
                <div style={s.companyStats}>
                  <span>{c.spanish_positions} {L.positionsLabel}</span>
                  {c.avg_salary_increase && <span>+{c.avg_salary_increase}% {L.salaryIncrease}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div style={s.ctaBox}>
          <button onClick={() => nav(`${BASE}/job-board`)} style={s.ctaBtn}>{L.viewJobs} →</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic', maxWidth: 600 },
  body: { padding: '24px 32px 48px', maxWidth: 1000 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  whySection: { marginBottom: 36 },
  whyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  whyCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '3px solid #C9A84C' },
  whyIcon: { fontSize: 32, marginBottom: 8 },
  whyCardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  whyCardDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 36 },
  statCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  statVal: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  companyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 },
  companyCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderLeft: '4px solid #1B2A4A' },
  companyTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  companyName: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A' },
  statusBadge: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' },
  companyIndustry: { fontSize: 12, color: '#6B6B6B', marginBottom: 10 },
  companyStats: { display: 'flex', gap: 16, fontSize: 12, color: '#8B6914', fontWeight: 500 },
  ctaBox: { textAlign: 'center', marginTop: 32 },
  ctaBtn: { padding: '14px 40px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
  empty: { textAlign: 'center', padding: 40, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};

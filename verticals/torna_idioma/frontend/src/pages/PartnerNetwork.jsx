import React, { useState, useEffect } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Partner Network', sub: 'International and local partners supporting the Torna Idioma initiative.', noPartners: 'No partners registered yet.', all: 'All', university: 'University', cultural_center: 'Cultural Center', government: 'Government', ngo: 'NGO', corporate: 'Corporate', filterType: 'Partner Type', filterCountry: 'Country', totalPartners: 'Total Partners', countries: 'Countries', universities: 'Universities', active: 'Active', programs: 'Programs Offered' },
  es: { title: 'Red de Socios', sub: 'Socios internacionales y locales que apoyan la iniciativa Torna Idioma.', noPartners: 'Aún no hay socios registrados.', all: 'Todos', university: 'Universidad', cultural_center: 'Centro Cultural', government: 'Gobierno', ngo: 'ONG', corporate: 'Empresa', filterType: 'Tipo de Socio', filterCountry: 'País', totalPartners: 'Socios Totales', countries: 'Países', universities: 'Universidades', active: 'Activo', programs: 'Programas Ofrecidos' },
  fil: { title: 'Partner Network', sub: 'Mga internasyonal at lokal na partners na sumusuporta sa Torna Idioma.', noPartners: 'Wala pang mga partner.', all: 'Lahat', university: 'Unibersidad', cultural_center: 'Cultural Center', government: 'Gobyerno', ngo: 'NGO', corporate: 'Korporasyon', filterType: 'Uri ng Partner', filterCountry: 'Bansa', totalPartners: 'Kabuuang Partners', countries: 'Mga Bansa', universities: 'Mga Unibersidad', active: 'Aktibo', programs: 'Mga Programang Inaalok' },
};

const typeColors = { university: '#1B2A4A', cultural_center: '#C41E3A', government: '#10B981', ngo: '#8B6914', corporate: '#2A3F6A' };

export default function PartnerNetwork() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [partners, setPartners] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/partners').then(r => setPartners(r.data.partners || [])).finally(() => setLoading(false));
  }, []);

  const filtered = partners.filter(p => typeFilter === 'all' || p.partner_type === typeFilter);
  const countries = [...new Set(partners.map(p => p.country))];
  const universities = partners.filter(p => p.partner_type === 'university').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Summary */}
        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <div style={s.summaryVal}>{partners.length}</div>
            <div style={s.summaryLabel}>{L.totalPartners}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={{ ...s.summaryVal, color: '#C9A84C' }}>{countries.length}</div>
            <div style={s.summaryLabel}>{L.countries}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={{ ...s.summaryVal, color: '#10B981' }}>{universities}</div>
            <div style={s.summaryLabel}>{L.universities}</div>
          </div>
        </div>

        {/* Filter */}
        <div style={s.filterRow}>
          <span style={s.filterLabel}>{L.filterType}</span>
          {['all','university','cultural_center','government','ngo','corporate'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ ...s.filterBtn, ...(typeFilter === t ? s.filterActive : {}) }}>{L[t] || t}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>{L.noPartners}</div>
        ) : (
          <div style={s.partnerGrid}>
            {filtered.map(p => (
              <div key={p.id} style={s.partnerCard}>
                <div style={s.partnerTop}>
                  <span style={s.flag}>{p.country_flag || '🌍'}</span>
                  <span style={{ ...s.partnerType, color: typeColors[p.partner_type] || '#6B6B6B' }}>{L[p.partner_type] || p.partner_type}</span>
                </div>
                <h3 style={s.partnerName}>{p.name}</h3>
                <div style={s.partnerCountry}>{p.country}</div>
                {p.description_en && <p style={s.partnerDesc}>{p[`description_${lang}`] || p.description_en}</p>}
                {p.programs_offered && Array.isArray(p.programs_offered) && p.programs_offered.length > 0 && (
                  <div style={s.programsRow}>
                    {p.programs_offered.map((prog, i) => (
                      <span key={i} style={s.programTag}>{prog}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* World map placeholder — country list */}
        <div style={s.countrySection}>
          <h2 style={s.sectionTitle}>{L.countries} ({countries.length})</h2>
          <div style={s.countryList}>
            {countries.map(c => {
              const cPartners = partners.filter(p => p.country === c);
              const flag = cPartners[0]?.country_flag || '🌍';
              return (
                <div key={c} style={s.countryItem}>
                  <span style={s.countryFlag}>{flag}</span>
                  <span style={s.countryName}>{c}</span>
                  <span style={s.countryCount}>{cPartners.length}</span>
                </div>
              );
            })}
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
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 },
  summaryCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #1B2A4A' },
  summaryVal: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, color: '#1B2A4A', marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  filterRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', background: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B6B6B' },
  filterActive: { background: '#1B2A4A', color: '#C9A84C', borderColor: '#1B2A4A' },
  partnerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 36 },
  partnerCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #C9A84C' },
  partnerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  flag: { fontSize: 32 },
  partnerType: { fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  partnerName: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 4 },
  partnerCountry: { fontSize: 12, color: '#8B6914', marginBottom: 8 },
  partnerDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 8 },
  programsRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  programTag: { fontSize: 10, padding: '2px 8px', background: '#F5E6C8', borderRadius: 10, color: '#8B6914', fontWeight: 500 },
  countrySection: { marginTop: 16 },
  countryList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 },
  countryItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  countryFlag: { fontSize: 24 },
  countryName: { flex: 1, fontSize: 14, fontWeight: 600, color: '#1B2A4A' },
  countryCount: { fontSize: 14, fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display',serif" },
  empty: { textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};

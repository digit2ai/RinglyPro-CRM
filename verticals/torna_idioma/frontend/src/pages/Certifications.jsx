import React, { useState, useEffect } from 'react';
import { getLang, getUser } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Certifications', sub: 'Track your Spanish language certifications — DELE, BPO, and course completions.', noCerts: 'No certifications yet. Complete courses to earn your first certification!', type: 'Type', level: 'Level', course: 'Course', score: 'Score', issued: 'Issued', status: 'Status', active: 'Active', expired: 'Expired', dele: 'DELE Certification', bpo: 'BPO Spanish Certification', completion: 'Course Completion', deleLevels: 'DELE Proficiency Levels', deleDesc: 'The Diplomas de Español como Lengua Extranjera (DELE) are official titles certifying competence and command of Spanish, granted by Instituto Cervantes.' },
  es: { title: 'Certificaciones', sub: 'Rastrea tus certificaciones de español — DELE, BPO y finalización de cursos.', noCerts: '¡Aún no tienes certificaciones! Completa cursos para obtener tu primera.', type: 'Tipo', level: 'Nivel', course: 'Curso', score: 'Puntaje', issued: 'Emitido', status: 'Estado', active: 'Activo', expired: 'Expirado', dele: 'Certificación DELE', bpo: 'Certificación BPO Español', completion: 'Finalización de Curso', deleLevels: 'Niveles de Competencia DELE', deleDesc: 'Los Diplomas de Español como Lengua Extranjera (DELE) son títulos oficiales que certifican la competencia en español, otorgados por el Instituto Cervantes.' },
  fil: { title: 'Mga Sertipikasyon', sub: 'I-track ang iyong mga sertipikasyon sa Espanyol — DELE, BPO, at pagkumpleto ng kurso.', noCerts: 'Wala pang sertipikasyon. Kumpletuhin ang mga kurso para makamit ang una!', type: 'Uri', level: 'Antas', course: 'Kurso', score: 'Iskor', issued: 'Inisyu', status: 'Katayuan', active: 'Aktibo', expired: 'Nag-expire', dele: 'DELE Sertipikasyon', bpo: 'BPO Espanyol Sertipikasyon', completion: 'Pagkumpleto ng Kurso', deleLevels: 'Mga Antas ng DELE', deleDesc: 'Ang DELE ay mga opisyal na titulo na nagsesertipikar ng kahusayan sa Espanyol, ibinibigay ng Instituto Cervantes.' },
};

const deleLevels = [
  { level: 'A1', name: 'Acceso', desc: 'Basic user — can handle simple, everyday interactions' },
  { level: 'A2', name: 'Plataforma', desc: 'Basic user — can understand frequently used expressions' },
  { level: 'B1', name: 'Umbral', desc: 'Independent user — can deal with most travel/work situations' },
  { level: 'B2', name: 'Avanzado', desc: 'Independent user — can interact fluently with native speakers' },
  { level: 'C1', name: 'Dominio Operativo', desc: 'Proficient user — can use language flexibly for professional purposes' },
  { level: 'C2', name: 'Maestría', desc: 'Proficient user — near-native command of the language' },
];

const certTypeColors = { dele: '#C41E3A', bpo_cert: '#C9A84C', course_completion: '#10B981' };
const certTypeLabels = { dele: 'dele', bpo_cert: 'bpo', course_completion: 'completion' };

export default function Certifications() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/courses/my/certifications').then(r => setCerts(r.data.certifications || [])).finally(() => setLoading(false));
  }, []);

  const t = (obj, field) => obj?.[`${field}_${lang}`] || obj?.[`${field}_en`] || '';

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* DELE Reference */}
        <div style={s.deleSection}>
          <h2 style={s.sectionTitle}>{L.deleLevels}</h2>
          <p style={s.deleDesc}>{L.deleDesc}</p>
          <div style={s.deleGrid}>
            {deleLevels.map(d => (
              <div key={d.level} style={s.deleCard}>
                <div style={s.deleLevel}>{d.level}</div>
                <div style={s.deleName}>{d.name}</div>
                <div style={s.deleCardDesc}>{d.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* User's certifications */}
        <h2 style={s.sectionTitle}>{L.title}</h2>
        {certs.length === 0 ? (
          <div style={s.empty}>{L.noCerts}</div>
        ) : (
          <div style={s.certList}>
            {certs.map(c => (
              <div key={c.id} style={{ ...s.certCard, borderLeftColor: certTypeColors[c.cert_type] || '#C9A84C' }}>
                <div style={s.certTop}>
                  <div>
                    <div style={{ ...s.certType, color: certTypeColors[c.cert_type] || '#C9A84C' }}>{L[certTypeLabels[c.cert_type]] || c.cert_type}</div>
                    <div style={s.certName}>{c.cert_level ? `${c.cert_level} — ` : ''}{t(c, 'course_title') || c.cert_type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {c.score && <div style={s.certScore}>{L.score}: {c.score}%</div>}
                    <div style={{ ...s.certStatus, color: c.status === 'active' ? '#10B981' : '#C41E3A' }}>{c.status === 'active' ? L.active : L.expired}</div>
                  </div>
                </div>
                <div style={s.certMeta}>
                  <span>{L.issued}: {new Date(c.issued_at).toLocaleDateString()}</span>
                  {c.expires_at && <span>Expires: {new Date(c.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic' },
  body: { padding: '24px 32px 48px', maxWidth: 900 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  deleSection: { marginBottom: 40 },
  deleDesc: { fontSize: 14, color: '#6B6B6B', lineHeight: 1.7, marginBottom: 20, maxWidth: 700 },
  deleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  deleCard: { background: '#fff', padding: '16px 14px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '3px solid #C41E3A' },
  deleLevel: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#C41E3A', marginBottom: 2 },
  deleName: { fontSize: 13, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  deleCardDesc: { fontSize: 11, color: '#6B6B6B', lineHeight: 1.5 },
  certList: { display: 'flex', flexDirection: 'column', gap: 12 },
  certCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #C9A84C' },
  certTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 16, flexWrap: 'wrap' },
  certType: { fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  certName: { fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 600, color: '#1B2A4A' },
  certScore: { fontSize: 14, fontWeight: 700, color: '#C9A84C' },
  certStatus: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, marginTop: 4 },
  certMeta: { display: 'flex', gap: 20, fontSize: 12, color: '#6B6B6B' },
  empty: { textAlign: 'center', padding: 40, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};

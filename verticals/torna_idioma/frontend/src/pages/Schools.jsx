import React, { useState, useEffect } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'School Management', sub: 'Participating schools in the Torna Idioma Spanish education program.', noSchools: 'No schools registered yet.', totalStudents: 'Total Students', enrolled: 'Enrolled', status: 'Status', pilot: 'Pilot', active: 'Active', expanding: 'Expanding', completed: 'Completed', barangay: 'Barangay', principal: 'Principal', contact: 'Contact', type: 'Type', public: 'Public', private: 'Private', filterStatus: 'Status' },
  es: { title: 'Gestión de Escuelas', sub: 'Escuelas participantes en el programa de educación en español Torna Idioma.', noSchools: 'Aún no hay escuelas registradas.', totalStudents: 'Total Estudiantes', enrolled: 'Inscritos', status: 'Estado', pilot: 'Piloto', active: 'Activo', expanding: 'Expandiendo', completed: 'Completado', barangay: 'Barangay', principal: 'Director', contact: 'Contacto', type: 'Tipo', public: 'Pública', private: 'Privada', filterStatus: 'Estado' },
  fil: { title: 'Pamamahala ng Paaralan', sub: 'Mga kalahok na paaralan sa programa ng edukasyon sa Espanyol ng Torna Idioma.', noSchools: 'Wala pang naka-register na paaralan.', totalStudents: 'Kabuuang Estudyante', enrolled: 'Na-enroll', status: 'Katayuan', pilot: 'Pilot', active: 'Aktibo', expanding: 'Lumalawak', completed: 'Nakumpleto', barangay: 'Barangay', principal: 'Punong-guro', contact: 'Kontak', type: 'Uri', public: 'Pampubliko', private: 'Pribado', filterStatus: 'Katayuan' },
};

const statusColors = { pilot: '#C9A84C', active: '#10B981', expanding: '#2A3F6A', completed: '#6B6B6B' };

export default function Schools() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [schools, setSchools] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/schools').then(r => setSchools(r.data.schools || [])).finally(() => setLoading(false));
  }, []);

  const filtered = schools.filter(s => statusFilter === 'all' || s.program_status === statusFilter);
  const totalStudents = schools.reduce((sum, s) => sum + (s.total_students || 0), 0);
  const totalEnrolled = schools.reduce((sum, s) => sum + (s.enrolled_students || 0), 0);

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
            <div style={s.summaryVal}>{schools.length}</div>
            <div style={s.summaryLabel}>{L.title}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={{ ...s.summaryVal, color: '#C9A84C' }}>{totalStudents.toLocaleString()}</div>
            <div style={s.summaryLabel}>{L.totalStudents}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={{ ...s.summaryVal, color: '#10B981' }}>{totalEnrolled.toLocaleString()}</div>
            <div style={s.summaryLabel}>{L.enrolled}</div>
          </div>
        </div>

        {/* Filter */}
        <div style={s.filterRow}>
          <span style={s.filterLabel}>{L.filterStatus}</span>
          {['all','pilot','active','expanding','completed'].map(st => (
            <button key={st} onClick={() => setStatusFilter(st)} style={{ ...s.filterBtn, ...(statusFilter === st ? s.filterActive : {}) }}>{st === 'all' ? 'All' : L[st]}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>{L.noSchools}</div>
        ) : (
          <div style={s.schoolList}>
            {filtered.map(sch => (
              <div key={sch.id} style={s.schoolCard}>
                <div style={s.schoolTop}>
                  <div>
                    <h3 style={s.schoolName}>{sch.name}</h3>
                    <div style={s.schoolMeta}>
                      <span style={{ ...s.typeBadge, background: sch.school_type === 'private' ? '#8B6914' : '#2A3F6A' }}>{L[sch.school_type] || sch.school_type}</span>
                      {sch.barangay && <span>📍 {sch.barangay}</span>}
                    </div>
                  </div>
                  <span style={{ ...s.statusBadge, background: statusColors[sch.program_status] || '#6B6B6B' }}>{L[sch.program_status] || sch.program_status}</span>
                </div>
                <div style={s.schoolStats}>
                  <div style={s.schoolStat}>
                    <div style={s.schoolStatVal}>{sch.total_students || 0}</div>
                    <div style={s.schoolStatLabel}>{L.totalStudents}</div>
                  </div>
                  <div style={s.schoolStat}>
                    <div style={{ ...s.schoolStatVal, color: '#10B981' }}>{sch.enrolled_students || 0}</div>
                    <div style={s.schoolStatLabel}>{L.enrolled}</div>
                  </div>
                  <div style={s.schoolStat}>
                    <div style={s.schoolStatVal}>{sch.total_students > 0 ? Math.round((sch.enrolled_students / sch.total_students) * 100) : 0}%</div>
                    <div style={s.schoolStatLabel}>Rate</div>
                  </div>
                </div>
                {(sch.principal_name || sch.contact_email) && (
                  <div style={s.contactRow}>
                    {sch.principal_name && <span>{L.principal}: {sch.principal_name}</span>}
                    {sch.contact_email && <span>{sch.contact_email}</span>}
                  </div>
                )}
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
  body: { padding: '24px 32px 48px', maxWidth: 1000 },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 },
  summaryCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #1B2A4A' },
  summaryVal: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, color: '#1B2A4A', marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  filterRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', background: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B6B6B' },
  filterActive: { background: '#1B2A4A', color: '#C9A84C', borderColor: '#1B2A4A' },
  schoolList: { display: 'flex', flexDirection: 'column', gap: 16 },
  schoolCard: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderLeft: '4px solid #2A3F6A' },
  schoolTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  schoolName: { fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  schoolMeta: { display: 'flex', gap: 12, fontSize: 12, color: '#6B6B6B', alignItems: 'center' },
  typeBadge: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '2px 10px', borderRadius: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  statusBadge: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '3px 12px', borderRadius: 12, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  schoolStats: { display: 'flex', gap: 24, marginBottom: 12 },
  schoolStat: { textAlign: 'center' },
  schoolStatVal: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: '#1B2A4A' },
  schoolStatLabel: { fontSize: 10, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  contactRow: { display: 'flex', gap: 16, fontSize: 12, color: '#8B6914' },
  empty: { textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};

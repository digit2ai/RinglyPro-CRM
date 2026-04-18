import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { community, events as eventsApi } from '../api';

const t = {
  en: {
    tagline: 'Leadership \u00b7 Creativity \u00b7 Global',
    subtitle: 'A bilingual AI-powered fellowship preparing Latin America\'s next generation for global impact.',
    register: 'Register Now',
    login: 'Login',
    stats: 'Community Stats',
    members: 'Community Members',
    countries: 'Countries',
    fellows: 'Fellows',
    events: 'Upcoming Events',
    noEvents: 'No upcoming events',
    cta: 'Join the founding class. Applications for Cohort 1 open Q3 2026.',
    powered: 'Powered by Digit2ai'
  },
  es: {
    tagline: 'Liderazgo \u00b7 Creatividad \u00b7 Global',
    subtitle: 'Una fellowship biling\u00fce impulsada por IA que prepara a la pr\u00f3xima generaci\u00f3n de Am\u00e9rica Latina para el impacto global.',
    register: 'Reg\u00edstrate Ahora',
    login: 'Iniciar Sesi\u00f3n',
    stats: 'Estad\u00edsticas de la Comunidad',
    members: 'Miembros',
    countries: 'Pa\u00edses',
    fellows: 'Fellows',
    events: 'Pr\u00f3ximos Eventos',
    noEvents: 'No hay eventos pr\u00f3ximos',
    cta: '\u00danete a la clase fundadora. Aplicaciones para la Cohorte 1 abren en Q3 2026.',
    powered: 'Impulsado por Digit2ai'
  }
};

export default function Landing({ lang, toggleLang }) {
  const [stats, setStats] = useState(null);
  const [evts, setEvts] = useState([]);
  const s = t[lang] || t.en;

  useEffect(() => {
    community.stats().then(d => setStats(d.stats)).catch(() => {});
    eventsApi.pub().then(d => setEvts(d.events || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-blk via-navy to-navy-light" />
        <div className="absolute inset-0 opacity-10" style={{backgroundImage:'linear-gradient(rgba(61,203,202,0.08) 1px, transparent 1px),linear-gradient(90deg, rgba(61,203,202,0.08) 1px, transparent 1px)',backgroundSize:'64px 64px'}} />
        <div className="relative z-10 max-w-3xl">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-32 mx-auto mb-6" />
          <div className="text-gold font-sans text-sm tracking-[0.3em] uppercase mb-6">{s.tagline}</div>
          <p className="text-white/80 text-lg font-serif mb-8 leading-relaxed">{s.subtitle}</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/register" className="btn-primary">{s.register}</Link>
            <Link to="/login" className="btn-secondary">{s.login}</Link>
          </div>
          <button onClick={toggleLang} className="mt-6 text-xs font-bold text-gold border border-gold rounded-full px-4 py-1 hover:bg-gold/10">{lang === 'en' ? 'ES' : 'EN'}</button>
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-xl font-bold text-white mb-8 text-center tracking-wider uppercase">{s.stats}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="stat-card"><div className="stat-value">{stats.total_community_members}</div><div className="stat-label">{s.members}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.countries_represented}</div><div className="stat-label">{s.countries}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.current_fellows}</div><div className="stat-label">{s.fellows}</div></div>
          </div>
        </section>
      )}

      {/* Events */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-xl font-bold text-white mb-8 text-center tracking-wider uppercase">{s.events}</h2>
        {evts.length === 0 ? (
          <p className="text-center text-white/40">{s.noEvents}</p>
        ) : (
          <div className="space-y-4">
            {evts.map(e => (
              <div key={e.id} className="glass-card flex justify-between items-center">
                <div>
                  <div className="font-semibold text-white">{lang === 'es' ? e.title_es : e.title_en}</div>
                  <div className="text-white/50 text-sm">{e.type} -- {e.format} {e.city ? `-- ${e.city}` : ''}</div>
                </div>
                <div className="text-teal-neon text-sm font-mono">{e.start_datetime ? new Date(e.start_datetime).toLocaleDateString() : 'TBD'}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="text-center py-20 px-6">
        <p className="text-white/60 font-serif text-lg max-w-2xl mx-auto mb-8">{s.cta}</p>
        <Link to="/register" className="btn-primary">{s.register}</Link>
      </section>

      <footer className="text-center py-8 border-t border-white/5 text-white/30 text-xs tracking-wider uppercase">
        Visionarium Foundation -- Est. 2015, New York -- Miami, Florida -- 2026 -- {s.powered}
      </footer>
    </div>
  );
}

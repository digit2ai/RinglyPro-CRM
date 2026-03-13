import React, { useState, useEffect } from 'react';

const BASE = '/torna-idioma';

const T = {
  en: {
    overline: 'The Return of the Cultural Language',
    h1a: 'Makati — The First', h1b: 'Spanish-Enabled City in Asia',
    subtitle: 'A Cultural, Educational & Economic Movement',
    desc: 'A bold, visionary initiative that reconnects Makati — and the Philippines — to a heritage that shaped our identity, our history, and our place in the world.',
    cta: 'Explore the Vision',
    pillar: 'Pillar', dignity: 'Dignity', pride: 'Pride', prize: 'Prize',
    missionOverline: 'Our Purpose', missionTitle: 'Mission & Vision',
    missionSub: 'Empowering Filipino youth through Spanish proficiency — restoring legacy while opening doors to the global economy.',
    missionLabel: 'Mission', visionLabel: 'Vision',
    missionH: 'Empowerment Through Language',
    missionP: 'Torna Idioma empowers Filipino youth through competence in Spanish — restoring dignity, pride, and legacy (Vida, Cultura, Legado) while opening opportunities in the era of artificial intelligence, digital industries, and global careers.',
    visionH: "Asia's First Spanish-Enabled Nation",
    visionP: "To establish the Philippines as Asia's first Spanish-enabled nation, where heritage becomes strength and students achieve prosperity through language, innovation, and international competitiveness.",
    whyOverline: 'The Opportunity', whyTitle: 'Why Spanish? Why Now?',
    whySub: 'Spanish is not foreign to us. It is a Filipino language — the language of Rizal, Bonifacio, Aguinaldo, and the Malolos Constitution.',
    pillarsOverline: 'Foundation', pillarsTitle: 'The Three Pillars',
    pillarsSub: 'TORNA IDIOMA is built on three pillars that unite cultural heritage with economic opportunity.',
    dignityDesc: 'Reclaiming a language that belongs to the Filipino soul. A language that was never foreign — only forgotten. The language of our heroes, our constitution, and our identity.',
    prideDesc: 'Restoring our identity as a Hispanic-Asian nation, connected to 650 million people across the world. Celebrating our place in the broader Hispanic community.',
    prizeDesc: 'Unlocking global careers, higher salaries, and international partnerships. The economic reward of embracing our cultural language — projected at ₱3.6B–₱8.2B over three years.',
    impactOverline: 'The Prize', impactTitle: 'Economic Impact for Makati',
    impactSub: "If just 10% of Makati's BPO workforce becomes Spanish-proficient, the economic returns are transformative.",
    stat1v: '₱960M–₱1.8B', stat1l: 'Annual Resident Income Increase',
    stat2v: '₱150M–₱300M', stat2l: 'Annual City Tax Revenue Increase',
    stat3v: '₱2B–₱5B', stat3l: 'Foreign Investment Over 5 Years',
    stat4v: '₱200M–₱400M', stat4l: 'Annual Tourism Revenue Increase',
    roiTitle: 'Return on Investment', roiValue: '10x – 20x',
    roiNote: 'Annual investment: ₱60M–₱100M • 3-year projected impact: ₱3.6B–₱8.2B',
    loginCta: 'Access the Platform',
    joinOverline: 'Join the Movement',
    joinTitle: 'Be Part of History',
    joinDesc: 'Whether you are a student, teacher, BPO professional, or government official — Torna Idioma has a place for you.',
    navMission: 'Mission', navPillars: 'Pillars', navImpact: 'Impact', navJoin: 'Join',
  },
  es: {
    overline: 'El Retorno del Idioma Cultural',
    h1a: 'Makati — La Primera', h1b: 'Ciudad Hispanohablante de Asia',
    subtitle: 'Un Movimiento Cultural, Educativo y Económico',
    desc: 'Una iniciativa audaz y visionaria que reconecta a Makati — y a Filipinas — con una herencia que forjó nuestra identidad, nuestra historia y nuestro lugar en el mundo.',
    cta: 'Explorar la Visión',
    pillar: 'Pilar', dignity: 'Dignidad', pride: 'Orgullo', prize: 'Premio',
    missionOverline: 'Nuestro Propósito', missionTitle: 'Misión y Visión',
    missionSub: 'Empoderando a la juventud filipina mediante la competencia en español — restaurando el legado mientras abrimos puertas a la economía global.',
    missionLabel: 'Misión', visionLabel: 'Visión',
    missionH: 'Empoderamiento a Través del Idioma',
    missionP: 'Torna Idioma empodera a la juventud filipina mediante la competencia en español — restaurando dignidad, orgullo y legado (Vida, Cultura, Legado) mientras abre oportunidades en la era de la inteligencia artificial.',
    visionH: 'La Primera Nación Hispanohablante de Asia',
    visionP: 'Establecer a Filipinas como la primera nación hispanohablante de Asia, donde la herencia se convierte en fortaleza.',
    whyOverline: 'La Oportunidad', whyTitle: '¿Por qué Español? ¿Por qué Ahora?',
    whySub: 'El español no es ajeno a nosotros. Es un idioma filipino — el idioma de Rizal, Bonifacio, Aguinaldo y la Constitución de Malolos.',
    pillarsOverline: 'Fundamento', pillarsTitle: 'Los Tres Pilares',
    pillarsSub: 'TORNA IDIOMA se construye sobre tres pilares que unen el patrimonio cultural con la oportunidad económica.',
    dignityDesc: 'Reclamando un idioma que pertenece al alma filipina. Un idioma que nunca fue extranjero — solo olvidado.',
    prideDesc: 'Restaurando nuestra identidad como nación hispano-asiática, conectada con 650 millones de personas en todo el mundo.',
    prizeDesc: 'Desbloqueando carreras globales, salarios más altos y alianzas internacionales — proyectado en ₱3.6B–₱8.2B en tres años.',
    impactOverline: 'El Premio', impactTitle: 'Impacto Económico para Makati',
    impactSub: 'Si solo el 10% de la fuerza laboral de BPO de Makati logra competencia en español, los retornos económicos son transformadores.',
    stat1v: '₱960M–₱1.8B', stat1l: 'Aumento Anual de Ingresos',
    stat2v: '₱150M–₱300M', stat2l: 'Aumento de Ingresos Fiscales',
    stat3v: '₱2B–₱5B', stat3l: 'Inversión Extranjera en 5 Años',
    stat4v: '₱200M–₱400M', stat4l: 'Aumento de Ingresos por Turismo',
    roiTitle: 'Retorno de Inversión', roiValue: '10x – 20x',
    roiNote: 'Inversión anual: ₱60M–₱100M • Impacto a 3 años: ₱3.6B–₱8.2B',
    loginCta: 'Acceder a la Plataforma',
    joinOverline: 'Únete al Movimiento',
    joinTitle: 'Sé Parte de la Historia',
    joinDesc: 'Ya seas estudiante, profesor, profesional de BPO o funcionario gubernamental — Torna Idioma tiene un lugar para ti.',
    navMission: 'Misión', navPillars: 'Pilares', navImpact: 'Impacto', navJoin: 'Únete',
  },
  fil: {
    overline: 'Ang Pagbabalik ng Kultural na Wika',
    h1a: 'Makati — Ang Unang', h1b: 'Lungsod na May Espanyol sa Asya',
    subtitle: 'Isang Kilusang Kultural, Pang-edukasyon at Pang-ekonomiya',
    desc: 'Isang matapang na inisyatiba na muling ikinokonekta ang Makati — at ang Pilipinas — sa pamanang humubog sa ating pagkakakilanlan.',
    cta: 'Tuklasin ang Bisyon',
    pillar: 'Haligi', dignity: 'Dignidad', pride: 'Pagmamalaki', prize: 'Gantimpala',
    missionOverline: 'Ang Aming Layunin', missionTitle: 'Misyon at Bisyon',
    missionSub: 'Pagpapalakas sa kabataang Pilipino sa pamamagitan ng kahusayan sa Espanyol.',
    missionLabel: 'Misyon', visionLabel: 'Bisyon',
    missionH: 'Pagpapalakas sa Pamamagitan ng Wika',
    missionP: 'Pinapalakas ng Torna Idioma ang kabataang Pilipino sa pamamagitan ng kahusayan sa Espanyol — ibinabalik ang dignidad, pagmamalaki, at pamana.',
    visionH: 'Unang Bansang May Espanyol sa Asya',
    visionP: 'Itatag ang Pilipinas bilang unang bansang may kakayahang Espanyol sa Asya.',
    whyOverline: 'Ang Oportunidad', whyTitle: 'Bakit Espanyol? Bakit Ngayon?',
    whySub: 'Hindi dayuhan sa atin ang Espanyol. Ito ay isang wikang Pilipino — ang wika ni Rizal, Bonifacio, Aguinaldo.',
    pillarsOverline: 'Pundasyon', pillarsTitle: 'Ang Tatlong Haligi',
    pillarsSub: 'Ang TORNA IDIOMA ay itinayo sa tatlong haligi na nag-uugnay ng kultural na pamana sa oportunidad.',
    dignityDesc: 'Pagbawi ng isang wikang pag-aari ng kaluluwa ng Pilipino. Isang wikang hindi kailanman dayuhan — nakalimutan lamang.',
    prideDesc: 'Pagpapanumbalik ng ating pagkakakilanlan bilang Hispanic-Asian na bansa, konektado sa 650 milyong tao.',
    prizeDesc: 'Pagbubukas ng pandaigdigang karera, mas mataas na sahod — inaasahang ₱3.6B–₱8.2B sa loob ng tatlong taon.',
    impactOverline: 'Ang Gantimpala', impactTitle: 'Epektong Pang-ekonomiya para sa Makati',
    impactSub: 'Kung 10% lamang ng mga manggagawa sa BPO ng Makati ay magkaroon ng kahusayan sa Espanyol.',
    stat1v: '₱960M–₱1.8B', stat1l: 'Taunang Pagtaas ng Kita',
    stat2v: '₱150M–₱300M', stat2l: 'Taunang Pagtaas ng Buwis',
    stat3v: '₱2B–₱5B', stat3l: 'Dayuhang Pamumuhunan sa 5 Taon',
    stat4v: '₱200M–₱400M', stat4l: 'Taunang Pagtaas ng Turismo',
    roiTitle: 'Balik ng Pamumuhunan', roiValue: '10x – 20x',
    roiNote: 'Taunang pamumuhunan: ₱60M–₱100M • 3-taong epekto: ₱3.6B–₱8.2B',
    loginCta: 'I-access ang Platform',
    joinOverline: 'Sumali sa Kilusan',
    joinTitle: 'Maging Bahagi ng Kasaysayan',
    joinDesc: 'Estudyante, guro, propesyonal sa BPO, o opisyal ng gobyerno — may lugar para sa iyo ang Torna Idioma.',
    navMission: 'Misyon', navPillars: 'Mga Haligi', navImpact: 'Epekto', navJoin: 'Sumali',
  },
};

const whyCards = [
  { icon: '650M', en: 'Global Speakers', es: 'Hablantes Globales', fil: 'Pandaigdigang Nagsasalita' },
  { icon: '#3', en: 'Internet Language', es: 'Idioma de Internet', fil: 'Wika sa Internet' },
  { icon: '250+', en: 'Years of Heritage', es: 'Años de Herencia', fil: 'Taon ng Pamana' },
  { icon: '20-40%', en: 'Higher Salaries', es: 'Salarios Más Altos', fil: 'Mas Mataas na Sahod' },
  { icon: '80K+', en: 'Businesses in Makati', es: 'Negocios en Makati', fil: 'Negosyo sa Makati' },
  { icon: 'AI', en: 'Future-Ready', es: 'Listo para el Futuro', fil: 'Handa sa Kinabukasan' },
];

export default function Landing() {
  const [lang, setLang] = useState(localStorage.getItem('ti_lang') || 'en');
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const L = T[lang] || T.en;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const switchLang = (l) => { localStorage.setItem('ti_lang', l); setLang(l); };

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={{ ...s.nav, ...(scrolled ? s.navScrolled : {}) }}>
        <div style={s.navInner}>
          <a href={`${BASE}/`} style={s.navBrand}>
            <span style={s.navBrandText}>TORNA IDIOMA</span>
            <span style={s.navBrandSub}>Vida · Cultura · Legado</span>
          </a>
          <div style={s.navLinks}>
            <a href="#mission" style={s.navLink}>{L.navMission}</a>
            <a href="#pillars" style={s.navLink}>{L.navPillars}</a>
            <a href="#impact" style={s.navLink}>{L.navImpact}</a>
            <a href="#join" style={s.navLink}>{L.navJoin}</a>
            <a href={`${BASE}/login`} style={s.navCTA}>{L.loginCta}</a>
            <div style={s.langSwitcher}>
              {['en','es','fil'].map(l => (
                <button key={l} onClick={() => switchLang(l)} style={{ ...s.langBtn, ...(lang === l ? s.langBtnActive : {}) }}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setMobileMenu(!mobileMenu)} style={s.hamburger}>
            <span style={s.hLine}/><span style={s.hLine}/><span style={s.hLine}/>
          </button>
        </div>
        {mobileMenu && (
          <div style={s.mobileMenu}>
            <a href="#mission" style={s.mobileLink} onClick={() => setMobileMenu(false)}>{L.navMission}</a>
            <a href="#pillars" style={s.mobileLink} onClick={() => setMobileMenu(false)}>{L.navPillars}</a>
            <a href="#impact" style={s.mobileLink} onClick={() => setMobileMenu(false)}>{L.navImpact}</a>
            <a href={`${BASE}/login`} style={s.mobileCTA}>{L.loginCta}</a>
            <div style={{ ...s.langSwitcher, justifyContent: 'center', marginTop: 8 }}>
              {['en','es','fil'].map(l => (
                <button key={l} onClick={() => switchLang(l)} style={{ ...s.langBtn, ...(lang === l ? s.langBtnActive : {}) }}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroPattern}/>
        <div style={s.heroContent}>
          <div style={s.crest}><div style={s.crestInner}>TORNA<br/>IDIOMA<span style={s.crestSub}>Vida · Cultura · Legado</span></div></div>
          <div style={s.heroOverline}>{L.overline}</div>
          <h1 style={s.heroH1}>{L.h1a}<br/><span style={s.heroAccent}>{L.h1b}</span></h1>
          <div style={s.heroSubtitle}>{L.subtitle}</div>
          <div style={s.heroDivider}/>
          <div style={s.heroPillars}>
            {[['I', L.dignity],['II', L.pride],['III', L.prize]].map(([n, v]) => (
              <div key={n} style={s.heroPillar}>
                <div style={s.heroPillarLabel}>{L.pillar} {n}</div>
                <div style={s.heroPillarValue}>{v}</div>
              </div>
            ))}
          </div>
          <p style={s.heroDesc}>{L.desc}</p>
          <a href="#mission" style={s.heroCta}>{L.cta} ↓</a>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" style={s.missionSection}>
        <div style={s.container}>
          <div style={s.overline}>{L.missionOverline}</div>
          <h2 style={s.sectionTitle}>{L.missionTitle}</h2>
          <p style={s.sectionSub}>{L.missionSub}</p>
          <div style={s.missionGrid}>
            <div style={s.missionCard}>
              <span style={s.missionLabel}>{L.missionLabel}</span>
              <h3 style={s.missionH}>{L.missionH}</h3>
              <p style={s.missionP}>{L.missionP}</p>
            </div>
            <div style={s.missionCard}>
              <span style={s.missionLabel}>{L.visionLabel}</span>
              <h3 style={s.missionH}>{L.visionH}</h3>
              <p style={s.missionP}>{L.visionP}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Spanish */}
      <section style={s.whySection}>
        <div style={s.container}>
          <div style={s.overline}>{L.whyOverline}</div>
          <h2 style={s.sectionTitle}>{L.whyTitle}</h2>
          <p style={s.sectionSub}>{L.whySub}</p>
          <div style={s.whyGrid}>
            {whyCards.map((c, i) => (
              <div key={i} style={s.whyCard}>
                <div style={s.whyIcon}>{c.icon}</div>
                <h4 style={s.whyH}>{c[lang] || c.en}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" style={s.pillarsSection}>
        <div style={s.container}>
          <div style={{ ...s.overline, color: '#E8D48B' }}>{L.pillarsOverline}</div>
          <h2 style={{ ...s.sectionTitle, color: '#fff' }}>{L.pillarsTitle}</h2>
          <p style={{ ...s.sectionSub, color: 'rgba(255,255,255,0.65)' }}>{L.pillarsSub}</p>
          <div style={s.pillarsGrid}>
            {[['I', L.dignity, L.dignityDesc],['II', L.pride, L.prideDesc],['III', L.prize, L.prizeDesc]].map(([n, title, desc]) => (
              <div key={n} style={s.pillarCard}>
                <div style={s.pillarNum}>{n}</div>
                <h4 style={s.pillarTitle}>{title}</h4>
                <p style={s.pillarDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Economic Impact */}
      <section id="impact" style={s.impactSection}>
        <div style={s.container}>
          <div style={s.overline}>{L.impactOverline}</div>
          <h2 style={s.sectionTitle}>{L.impactTitle}</h2>
          <p style={s.sectionSub}>{L.impactSub}</p>
          <div style={s.statsGrid}>
            {[[L.stat1v,L.stat1l],[L.stat2v,L.stat2l],[L.stat3v,L.stat3l],[L.stat4v,L.stat4l]].map(([v,l], i) => (
              <div key={i} style={s.statCard}>
                <div style={s.statValue}>{v}</div>
                <div style={s.statLabel}>{l}</div>
              </div>
            ))}
          </div>
          <div style={s.roiBanner}>
            <h3 style={s.roiTitle}>{L.roiTitle}</h3>
            <div style={s.roiValue}>{L.roiValue}</div>
            <div style={s.roiNote}>{L.roiNote}</div>
          </div>
        </div>
      </section>

      {/* Join CTA */}
      <section id="join" style={s.ctaSection}>
        <div style={s.container}>
          <div style={{ ...s.overline, color: '#0F1A2E' }}>{L.joinOverline}</div>
          <h2 style={{ ...s.sectionTitle, color: '#0F1A2E' }}>{L.joinTitle}</h2>
          <p style={{ fontSize: 16, color: '#1B2A4A', maxWidth: 600, margin: '0 auto 32px', opacity: 0.85, lineHeight: 1.7 }}>{L.joinDesc}</p>
          <a href={`${BASE}/login`} style={s.ctaBtn}>{L.loginCta} →</a>
        </div>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <div style={s.footerBrand}>TORNA IDIOMA</div>
        <div style={s.footerMotto}>Vida · Cultura · Legado</div>
        <div style={s.footerLinks}>
          <a href="/Torna_Idioma/" style={s.footerLink}>Original Website</a>
          <a href={`${BASE}/login`} style={s.footerLink}>Platform Login</a>
          <a href="https://ringlypro.com" style={s.footerLink}>Powered by Digit2AI</a>
        </div>
        <div style={s.footerCopy}>© {new Date().getFullYear()} Torna Idioma · Makati, Philippines</div>
      </footer>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#fff', lineHeight: 1.7, overflowX: 'hidden' },
  nav: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, background: 'rgba(15,26,46,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(201,168,76,0.3)', transition: 'all 0.3s' },
  navScrolled: { background: 'rgba(15,26,46,0.98)', boxShadow: '0 4px 30px rgba(0,0,0,0.3)' },
  navInner: { maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 },
  navBrand: { textDecoration: 'none', display: 'flex', flexDirection: 'column' },
  navBrandText: { fontFamily: "'Playfair Display',serif", fontSize: '1.3rem', fontWeight: 700, color: '#C9A84C', letterSpacing: 2 },
  navBrandSub: { fontSize: '.65rem', color: '#E8D48B', letterSpacing: 3, opacity: 0.8 },
  navLinks: { display: 'flex', gap: 24, alignItems: 'center' },
  navLink: { color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '.85rem', fontWeight: 500 },
  navCTA: { padding: '8px 20px', background: 'linear-gradient(135deg,#C9A84C,#8B6914)', color: '#0F1A2E', textDecoration: 'none', borderRadius: 4, fontSize: '.85rem', fontWeight: 700, letterSpacing: 1 },
  langSwitcher: { display: 'flex', gap: 4 },
  langBtn: { padding: '4px 10px', border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '.75rem', fontWeight: 600, letterSpacing: 1, cursor: 'pointer', borderRadius: 3 },
  langBtnActive: { background: '#C9A84C', color: '#0F1A2E', borderColor: '#C9A84C' },
  hamburger: { display: 'none', flexDirection: 'column', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 8 },
  hLine: { display: 'block', width: 24, height: 2, background: '#C9A84C', borderRadius: 1 },
  mobileMenu: { padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: '#0F1A2E', borderBottom: '1px solid rgba(201,168,76,0.2)' },
  mobileLink: { color: '#fff', textDecoration: 'none', fontSize: 15, padding: '8px 0' },
  mobileCTA: { background: '#C9A84C', color: '#0F1A2E', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '10px 20px', borderRadius: 4, textAlign: 'center', marginTop: 8 },

  hero: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'linear-gradient(135deg,#0F1A2E 0%,#1B2A4A 40%,#2A3F6A 100%)', overflow: 'hidden' },
  heroPattern: { position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 50px,rgba(201,168,76,0.5) 50px,rgba(201,168,76,0.5) 51px)' },
  heroContent: { textAlign: 'center', position: 'relative', zIndex: 2, padding: '120px 24px 80px', maxWidth: 900 },
  crest: { width: 140, height: 140, margin: '0 auto 32px', border: '3px solid #C9A84C', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,168,76,0.08)' },
  crestInner: { fontFamily: "'Playfair Display',serif", fontSize: '1rem', fontWeight: 700, color: '#C9A84C', textAlign: 'center', lineHeight: 1.2, letterSpacing: 2 },
  crestSub: { display: 'block', fontSize: '.6rem', fontStyle: 'italic', fontWeight: 400, color: '#E8D48B', marginTop: 4, letterSpacing: 1 },
  heroOverline: { fontSize: '.8rem', letterSpacing: 6, textTransform: 'uppercase', color: '#C9A84C', marginBottom: 20, fontWeight: 600 },
  heroH1: { fontFamily: "'Playfair Display',serif", fontSize: 'clamp(2.5rem,6vw,4.5rem)', fontWeight: 800, color: '#fff', lineHeight: 1.15, marginBottom: 8 },
  heroAccent: { color: '#C9A84C', display: 'block' },
  heroSubtitle: { fontFamily: "'Playfair Display',serif", fontSize: 'clamp(1rem,2.5vw,1.4rem)', color: '#E8D48B', fontStyle: 'italic', marginBottom: 32 },
  heroDivider: { width: 80, height: 2, background: 'linear-gradient(90deg,transparent,#C9A84C,transparent)', margin: '0 auto 32px' },
  heroPillars: { display: 'flex', justifyContent: 'center', gap: 40, marginBottom: 40 },
  heroPillar: { textAlign: 'center' },
  heroPillarLabel: { fontSize: '.7rem', letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  heroPillarValue: { fontFamily: "'Playfair Display',serif", fontSize: '1.3rem', fontWeight: 700, color: '#C9A84C' },
  heroDesc: { fontSize: '1.05rem', color: 'rgba(255,255,255,0.75)', maxWidth: 650, margin: '0 auto 40px', fontWeight: 300, lineHeight: 1.8 },
  heroCta: { display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', background: 'linear-gradient(135deg,#C9A84C,#8B6914)', color: '#0F1A2E', fontWeight: 700, fontSize: '.9rem', letterSpacing: 2, textTransform: 'uppercase', textDecoration: 'none', borderRadius: 4 },

  container: { maxWidth: 1100, margin: '0 auto', padding: '0 24px' },
  overline: { fontSize: '.75rem', letterSpacing: 5, textTransform: 'uppercase', color: '#8B6914', marginBottom: 12, fontWeight: 600 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 700, color: '#1B2A4A', marginBottom: 16, lineHeight: 1.2 },
  sectionSub: { fontSize: '1.05rem', color: '#6B6B6B', maxWidth: 650, lineHeight: 1.8, marginBottom: 48 },

  missionSection: { padding: '100px 24px', background: '#FFF8E7' },
  missionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 },
  missionCard: { background: '#fff', padding: 48, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', borderTop: '4px solid #C9A84C' },
  missionLabel: { display: 'inline-block', fontSize: '.7rem', letterSpacing: 2, textTransform: 'uppercase', color: '#8B6914', background: '#FFF8E7', padding: '4px 12px', borderRadius: 20, marginBottom: 12, fontWeight: 600 },
  missionH: { fontFamily: "'Playfair Display',serif", fontSize: '1.5rem', color: '#1B2A4A', marginBottom: 16 },
  missionP: { color: '#6B6B6B', lineHeight: 1.8 },

  whySection: { padding: '100px 24px', background: '#fff' },
  whyGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginTop: 48 },
  whyCard: { textAlign: 'center', padding: '40px 28px', border: '1px solid #eee', borderRadius: 8, transition: 'all 0.3s' },
  whyIcon: { width: 64, height: 64, background: '#FFF8E7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '1.2rem', fontWeight: 700, color: '#1B2A4A', fontFamily: "'Playfair Display',serif" },
  whyH: { fontFamily: "'Playfair Display',serif", fontSize: '1.15rem', color: '#1B2A4A' },

  pillarsSection: { padding: '100px 24px', background: 'linear-gradient(135deg,#0F1A2E,#1B2A4A)', textAlign: 'center' },
  pillarsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 },
  pillarCard: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '48px 32px', textAlign: 'center' },
  pillarNum: { fontFamily: "'Playfair Display',serif", fontSize: '3rem', fontWeight: 800, color: '#C9A84C', lineHeight: 1, marginBottom: 8 },
  pillarTitle: { fontFamily: "'Playfair Display',serif", fontSize: '1.4rem', color: '#C9A84C', marginBottom: 12, letterSpacing: 3, textTransform: 'uppercase' },
  pillarDesc: { color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, fontSize: '.95rem' },

  impactSection: { padding: '100px 24px', background: '#FFF8E7' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 48 },
  statCard: { background: '#fff', padding: '32px 24px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', borderBottom: '3px solid #C9A84C' },
  statValue: { fontFamily: "'Playfair Display',serif", fontSize: '1.8rem', fontWeight: 800, color: '#1B2A4A', marginBottom: 4 },
  statLabel: { fontSize: '.8rem', color: '#6B6B6B', lineHeight: 1.4 },
  roiBanner: { background: 'linear-gradient(135deg,#1B2A4A,#2A3F6A)', color: '#fff', padding: 40, borderRadius: 8, textAlign: 'center' },
  roiTitle: { fontFamily: "'Playfair Display',serif", fontSize: '1.5rem', marginBottom: 8 },
  roiValue: { fontFamily: "'Playfair Display',serif", fontSize: '3rem', fontWeight: 800, color: '#C9A84C' },
  roiNote: { color: 'rgba(255,255,255,0.6)', fontSize: '.9rem', marginTop: 8 },

  ctaSection: { padding: '80px 24px', background: 'linear-gradient(135deg,#8B6914,#C9A84C,#8B6914)', textAlign: 'center' },
  ctaBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 40px', background: '#0F1A2E', color: '#C9A84C', fontWeight: 700, fontSize: '.9rem', letterSpacing: 2, textTransform: 'uppercase', textDecoration: 'none', borderRadius: 4 },

  footer: { background: '#0F1A2E', color: 'rgba(255,255,255,0.6)', padding: '48px 24px', textAlign: 'center' },
  footerBrand: { fontFamily: "'Playfair Display',serif", fontSize: '1.5rem', fontWeight: 700, color: '#C9A84C', marginBottom: 8, letterSpacing: 3 },
  footerMotto: { fontStyle: 'italic', color: '#E8D48B', marginBottom: 24, fontSize: '.9rem' },
  footerLinks: { display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 24, flexWrap: 'wrap' },
  footerLink: { color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '.85rem' },
  footerCopy: { fontSize: '.8rem', color: 'rgba(255,255,255,0.3)' },
};

// Responsive CSS
const style = document.createElement('style');
style.textContent = `
  @media(max-width:768px) {
    .ti-landing-nav-links { display: none !important; }
    .ti-landing-hamburger { display: flex !important; }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('ti-landing-resp')) {
  style.id = 'ti-landing-resp';
  document.head.appendChild(style);
}

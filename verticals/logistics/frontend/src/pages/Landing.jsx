import React, { useState, useEffect } from 'react';
const BASE = '/logistics';

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setActiveSlide(s => (s + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

  const showcaseImages = [
    { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74634a2d882ebdf052d4.png', label: 'Smart Warehouse Monitoring', desc: 'Real-time HUD analytics with automated guided vehicles and inventory scoring' },
    { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74638d3eae2098bec258.png', label: 'Automated Fulfillment', desc: 'AI-driven robotic warehouse operations with intelligent routing' },
    { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74637c27022c86498b74.png', label: 'Connected Logistics', desc: 'Cloud AI platform unifying freight, voice, analytics, and global tracking' },
    { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74638d3eaeb7f1bec259.png', label: 'Supply Chain Intelligence', desc: 'Real-time cargo tracking and supply analytics at your fingertips' },
  ];

  const solutions = [
    { title: 'Freight Brokerage CRM', desc: 'Complete load management, contact database, carrier matching, and automated coverage calls. Built for 3PLs and freight brokers who need speed and accuracy.', icon: 'T', color: '#0EA5E9', features: ['Load Board & Dispatch', 'Carrier Coverage AI', 'Rate Management', 'HubSpot Integration'] },
    { title: 'Carrier Management', desc: 'Onboard, vet, and manage carriers at scale. Automated FMCSA verification, compliance monitoring, and performance scoring.', icon: 'C', color: '#10B981', features: ['Carrier Onboarding', 'FMCSA Compliance', 'Safety Scoring', 'Document Vault'] },
    { title: 'Warehouse Analytics', desc: 'Real-time inventory visibility, goods-in/out tracking, OEE monitoring, and AI-powered demand forecasting for warehouse operations.', icon: 'W', color: '#F59E0B', features: ['Inventory Analytics', 'OEE Monitoring', 'Throughput Analysis', 'Product Matching'] },
    { title: 'Voice AI Automation', desc: 'Rachel, our AI voice agent, handles inbound calls, outbound carrier coverage, check calls, and customer updates 24/7/365.', icon: 'V', color: '#A855F7', features: ['Inbound Call Handling', 'Carrier Coverage Calls', 'Automated Check Calls', 'Lead Qualification'] },
  ];

  const stats = [
    { number: '45+', label: 'MCP API Endpoints' },
    { number: '24/7', label: 'AI Voice Coverage' },
    { number: '82%', label: 'Cost Reduction' },
    { number: '<14', label: 'Days to Deploy' },
  ];

  const modules = [
    { name: 'Load Management', desc: 'Create, track, and manage loads from origin to delivery with real-time status updates.', tier: 'Starter' },
    { name: 'Shipper Portal', desc: 'Self-service portal for shippers to request quotes, track shipments, and manage documents.', tier: 'Professional' },
    { name: 'Carrier Portal', desc: 'Carriers can view available loads, submit bids, and manage their fleet assignments.', tier: 'Professional' },
    { name: 'Document Vault', desc: 'Centralized storage for BOLs, PODs, insurance certificates, W-9s, and rate confirmations.', tier: 'Professional' },
    { name: 'FMCSA Compliance', desc: 'Automated carrier vetting with real-time FMCSA authority, insurance, and safety data.', tier: 'Enterprise' },
    { name: 'Smart Freight Matching', desc: 'AI-powered carrier-load matching based on equipment, lanes, rates, and performance history.', tier: 'Enterprise' },
    { name: 'Rachel Voice AI', desc: 'Autonomous voice agent for inbound/outbound calls — carrier coverage, check calls, lead qualification.', tier: 'Enterprise' },
    { name: 'Warehouse OPS', desc: 'Full warehouse analytics with inventory tracking, goods flow analysis, and OEE monitoring.', tier: 'Full Suite' },
    { name: 'TMS Bridge', desc: 'Bi-directional sync with McLeod LoadMaster, Tailwind TMS, and other transportation management systems.', tier: 'Full Suite' },
  ];

  const testimonialSlides = [
    { quote: 'RinglyPro replaced 9 full-time roles and cut our operational costs by 82%. The AI carrier coverage alone saves us 40 hours per week.', author: 'VP Operations', company: 'National 3PL Broker' },
    { quote: 'We went from manual carrier calls to fully automated coverage in under 14 days. Rachel handles hundreds of outbound calls daily.', author: 'Director of Freight', company: 'Regional Carrier Network' },
    { quote: 'The warehouse analytics module gave us visibility we never had. OEE went from 67% to 89% in the first quarter.', author: 'Warehouse Manager', company: 'Distribution Center' },
  ];

  const phases = [
    { phase: 'Phase 1', title: 'Foundation', days: 'Days 1-3', items: ['CRM Setup & Data Migration', 'User Provisioning & Roles', 'Load Board Configuration', 'Contact Import'] },
    { phase: 'Phase 2', title: 'AI Integration', days: 'Days 4-7', items: ['Rachel Voice AI Deployment', 'Carrier Coverage Automation', 'HubSpot/CRM Sync', 'Document Vault Setup'] },
    { phase: 'Phase 3', title: 'Advanced Modules', days: 'Days 8-11', items: ['FMCSA Compliance Engine', 'Smart Freight Matching', 'Warehouse Analytics', 'OEE Monitoring'] },
    { phase: 'Phase 4', title: 'Go Live', days: 'Days 12-14', items: ['End-to-End Testing', 'Team Training', 'Production Cutover', 'Continuous Monitoring'] },
  ];

  return (
    <div style={s.page}>
      {/* NAV */}
      <nav style={{ ...s.nav, ...(scrolled ? s.navScrolled : {}) }}>
        <div style={s.navInner}>
          <a href={`${BASE}`} style={s.navLogo}>
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="RinglyPro Logistics" style={s.navLogoImg} />
          </a>
          <div className="landing-nav-links" style={s.navLinks}>
            <a href="#solutions" style={s.navLink}>Solutions</a>
            <a href="#neural" style={s.navLink}>Neural AI</a>
            <a href="#platform" style={s.navLink}>Platform</a>
            <a href="#implementation" style={s.navLink}>Implementation</a>
            <a href="#pricing" style={s.navLink}>Pricing</a>
          </div>
          <div className="landing-nav-actions" style={s.navActions}>
            <a href={`${BASE}/login`} style={s.navSignIn}>Sign In</a>
            <a href="https://ringlypro.com/demo" style={s.navCTA}>Request Demo</a>
          </div>
          <button className="landing-hamburger" onClick={() => setMobileMenu(!mobileMenu)} style={s.hamburger}>
            <span style={{ ...s.hamburgerLine, ...(mobileMenu ? { transform: 'rotate(45deg) translate(5px,5px)' } : {}) }} />
            <span style={{ ...s.hamburgerLine, ...(mobileMenu ? { opacity: 0 } : {}) }} />
            <span style={{ ...s.hamburgerLine, ...(mobileMenu ? { transform: 'rotate(-45deg) translate(5px,-5px)' } : {}) }} />
          </button>
        </div>
        {mobileMenu && (
          <div style={s.mobileMenuPanel}>
            <a href="#solutions" style={s.mobileLink} onClick={() => setMobileMenu(false)}>Solutions</a>
            <a href="#neural" style={s.mobileLink} onClick={() => setMobileMenu(false)}>Neural AI</a>
            <a href="#platform" style={s.mobileLink} onClick={() => setMobileMenu(false)}>Platform</a>
            <a href="#implementation" style={s.mobileLink} onClick={() => setMobileMenu(false)}>Implementation</a>
            <a href="#pricing" style={s.mobileLink} onClick={() => setMobileMenu(false)}>Pricing</a>
            <a href={`${BASE}/login`} style={s.mobileCTA}>Sign In</a>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section style={s.hero}>
        <div style={s.heroOverlay} />
        <div style={s.heroContent}>
          <div style={{ ...s.heroBadge, visibility: 'hidden' }}>AI-Powered Transportation Management</div>
          <h1 style={s.heroTitle}>The Complete Logistics<br />Management Platform</h1>
          <p style={s.heroSub}>From freight brokerage to warehouse operations — one intelligent platform that automates your entire logistics workflow with AI voice agents, smart freight matching, and real-time analytics.</p>
          <div style={s.heroCTAs}>
            <a href="https://ringlypro.com/demo" style={s.heroPrimary}>Get Started</a>
            <a href="#solutions" style={s.heroSecondary}>Explore Solutions</a>
          </div>
        </div>
        {/* Hero Visual */}
        <div style={s.heroVisual}>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74637c27022c86498b74.png" alt="Connected Logistics Platform" style={s.heroImage} />
          <div style={s.heroImageGlow} />
        </div>

        <div style={s.heroStats}>
          {stats.map((st, i) => (
            <div key={i} style={s.heroStat}>
              <div style={s.heroStatNum}>{st.number}</div>
              <div style={s.heroStatLabel}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PLATFORM SHOWCASE */}
      <section style={s.showcaseSection}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>SEE IT IN ACTION</div>
            <h2 style={s.sectionTitle}>Powering the Future of Logistics</h2>
            <p style={s.sectionSub}>From warehouse floor to final mile — intelligent automation across every touchpoint.</p>
          </div>
          <div className="landing-showcase-grid" style={s.showcaseGrid}>
            {showcaseImages.map((img, i) => (
              <div key={i} style={s.showcaseCard}>
                <div style={s.showcaseImgWrap}>
                  <img src={img.src} alt={img.label} style={s.showcaseImg} />
                  <div style={s.showcaseOverlay}>
                    <span style={s.showcaseLabel}>{img.label}</span>
                  </div>
                </div>
                <p style={s.showcaseDesc}>{img.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOLUTIONS */}
      <section id="solutions" style={s.section}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>SOLUTIONS</div>
            <h2 style={s.sectionTitle}>Built for Every Logistics Vertical</h2>
            <p style={s.sectionSub}>Whether you're a freight broker, carrier, or warehouse operator — RinglyPro Logistics adapts to your workflow.</p>
          </div>
          <div style={s.solutionsGrid}>
            {solutions.map((sol, i) => (
              <div key={i} style={s.solutionCard}>
                <div style={{ ...s.solutionIcon, background: sol.color }}>{sol.icon}</div>
                <h3 style={s.solutionTitle}>{sol.title}</h3>
                <p style={s.solutionDesc}>{sol.desc}</p>
                <ul style={s.solutionFeatures}>
                  {sol.features.map((f, j) => (
                    <li key={j} style={s.solutionFeature}>
                      <span style={{ ...s.checkmark, color: sol.color }}>&#10003;</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEURAL INTELLIGENCE */}
      <section id="neural" style={{ ...s.section, background: 'linear-gradient(180deg, #07090f 0%, #0a0f18 50%, #0D1117 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Glow effects */}
        <div style={{ position: 'absolute', width: 400, height: 400, background: 'rgba(99,102,241,0.15)', borderRadius: '50%', filter: 'blur(120px)', top: -100, left: -100, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, background: 'rgba(139,92,246,0.1)', borderRadius: '50%', filter: 'blur(100px)', bottom: 0, right: '5%', pointerEvents: 'none' }} />

        <div style={s.container}>
          {/* Neural OBD Hero */}
          <div className="neural-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center', marginBottom: 80 }}>
            {/* Left — Elevator Pitch */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 24, marginBottom: 28 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 2 }}>On-Board Diagnostics</span>
              </div>
              <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: '#fff', letterSpacing: 2, lineHeight: 1.05, marginBottom: 20 }}>Not a Dashboard. <span style={{ color: '#8b5cf6' }}>A Doctor.</span></h2>
              <p style={{ fontSize: 17, color: '#94a3b8', lineHeight: 1.8, maxWidth: 540, marginBottom: 24 }}>Most of today's companies run on platforms that give you charts, numbers, and KPIs. You still have to figure out what's wrong, decide what to do, and do it yourself.</p>
              <p style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.7, maxWidth: 540, marginBottom: 32 }}>Neural Intelligence is different. It <strong style={{ color: '#8b5cf6' }}>diagnoses</strong> your operation, <strong style={{ color: '#06b6d4' }}>prescribes</strong> the fix, <strong style={{ color: '#22c55e' }}>executes</strong> it autonomously, and <strong style={{ color: '#f59e0b' }}>proves</strong> the ROI — all in one system.</p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
                <a href={`${BASE}/neural`} style={{ display: 'inline-block', padding: '14px 32px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', borderRadius: 28, fontSize: 15, fontWeight: 600 }}>See Neural in Action</a>
                <a href="https://ringlypro.com/demo" style={{ display: 'inline-block', padding: '14px 32px', background: 'transparent', border: '1px solid #334155', color: '#e2e8f0', textDecoration: 'none', borderRadius: 28, fontSize: 15, fontWeight: 500 }}>Book a Demo</a>
              </div>
            </div>

            {/* Right — OBD Visual */}
            <div style={{ background: 'rgba(15,18,30,0.9)', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Neural OBD — All Systems Monitored</span>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { code: 'OBD-01', system: 'Voice AI Engine', status: 'OK', color: '#22c55e', reading: '87% answer rate' },
                  { code: 'OBD-02', system: 'CRM Sync Pipeline', status: 'OK', color: '#22c55e', reading: '100% synced' },
                  { code: 'OBD-03', system: 'Revenue Pipeline', status: 'OK', color: '#22c55e', reading: '$64K active' },
                  { code: 'OBD-04', system: 'Dispatch Engine', status: 'CHECK', color: '#fbbf24', reading: '3 loads uncovered' },
                  { code: 'OBD-05', system: 'Carrier Network', status: 'OK', color: '#22c55e', reading: '25 active carriers' },
                  { code: 'OBD-06', system: 'Treatment Automation', status: 'ACTIVE', color: '#8b5cf6', reading: '4 workflows firing' },
                ].map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(30,41,59,0.3)', border: '1px solid #1e293b', borderLeft: `3px solid ${d.color}`, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: d.color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, width: 55, flexShrink: 0 }}>{d.code}</span>
                    <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{d.system}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', background: `${d.color}22`, color: d.color, borderRadius: 4, fontWeight: 700 }}>{d.status}</span>
                    <span style={{ fontSize: 11, color: '#64748b', width: 110, textAlign: 'right' }}>{d.reading}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 20px 20px', textAlign: 'center' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#22c55e', fontWeight: 600, letterSpacing: 1 }}>ALL SYSTEMS GO — 6/6 SUBSYSTEMS MONITORED</div>
              </div>
            </div>
          </div>

          {/* The 4-Step OBD Process */}
          <div style={s.sectionHeader}>
            <div style={{ ...s.sectionTag, background: 'rgba(168,85,247,0.12)', color: '#A855F7' }}>NEURAL OBD</div>
            <h2 style={s.sectionTitle}>Analyze. Diagnose. Prescribe. Remediate.</h2>
            <p style={s.sectionSub}>Behind the scenes, your operation runs on disconnected policies, procedures, and systems. Your sales tools don't talk to your CRM, your call logs don't feed your operations, your customer data lives in spreadsheets. That disarray is where revenue dies. Neural replaces the silos.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 64 }}>
            {[
              { step: '01', title: 'ANALYZE', icon: '\u{1F50D}', color: '#8b5cf6', desc: 'Continuously scans every subsystem — voice AI, CRM, dispatch, pipeline, carrier network, data ingestion — in real time.' },
              { step: '02', title: 'DIAGNOSE', icon: '\u{2699}', color: '#06b6d4', desc: '8 diagnostic codes identify exactly what\'s broken: missed calls, sync failures, stale deals, uncovered loads, thin carrier networks.' },
              { step: '03', title: 'PRESCRIBE', icon: '\u{1F4CB}', color: '#22c55e', desc: 'Each finding comes with a Treatment — a real automation workflow with triggers, conditions, and actions ready to activate.' },
              { step: '04', title: 'REMEDIATE', icon: '\u{26A1}', color: '#f59e0b', desc: 'One click activates the fix. Missed call? Auto-SMS, CRM contact, callback in 30 minutes. No human touched it. No ball dropped.' },
            ].map((s2, i) => (
              <div key={i} style={{ background: '#161B22', border: '1px solid #21262D', borderTop: `3px solid ${s2.color}`, borderRadius: 12, padding: 28, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{s2.icon}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: s2.color, letterSpacing: 3, marginBottom: 4 }}>STEP {s2.step}</div>
                <h4 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#fff', letterSpacing: 2, marginBottom: 12 }}>{s2.title}</h4>
                <p style={{ fontSize: 13, color: '#8B949E', lineHeight: 1.6, margin: 0 }}>{s2.desc}</p>
              </div>
            ))}
          </div>

          {/* The Difference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 64 }}>
            <div style={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 16, padding: 36, borderTop: '3px solid #ef4444' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{'\u{1F321}'}</div>
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#ef4444', letterSpacing: 2, marginBottom: 12 }}>A Thermometer</h3>
              <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>Traditional platforms show you numbers. Revenue is down. Calls are being missed. Deals are stalling. You see the fever, but you're left to diagnose, prescribe, and treat it yourself — across disconnected systems, departments, and spreadsheets.</p>
            </div>
            <div style={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 16, padding: 36, borderTop: '3px solid #22c55e' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{'\u{1FA7A}'}</div>
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#22c55e', letterSpacing: 2, marginBottom: 12 }}>A Doctor</h3>
              <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>Neural Intelligence sees the symptoms, runs the tests, identifies the root cause, prescribes the treatment, administers it automatically, and tracks the recovery. Every action is logged, every dollar saved is measured, every improvement is proven.</p>
            </div>
          </div>

          {/* System Architecture Workflow — Inline SVG */}
          <div style={{ marginBottom: 64 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 2 }}>System Architecture</span>
              </div>
              <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 2, marginBottom: 8 }}>Full Workflow Diagram</h3>
              <p style={{ fontSize: 14, color: '#64748b', maxWidth: 600, margin: '0 auto' }}>From data sources through diagnostics, treatment, and ROI — the complete Neural OBD pipeline.</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox="0 0 1400 1100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block', minWidth: 800 }}>
                <defs>
                  <marker id="aPu" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6"/></marker>
                  <marker id="aCy" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#06b6d4"/></marker>
                  <marker id="aGr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#22c55e"/></marker>
                  <marker id="aAm" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/></marker>
                  <marker id="aGy" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#475569"/></marker>
                  <filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{stopColor:'#6366f1',stopOpacity:0.15}}/><stop offset="100%" style={{stopColor:'#8b5cf6',stopOpacity:0.08}}/></linearGradient>
                  <linearGradient id="gC" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{stopColor:'#06b6d4',stopOpacity:0.12}}/><stop offset="100%" style={{stopColor:'#0ea5e9',stopOpacity:0.06}}/></linearGradient>
                  <linearGradient id="gG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{stopColor:'#22c55e',stopOpacity:0.12}}/><stop offset="100%" style={{stopColor:'#10b981',stopOpacity:0.06}}/></linearGradient>
                </defs>

                {/* Layer 1: Data Sources */}
                <text x="700" y="32" textAnchor="middle" fill="#475569" fontSize="11" fontWeight="700" letterSpacing="3" fontFamily="'Bebas Neue',sans-serif">DATA SOURCES</text>
                {[
                  {x:30,icon:'\u{1F4DE}',name:'Voice AI',sub:'Calls, Transcripts'},
                  {x:220,icon:'\u{1F517}',name:'HubSpot CRM',sub:'Contacts, Deals'},
                  {x:410,icon:'\u{1F69A}',name:'Dispatch',sub:'Loads, Carriers'},
                  {x:600,icon:'\u{1F4B0}',name:'Revenue',sub:'Rates, Margins'},
                  {x:790,icon:'\u{1F465}',name:'Contacts',sub:'Network'},
                  {x:980,icon:'\u{1F4CA}',name:'Ingestion',sub:'CSV, TMS'},
                  {x:1170,icon:'\u{1F310}',name:'DAT API',sub:'Market Rates'},
                ].map((s3,i) => (
                  <g key={i}>
                    <rect x={s3.x} y="48" width="160" height="80" rx="12" fill="#0f1724" stroke="#1e293b" strokeWidth="1.5"/>
                    <text x={s3.x+80} y="78" textAnchor="middle" fontSize="22">{s3.icon}</text>
                    <text x={s3.x+80} y="98" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="700">{s3.name}</text>
                    <text x={s3.x+80} y="114" textAnchor="middle" fill="#64748b" fontSize="9">{s3.sub}</text>
                    {i < 6 && <line x1={s3.x+80} y1="128" x2={s3.x+80} y2="200" stroke="#334155" strokeWidth="1.5" markerEnd="url(#aGy)"/>}
                  </g>
                ))}
                <line x1="1250" y1="128" x2="1060" y2="200" stroke="#334155" strokeWidth="1.5" strokeDasharray="6,4" markerEnd="url(#aGy)"/>

                {/* Layer 2: Analyze */}
                <rect x="50" y="200" width="1120" height="100" rx="20" fill="url(#gP)" stroke="#6366f1" strokeWidth="2" filter="url(#gl)"/>
                <text x="610" y="245" textAnchor="middle" fill="#a5b4fc" fontSize="14" fontWeight="700" letterSpacing="4" fontFamily="'Bebas Neue',sans-serif">STEP 01 — ANALYZE</text>
                <text x="610" y="272" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="'Bebas Neue',sans-serif" letterSpacing="3">NEURAL SCANNER ENGINE</text>
                <text x="610" y="290" textAnchor="middle" fill="#94a3b8" fontSize="11">Continuously scans all subsystems — pulls metrics, detects anomalies, calculates health scores</text>
                <line x1="610" y1="300" x2="610" y2="360" stroke="#8b5cf6" strokeWidth="2.5" markerEnd="url(#aPu)"/>
                <text x="625" y="340" fill="#8b5cf6" fontSize="10" fontWeight="600">Findings</text>

                {/* Layer 3: Diagnose — OBD Codes */}
                <rect x="50" y="360" width="1120" height="160" rx="20" fill="url(#gC)" stroke="#06b6d4" strokeWidth="2"/>
                <text x="610" y="390" textAnchor="middle" fill="#67e8f9" fontSize="14" fontWeight="700" letterSpacing="4" fontFamily="'Bebas Neue',sans-serif">STEP 02 — DIAGNOSE</text>
                <text x="610" y="414" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="'Bebas Neue',sans-serif" letterSpacing="3">OBD DIAGNOSTIC CODES</text>
                {[
                  {x:80,code:'OBD-01',name:'Voice AI',c:'#22c55e'},
                  {x:215,code:'OBD-02',name:'CRM Link',c:'#22c55e'},
                  {x:350,code:'OBD-03',name:'Sync',c:'#22c55e'},
                  {x:485,code:'OBD-04',name:'Dispatch',c:'#fbbf24'},
                  {x:620,code:'OBD-05',name:'Revenue',c:'#22c55e'},
                  {x:755,code:'OBD-06',name:'Treatments',c:'#8b5cf6'},
                  {x:890,code:'OBD-07',name:'Network',c:'#22c55e'},
                  {x:1025,code:'OBD-08',name:'Ingestion',c:'#22c55e'},
                ].map((d,i) => (
                  <g key={i}>
                    <rect x={d.x} y="430" width="120" height="50" rx="8" fill="#0f172a" stroke="#1e3a5f"/>
                    <text x={d.x+60} y="452" textAnchor="middle" fill={d.c} fontSize="12" fontWeight="800" fontFamily="'Bebas Neue',sans-serif" letterSpacing="2">{d.code}</text>
                    <text x={d.x+60} y="470" textAnchor="middle" fill="#94a3b8" fontSize="9">{d.name}</text>
                    <circle cx={d.x+108} cy="448" r="4" fill={d.c}/>
                  </g>
                ))}
                <circle cx="485" cy="507" r="4" fill="#ef4444"/><text x="505" y="510" textAnchor="middle" fill="#64748b" fontSize="10">CRITICAL</text>
                <circle cx="590" cy="507" r="4" fill="#fbbf24"/><text x="610" y="510" textAnchor="middle" fill="#64748b" fontSize="10">WARNING</text>
                <circle cx="708" cy="507" r="4" fill="#22c55e"/><text x="730" y="510" textAnchor="middle" fill="#64748b" fontSize="10">OPPORTUNITY</text>

                <line x1="610" y1="520" x2="610" y2="580" stroke="#06b6d4" strokeWidth="2.5" markerEnd="url(#aCy)"/>
                <text x="625" y="558" fill="#06b6d4" fontSize="10" fontWeight="600">Treatments</text>

                {/* Layer 4: Prescribe */}
                <rect x="50" y="580" width="1120" height="130" rx="20" fill="url(#gG)" stroke="#22c55e" strokeWidth="2"/>
                <text x="610" y="610" textAnchor="middle" fill="#86efac" fontSize="14" fontWeight="700" letterSpacing="4" fontFamily="'Bebas Neue',sans-serif">STEP 03 — PRESCRIBE</text>
                <text x="610" y="634" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="'Bebas Neue',sans-serif" letterSpacing="3">TREATMENT TEMPLATES</text>
                {[
                  {x:80,name:'Missed Call Recovery',trigger:'call.missed'},
                  {x:290,name:'Load Coverage Outbound',trigger:'load.uncovered'},
                  {x:500,name:'Contact HubSpot Sync',trigger:'contact.created'},
                  {x:710,name:'Stale Deal Reengagement',trigger:'deal.stale'},
                  {x:920,name:'New Carrier Welcome',trigger:'carrier.created'},
                ].map((t,i) => (
                  <g key={i}>
                    <rect x={t.x} y="650" width="195" height="45" rx="8" fill="#0f172a" stroke="#1e3a5f"/>
                    <text x={t.x+98} y="670" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600">{t.name}</text>
                    <text x={t.x+98} y="684" textAnchor="middle" fill="#64748b" fontSize="8">trigger: {t.trigger}</text>
                  </g>
                ))}
                <line x1="610" y1="710" x2="610" y2="770" stroke="#22c55e" strokeWidth="2.5" markerEnd="url(#aGr)"/>
                <text x="625" y="748" fill="#22c55e" fontSize="10" fontWeight="600">Execute</text>

                {/* Layer 5: Remediate */}
                <rect x="50" y="770" width="1120" height="110" rx="20" fill="#0f172a" stroke="#f59e0b" strokeWidth="2"/>
                <text x="610" y="800" textAnchor="middle" fill="#fcd34d" fontSize="14" fontWeight="700" letterSpacing="4" fontFamily="'Bebas Neue',sans-serif">STEP 04 — REMEDIATE</text>
                <text x="610" y="824" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="'Bebas Neue',sans-serif" letterSpacing="3">TREATMENT EXECUTOR</text>
                {[
                  {x:100,label:'\u{1F4AC} Auto-SMS'},{x:250,label:'\u{1F464} CRM Write'},{x:400,label:'\u{1F3F7} CRM Tag'},
                  {x:550,label:'\u{1F4CB} CRM Task'},{x:700,label:'\u{1F4DE} Callback'},{x:850,label:'\u{1F4E8} Email'},
                ].map((a,i) => (
                  <g key={i}>
                    <rect x={a.x} y="840" width="130" height="30" rx="6" fill="#1a1a2e" stroke="#334155"/>
                    <text x={a.x+65} y="860" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600">{a.label}</text>
                  </g>
                ))}
                <rect x="1000" y="838" width="150" height="34" rx="6" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.3)"/>
                <text x="1075" y="854" textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="700">RATE LIMIT</text>
                <text x="1075" y="866" textAnchor="middle" fill="#94a3b8" fontSize="8">1 per phone / hour</text>

                <line x1="400" y1="880" x2="400" y2="940" stroke="#f59e0b" strokeWidth="2.5" markerEnd="url(#aAm)"/>
                <line x1="820" y1="880" x2="820" y2="940" stroke="#f59e0b" strokeWidth="2.5" markerEnd="url(#aAm)"/>

                {/* Layer 6: Outputs */}
                <rect x="150" y="940" width="500" height="100" rx="16" fill="#0f172a" stroke="#475569" strokeWidth="1.5"/>
                <text x="400" y="972" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700" letterSpacing="2" fontFamily="'Bebas Neue',sans-serif">TREATMENT EXECUTION LOG</text>
                <text x="400" y="992" textAnchor="middle" fill="#64748b" fontSize="10">Every trigger logged | Every action tracked</text>
                <text x="400" y="1012" textAnchor="middle" fill="#475569" fontSize="9">client_id | treatment_type | trigger_event | actions_executed | status</text>

                <rect x="700" y="940" width="500" height="100" rx="16" fill="#0f172a" stroke="#22c55e" strokeWidth="2"/>
                <text x="950" y="972" textAnchor="middle" fill="#86efac" fontSize="11" fontWeight="700" letterSpacing="2" fontFamily="'Bebas Neue',sans-serif">LIVE ROI DASHBOARD</text>
                <text x="950" y="992" textAnchor="middle" fill="#94a3b8" fontSize="10">Actuals, not projections</text>
                {[
                  {x:780,v:'87%',l:'COST CUT',c:'#22c55e'},{x:880,v:'74%',l:'FASTER',c:'#06b6d4'},
                  {x:980,v:'8.4x',l:'ROI',c:'#8b5cf6'},{x:1080,v:'11d',l:'PAYBACK',c:'#f59e0b'},
                ].map((k,i) => (
                  <g key={i}>
                    <text x={k.x} y="1020" textAnchor="middle" fill={k.c} fontSize="16" fontWeight="700" fontFamily="'Bebas Neue',sans-serif">{k.v}</text>
                    <text x={k.x} y="1032" textAnchor="middle" fill="#475569" fontSize="7">{k.l}</text>
                  </g>
                ))}

                {/* Feedback loop */}
                <path d="M 1200 990 Q 1340 990 1340 250 Q 1340 200 1170 250" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="6,4" markerEnd="url(#aGy)"/>
                <text x="1350" y="600" fill="#475569" fontSize="10" fontWeight="600" transform="rotate(90,1350,600)">FEEDBACK LOOP</text>

                <text x="610" y="1080" textAnchor="middle" fill="#334155" fontSize="12" fontWeight="500" fontStyle="italic">"The difference between a thermometer and a doctor."</text>
              </svg>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {[
                {c:'#8b5cf6',l:'Analyze'},{c:'#06b6d4',l:'Diagnose'},{c:'#22c55e',l:'Prescribe'},
                {c:'#f59e0b',l:'Remediate'},{c:'#475569',l:'Data Flow'},
              ].map((lg,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: lg.c }} />{lg.l}
                </div>
              ))}
            </div>
          </div>

          {/* ROI Proof */}
          <div style={{ background: 'linear-gradient(135deg, #161B22, #1a1f2e)', border: '1px solid #21262D', borderRadius: 16, padding: 40, textAlign: 'center' }}>
            <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 2, marginBottom: 8 }}>Proven ROI — Not Projections. Actuals.</h3>
            <p style={{ fontSize: 15, color: '#8B949E', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.7 }}>Every action Neural takes is tracked on a live ROI dashboard. Show your board exactly how much the platform saved this quarter — in dollars, in hours, in margin points.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 36 }}>
              {[
                { num: '87%', label: 'Cost Reduction per Call', color: '#22c55e' },
                { num: '74%', label: 'Faster Response Time', color: '#06b6d4' },
                { num: '8.4x', label: 'ROI Multiple', color: '#8b5cf6' },
                { num: '11 days', label: 'Payback Period', color: '#f59e0b' },
              ].map((kpi, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: kpi.color, letterSpacing: 1 }}>{kpi.num}</div>
                  <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>{kpi.label}</div>
                </div>
              ))}
            </div>
            <a href={`${BASE}/neural`} style={{ display: 'inline-block', padding: '14px 36px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', borderRadius: 28, fontSize: 15, fontWeight: 600 }}>Launch Neural Dashboard &rarr;</a>
          </div>
        </div>
      </section>

      {/* PLATFORM MODULES */}
      <section id="platform" style={{ ...s.section, background: '#0a0f18' }}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>PLATFORM</div>
            <h2 style={s.sectionTitle}>Modular Architecture, Unlimited Scale</h2>
            <p style={s.sectionSub}>Start with what you need today. Add modules as your business grows. Every component is built on our MCP tool architecture.</p>
          </div>
          <div style={s.modulesGrid}>
            {modules.map((mod, i) => (
              <div key={i} style={s.moduleCard}>
                <div style={s.moduleTop}>
                  <h4 style={s.moduleName}>{mod.name}</h4>
                  <span style={{ ...s.tierBadge, background: mod.tier === 'Starter' ? '#1e293b' : mod.tier === 'Professional' ? '#0c4a6e' : mod.tier === 'Enterprise' ? '#064e3b' : '#713f12' }}>{mod.tier}</span>
                </div>
                <p style={s.moduleDesc}>{mod.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI / TESTIMONIALS */}
      <section style={s.section}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>RESULTS</div>
            <h2 style={s.sectionTitle}>AI That Delivers Measurable ROI</h2>
          </div>
          <div style={s.roiGrid}>
            <div style={s.roiCard}>
              <div style={s.roiNumber}>9</div>
              <div style={s.roiLabel}>Full-Time Roles Replaced</div>
              <p style={s.roiDesc}>Rachel AI handles the work of dispatchers, coverage agents, check-call operators, and lead qualifiers — around the clock.</p>
            </div>
            <div style={s.roiCard}>
              <div style={{ ...s.roiNumber, color: '#10B981' }}>$274K</div>
              <div style={s.roiLabel}>Annual Cost Savings</div>
              <p style={s.roiDesc}>Compared to traditional staffing, RinglyPro Logistics delivers 77-82% cost reduction across operations.</p>
            </div>
            <div style={s.roiCard}>
              <div style={{ ...s.roiNumber, color: '#F59E0B' }}>24/7</div>
              <div style={s.roiLabel}>Always-On Operations</div>
              <p style={s.roiDesc}>No more missed calls, delayed check-ins, or after-hours gaps. Your logistics never sleeps.</p>
            </div>
          </div>
          {/* Visual accent */}
          <div style={s.roiVisual}>
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69af74638d3eaeb7f1bec259.png" alt="Supply Chain Analytics" style={s.roiVisualImg} />
          </div>

          <div style={s.testimonialSection}>
            <div style={s.testimonialCard}>
              <div style={s.quoteIcon}>"</div>
              <p style={s.quoteText}>{testimonialSlides[activeSlide].quote}</p>
              <div style={s.quoteAuthor}>
                <strong>{testimonialSlides[activeSlide].author}</strong>
                <span style={s.quoteCompany}>{testimonialSlides[activeSlide].company}</span>
              </div>
              <div style={s.slideDots}>
                {testimonialSlides.map((_, i) => (
                  <button key={i} onClick={() => setActiveSlide(i)} style={{ ...s.dot, ...(i === activeSlide ? s.dotActive : {}) }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IMPLEMENTATION */}
      <section id="implementation" style={{ ...s.section, background: '#0a0f18' }}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>IMPLEMENTATION</div>
            <h2 style={s.sectionTitle}>Live in 14 Days or Less</h2>
            <p style={s.sectionSub}>Our proven deployment methodology gets your logistics platform running fast — with zero downtime and full data migration.</p>
          </div>
          <div style={s.timeline}>
            {phases.map((p, i) => (
              <div key={i} style={s.timelineItem}>
                <div style={s.timelineDot}>
                  <div style={{ ...s.timelineDotInner, background: i === 3 ? '#F59E0B' : '#0EA5E9' }} />
                </div>
                <div style={s.timelineContent}>
                  <div style={s.timelineMeta}>
                    <span style={s.timelinePhase}>{p.phase}</span>
                    <span style={s.timelineDays}>{p.days}</span>
                  </div>
                  <h4 style={s.timelineTitle}>{p.title}</h4>
                  <ul style={s.timelineItems}>
                    {p.items.map((item, j) => (
                      <li key={j} style={s.timelineFeature}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING TIERS */}
      <section id="pricing" style={s.section}>
        <div style={s.container}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTag}>PRICING</div>
            <h2 style={s.sectionTitle}>Plans That Scale With You</h2>
            <p style={s.sectionSub}>From single-office brokerages to enterprise logistics networks.</p>
          </div>
          <div style={s.pricingGrid}>
            {[
              { name: 'Freight CRM', tier: 'Professional', price: '$497', period: '/mo', features: ['Load Management', 'Contact Database', 'Basic Analytics', 'Call Logging', '500 AI Tokens'], color: '#8B949E', popular: false },
              { name: 'Freight Pro', tier: 'Professional', price: '$997', period: '/mo', features: ['Everything in Starter', 'Shipper Portal', 'Carrier Portal', 'Document Vault', '2,000 AI Tokens', 'HubSpot Integration'], color: '#0EA5E9', popular: true },
              { name: 'Logistics AI', tier: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'FMCSA Compliance', 'Smart Freight Matching', 'Rachel Voice AI', 'Unlimited AI Tokens', 'Dedicated Support'], color: '#10B981', popular: false },
              { name: 'Full Suite', tier: 'Complete', price: 'Custom', period: '', features: ['Everything in Enterprise', 'Warehouse Analytics', 'OEE Monitoring', 'TMS Bridge', 'White-Label Ready', 'SLA Guarantee'], color: '#F59E0B', popular: false },
            ].map((plan, i) => (
              <div key={i} style={{ ...s.pricingCard, ...(plan.popular ? s.pricingCardPopular : {}), borderColor: plan.color }}>
                {plan.popular && <div style={s.popularBadge}>Most Popular</div>}
                <div style={{ ...s.pricingTier, color: plan.color }}>{plan.tier}</div>
                <h3 style={s.pricingName}>{plan.name}</h3>
                <div style={s.pricingPrice}>{plan.price}<span style={s.pricingPeriod}>{plan.period}</span></div>
                <ul style={s.pricingFeatures}>
                  {plan.features.map((f, j) => (
                    <li key={j} style={s.pricingFeature}><span style={{ color: plan.color }}>&#10003;</span> {f}</li>
                  ))}
                </ul>
                <a href="https://ringlypro.com/demo" style={{ ...s.pricingCTA, background: plan.popular ? plan.color : 'transparent', border: `1px solid ${plan.color}`, color: plan.popular ? '#fff' : plan.color }}>{plan.price === 'Custom' ? 'Contact Sales' : 'Start Free Trial'}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={s.ctaBanner}>
        <div style={s.container}>
          <h2 style={s.ctaTitle}>Ready to Transform Your Logistics?</h2>
          <p style={s.ctaSub}>Join the next generation of freight brokers and logistics operators using AI to move more freight with fewer resources.</p>
          <div style={s.ctaActions}>
            <a href="https://ringlypro.com/demo" style={s.ctaPrimary}>Get Started Now</a>
            <a href="tel:+18886103810" style={s.ctaPhone}>(888) 610-3810</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerBrand}>
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="RinglyPro Logistics" style={s.footerLogo} />
            <p style={s.footerDesc}>AI-powered logistics management for freight brokers, carriers, and warehouse operators.</p>
          </div>
          <div style={s.footerLinks}>
            <div style={s.footerCol}>
              <h4 style={s.footerColTitle}>Platform</h4>
              <a href="#solutions" style={s.footerLink}>Solutions</a>
              <a href="#platform" style={s.footerLink}>Modules</a>
              <a href="#pricing" style={s.footerLink}>Pricing</a>
              <a href="#implementation" style={s.footerLink}>Implementation</a>
            </div>
            <div style={s.footerCol}>
              <h4 style={s.footerColTitle}>Dashboards</h4>
              <a href={`${BASE}/login`} style={s.footerLink}>Logistics CRM</a>
              <a href="/cw_carriers/" style={s.footerLink}>Carriers CRM</a>
              <a href="/pinaxis/" style={s.footerLink}>Warehouse Analytics</a>
            </div>
            <div style={s.footerCol}>
              <h4 style={s.footerColTitle}>Company</h4>
              <a href="https://ringlypro.com" style={s.footerLink}>RinglyPro.com</a>
              <a href="https://ringlypro.com/demo" style={s.footerLink}>Contact Sales</a>
              <a href="tel:+18886103810" style={s.footerLink}>(888) 610-3810</a>
            </div>
          </div>
        </div>
        <div style={s.footerBottom}>
          <span>&copy; {new Date().getFullYear()} Digit2AI LLC. All rights reserved.</span>
          <span style={s.footerPowered}>Powered by RinglyPro AI | MCP Architecture | Rachel Voice AI</span>
        </div>
      </footer>
    </div>
  );
}

const s = {
  page: { fontFamily: "'DM Sans', 'Roboto', sans-serif", color: '#E6EDF3', background: '#0D1117', minHeight: '100vh', overflowX: 'hidden' },

  // NAV
  nav: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, padding: '16px 0', transition: 'all 0.3s ease' },
  navScrolled: { background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #21262D', padding: '10px 0' },
  navInner: { maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navLogo: { display: 'flex', alignItems: 'center', textDecoration: 'none' },
  navLogoImg: { height: 180, width: 'auto' },
  navLinks: { display: 'flex', gap: 32, alignItems: 'center' },
  navLink: { color: '#8B949E', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' },
  navActions: { display: 'flex', gap: 12, alignItems: 'center' },
  navSignIn: { color: '#E6EDF3', textDecoration: 'none', fontSize: 14, fontWeight: 500, padding: '8px 16px' },
  navCTA: { background: '#0EA5E9', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 20px', borderRadius: 6 },
  hamburger: { display: 'none', flexDirection: 'column', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 8 },
  hamburgerLine: { width: 24, height: 2, background: '#E6EDF3', borderRadius: 1, transition: 'all 0.3s ease' },
  mobileMenuPanel: { padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: '#161B22', borderBottom: '1px solid #21262D' },
  mobileLink: { color: '#E6EDF3', textDecoration: 'none', fontSize: 15, padding: '8px 0' },
  mobileCTA: { background: '#0EA5E9', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '10px 20px', borderRadius: 6, textAlign: 'center', marginTop: 8 },

  // HERO
  hero: { position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '120px 24px 60px', textAlign: 'center', background: 'linear-gradient(135deg, #0D1117 0%, #0c1a2e 40%, #0D1117 100%)' },
  heroOverlay: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(14,165,233,0.08) 0%, transparent 60%)', pointerEvents: 'none' },
  heroContent: { position: 'relative', maxWidth: 800, zIndex: 1 },
  heroBadge: { display: 'inline-block', padding: '6px 16px', background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 24 },
  heroTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: '#fff', letterSpacing: 3, lineHeight: 1.05, marginBottom: 20 },
  heroSub: { fontSize: 18, color: '#8B949E', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 32px' },
  heroCTAs: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  heroPrimary: { padding: '14px 36px', background: '#0EA5E9', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600 },
  heroSecondary: { padding: '14px 36px', background: 'transparent', border: '1px solid #30363D', color: '#E6EDF3', textDecoration: 'none', borderRadius: 8, fontSize: 16, fontWeight: 500 },
  // HERO VISUAL
  heroVisual: { position: 'relative', zIndex: 1, marginTop: 48, maxWidth: 900, width: '100%' },
  heroImage: { width: '100%', borderRadius: 16, border: '1px solid rgba(14,165,233,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(14,165,233,0.1)' },
  heroImageGlow: { position: 'absolute', inset: -2, borderRadius: 18, background: 'linear-gradient(135deg, rgba(14,165,233,0.15), transparent, rgba(14,165,233,0.1))', zIndex: -1, filter: 'blur(1px)' },

  heroStats: { position: 'relative', zIndex: 1, display: 'flex', gap: 48, marginTop: 48, flexWrap: 'wrap', justifyContent: 'center' },
  heroStat: { textAlign: 'center' },
  heroStatNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#0EA5E9', letterSpacing: 2 },
  heroStatLabel: { fontSize: 12, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },

  // SECTIONS
  section: { padding: '100px 24px', background: '#0D1117' },
  container: { maxWidth: 1200, margin: '0 auto' },
  sectionHeader: { textAlign: 'center', marginBottom: 60 },
  sectionTag: { display: 'inline-block', padding: '4px 12px', background: 'rgba(14,165,233,0.1)', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#0EA5E9', letterSpacing: 2, marginBottom: 16 },
  sectionTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', letterSpacing: 2, marginBottom: 12 },
  sectionSub: { fontSize: 16, color: '#8B949E', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 },

  // SHOWCASE
  showcaseSection: { padding: '80px 24px 100px', background: 'linear-gradient(180deg, #0D1117 0%, #0a0f18 100%)' },
  showcaseGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 },
  showcaseCard: { borderRadius: 14, overflow: 'hidden', background: '#161B22', border: '1px solid #21262D', transition: 'transform 0.3s, border-color 0.3s' },
  showcaseImgWrap: { position: 'relative', overflow: 'hidden', aspectRatio: '16/10' },
  showcaseImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.4s' },
  showcaseOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 20px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' },
  showcaseLabel: { fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 0.5 },
  showcaseDesc: { padding: '14px 20px 18px', fontSize: 13, color: '#8B949E', lineHeight: 1.5, margin: 0 },

  // SOLUTIONS
  solutionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 },
  solutionCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, transition: 'transform 0.2s, border-color 0.2s' },
  solutionIcon: { width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16 },
  solutionTitle: { fontSize: 20, fontWeight: 700, color: '#E6EDF3', marginBottom: 10 },
  solutionDesc: { fontSize: 14, color: '#8B949E', lineHeight: 1.6, marginBottom: 16 },
  solutionFeatures: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  solutionFeature: { fontSize: 13, color: '#C9D1D9', display: 'flex', alignItems: 'center', gap: 8 },
  checkmark: { fontSize: 14, fontWeight: 700 },

  // MODULES
  modulesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 },
  moduleCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 22 },
  moduleTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  moduleName: { fontSize: 16, fontWeight: 600, color: '#E6EDF3' },
  tierBadge: { fontSize: 10, fontWeight: 600, color: '#fff', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  moduleDesc: { fontSize: 13, color: '#8B949E', lineHeight: 1.5 },

  // ROI
  roiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 48 },
  roiCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 32, textAlign: 'center' },
  roiNumber: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: '#0EA5E9', letterSpacing: 2, lineHeight: 1 },
  roiLabel: { fontSize: 16, fontWeight: 600, color: '#E6EDF3', marginTop: 8, marginBottom: 12 },
  roiDesc: { fontSize: 14, color: '#8B949E', lineHeight: 1.6 },

  // ROI VISUAL
  roiVisual: { margin: '0 auto 48px', maxWidth: 800, borderRadius: 16, overflow: 'hidden', border: '1px solid #21262D', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' },
  roiVisualImg: { width: '100%', display: 'block' },

  // TESTIMONIALS
  testimonialSection: { maxWidth: 700, margin: '0 auto' },
  testimonialCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 16, padding: '40px 36px', textAlign: 'center', position: 'relative' },
  quoteIcon: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 80, color: '#0EA5E9', lineHeight: 0.5, opacity: 0.3, marginBottom: 16 },
  quoteText: { fontSize: 18, color: '#E6EDF3', lineHeight: 1.7, fontStyle: 'italic', marginBottom: 24 },
  quoteAuthor: { display: 'flex', flexDirection: 'column', gap: 4 },
  quoteCompany: { fontSize: 13, color: '#8B949E' },
  slideDots: { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#30363D', border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.2s' },
  dotActive: { background: '#0EA5E9', width: 24, borderRadius: 4 },

  // TIMELINE
  timeline: { display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 32 },
  timelineItem: { display: 'flex', gap: 24, paddingBottom: 40, position: 'relative' },
  timelineDot: { position: 'absolute', left: -32, top: 4, width: 16, height: 16, borderRadius: '50%', background: '#0D1117', border: '2px solid #21262D', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelineDotInner: { width: 8, height: 8, borderRadius: '50%' },
  timelineContent: { flex: 1, background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 24 },
  timelineMeta: { display: 'flex', gap: 12, marginBottom: 8 },
  timelinePhase: { fontSize: 11, fontWeight: 700, color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: 1 },
  timelineDays: { fontSize: 11, color: '#484F58' },
  timelineTitle: { fontSize: 18, fontWeight: 600, color: '#E6EDF3', marginBottom: 12 },
  timelineItems: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 },
  timelineFeature: { fontSize: 13, color: '#8B949E', paddingLeft: 16, position: 'relative' },

  // PRICING
  pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 },
  pricingCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', position: 'relative' },
  pricingCardPopular: { borderWidth: 2, transform: 'scale(1.03)' },
  popularBadge: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#0EA5E9', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  pricingTier: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  pricingName: { fontSize: 22, fontWeight: 700, color: '#E6EDF3', marginBottom: 8 },
  pricingPrice: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, color: '#fff', marginBottom: 20, letterSpacing: 1 },
  pricingPeriod: { fontSize: 16, color: '#8B949E', fontFamily: "'DM Sans', sans-serif" },
  pricingFeatures: { listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 },
  pricingFeature: { fontSize: 14, color: '#C9D1D9', display: 'flex', alignItems: 'center', gap: 8 },
  pricingCTA: { display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', transition: 'opacity 0.2s' },

  // CTA BANNER
  ctaBanner: { padding: '80px 24px', background: 'linear-gradient(135deg, #0c1a2e 0%, #0D1117 100%)', textAlign: 'center' },
  ctaTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: '#fff', letterSpacing: 2, marginBottom: 12 },
  ctaSub: { fontSize: 16, color: '#8B949E', maxWidth: 500, margin: '0 auto 32px', lineHeight: 1.6 },
  ctaActions: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' },
  ctaPrimary: { padding: '14px 36px', background: '#0EA5E9', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600 },
  ctaPhone: { color: '#8B949E', textDecoration: 'none', fontSize: 16, fontWeight: 500 },

  // FOOTER
  footer: { background: '#0a0f18', borderTop: '1px solid #21262D', padding: '60px 24px 24px' },
  footerInner: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 48, flexWrap: 'wrap', marginBottom: 40 },
  footerBrand: { maxWidth: 280 },
  footerLogo: { height: 180, marginBottom: 16 },
  footerDesc: { fontSize: 13, color: '#8B949E', lineHeight: 1.6 },
  footerLinks: { display: 'flex', gap: 48, flexWrap: 'wrap' },
  footerCol: { display: 'flex', flexDirection: 'column', gap: 10 },
  footerColTitle: { fontSize: 13, fontWeight: 700, color: '#E6EDF3', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  footerLink: { fontSize: 13, color: '#8B949E', textDecoration: 'none' },
  footerBottom: { maxWidth: 1200, margin: '0 auto', paddingTop: 24, borderTop: '1px solid #21262D', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#484F58' },
  footerPowered: { fontSize: 12, color: '#30363D' },
};

// Responsive overrides via CSS-in-JS media query injection
const style = document.createElement('style');
style.textContent = `
  @media (max-width: 768px) {
    .landing-nav-links, .landing-nav-actions { display: none !important; }
    .landing-hamburger { display: flex !important; }
  }
  @media (max-width: 768px) {
    .landing-showcase-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 900px) {
    .neural-hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
  }
  @media (max-width: 640px) {
    h1 { font-size: 42px !important; }
    h2 { font-size: 32px !important; }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('landing-responsive')) {
  style.id = 'landing-responsive';
  document.head.appendChild(style);
}

import React, { useState } from 'react';

const GOLD = '#C8962A';
const RED = '#F85149';
const GREEN = '#238636';
const BLUE = '#1A9FE0';
const PURPLE = '#A371F7';
const CYAN = '#39D2C0';
const CARD = '#161B22';
const BORDER = '#30363D';

const LAYERS = [
  {
    id: 'layer1', num: 1, name: 'ERP / Operational', color: BLUE, status: 'BUILT',
    tagline: 'What Already Happened',
    icon: '🗄️',
    description: 'Structured records from the back office — the foundation of all intelligence.',
    dataSources: ['QuickBooks', 'Antera Advance', 'commonsku', 'Facilisgroup', 'SAGE', 'CSV Export'],
    tables: [
      { name: 'iq_customers', records: '140+', desc: 'B2B accounts with LTV, industry, last order' },
      { name: 'iq_quotes', records: '40+', desc: 'Proposals with stage, amount, margin, source' },
      { name: 'iq_quote_items', records: '—', desc: 'Line items per quote' },
      { name: 'iq_orders', records: '25+', desc: 'Confirmed orders with production stage' },
      { name: 'iq_order_items', records: '—', desc: 'Line items per order' },
      { name: 'iq_invoices', records: '20+', desc: 'Billing with payment status, aging' },
      { name: 'iq_products', records: '105+', desc: 'Product catalog with pricing, decoration methods' },
      { name: 'iq_suppliers', records: '56+', desc: 'Vendor profiles with quality scores' },
      { name: 'iq_inventory', records: '105+', desc: 'Stock levels with reorder points' },
      { name: 'iq_shipments', records: '—', desc: 'Carrier, tracking, delivery' },
      { name: 'iq_artwork', records: '20+', desc: 'Proof workflow with revision tracking' },
      { name: 'iq_production_jobs', records: '30+', desc: 'Decoration jobs by method and line' },
    ],
    neuralAnalyzers: [
      'Quote Conversion Leak Detector', 'Artwork Bottleneck Analyzer', 'Production Defect Monitor',
      'Dormant Customer Tracker', 'Inventory Stockout Scanner', 'Overdue Invoice Detector',
      'Reorder Opportunity Predictor', 'Missed Call Calculator', 'Margin Erosion Tracker', 'Stale Quote Monitor'
    ],
    agents: ['Quote Engine', 'Art Director', 'Supply Chain', 'Finance & Billing'],
    ingestion: 'CSV upload + paste with smart column mapping (Levenshtein fuzzy matching)'
  },
  {
    id: 'layer2', num: 2, name: 'Communications', color: GREEN, status: 'PLANNED',
    tagline: 'What People Said',
    icon: '💬',
    description: 'Every conversation is intelligence. 60% of the real value lives here — intent, sentiment, objections, competitor mentions.',
    dataSources: ['RingCentral / 8x8 / Twilio', 'Gmail / Outlook / Exchange', 'Website Chat', 'Twilio SMS', 'Zoom / Teams'],
    tables: [
      { name: 'iq_calls', records: '50+', desc: 'Voice AI call logs with transcript + sentiment' },
      { name: 'iq_emails', records: '—', desc: 'Inbound/outbound email with intent detection' },
      { name: 'iq_chats', records: '—', desc: 'Website/WhatsApp chat sessions' },
      { name: 'iq_sms', records: '—', desc: 'SMS/text message tracking' },
      { name: 'iq_meetings', records: '—', desc: 'Meeting notes with competitor mentions, action items' },
    ],
    neuralAnalyzers: [
      'Email Response Time Analysis', 'Intent Distribution Tracker', 'Sentiment Trend Monitor',
      'Competitor Mention Frequency', 'Communication Gap Detector'
    ],
    agents: ['Customer Voice (Rachel/Ana/Lina)', 'Sales Intelligence'],
    ingestion: 'Phone system webhook + email forwarding + chat widget + Twilio SMS webhook'
  },
  {
    id: 'layer3', num: 3, name: 'Market & Industry', color: GOLD, status: 'PLANNED',
    tagline: 'What\'s Happening Outside',
    icon: '🌐',
    description: 'External signals — product trends, supplier stock, market pricing, trade shows, competitor activity.',
    dataSources: ['ASI / ESP', 'SAGE', 'PromoStandards API', 'PPAI Event Calendar', 'Web Monitoring'],
    tables: [
      { name: 'iq_catalog_feed', records: '—', desc: '100K+ SKUs from ASI/SAGE with pricing, images' },
      { name: 'iq_supplier_inventory', records: '—', desc: 'Real-time stock levels from PromoStandards' },
      { name: 'iq_rate_benchmarks', records: '—', desc: 'Market pricing by category, method, qty' },
      { name: 'iq_trade_shows', records: '—', desc: 'Event calendar with buying window prediction' },
      { name: 'iq_competitor_intel', records: '—', desc: 'Competitor signals — price, product, activity' },
    ],
    neuralAnalyzers: [
      'Rate Competitiveness Analyzer', 'Trending Product Alerts', 'Trade Show Pipeline Predictor',
      'Supplier Lead Time Risk', 'Catalog Gap Detector'
    ],
    agents: ['Catalog Intelligence', 'Compliance'],
    ingestion: 'ASI/SAGE API sync (nightly) + PromoStandards API (real-time) + event database'
  },
  {
    id: 'layer4', num: 4, name: 'Production & Sensors', color: RED, status: 'PLANNED',
    tagline: 'What Machines Are Doing',
    icon: '🏭',
    description: 'Real-time shop floor — machine status, OEE, QC vision, barcode tracking, shipping events.',
    dataSources: ['PLC / IoT Sensors', 'QC Station Cameras', 'Barcode Scanners', 'UPS / FedEx / USPS API', 'n8n Webhooks'],
    tables: [
      { name: 'iq_machines', records: '—', desc: 'Machine registry with type, line, capacity' },
      { name: 'iq_machine_events', records: '—', desc: 'Real-time status changes (running/idle/fault)' },
      { name: 'iq_qc_inspections', records: '—', desc: 'QC results with color delta, placement offset' },
      { name: 'iq_scan_events', records: '—', desc: 'Barcode scans through workflow stages' },
      { name: 'iq_shipping_events', records: '—', desc: 'Carrier tracking events (pickup → delivered)' },
    ],
    neuralAnalyzers: [
      'Machine Utilization Monitor', 'Bottleneck Predictor', 'QC Defect Trend Analyzer',
      'On-Time Delivery Risk', 'OEE Score Tracker'
    ],
    agents: ['Production Orchestrator', 'QC Vision', 'Fulfillment'],
    ingestion: 'PLC webhook + barcode scanner API + carrier tracking webhook + QC camera feed'
  },
  {
    id: 'layer5', num: 5, name: 'Behavioral & Engagement', color: PURPLE, status: 'PLANNED',
    tagline: 'What They Will Do Next',
    icon: '🔮',
    description: 'Digital behavior signals that predict future actions — browsing, email engagement, search, social, churn risk.',
    dataSources: ['Website / Portal Analytics', 'SendGrid / Mailchimp', 'Search Logs', 'LinkedIn / Social', 'NPS / Reviews'],
    tables: [
      { name: 'iq_page_views', records: '—', desc: 'Website/portal browsing with product interest' },
      { name: 'iq_email_engagement', records: '—', desc: 'Campaign opens, clicks, conversions' },
      { name: 'iq_search_queries', records: '—', desc: 'What customers search for (intent signals)' },
      { name: 'iq_engagement_scores', records: '—', desc: 'Daily computed score per customer (0-100)' },
      { name: 'iq_social_signals', records: '—', desc: 'Social media buying signals (events, hiring)' },
    ],
    neuralAnalyzers: [
      'Engagement Score Distribution', 'Churn Prediction Model', 'Reorder Signal Detection',
      'Campaign Effectiveness Analyzer', 'Search Intent Analysis'
    ],
    agents: ['Sales Intelligence', 'Catalog Intelligence'],
    ingestion: 'Tracking pixel + email webhook + portal event logging + social monitoring API'
  }
];

const AGENTS = [
  { name: 'Catalog Intelligence', icon: '📚', layers: [1,3,5], desc: 'SKU tagging, trend prediction, catalog curation, gap analysis' },
  { name: 'Quote Engine', icon: '💰', layers: [1,2,3], desc: 'NL→quote, pricing, volume breaks, multi-option proposals' },
  { name: 'Art Director', icon: '🎨', layers: [1,4], desc: 'Preflight validation, virtual proofs, color matching, revision automation' },
  { name: 'Production Orchestrator', icon: '🏭', layers: [1,4], desc: 'Job routing, scheduling, bottleneck detection, OEE optimization' },
  { name: 'Supply Chain', icon: '🚚', layers: [1,3], desc: 'Auto-reorder, supplier scoring, overseas pipeline, MOQ optimization' },
  { name: 'QC Vision', icon: '🔍', layers: [1,4], desc: 'AI visual inspection, color delta, defect detection, pass/fail automation' },
  { name: 'Fulfillment', icon: '📬', layers: [1,4], desc: 'Carrier selection, label generation, split shipments, delivery tracking' },
  { name: 'Customer Voice', icon: '🎙️', layers: [1,2], desc: 'Rachel/Ana/Lina — inbound/outbound calls, reorders, status checks' },
  { name: 'Sales Intelligence', icon: '📊', layers: [1,2,5], desc: 'Lead scoring, pipeline management, win/loss analysis, rep performance' },
  { name: 'Finance & Billing', icon: '🧾', layers: [1], desc: 'Auto-invoice, collections automation, margin analysis, tax compliance' },
  { name: 'Compliance', icon: '🛡️', layers: [1,3], desc: 'CPSIA, Prop 65, import compliance, recall monitoring, ESG reporting' },
];

const COMMANDS = [
  { cmd: '/imprintiq all', desc: 'All 5 layers, end-to-end' },
  { cmd: '/imprintiq layer1', desc: 'Extend ERP ingestion (add 8 more data types)' },
  { cmd: '/imprintiq layer2', desc: 'Communications — emails, chat, SMS, meetings, transcripts' },
  { cmd: '/imprintiq layer3', desc: 'Market — ASI/SAGE feeds, pricing, trade shows, competitors' },
  { cmd: '/imprintiq layer4', desc: 'Production — machines, OEE, QC vision, barcode, shipping' },
  { cmd: '/imprintiq layer5', desc: 'Behavioral — page views, engagement, churn prediction' },
  { cmd: '/imprintiq production board', desc: 'Just the production Kanban board' },
  { cmd: '/imprintiq email parsing', desc: 'Just the email intelligence feature' },
  { cmd: '/imprintiq qc vision', desc: 'Just the QC camera comparison feature' },
];

export default function Architecture() {
  const [activeLayer, setActiveLayer] = useState(null);
  const [view, setView] = useState('overview');

  const pill = (text, color) => (
    <span style={{ fontSize:10, padding:'3px 10px', borderRadius:10, background:color+'22', color, fontWeight:600, whiteSpace:'nowrap' }}>{text}</span>
  );

  const statusBadge = (status) => {
    const map = { BUILT: GREEN, 'PARTIALLY BUILT': GOLD, PLANNED: '#484F58' };
    return pill(status, map[status] || '#484F58');
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
          <div>
            <h2 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:28, margin:0, letterSpacing:2 }}>SYSTEM ARCHITECTURE</h2>
            <p style={{ color:'#8B949E', fontSize:13, marginTop:4 }}>ImprintIQ — 5-Layer AI Ecosystem for Promotional Products</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {['overview','diagram','layers','agents','data','build'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding:'8px 16px', borderRadius:6, border:`1px solid ${view === v ? GOLD : BORDER}`, background: view === v ? GOLD+'22' : 'transparent', color: view === v ? GOLD : '#8B949E', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
                {v === 'diagram' ? 'Visual Diagram' : v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════ OVERVIEW ═══════════ */}
      {view === 'overview' && (
        <div>
          {/* Architecture Diagram */}
          <div style={{ background:CARD, borderRadius:16, padding:28, border:`1px solid ${BORDER}`, marginBottom:24 }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:20, textAlign:'center', letterSpacing:2 }}>5-LAYER DATA ARCHITECTURE</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {LAYERS.slice().reverse().map((layer) => (
                <div key={layer.id} onClick={() => { setActiveLayer(layer.id); setView('layers'); }}
                  style={{ display:'grid', gridTemplateColumns:'40px 1fr 200px 100px', alignItems:'center', padding:'14px 16px', borderRadius:10, cursor:'pointer', border:`1px solid ${layer.color}33`, background:`${layer.color}08`, transition:'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = `${layer.color}18`}
                  onMouseLeave={e => e.currentTarget.style.background = `${layer.color}08`}>
                  <span style={{ fontSize:22 }}>{layer.icon}</span>
                  <div>
                    <span style={{ color:layer.color, fontSize:14, fontWeight:700 }}>LAYER {layer.num}: {layer.name.toUpperCase()}</span>
                    <span style={{ color:'#8B949E', fontSize:12, marginLeft:12 }}>{layer.tagline}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    {pill(`${layer.tables.length} tables`, layer.color)}
                    {pill(`${layer.neuralAnalyzers.length} analyzers`, layer.color)}
                  </div>
                  {statusBadge(layer.status)}
                </div>
              ))}
            </div>

            {/* Arrow to Neural */}
            <div style={{ textAlign:'center', margin:'16px 0 8px' }}>
              <div style={{ color:GOLD, fontSize:20 }}>▼ ALL 5 LAYERS FEED ▼</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:`${GOLD}11`, borderRadius:12, padding:16, border:`1px solid ${GOLD}33`, textAlign:'center' }}>
                <div style={{ fontSize:28 }}>🧠</div>
                <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:18, marginTop:4 }}>NEURAL INTELLIGENCE</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>6 Health Panels &bull; 15+ Analyzers &bull; Diagnostic + Prescriptive</div>
              </div>
              <div style={{ background:`${GREEN}11`, borderRadius:12, padding:16, border:`1px solid ${GREEN}33`, textAlign:'center' }}>
                <div style={{ fontSize:28 }}>🤖</div>
                <div style={{ fontFamily:'Bebas Neue', color:GREEN, fontSize:18, marginTop:4 }}>11 AI AGENTS</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>Autonomous operations &bull; Treatment execution &bull; 24/7</div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
            {[
              { label: 'Data Layers', value: '5', color: BLUE },
              { label: 'Database Tables', value: `${LAYERS.reduce((s,l) => s+l.tables.length, 0)}`, color: GREEN },
              { label: 'AI Agents', value: '11', color: GOLD },
              { label: 'Neural Analyzers', value: `${LAYERS.reduce((s,l) => s+l.neuralAnalyzers.length, 0)}+`, color: PURPLE },
              { label: 'Health Panels', value: '6', color: CYAN },
              { label: 'Treatment Templates', value: '10', color: RED },
            ].map((s, i) => (
              <div key={i} style={{ background:CARD, borderRadius:10, padding:14, border:`1px solid ${BORDER}`, textAlign:'center', borderTop:`3px solid ${s.color}` }}>
                <div style={{ color:s.color, fontSize:28, fontFamily:'Bebas Neue' }}>{s.value}</div>
                <div style={{ color:'#8B949E', fontSize:10, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Value Unlock Table */}
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}` }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:18, marginBottom:16 }}>WHAT EACH LAYER UNLOCKS</h3>
            {[
              { layers: 'Layer 1 only', what: 'Dashboard + historical findings', value: '"Here\'s what you lost last month"', color: BLUE },
              { layers: '+ Layer 2', what: 'Voice AI, email parsing, real-time intent', value: '"Here\'s what\'s happening right now"', color: GREEN },
              { layers: '+ Layer 3', what: 'Competitive pricing, catalog intelligence, demand forecasting', value: '"Here\'s what the market is doing"', color: GOLD },
              { layers: '+ Layer 4', what: 'OEE, QC automation, real-time scheduling', value: '"Here\'s what your factory is doing"', color: RED },
              { layers: '+ Layer 5', what: 'Predictive reorders, churn prevention, upsell triggers', value: '"Here\'s what will happen next"', color: PURPLE },
            ].map((row, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'140px 1fr 1fr', gap:16, padding:'10px 0', borderBottom: i < 4 ? `1px solid #21262D` : 'none', alignItems:'center' }}>
                <span style={{ color:row.color, fontSize:13, fontWeight:700 }}>{row.layers}</span>
                <span style={{ color:'#C9D1D9', fontSize:12 }}>{row.what}</span>
                <span style={{ color:'#8B949E', fontSize:12, fontStyle:'italic' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ VISUAL DIAGRAM ═══════════ */}
      {view === 'diagram' && (() => {
        const W = '100%';
        const box = (x, y, w, h, color, label, sub, icon) => (
          <g key={label}>
            <rect x={x} y={y} width={w} height={h} rx={8} fill={color+'15'} stroke={color} strokeWidth={1.5} />
            {icon && <text x={x+12} y={y+22} fontSize={16}>{icon}</text>}
            <text x={x + (icon ? 32 : w/2)} y={y+22} fill={color} fontSize={12} fontWeight="700" textAnchor={icon ? 'start' : 'middle'} fontFamily="DM Sans">{label}</text>
            {sub && <text x={x + (icon ? 32 : w/2)} y={y+38} fill="#8B949E" fontSize={9} textAnchor={icon ? 'start' : 'middle'} fontFamily="DM Sans">{sub}</text>}
          </g>
        );
        const arrow = (x1,y1,x2,y2,color) => (
          <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color||'#30363D'} strokeWidth={1.5} markerEnd="url(#arrowhead)" />
        );
        const dashedArrow = (x1,y1,x2,y2,color) => (
          <line key={`d${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color||'#30363D'} strokeWidth={1} strokeDasharray="4,3" markerEnd="url(#arrowhead)" />
        );

        return (
          <div>
            {/* Full System Flow */}
            <div style={{ background:CARD, borderRadius:16, padding:24, border:`1px solid ${BORDER}`, marginBottom:20, overflowX:'auto' }}>
              <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:4, textAlign:'center', letterSpacing:2 }}>IMPRINTIQ SYSTEM ARCHITECTURE</h3>
              <p style={{ color:'#484F58', fontSize:11, textAlign:'center', marginBottom:16 }}>End-to-end data flow from external sources through 5 layers to AI agents + Neural Intelligence</p>
              <svg width="100%" viewBox="0 0 1100 720" style={{ maxWidth:1100, margin:'0 auto', display:'block' }}>
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#8B949E"/></marker>
                  <marker id="arrowGold" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={GOLD}/></marker>
                </defs>

                {/* ─── EXTERNAL SOURCES (Top) ─── */}
                <text x={550} y={20} fill="#484F58" fontSize={10} textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={2}>EXTERNAL DATA SOURCES</text>
                {box(10,30,120,48,BLUE,'QuickBooks','ERP / Accounting','🗄️')}
                {box(140,30,120,48,BLUE,'Antera / commonsku','Promo ERP','📦')}
                {box(270,30,120,48,GREEN,'Phone System','RingCentral / Twilio','📞')}
                {box(400,30,120,48,GREEN,'Email / Chat','Gmail / Outlook','💬')}
                {box(530,30,120,48,GOLD,'ASI / SAGE','Product Feeds','📚')}
                {box(660,30,120,48,GOLD,'PromoStandards','Inventory API','🔗')}
                {box(790,30,120,48,RED,'PLC / Sensors','Shop Floor IoT','🏭')}
                {box(920,30,120,48,PURPLE,'Website / Portal','Analytics','🌐')}

                {/* Arrows down from sources to layers */}
                {arrow(70,78,70,120,BLUE)}
                {arrow(200,78,200,120,BLUE)}
                {arrow(330,78,330,180,GREEN)}
                {arrow(460,78,460,180,GREEN)}
                {arrow(590,78,590,250,GOLD)}
                {arrow(720,78,720,250,GOLD)}
                {arrow(850,78,850,320,RED)}
                {arrow(980,78,980,390,PURPLE)}

                {/* ─── LAYER 1: ERP ─── */}
                <rect x={20} y={100} width={500} height={65} rx={10} fill={BLUE+'10'} stroke={BLUE} strokeWidth={2} />
                <text x={30} y={118} fill={BLUE} fontSize={11} fontWeight="700" fontFamily="Bebas Neue" letterSpacing={1}>LAYER 1: ERP / OPERATIONAL</text>
                <text x={530} y={118} fill={BLUE} fontSize={9} textAnchor="end" fontFamily="DM Sans">WHAT ALREADY HAPPENED</text>
                <rect x={30} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={42} y={131} fill="#8B949E" fontSize={9} fontFamily="DM Sans">Customers</text>
                <rect x={100} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={112} y={131} fill="#8B949E" fontSize={9}>Quotes</text>
                <rect x={155} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={167} y={131} fill="#8B949E" fontSize={9}>Orders</text>
                <rect x={210} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={222} y={131} fill="#8B949E" fontSize={9}>Invoices</text>
                <rect x={270} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={282} y={131} fill="#8B949E" fontSize={9}>Products</text>
                <rect x={340} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={352} y={131} fill="#8B949E" fontSize={9}>Inventory</text>
                <rect x={410} y={124} width={6} height={6} rx={3} fill={GREEN}/><text x={422} y={131} fill="#8B949E" fontSize={9}>Shipments</text>
                <text x={30} y={155} fill={GREEN} fontSize={9} fontFamily="DM Sans">✅ BUILT — CSV upload + smart column mapping</text>

                {/* ─── LAYER 2: COMMS ─── */}
                <rect x={20} y={175} width={500} height={55} rx={10} fill={GREEN+'10'} stroke={GREEN} strokeWidth={2} />
                <text x={30} y={193} fill={GREEN} fontSize={11} fontWeight="700" fontFamily="Bebas Neue" letterSpacing={1}>LAYER 2: COMMUNICATIONS</text>
                <text x={530} y={193} fill={GREEN} fontSize={9} textAnchor="end" fontFamily="DM Sans">WHAT PEOPLE SAID</text>
                <text x={30} y={210} fill="#8B949E" fontSize={9} fontFamily="DM Sans">Calls + Transcripts &bull; Emails &bull; Chat &bull; SMS &bull; Meeting Notes</text>
                <text x={30} y={222} fill="#484F58" fontSize={9} fontFamily="DM Sans">PLANNED — Voice AI auto-generates data from every call</text>

                {/* ─── LAYER 3: MARKET ─── */}
                <rect x={20} y={245} width={500} height={55} rx={10} fill={GOLD+'10'} stroke={GOLD} strokeWidth={2} />
                <text x={30} y={263} fill={GOLD} fontSize={11} fontWeight="700" fontFamily="Bebas Neue" letterSpacing={1}>LAYER 3: MARKET & INDUSTRY</text>
                <text x={530} y={263} fill={GOLD} fontSize={9} textAnchor="end" fontFamily="DM Sans">WHAT'S HAPPENING OUTSIDE</text>
                <text x={30} y={280} fill="#8B949E" fontSize={9} fontFamily="DM Sans">100K SKU Catalog &bull; Supplier Stock &bull; Rate Benchmarks &bull; Trade Shows &bull; Competitors</text>
                <text x={30} y={292} fill="#484F58" fontSize={9} fontFamily="DM Sans">PLANNED — ASI/SAGE sync + PromoStandards API</text>

                {/* ─── LAYER 4: PRODUCTION ─── */}
                <rect x={20} y={315} width={500} height={55} rx={10} fill={RED+'10'} stroke={RED} strokeWidth={2} />
                <text x={30} y={333} fill={RED} fontSize={11} fontWeight="700" fontFamily="Bebas Neue" letterSpacing={1}>LAYER 4: PRODUCTION & SENSORS</text>
                <text x={530} y={333} fill={RED} fontSize={9} textAnchor="end" fontFamily="DM Sans">WHAT MACHINES ARE DOING</text>
                <text x={30} y={350} fill="#8B949E" fontSize={9} fontFamily="DM Sans">Machine OEE &bull; QC Vision &bull; Barcode Scans &bull; Shipping Events</text>
                <text x={30} y={362} fill="#484F58" fontSize={9} fontFamily="DM Sans">PLANNED — PLC webhook + QC camera + carrier API</text>

                {/* ─── LAYER 5: BEHAVIORAL ─── */}
                <rect x={20} y={385} width={500} height={55} rx={10} fill={PURPLE+'10'} stroke={PURPLE} strokeWidth={2} />
                <text x={30} y={403} fill={PURPLE} fontSize={11} fontWeight="700" fontFamily="Bebas Neue" letterSpacing={1}>LAYER 5: BEHAVIORAL & ENGAGEMENT</text>
                <text x={530} y={403} fill={PURPLE} fontSize={9} textAnchor="end" fontFamily="DM Sans">WHAT THEY WILL DO NEXT</text>
                <text x={30} y={420} fill="#8B949E" fontSize={9} fontFamily="DM Sans">Page Views &bull; Email Engagement &bull; Search Queries &bull; Engagement Scores &bull; Social Signals</text>
                <text x={30} y={432} fill="#484F58" fontSize={9} fontFamily="DM Sans">PLANNED — Tracking pixel + email webhook + portal analytics</text>

                {/* ─── CONVERGENCE ARROWS ─── */}
                {arrow(270,165,660,480,'#30363D')}
                {arrow(270,230,660,485,'#30363D')}
                {arrow(270,300,660,490,'#30363D')}
                {arrow(270,370,660,495,'#30363D')}
                {arrow(270,440,660,500,'#30363D')}

                {/* ─── NEURAL INTELLIGENCE (Center-Right) ─── */}
                <rect x={600} y={460} width={240} height={100} rx={14} fill={GOLD+'18'} stroke={GOLD} strokeWidth={2.5} />
                <text x={720} y={488} fill={GOLD} fontSize={14} fontWeight="700" textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={2}>NEURAL INTELLIGENCE</text>
                <text x={720} y={506} fill="#C9D1D9" fontSize={10} textAnchor="middle" fontFamily="DM Sans">6 Health Panels</text>
                <text x={720} y={520} fill="#C9D1D9" fontSize={10} textAnchor="middle" fontFamily="DM Sans">15+ Diagnostic Analyzers</text>
                <text x={720} y={536} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Diagnostic + Prescriptive (Treatment = $$$)</text>
                <text x={720} y={552} fill={GREEN} fontSize={9} textAnchor="middle" fontFamily="DM Sans">✅ BUILT</text>

                {/* ─── Arrow: Neural → Agents ─── */}
                <line x1={720} y1={560} x2={720} y2={590} stroke={GOLD} strokeWidth={2} markerEnd="url(#arrowGold)"/>

                {/* ─── 11 AI AGENTS (Bottom) ─── */}
                <rect x={545} y={595} width={350} height={110} rx={14} fill={GREEN+'12'} stroke={GREEN} strokeWidth={2} />
                <text x={720} y={618} fill={GREEN} fontSize={13} fontWeight="700" textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={2}>11 AI AGENTS</text>
                {[
                  { x:555, y:628, icon:'📚', name:'Catalog' },
                  { x:625, y:628, icon:'💰', name:'Quote' },
                  { x:695, y:628, icon:'🎨', name:'Art' },
                  { x:765, y:628, icon:'🏭', name:'Production' },
                  { x:835, y:628, icon:'🚚', name:'Supply' },
                  { x:555, y:665, icon:'🔍', name:'QC' },
                  { x:625, y:665, icon:'📬', name:'Fulfill' },
                  { x:695, y:665, icon:'🎙️', name:'Voice' },
                  { x:765, y:665, icon:'📊', name:'Sales' },
                  { x:835, y:665, icon:'🧾', name:'Finance' },
                ].map((a,i) => (
                  <g key={i}>
                    <rect x={a.x} y={a.y} width={60} height={28} rx={6} fill="#21262D" stroke="#30363D" strokeWidth={1}/>
                    <text x={a.x+8} y={a.y+18} fontSize={11}>{a.icon}</text>
                    <text x={a.x+24} y={a.y+18} fill="#8B949E" fontSize={8} fontFamily="DM Sans">{a.name}</text>
                  </g>
                ))}
                <text x={720} y={712} fill={GREEN} fontSize={9} textAnchor="middle" fontFamily="DM Sans">✅ REGISTERED — Standby Mode (activate per consulting license)</text>

                {/* ─── TREATMENT PAYWALL ─── */}
                <rect x={900} y={595} width={180} height={110} rx={14} fill={RED+'12'} stroke={RED} strokeWidth={2} strokeDasharray="6,3"/>
                <text x={990} y={618} fill={RED} fontSize={11} fontWeight="700" textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={1}>TREATMENT LAYER</text>
                <text x={990} y={636} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">10 Automation Workflows</text>
                <text x={990} y={652} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">SMS + CRM + Callbacks</text>
                <text x={990} y={668} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Voice Agent Execution</text>
                <text x={990} y={690} fill={RED} fontSize={10} fontWeight="700" textAnchor="middle" fontFamily="DM Sans">LOCKED</text>
                <text x={990} y={703} fill="#484F58" fontSize={8} textAnchor="middle" fontFamily="DM Sans">Consulting / License Fee</text>

                {/* Arrow: Agents → Treatment */}
                {dashedArrow(895,650,900,650,RED)}

                {/* ─── INGESTION MODULE (Left side) ─── */}
                <rect x={560} y={100} width={200} height={120} rx={10} fill={CYAN+'10'} stroke={CYAN} strokeWidth={1.5} />
                <text x={660} y={120} fill={CYAN} fontSize={11} fontWeight="700" textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={1}>DATA INGESTION</text>
                <text x={660} y={138} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">CSV Upload</text>
                <text x={660} y={152} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Paste from Spreadsheet</text>
                <text x={660} y={166} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Smart Column Mapping</text>
                <text x={660} y={180} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">API Connectors (planned)</text>
                <text x={660} y={198} fill="#484F58" fontSize={8} textAnchor="middle" fontFamily="DM Sans">6 types active &bull; 8 more planned</text>
                <text x={660} y={212} fill={GREEN} fontSize={9} textAnchor="middle" fontFamily="DM Sans">✅ BUILT</text>
                {dashedArrow(560,160,520,140,CYAN)}

                {/* ─── CLIENT PORTAL (Right side top) ─── */}
                <rect x={800} y={100} width={180} height={90} rx={10} fill="#21262D" stroke="#30363D" strokeWidth={1.5} />
                <text x={890} y={120} fill="#E6EDF3" fontSize={11} fontWeight="700" textAnchor="middle" fontFamily="Bebas Neue" letterSpacing={1}>CLIENT DASHBOARD</text>
                <text x={890} y={138} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Neural Health Score</text>
                <text x={890} y={152} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">KPIs + Findings</text>
                <text x={890} y={166} fill="#8B949E" fontSize={9} textAnchor="middle" fontFamily="DM Sans">Process & ROI</text>
                <text x={890} y={180} fill={GREEN} fontSize={9} textAnchor="middle" fontFamily="DM Sans">✅ BUILT</text>
                {dashedArrow(890,190,780,460,'#30363D')}

              </svg>
            </div>

            {/* Legend */}
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', justifyContent:'center' }}>
              {[
                { color: BLUE, label: 'Layer 1: ERP' },
                { color: GREEN, label: 'Layer 2: Comms' },
                { color: GOLD, label: 'Layer 3: Market' },
                { color: RED, label: 'Layer 4: Production' },
                { color: PURPLE, label: 'Layer 5: Behavioral' },
                { color: CYAN, label: 'Ingestion Module' },
              ].map((l, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:l.color }} />
                  <span style={{ color:'#8B949E', fontSize:11 }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:3, background:'#8B949E' }} />
                <span style={{ color:'#8B949E', fontSize:11 }}>Data Flow</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:3, background:RED, borderTop:'1px dashed' }} />
                <span style={{ color:'#8B949E', fontSize:11 }}>Paywall (Treatment)</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════ LAYERS DETAIL ═══════════ */}
      {view === 'layers' && (
        <div>
          {/* Layer selector */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            {LAYERS.map(l => (
              <button key={l.id} onClick={() => setActiveLayer(activeLayer === l.id ? null : l.id)}
                style={{ padding:'8px 14px', borderRadius:6, border:`1px solid ${activeLayer === l.id ? l.color : BORDER}`, background: activeLayer === l.id ? l.color+'22' : 'transparent', color: activeLayer === l.id ? l.color : '#8B949E', fontSize:12, cursor:'pointer' }}>
                {l.icon} Layer {l.num}
              </button>
            ))}
          </div>

          {/* Show all or selected layer */}
          {LAYERS.filter(l => !activeLayer || l.id === activeLayer).map(layer => (
            <div key={layer.id} style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${layer.color}`, marginBottom:16 }}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>{layer.icon}</span>
                  <div>
                    <h3 style={{ fontFamily:'Bebas Neue', color:layer.color, fontSize:22, margin:0 }}>LAYER {layer.num}: {layer.name.toUpperCase()}</h3>
                    <p style={{ color:'#8B949E', fontSize:12, margin:0 }}>{layer.tagline}</p>
                  </div>
                </div>
                {statusBadge(layer.status)}
              </div>
              <p style={{ color:'#C9D1D9', fontSize:13, lineHeight:1.6, marginBottom:16 }}>{layer.description}</p>

              {/* Data Sources */}
              <div style={{ marginBottom:16 }}>
                <div style={{ color:'#8B949E', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Data Sources</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {layer.dataSources.map(s => <span key={s} style={{ background:'#21262D', color:'#C9D1D9', fontSize:11, padding:'4px 10px', borderRadius:6, border:`1px solid ${BORDER}` }}>{s}</span>)}
                </div>
              </div>

              {/* Database Tables */}
              <div style={{ marginBottom:16 }}>
                <div style={{ color:'#8B949E', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Database Tables ({layer.tables.length})</div>
                <div style={{ background:'#0D1117', borderRadius:8, border:`1px solid #21262D`, overflow:'hidden' }}>
                  {layer.tables.map((t, i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'200px 60px 1fr', padding:'6px 12px', borderBottom: i < layer.tables.length - 1 ? '1px solid #21262D' : 'none', fontSize:12 }}>
                      <span style={{ color:layer.color, fontFamily:'monospace' }}>{t.name}</span>
                      <span style={{ color: t.records !== '—' ? GREEN : '#484F58' }}>{t.records}</span>
                      <span style={{ color:'#8B949E' }}>{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Neural Analyzers */}
              <div style={{ marginBottom:16 }}>
                <div style={{ color:'#8B949E', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Neural Analyzers ({layer.neuralAnalyzers.length})</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {layer.neuralAnalyzers.map(a => pill(a, layer.color))}
                </div>
              </div>

              {/* AI Agents */}
              <div style={{ marginBottom:12 }}>
                <div style={{ color:'#8B949E', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>AI Agents Powered</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {layer.agents.map(a => pill(a, GREEN))}
                </div>
              </div>

              {/* Ingestion Method */}
              <div style={{ padding:10, background:`${layer.color}08`, borderRadius:6, border:`1px solid ${layer.color}22` }}>
                <span style={{ color:'#8B949E', fontSize:11 }}>Ingestion: </span>
                <span style={{ color:'#C9D1D9', fontSize:12 }}>{layer.ingestion}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ AGENTS ═══════════ */}
      {view === 'agents' && (
        <div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:8 }}>11 AUTONOMOUS AI AGENTS</h3>
            <p style={{ color:'#8B949E', fontSize:13 }}>Each agent consumes data from specific layers and operates autonomously. Treatment activation is the monetization gate.</p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:12 }}>
            {AGENTS.map((agent, i) => (
              <div key={i} style={{ background:CARD, borderRadius:12, padding:18, border:`1px solid ${BORDER}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:26 }}>{agent.icon}</span>
                    <span style={{ color:'#E6EDF3', fontSize:15, fontWeight:700 }}>{agent.name}</span>
                  </div>
                </div>
                <p style={{ color:'#8B949E', fontSize:12, lineHeight:1.5, marginBottom:10 }}>{agent.desc}</p>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <span style={{ color:'#484F58', fontSize:10 }}>Feeds from:</span>
                  {agent.layers.map(l => {
                    const layer = LAYERS[l-1];
                    return <span key={l} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:layer.color+'22', color:layer.color }}>{layer.icon} L{l}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ DATA MODEL ═══════════ */}
      {view === 'data' && (
        <div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:8 }}>COMPLETE DATA MODEL</h3>
            <p style={{ color:'#8B949E', fontSize:13 }}>All tables use <code style={{ color:GOLD, background:'#21262D', padding:'2px 6px', borderRadius:4 }}>iq_</code> prefix. PostgreSQL on Render. Multi-tenant via <code style={{ color:GOLD, background:'#21262D', padding:'2px 6px', borderRadius:4 }}>tenant_id</code>.</p>
          </div>

          {/* Group by layer */}
          {LAYERS.map(layer => (
            <div key={layer.id} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:18 }}>{layer.icon}</span>
                <span style={{ fontFamily:'Bebas Neue', color:layer.color, fontSize:16 }}>LAYER {layer.num}: {layer.name.toUpperCase()}</span>
                {statusBadge(layer.status)}
              </div>
              <div style={{ background:CARD, borderRadius:10, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
                {layer.tables.map((t, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'220px 80px 1fr', padding:'8px 14px', borderBottom: i < layer.tables.length - 1 ? '1px solid #21262D' : 'none', alignItems:'center' }}>
                    <span style={{ color:layer.color, fontFamily:'monospace', fontSize:12 }}>{t.name}</span>
                    <span style={{ color: t.records !== '—' ? GREEN : '#484F58', fontSize:12, fontFamily:'monospace' }}>{t.records}</span>
                    <span style={{ color:'#8B949E', fontSize:12 }}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Core infrastructure tables */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:18 }}>⚙️</span>
              <span style={{ fontFamily:'Bebas Neue', color:'#8B949E', fontSize:16 }}>CORE INFRASTRUCTURE</span>
              {statusBadge('BUILT')}
            </div>
            <div style={{ background:CARD, borderRadius:10, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
              {[
                { name: 'iq_users', records: '1+', desc: 'Auth & user management with JWT' },
                { name: 'iq_neural_insights', records: 'dynamic', desc: 'Diagnostic findings per category per date' },
                { name: 'iq_neural_treatments', records: 'dynamic', desc: 'Activated treatment workflows' },
                { name: 'iq_treatment_log', records: 'dynamic', desc: 'Treatment execution history' },
                { name: 'iq_agent_sessions', records: 'dynamic', desc: 'AI agent activity log' },
                { name: 'iq_reorder_predictions', records: '12+', desc: 'AI-generated reorder forecasts' },
                { name: 'iq_compliance', records: '—', desc: 'Product compliance records (CPSIA, Prop 65)' },
              ].map((t, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'220px 80px 1fr', padding:'8px 14px', borderBottom: i < 6 ? '1px solid #21262D' : 'none', alignItems:'center' }}>
                  <span style={{ color:'#8B949E', fontFamily:'monospace', fontSize:12 }}>{t.name}</span>
                  <span style={{ color: t.records !== '—' ? GREEN : '#484F58', fontSize:12, fontFamily:'monospace' }}>{t.records}</span>
                  <span style={{ color:'#8B949E', fontSize:12 }}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div style={{ background:`${GOLD}11`, borderRadius:10, padding:14, border:`1px solid ${GOLD}33`, textAlign:'center' }}>
            <span style={{ color:GOLD, fontSize:14, fontWeight:700 }}>TOTAL: {LAYERS.reduce((s,l) => s+l.tables.length, 0) + 7} tables across 5 data layers + core infrastructure</span>
          </div>
        </div>
      )}

      {/* ═══════════ BUILD COMMANDS ═══════════ */}
      {view === 'build' && (
        <div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:8 }}>BUILD COMMANDS</h3>
            <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>
              Use the <code style={{ color:GOLD, background:'#21262D', padding:'2px 6px', borderRadius:4 }}>/imprintiq</code> command with the RinglyPro Architect agent to build any layer or feature.
            </p>
          </div>

          {/* Command Table */}
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h4 style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>COMMANDS</h4>
            {COMMANDS.map((c, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'280px 1fr', padding:'8px 0', borderBottom: i < COMMANDS.length - 1 ? '1px solid #21262D' : 'none' }}>
                <code style={{ color:GREEN, fontSize:13, fontFamily:'monospace' }}>{c.cmd}</code>
                <span style={{ color:'#C9D1D9', fontSize:13 }}>{c.desc}</span>
              </div>
            ))}
          </div>

          {/* What the prompt includes */}
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h4 style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>PROMPT INCLUDES</h4>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))', gap:10 }}>
              {[
                { icon: '🗄️', text: 'Full SQL schemas for every table in all 5 layers' },
                { icon: '⚙️', text: 'Backend service + route specifications' },
                { icon: '🧠', text: 'Neural analyzer requirements per layer' },
                { icon: '🖥️', text: 'Frontend page specifications' },
                { icon: '🚀', text: 'Build & deploy instructions' },
                { icon: '✅', text: 'Tracks what\'s built — no duplicate work' },
              ].map((item, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:10, background:'#0D1117', borderRadius:8, border:'1px solid #21262D' }}>
                  <span style={{ fontSize:18 }}>{item.icon}</span>
                  <span style={{ color:'#C9D1D9', fontSize:12 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tech Stack */}
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h4 style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>TECH STACK</h4>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
              {[
                { cat: 'Backend', items: 'Node.js, Express.js, Raw SQL' },
                { cat: 'Database', items: 'PostgreSQL on Render' },
                { cat: 'Frontend', items: 'React 18, Vite 5, React Router' },
                { cat: 'Auth', items: 'JWT (bcryptjs + jsonwebtoken)' },
                { cat: 'Voice AI', items: 'ElevenLabs WebRTC (Rachel/Ana/Lina)' },
                { cat: 'Deploy', items: 'Render auto-deploy on git push' },
                { cat: 'Design', items: 'Inline React styles, dark theme' },
                { cat: 'Fonts', items: 'Bebas Neue (headings) + DM Sans (body)' },
              ].map((t, i) => (
                <div key={i} style={{ padding:10, background:'#0D1117', borderRadius:8, border:'1px solid #21262D' }}>
                  <div style={{ color:GOLD, fontSize:11, fontWeight:700, marginBottom:4 }}>{t.cat}</div>
                  <div style={{ color:'#C9D1D9', fontSize:12 }}>{t.items}</div>
                </div>
              ))}
            </div>
          </div>

          {/* URLs */}
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}` }}>
            <h4 style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>PRODUCTION URLS</h4>
            {[
              { label: 'Landing', url: 'https://aiagent.ringlypro.com/imprint_iq/' },
              { label: 'Dashboard', url: 'https://aiagent.ringlypro.com/imprint_iq/dashboard' },
              { label: 'Neural Intelligence', url: 'https://aiagent.ringlypro.com/imprint_iq/neural' },
              { label: 'Process & ROI', url: 'https://aiagent.ringlypro.com/imprint_iq/process' },
              { label: 'Data Ingestion', url: 'https://aiagent.ringlypro.com/imprint_iq/ingest' },
              { label: 'Architecture (this page)', url: 'https://aiagent.ringlypro.com/imprint_iq/architecture' },
              { label: 'Health API', url: 'https://aiagent.ringlypro.com/imprint_iq/health' },
              { label: 'Neural API', url: 'https://aiagent.ringlypro.com/imprint_iq/api/neural/dashboard' },
            ].map((u, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'180px 1fr', padding:'6px 0', borderBottom: i < 7 ? '1px solid #21262D' : 'none' }}>
                <span style={{ color:'#8B949E', fontSize:12 }}>{u.label}</span>
                <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ color:BLUE, fontSize:12, textDecoration:'none' }}>{u.url}</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

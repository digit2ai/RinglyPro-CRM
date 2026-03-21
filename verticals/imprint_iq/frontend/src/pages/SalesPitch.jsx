import React, { useState, useRef } from 'react';

const GOLD = '#C8962A';
const RED = '#F85149';
const GREEN = '#238636';
const BLUE = '#1A9FE0';
const CARD = '#161B22';
const BORDER = '#30363D';

export default function SalesPitch() {
  const [active, setActive] = useState('why');
  const [linaOpen, setLinaOpen] = useState(false);
  const [linaStatus, setLinaStatus] = useState('idle');
  const [linaClient, setLinaClient] = useState(null);
  const transcriptRef = useRef(null);
  const [transcript, setTranscript] = useState([]);
  const [walkthrough, setWalkthrough] = useState(false);

  const scrollToSection = (id) => {
    setActive(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Lina Voice Connection (dedicated ImprintIQ agent)
  const connectLina = async () => {
    setLinaStatus('connecting');
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@11labs/client@0.2.0/+esm');
      const Conversation = mod.Conversation;

      const res = await fetch('/imprint_iq/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (!data.signed_url) {
        setLinaStatus('error');
        return;
      }

      const conversation = await Conversation.startSession({
        signedUrl: data.signed_url,
        onMessage: ({ message, source }) => {
          if (message) {
            setTranscript(prev => [...prev, { role: source === 'ai' ? 'Lina' : 'You', text: message }]);
            if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
          }
        },
        onStatusChange: ({ status }) => {
          setLinaStatus(status === 'connected' ? 'connected' : status);
        },
        onError: () => setLinaStatus('error')
      });
      setLinaClient(conversation);
      setLinaStatus('connected');
    } catch (err) {
      console.error('Lina connection error:', err);
      setLinaStatus('error');
    }
  };

  const disconnectLina = () => {
    if (linaClient?.endSession) linaClient.endSession();
    setLinaClient(null);
    setLinaStatus('idle');
  };

  const pill = (text, color) => (
    <span style={{ fontSize:11, padding:'4px 12px', borderRadius:20, background:color+'22', color, fontWeight:600 }}>{text}</span>
  );

  const h2 = { fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:26, margin:'0 0 8px', letterSpacing:2 };
  const p = { color:'#C9D1D9', fontSize:15, lineHeight:1.8, margin:'0 0 16px' };
  const sec = { padding:'32px 0', borderBottom:'1px solid #21262D' };

  return (
    <div style={{ maxWidth:800, margin:'0 auto', position:'relative' }}>

      {/* Sticky Nav */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'#0D1117', padding:'12px 0', borderBottom:'1px solid #21262D', display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
        {[
          { id:'why', label:'WHY IMPRINTIQ' },
          { id:'how', label:'HOW IT WORKS' },
          { id:'timeline', label:'IMPLEMENTATION' },
          { id:'benefit', label:'YOUR BENEFIT' },
          { id:'roi', label:'ROI' },
        ].map(s => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            style={{ padding:'8px 20px', borderRadius:20, border:`1px solid ${active === s.id ? GOLD : BORDER}`, background: active === s.id ? GOLD+'22' : 'transparent', color: active === s.id ? GOLD : '#8B949E', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Bebas Neue', letterSpacing:2 }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Hero */}
      <div style={{ textAlign:'center', padding:'40px 16px 16px' }}>
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="ImprintIQ" style={{ width:160, height:160, borderRadius:24, marginBottom:16 }} />
        <h1 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:32, margin:'0', letterSpacing:3 }}>IMPRINT<span style={{ color:GOLD }}>IQ</span></h1>
        <p style={{ color:'#8B949E', fontSize:12, letterSpacing:2, textTransform:'uppercase', marginTop:4 }}>Intelligence for Every Impression</p>

        {/* Walk Me Through CTA */}
        <button onClick={() => { setLinaOpen(true); setTimeout(() => { if (linaStatus === 'idle') connectLina(); }, 300); setWalkthrough(true); }}
          style={{ marginTop:20, padding:'14px 32px', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, color:'#fff', border:'none', borderRadius:30, fontSize:14, fontWeight:700, cursor:'pointer', letterSpacing:1, boxShadow:'0 4px 20px rgba(200,150,42,0.3)' }}>
          Walk Me Through This Presentation
        </button>
        <p style={{ color:'#484F58', fontSize:11, marginTop:8 }}>Lina, our AI presenter, will walk you through the entire pitch using live data</p>
      </div>

      {/* Ask Lina — Quick Questions */}
      <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, margin:'0 0 16px' }}>
        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12, textAlign:'center', letterSpacing:1 }}>ASK LINA</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
          {[
            'Walk me through the full presentation',
            'Show me the live dashboard numbers',
            'What does Neural Intelligence show?',
            'How do operations change with ImprintIQ?',
            'What is the ROI for Hit Promotional Products?',
            'What problems did you find in the data?',
            'Explain the architecture and the 11 AI agents',
            'What systems does ImprintIQ connect to?',
            'How does the quoting process change?',
            'What happens with missed calls?',
            'How does artwork proofing get faster?',
            'What is the implementation timeline?',
            'How does production scheduling work?',
            'What does the invoice automation do?',
            'How do you detect reorder opportunities?',
            'What is the health score right now?',
            'How much does Hit lose on dormant accounts?',
            'What competitors does Hit lose deals to?',
          ].map((q, i) => (
            <button key={i} onClick={() => {
              setLinaOpen(true);
              setTranscript(prev => [...prev, { role: 'You', text: q }]);
              if (linaStatus === 'idle') { setTimeout(connectLina, 300); }
            }}
              style={{ padding:'6px 14px', background:'#0D1117', border:`1px solid ${BORDER}`, borderRadius:20, cursor:'pointer', color:'#C9D1D9', fontSize:11 }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Hit Promo Context Card */}
      <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${GOLD}33`, margin:'0 0 24px', textAlign:'center' }}>
        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:18, letterSpacing:1 }}>PREPARED FOR HIT PROMOTIONAL PRODUCTS</div>
        <div style={{ color:'#8B949E', fontSize:13, marginTop:6 }}>$655M Revenue  /  ASI #5 Supplier  /  73 Years in Business  /  Largo, FL</div>
        <div style={{ color:'#484F58', fontSize:12, marginTop:4, fontStyle:'italic' }}>"2025 and 2026 should focus on efficiency on all levels of our business." — CJ Schmidt, CEO</div>
      </div>

      {/* ══════════════ WHY IMPRINTIQ ══════════════ */}
      <div id="section-why" style={sec}>
        <h2 style={h2}>WHY IMPRINTIQ FOR HIT?</h2>
        <p style={p}>
          Hit Promotional Products has grown 100% in 8 years under CJ Schmidt — from $319M to $655M.
          You are building an 800,000 sq ft facility in Fairfield, OH. You are investing in robotics and AI.
          But your day-to-day operations still run on manual processes that cannot scale to $1 billion.
        </p>

        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>HIT'S OPERATIONAL CHALLENGES TODAY</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10, marginBottom:20 }}>
          {[
            { stat:'4-24 HOURS', label:'per quote', problem:'Your sales reps manually look up prices in ESP, build Excel quotes, and email PDFs. At $655M in revenue, that is thousands of quotes per month — each one a manual project.', color:RED },
            { stat:'3-5 DAYS', label:'per proof cycle', problem:'Your art department processes artwork via email — bad files, wrong DPI, missing font outlines. Average 3+ revision cycles before production can even start. This is your single biggest bottleneck.', color:RED },
            { stat:'30-40%', label:'calls missed', problem:'After hours, lunch breaks, trade show weeks — every missed call is a $500 to $5,000 order walking to 4imprint or HALO. With $655M in revenue, even 1% in missed calls is $6.5M at risk.', color:RED },
            { stat:'ZERO', label:'reorder detection', problem:'Your customers buy promotional products for the same events every year — trade shows, employee onboarding, holiday gifts. But nobody at Hit is tracking those patterns. Customers reorder elsewhere because nobody called them first.', color:RED },
            { stat:'WHITEBOARD', label:'production scheduling', problem:'Your new 800,000 sq ft facility will have dozens of production lines — screen print, embroidery, laser, ColorBrite, digital, heat press. Without AI scheduling, you are guessing which line to route each job to.', color:RED },
            { stat:'8-10 SYSTEMS', label:'data scattered', problem:'Profill Portal, QuickBooks, PromoStandards, email, phone system, spreadsheets — your data lives in 8-10 disconnected places. Your monthly reporting takes days of manual compilation. No one has a real-time view.', color:RED },
          ].map((item, i) => (
            <div key={i} style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${item.color}` }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:6 }}>
                <span style={{ color:item.color, fontSize:22, fontFamily:'Bebas Neue' }}>{item.stat}</span>
                <span style={{ color:'#8B949E', fontSize:12 }}>{item.label}</span>
              </div>
              <div style={{ color:'#C9D1D9', fontSize:13, lineHeight:1.6 }}>{item.problem}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════ HOW IT WORKS ══════════════ */}
      <div id="section-how" style={sec}>
        <h2 style={h2}>HOW IT WORKS</h2>
        <p style={p}>
          ImprintIQ does not replace your systems. It plugs into what you already use — QuickBooks, Antera, commonsku, SAGE, your phone system — and adds an AI intelligence layer on top.
        </p>

        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>THREE THINGS HAPPEN WHEN YOU CONNECT</div>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
          {[
            {
              num:'1', title:'NEURAL INTELLIGENCE SCANS YOUR OPERATIONS',
              desc:'We connect to your data — customer lists, order history, call logs, invoices, inventory. Neural Intelligence runs 15 diagnostic analyzers and scores your business across 6 health panels. Results in hours, not weeks.',
              result:'You see exactly where you are losing money, with dollar amounts attached to every finding.',
              color:BLUE
            },
            {
              num:'2', title:'AI AGENTS TAKE OVER MANUAL WORK',
              desc:'11 autonomous AI agents handle quoting, artwork validation, call answering, production scheduling, inventory management, invoicing, and more. They work 24/7. They do not make errors. They do not take breaks.',
              result:'30-second quotes instead of 24 hours. 5-minute proofs instead of 5 days. Every call answered. Every reorder detected.',
              color:GREEN
            },
            {
              num:'3', title:'CONTINUOUS IMPROVEMENT LOOP',
              desc:'Neural Intelligence monitors everything in real-time. When a new problem emerges — margin dropping, calls spiking, inventory running low — it surfaces the finding immediately with the exact fix.',
              result:'Your operations get smarter every day without anyone doing anything manually.',
              color:GOLD
            },
          ].map((item, i) => (
            <div key={i} style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${item.color}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                <div style={{ minWidth:36, height:36, borderRadius:'50%', background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center', color:item.color, fontFamily:'Bebas Neue', fontSize:18, flexShrink:0 }}>{item.num}</div>
                <div style={{ color:'#E6EDF3', fontSize:15, fontWeight:700 }}>{item.title}</div>
              </div>
              <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6, margin:'0 0 10px' }}>{item.desc}</p>
              <div style={{ padding:10, background:item.color+'11', borderRadius:6, border:`1px solid ${item.color}22` }}>
                <span style={{ color:item.color, fontSize:12, fontWeight:600 }}>Result: </span>
                <span style={{ color:'#C9D1D9', fontSize:12 }}>{item.result}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:CARD, borderRadius:10, padding:16, border:`1px solid ${BORDER}` }}>
          <div style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:14, marginBottom:8 }}>WHAT WE CONNECT TO (NO SYSTEM CHANGES REQUIRED)</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:8 }}>
            {['QuickBooks', 'Antera Advance', 'commonsku', 'Facilisgroup', 'SAGE', 'ASI / ESP', 'PromoStandards', 'HubSpot / Salesforce', 'Phone System', 'CSV / Excel'].map((s, i) => (
              <div key={i} style={{ padding:'8px 12px', background:'#0D1117', borderRadius:6, border:'1px solid #21262D', color:'#8B949E', fontSize:12, textAlign:'center' }}>{s}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════ IMPLEMENTATION TIMELINE ══════════════ */}
      <div id="section-timeline" style={sec}>
        <h2 style={h2}>IMPLEMENTATION TIMELINE</h2>
        <p style={p}>
          Getting started requires no system changes, no IT projects, and no disruption to your current operations.
          Here is how we bring ImprintIQ online for Hit:
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {[
            {
              phase:'WEEK 1', title:'CONNECT YOUR DATA',
              desc:'We connect to your existing systems — Profill Portal exports, QuickBooks data, call logs, order history. A simple CSV export or API connection. No software installation required.',
              outcome:'Neural Intelligence begins analyzing your operations within hours of data connection.',
              color:BLUE
            },
            {
              phase:'WEEK 2', title:'REVIEW YOUR OPERATIONAL HEALTH REPORT',
              desc:'Neural Intelligence delivers your complete operational health assessment — 6 health panels scored 0-100, specific findings with dollar impact, and recommended actions for each issue identified.',
              outcome:'You see exactly where operational inefficiencies exist and how much each one costs annually.',
              color:GOLD
            },
            {
              phase:'WEEK 3-4', title:'ACTIVATE YOUR FIRST AI AGENTS',
              desc:'Based on the health report, we activate the agents that address your highest-impact areas first. Typically this starts with the Quote Engine (instant quoting), Customer Voice (24/7 call handling), and Art Director (proof automation).',
              outcome:'Your team experiences the impact immediately — quotes in seconds, every call answered, proofs validated automatically.',
              color:GREEN
            },
            {
              phase:'MONTH 2-3', title:'EXPAND ACROSS OPERATIONS',
              desc:'As your team sees results from the initial agents, we expand into production scheduling, inventory management, automated invoicing, and supplier intelligence. Each agent is activated independently based on your priorities.',
              outcome:'Manual processes are replaced one by one. Your operations team focuses on exceptions, not routine work.',
              color:GREEN
            },
            {
              phase:'MONTH 4+', title:'CONTINUOUS OPTIMIZATION',
              desc:'Neural Intelligence monitors all connected systems in real-time. New findings surface automatically as your business evolves. Additional data layers — market intelligence, production sensors, behavioral analytics — are added over time.',
              outcome:'Your operational efficiency improves continuously without additional effort. ImprintIQ gets smarter as more data flows through it.',
              color:GOLD
            },
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', gap:16, padding:'0 0 20px' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:48 }}>
                <div style={{ width:14, height:14, borderRadius:'50%', background:item.color, border:`3px solid ${item.color}44`, flexShrink:0 }} />
                {i < 4 && <div style={{ width:2, flex:1, background:'#21262D', marginTop:4 }} />}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                  {pill(item.phase, item.color)}
                  <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>{item.title}</span>
                </div>
                <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6, margin:'0 0 8px' }}>{item.desc}</p>
                <div style={{ padding:10, background:item.color+'11', borderRadius:6, border:`1px solid ${item.color}22` }}>
                  <span style={{ color:item.color, fontSize:12, fontWeight:600 }}>Outcome: </span>
                  <span style={{ color:'#C9D1D9', fontSize:12 }}>{item.outcome}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:CARD, borderRadius:10, padding:16, border:`1px solid ${BORDER}`, textAlign:'center' }}>
          <div style={{ color:'#C9D1D9', fontSize:13 }}>
            <strong style={{ color:GOLD }}>No disruption to current operations.</strong> ImprintIQ runs alongside your existing systems from day one.
            Your team continues working as normal while AI agents gradually take over manual processes.
          </div>
        </div>
      </div>

      {/* ══════════════ YOUR BENEFIT ══════════════ */}
      <div id="section-benefit" style={sec}>
        <h2 style={h2}>YOUR BENEFIT</h2>
        <p style={p}>
          For a company like Hit at $655M, every percentage point of efficiency is worth millions.
          Here is what ImprintIQ delivers specifically:
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {[
            {
              before:'Quoting: 4-24 hours per quote',
              after:'30 seconds — AI generates multi-option proposals from natural language',
              impact:'2x more quotes sent per day. Faster response wins the deal.',
              savings:'$180K/yr in sales rep time'
            },
            {
              before:'Artwork: 3-5 day proof cycle, 3+ revisions',
              after:'5 minutes — AI validates art, generates virtual mockup, customer approves with 1 click',
              impact:'Production starts 3-4 days sooner on every order.',
              savings:'$250K/yr in art department labor'
            },
            {
              before:'Calls: 30-40% missed, no after-hours',
              after:'0% missed — AI voice agents answer every call 24/7, create leads, generate quotes',
              impact:'At $1,500 average order, 10 recovered calls per week = $780K/yr in new revenue.',
              savings:'$55K/yr in reception costs + $780K in recovered revenue'
            },
            {
              before:'Reorders: No detection, customers leave silently',
              after:'AI predicts reorder windows, calls customers 30 days before they need to buy',
              impact:'20-30% of dormant accounts reactivated. Proactive beats reactive.',
              savings:'$200K/yr in recovered customer revenue'
            },
            {
              before:'Production: Whiteboard scheduling, bottlenecks found too late',
              after:'AI routes jobs to optimal line, predicts bottlenecks, tracks OEE in real-time',
              impact:'Higher throughput, fewer reprints, on-time delivery improves.',
              savings:'$350K/yr in production efficiency'
            },
            {
              before:'Invoicing: 1-3 day delay, manual collections, 45+ day DSO',
              after:'Invoice generated instantly on shipment. AI calls overdue accounts automatically.',
              impact:'DSO reduced by 12 days. Cash flow improves immediately.',
              savings:'$140K/yr in accounting labor + cash flow improvement'
            },
          ].map((item, i) => (
            <div key={i} style={{ background:CARD, borderRadius:12, padding:18, border:`1px solid ${BORDER}` }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 40px 1fr', gap:0, alignItems:'center', marginBottom:10 }}>
                <div style={{ background:RED+'11', borderRadius:8, padding:10, borderLeft:`3px solid ${RED}` }}>
                  <div style={{ color:RED, fontSize:11, fontWeight:700, marginBottom:2 }}>BEFORE</div>
                  <div style={{ color:'#8B949E', fontSize:12 }}>{item.before}</div>
                </div>
                <div style={{ textAlign:'center', color:GOLD, fontSize:16 }}>{'->'}</div>
                <div style={{ background:GREEN+'11', borderRadius:8, padding:10, borderLeft:`3px solid ${GREEN}` }}>
                  <div style={{ color:GREEN, fontSize:11, fontWeight:700, marginBottom:2 }}>AFTER</div>
                  <div style={{ color:'#C9D1D9', fontSize:12 }}>{item.after}</div>
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'#8B949E', fontSize:12 }}>{item.impact}</span>
                {pill(item.savings, GOLD)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════ ROI ══════════════ */}
      <div id="section-roi" style={{ ...sec, borderBottom:'none' }}>
        <h2 style={h2}>COST REDUCTION AND VALUE</h2>
        <p style={p}>
          The question is not what ImprintIQ costs — it is what your current operations cost
          without it. Here is where the value lives:
        </p>

        {/* Savings Breakdown */}
        <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:16 }}>
          <div style={{ fontFamily:'Bebas Neue', color:GREEN, fontSize:16, marginBottom:12 }}>PROJECTED ANNUAL COST REDUCTION</div>
          {[
            { area:'Quoting Automation', saving:'$180K', detail:'AI-generated quotes replace manual price lookups and Excel proposals' },
            { area:'Artwork and Proof Automation', saving:'$250K', detail:'AI preflight validation and virtual proof generation reduce art department workload' },
            { area:'Call Recovery and Voice AI', saving:'$835K', detail:'24/7 AI call handling eliminates missed calls plus recovers $780K in lost orders' },
            { area:'Reorder Intelligence', saving:'$200K', detail:'Proactive outreach reactivates dormant accounts before they leave' },
            { area:'Production Scheduling', saving:'$350K', detail:'AI job routing and bottleneck prediction across all decoration lines' },
            { area:'Invoice and Collections Automation', saving:'$140K', detail:'Instant invoicing on shipment, automated collections reduce DSO by 12 days' },
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom: i < 5 ? '1px solid #21262D' : 'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600 }}>{item.area}</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:2 }}>{item.detail}</div>
              </div>
              <div style={{ color:GREEN, fontSize:16, fontFamily:'Bebas Neue', minWidth:80, textAlign:'right' }}>{item.saving}</div>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0 0', marginTop:8, borderTop:`2px solid ${GREEN}` }}>
            <span style={{ color:'#E6EDF3', fontSize:15, fontWeight:700 }}>TOTAL PROJECTED ANNUAL COST REDUCTION</span>
            <span style={{ color:GREEN, fontSize:24, fontFamily:'Bebas Neue' }}>$1.955M</span>
          </div>
        </div>

        {/* Pricing Approach */}
        <div style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${GOLD}33`, marginBottom:16 }}>
          <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:18, marginBottom:12 }}>HOW PRICING WORKS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ borderLeft:`3px solid ${BLUE}`, paddingLeft:16 }}>
              <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700, marginBottom:4 }}>Based on actual data consumption</div>
              <div style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>ImprintIQ pricing is based on actual data consumption — the volume of quotes processed, calls handled, production jobs routed, and inventory managed. You pay for what the AI actually does, not for seats or licenses.</div>
            </div>
            <div style={{ borderLeft:`3px solid ${GREEN}`, paddingLeft:16 }}>
              <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700, marginBottom:4 }}>Significantly lower than human labor</div>
              <div style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>An AI agent processing a quote costs a fraction of a cent. A human rep spending 4 hours on the same quote costs $120 in labor. The cost per transaction is orders of magnitude lower than your current manual operations.</div>
            </div>
            <div style={{ borderLeft:`3px solid ${GOLD}`, paddingLeft:16 }}>
              <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700, marginBottom:4 }}>Determined after Proof of Concept</div>
              <div style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>We start with a POC using your real data. During the POC, we measure actual data consumption across all active agents and generate a predictive forecast. Final pricing is tailored to your specific operational volume — no generic packages.</div>
            </div>
          </div>
        </div>

        {/* Key Point */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, borderTop:`3px solid ${GREEN}`, textAlign:'center' }}>
            <div style={{ color:GREEN, fontSize:28, fontFamily:'Bebas Neue' }}>$1.955M/yr</div>
            <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600, marginTop:4 }}>Projected Cost Reduction</div>
            <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>Across 6 operational areas</div>
          </div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, borderTop:`3px solid ${GOLD}`, textAlign:'center' }}>
            <div style={{ color:GOLD, fontSize:28, fontFamily:'Bebas Neue' }}>PAYS FOR ITSELF IN WEEKS</div>
            <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600, marginTop:4 }}>Platform Cost vs Savings</div>
            <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>Data consumption cost is a fraction of human labor</div>
          </div>
        </div>

        {/* Additional Upside */}
        <div style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BORDER}`, marginBottom:20 }}>
          <div style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:14, marginBottom:10 }}>ADDITIONAL REVENUE UPSIDE (NOT INCLUDED ABOVE)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { item:'Recovered missed call revenue', value:'$780K+/yr potential' },
              { item:'Proactive reorder capture', value:'20-30% dormant reactivation' },
              { item:'Faster quoting wins more deals', value:'2x proposal volume' },
              { item:'Reduced customer churn', value:'Higher lifetime value per account' },
              { item:'Market pricing intelligence', value:'Competitive rate optimization' },
              { item:'New facility OEE optimization', value:'800K sq ft production efficiency' },
            ].map((item, i) => (
              <div key={i} style={{ padding:'8px 12px', background:'#0D1117', borderRadius:6, border:'1px solid #21262D' }}>
                <div style={{ color:'#C9D1D9', fontSize:12 }}>{item.item}</div>
                <div style={{ color:GOLD, fontSize:11, marginTop:2 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Next Steps */}
        <div style={{ background:`linear-gradient(135deg, ${GOLD}15, ${GREEN}10)`, borderRadius:12, padding:24, border:`1px solid ${GOLD}33`, textAlign:'center' }}>
          <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:20, marginBottom:8 }}>NEXT STEPS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:400, margin:'0 auto' }}>
            {[
              { step:'1', text:'We connect to your data (CSV export or API) — takes 15 minutes' },
              { step:'2', text:'Neural Intelligence analyzes your real operations — findings in hours' },
              { step:'3', text:'We walk through the findings together — every dollar quantified' },
              { step:'4', text:'You activate the agents and treatments that matter most to you' },
            ].map((item, i) => (
              <div key={i} style={{ display:'flex', gap:12, alignItems:'center', textAlign:'left' }}>
                <div style={{ minWidth:28, height:28, borderRadius:'50%', background:GOLD+'22', display:'flex', alignItems:'center', justifyContent:'center', color:GOLD, fontFamily:'Bebas Neue', fontSize:14, flexShrink:0 }}>{item.step}</div>
                <span style={{ color:'#C9D1D9', fontSize:13 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lina Voice Assistant (Floating Button) */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:100 }}>
        {!linaOpen ? (
          <button onClick={() => setLinaOpen(true)}
            style={{ width:56, height:56, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, border:'none', cursor:'pointer', boxShadow:'0 4px 20px rgba(200,150,42,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
        ) : (
          <div style={{ width:340, maxWidth:'92vw', maxHeight:'85vh', background:CARD, borderRadius:16, border:`1px solid ${BORDER}`, boxShadow:'0 8px 40px rgba(0,0,0,0.5)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 16px', background:'#21262D', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div>
                <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>Lina — AI Presenter</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>Ask anything or tap a topic below</div>
              </div>
              <button onClick={() => { disconnectLina(); setLinaOpen(false); setWalkthrough(false); }}
                style={{ background:'none', border:'none', color:'#8B949E', fontSize:18, cursor:'pointer', padding:4 }}>x</button>
            </div>

            {/* Scrollable content area — transcript + topics */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {/* Transcript */}
              <div ref={transcriptRef} style={{ padding:12, background:'#0D1117', minHeight:120 }}>
                {transcript.length === 0 && (
                  <div style={{ color:'#484F58', fontSize:12, textAlign:'center', marginTop:40 }}>
                    {walkthrough
                      ? 'Starting the full walkthrough...'
                      : 'Tap Start, then ask a question or tap a topic.'}
                  </div>
                )}
                {transcript.map((msg, i) => (
                  <div key={i} style={{ marginBottom:8, textAlign: msg.role === 'You' ? 'right' : 'left' }}>
                    <div style={{ display:'inline-block', maxWidth:'85%', padding:'8px 12px', borderRadius:10, background: msg.role === 'You' ? GOLD+'22' : '#21262D', color: msg.role === 'You' ? GOLD : '#C9D1D9', fontSize:12, lineHeight:1.5 }}>
                      <div style={{ fontSize:10, color:'#8B949E', marginBottom:2 }}>{msg.role}</div>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Topics — scrollable inside the panel */}
              {linaStatus === 'connected' && (
                <div style={{ padding:'8px 10px', borderTop:'1px solid #21262D', background:'#0D1117' }}>
                  <div style={{ color:'#484F58', fontSize:10, marginBottom:6, textAlign:'center' }}>TAP A TOPIC TO ASK LINA</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'center' }}>
                    {[
                      'Walk me through the full presentation',
                      'Show me the live dashboard',
                      'What does Neural Intelligence show?',
                      'How do operations change?',
                      'What is the cost reduction for Hit?',
                      'What problems did you find?',
                      'Explain the architecture',
                      'What systems do you connect to?',
                    ].map((q, i) => (
                      <button key={i} onClick={() => setTranscript(prev => [...prev, { role: 'You', text: q }])}
                        style={{ padding:'5px 10px', background:'#21262D', border:`1px solid ${BORDER}`, borderRadius:14, color:'#C9D1D9', fontSize:10, cursor:'pointer', lineHeight:1.3 }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fixed bottom controls */}
            <div style={{ flexShrink:0, borderTop:'1px solid #21262D' }}>
              <div style={{ padding:10, display:'flex', gap:8, justifyContent:'center' }}>
                {linaStatus === 'idle' || linaStatus === 'error' ? (
                  <button onClick={connectLina}
                    style={{ flex:1, padding:'10px', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    {walkthrough ? 'Start Walkthrough' : 'Start Conversation'}
                  </button>
                ) : linaStatus === 'connecting' ? (
                  <div style={{ color:'#8B949E', fontSize:12, padding:10 }}>Connecting to Lina...</div>
                ) : (
                  <button onClick={() => { disconnectLina(); setWalkthrough(false); }}
                    style={{ flex:1, padding:'10px', background:RED+'33', color:RED, border:`1px solid ${RED}44`, borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    End Conversation
                  </button>
                )}
              </div>
              {linaStatus === 'connected' && (
                <div style={{ textAlign:'center', padding:'0 0 8px' }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:GREEN, animation:'pulse 1.5s infinite' }} />
                    <span style={{ color:GREEN, fontSize:11 }}>Lina is listening...</span>
                  </div>
                </div>
              )}
              {linaStatus === 'error' && (
                <div style={{ textAlign:'center', padding:'0 0 8px' }}>
                  <span style={{ color:RED, fontSize:11 }}>Connection failed. Try again.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

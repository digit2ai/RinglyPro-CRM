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
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="ImprintIQ" style={{ width:56, height:56, borderRadius:12, marginBottom:12 }} />
        <h1 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:32, margin:'0', letterSpacing:3 }}>IMPRINT<span style={{ color:GOLD }}>IQ</span></h1>
        <p style={{ color:'#8B949E', fontSize:12, letterSpacing:2, textTransform:'uppercase', marginTop:4 }}>Intelligence for Every Impression</p>
      </div>

      {/* Hit Promo Context Card */}
      <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${GOLD}33`, margin:'0 0 24px', textAlign:'center' }}>
        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:18, letterSpacing:1 }}>PREPARED FOR HIT PROMOTIONAL PRODUCTS</div>
        <div style={{ color:'#8B949E', fontSize:13, marginTop:6 }}>$655M Revenue  /  ASI #5 Supplier  /  73 Years in Business  /  Largo, FL</div>
        <div style={{ color:'#484F58', fontSize:12, marginTop:4, fontStyle:'italic' }}>"2025 and 2026 should focus on efficiency on all levels of our business." — CJ Schmidt, CEO</div>
      </div>

      {/* ══════════════ WHY IMPRINTIQ ══════════════ */}
      <div id="section-why" style={sec}>
        <h2 style={h2}>WHY IMPRINTIQ?</h2>
        <p style={p}>
          Hit Promotional Products has grown 100% in 8 years under CJ Schmidt — from $319M to $655M.
          But growth has been powered by people, not systems. The next 100% will require a different approach.
        </p>

        <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:16, marginBottom:12 }}>THE OPERATIONAL REALITY TODAY</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
          {[
            { problem:'Quoting takes 4-24 hours', detail:'Sales reps manually look up prices, build Excel quotes, email PDFs. Every quote is a custom project.' },
            { problem:'Artwork proofs take 3-5 days', detail:'Art department drowning in email revisions. Bad files delay everything. Average 3+ revision cycles.' },
            { problem:'30-40% of calls are missed', detail:'After hours, lunch breaks, busy periods — every missed call is a $500 to $5,000 order walking to a competitor.' },
            { problem:'No reorder detection', detail:'Repeat customers go silent. Nobody notices until they have already ordered from someone else.' },
            { problem:'Production managed by whiteboard', detail:'No real-time visibility. Bottlenecks discovered when it is too late. Manual scheduling across 6+ decoration lines.' },
            { problem:'Reporting takes days', detail:'Data scattered across 8-10 systems. Monthly reports require manual compilation. No real-time view.' },
          ].map((item, i) => (
            <div key={i} style={{ background:CARD, borderRadius:10, padding:14, border:`1px solid ${BORDER}`, borderLeft:`3px solid ${RED}` }}>
              <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:700, marginBottom:4 }}>{item.problem}</div>
              <div style={{ color:'#8B949E', fontSize:12, lineHeight:1.5 }}>{item.detail}</div>
            </div>
          ))}
        </div>

        <div style={{ background:'#0D1117', borderRadius:10, padding:16, border:`1px solid ${BORDER}` }}>
          <div style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:14, marginBottom:8 }}>THE INDUSTRY CONTEXT</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              { value:'$26.6B', label:'US promo industry', color:GOLD },
              { value:'0', label:'AI-native platforms', color:RED },
              { value:'6,500+', label:'Companies in the industry', color:BLUE },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ color:s.color, fontSize:24, fontFamily:'Bebas Neue' }}>{s.value}</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>{s.label}</div>
              </div>
            ))}
          </div>
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
        <h2 style={h2}>ROI FOR HIT PROMOTIONAL PRODUCTS</h2>
        <p style={p}>
          Based on $655M revenue and current operational structure:
        </p>

        <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${GOLD}33`, marginBottom:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <div style={{ color:'#8B949E', fontSize:11, marginBottom:4 }}>ImprintIQ Investment</div>
              <div style={{ color:BLUE, fontSize:28, fontFamily:'Bebas Neue' }}>$120K/mo</div>
              <div style={{ color:'#484F58', fontSize:11 }}>$1.44M annually</div>
            </div>
            <div>
              <div style={{ color:'#8B949E', fontSize:11, marginBottom:4 }}>Operational Savings Generated</div>
              <div style={{ color:GREEN, fontSize:28, fontFamily:'Bebas Neue' }}>$5.1M/yr</div>
              <div style={{ color:'#484F58', fontSize:11 }}>72% reduction in manual ops cost</div>
            </div>
          </div>
          <div style={{ borderTop:'1px solid #21262D', marginTop:16, paddingTop:16, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:GOLD, fontSize:24, fontFamily:'Bebas Neue' }}>3.5x</div>
              <div style={{ color:'#8B949E', fontSize:11 }}>Return on Investment</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:GOLD, fontSize:24, fontFamily:'Bebas Neue' }}>3 MONTHS</div>
              <div style={{ color:'#8B949E', fontSize:11 }}>Payback Period</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:GOLD, fontSize:24, fontFamily:'Bebas Neue' }}>$3.66M</div>
              <div style={{ color:'#8B949E', fontSize:11 }}>Net Annual Savings</div>
            </div>
          </div>
        </div>

        <div style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:14, marginBottom:10 }}>DOES NOT INCLUDE REVENUE GAINS FROM</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
          {[
            'Recovered missed calls ($780K+ potential)',
            'Proactive reorder outreach',
            'Faster quoting (wins more deals)',
            'Reduced customer churn',
            'Competitive pricing intelligence',
            'New 800K sq ft facility OEE optimization'
          ].map((item, i) => (
            <div key={i} style={{ padding:'8px 12px', background:'#0D1117', borderRadius:6, border:'1px solid #21262D', color:'#8B949E', fontSize:12 }}>+ {item}</div>
          ))}
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
          <div style={{ width:320, maxWidth:'90vw', background:CARD, borderRadius:16, border:`1px solid ${BORDER}`, boxShadow:'0 8px 40px rgba(0,0,0,0.5)', overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:'#21262D', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>Ask Lina</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>ImprintIQ Sales Presenter</div>
              </div>
              <button onClick={() => { disconnectLina(); setLinaOpen(false); }}
                style={{ background:'none', border:'none', color:'#8B949E', fontSize:18, cursor:'pointer', padding:4 }}>x</button>
            </div>
            <div ref={transcriptRef} style={{ height:200, overflowY:'auto', padding:12, background:'#0D1117' }}>
              {transcript.length === 0 && (
                <div style={{ color:'#484F58', fontSize:12, textAlign:'center', marginTop:60 }}>
                  Press Start to talk with Lina.
                  <br />She knows everything about ImprintIQ.
                </div>
              )}
              {transcript.map((msg, i) => (
                <div key={i} style={{ marginBottom:8, textAlign: msg.role === 'You' ? 'right' : 'left' }}>
                  <div style={{ display:'inline-block', maxWidth:'80%', padding:'8px 12px', borderRadius:10, background: msg.role === 'You' ? GOLD+'22' : '#21262D', color: msg.role === 'You' ? GOLD : '#C9D1D9', fontSize:12 }}>
                    <div style={{ fontSize:10, color:'#8B949E', marginBottom:2 }}>{msg.role}</div>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:12, borderTop:'1px solid #21262D', display:'flex', gap:8, justifyContent:'center' }}>
              {linaStatus === 'idle' || linaStatus === 'error' ? (
                <button onClick={connectLina}
                  style={{ flex:1, padding:'10px', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  Start Conversation
                </button>
              ) : linaStatus === 'connecting' ? (
                <div style={{ color:'#8B949E', fontSize:12, padding:10 }}>Connecting to Lina...</div>
              ) : (
                <button onClick={disconnectLina}
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
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

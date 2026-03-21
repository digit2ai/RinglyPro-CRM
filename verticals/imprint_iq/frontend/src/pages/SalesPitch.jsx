import React, { useState, useEffect, useRef } from 'react';

const GOLD = '#C8962A';
const RED = '#F85149';
const GREEN = '#238636';
const BLUE = '#1A9FE0';
const CARD = '#161B22';
const BORDER = '#30363D';

const SECTIONS = ['what', 'why', 'when', 'how', 'roi'];

export default function SalesPitch() {
  const [active, setActive] = useState('what');
  const [rachelOpen, setRachelOpen] = useState(false);
  const [rachelStatus, setRachelStatus] = useState('idle');
  const [rachelClient, setRachelClient] = useState(null);
  const transcriptRef = useRef(null);
  const [transcript, setTranscript] = useState([]);

  const scrollToSection = (id) => {
    setActive(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Rachel Voice Connection
  const connectRachel = async () => {
    setRachelStatus('connecting');
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@11labs/client@0.2.0/+esm');
      const Conversation = mod.Conversation;

      const res = await fetch('/api/elevenlabs-webrtc/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dynamicVariables: {
            company_name: 'ImprintIQ by Digit2AI',
            website_url: 'https://aiagent.ringlypro.com/imprint_iq/',
            knowledge_base: `ImprintIQ is an AI-powered ecosystem for the promotional products industry. It replaces manual operations with 11 autonomous AI agents monitored by Neural Intelligence. The platform has 5 data layers: ERP, Communications, Market, Production, and Behavioral. Target market is the $26.6 billion US promotional products industry. Reference client profile: Hit Promotional Products, $655 million revenue, ASI #5 supplier. Pricing is hybrid monthly model scaling with company revenue. A $50M company pays about $17,500/mo. A $200M company pays about $43,000/mo. The ROI is typically 3-5x with payback in 8-14 months. The doctor metaphor: we take your business temperature with Neural Intelligence diagnostics, prescribe treatments, and the treatments are the revenue — consulting license to activate automation workflows. Key pain points we solve: missed calls, slow quoting (24h to 30 seconds), artwork bottleneck (5 days to 5 minutes), no reorder detection, manual reporting. ImprintIQ does not replace their ERP — it plugs into QuickBooks, Antera, commonsku, Facilisgroup, SAGE. We are the AI brain layer on top.`
          }
        })
      });
      const data = await res.json();

      const conversation = await Conversation.startSession({
        signedUrl: data.signed_url,
        onMessage: ({ message, source }) => {
          if (message) {
            setTranscript(prev => [...prev, { role: source === 'ai' ? 'Rachel' : 'You', text: message }]);
            if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
          }
        },
        onStatusChange: ({ status }) => {
          setRachelStatus(status === 'connected' ? 'connected' : status);
        },
        onError: (err) => {
          console.error('Rachel error:', err);
          setRachelStatus('error');
        }
      });
      setRachelClient(conversation);
      setRachelStatus('connected');
    } catch (err) {
      console.error('Failed to connect Rachel:', err);
      setRachelStatus('error');
    }
  };

  const disconnectRachel = () => {
    if (rachelClient?.endSession) rachelClient.endSession();
    setRachelClient(null);
    setRachelStatus('idle');
  };

  const pill = (text, color) => (
    <span style={{ fontSize:11, padding:'4px 12px', borderRadius:20, background:color+'22', color, fontWeight:600 }}>{text}</span>
  );

  const h2Style = { fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:26, margin:'0 0 8px', letterSpacing:2 };
  const pStyle = { color:'#C9D1D9', fontSize:15, lineHeight:1.8, margin:'0 0 16px' };
  const sectionStyle = { padding:'32px 0', borderBottom:'1px solid #21262D' };

  return (
    <div style={{ maxWidth:800, margin:'0 auto', position:'relative' }}>

      {/* ── NAVIGATION PILLS (sticky, mobile-friendly) ── */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'#0D1117', padding:'12px 0', borderBottom:'1px solid #21262D', display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
        {[
          { id:'what', label:'WHAT' },
          { id:'why', label:'WHY' },
          { id:'when', label:'WHEN' },
          { id:'how', label:'HOW' },
          { id:'roi', label:'ROI' },
        ].map(s => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            style={{ padding:'8px 20px', borderRadius:20, border:`1px solid ${active === s.id ? GOLD : BORDER}`, background: active === s.id ? GOLD+'22' : 'transparent', color: active === s.id ? GOLD : '#8B949E', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Bebas Neue', letterSpacing:2 }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── HERO ── */}
      <div style={{ textAlign:'center', padding:'40px 16px 24px' }}>
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="ImprintIQ" style={{ width:64, height:64, borderRadius:12, marginBottom:12 }} />
        <h1 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:36, margin:'0', letterSpacing:3 }}>IMPRINT<span style={{ color:GOLD }}>IQ</span></h1>
        <p style={{ color:'#8B949E', fontSize:13, letterSpacing:2, textTransform:'uppercase', marginTop:4 }}>Intelligence for Every Impression</p>
        <p style={{ color:GOLD, fontSize:15, marginTop:16, fontWeight:600 }}>The AI doctor for your promotional products business.</p>
      </div>

      {/* ══════════════ WHAT ══════════════ */}
      <div id="section-what" style={sectionStyle}>
        <h2 style={h2Style}>WHAT IS IMPRINTIQ?</h2>
        <p style={pStyle}>
          Think of your business like a patient. Right now, nobody is checking its vital signs.
          Orders fall through cracks. Quotes take days. Art proofs bounce back and forth.
          Customers leave and nobody notices.
        </p>

        <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:16 }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:18, letterSpacing:1 }}>THE DOCTOR METAPHOR</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
            {[
              { step:'1', title:'TAKE THE TEMPERATURE', desc:'Neural Intelligence scans your operations — calls, quotes, orders, production, inventory, invoices. Finds exactly where you\'re bleeding money.', color:BLUE, label:'DIAGNOSTIC' },
              { step:'2', title:'READ THE RESULTS', desc:'6 health panels score your business 0-100. Findings show dollar-amount impact. "You missed 47 calls last month — that\'s $70K in lost orders."', color:GOLD, label:'PRESCRIPTIVE' },
              { step:'3', title:'PRESCRIBE THE TREATMENT', desc:'Each finding comes with a specific automation workflow — the exact AI agent + steps to fix it. This is where ImprintIQ shows its value.', color:GREEN, label:'PRESCRIPTION' },
              { step:'4', title:'ACTIVATE THE TREATMENT', desc:'The client activates each treatment workflow. This is the consulting/license revenue — they pay to turn on the automation that fixes the problem.', color:RED, label:'MONETIZATION' },
            ].map((item, i) => (
              <div key={i} style={{ display:'flex', gap:16, padding:16, background:'#0D1117', borderRadius:10, border:`1px solid #21262D`, borderLeft:`4px solid ${item.color}` }}>
                <div style={{ minWidth:36, height:36, borderRadius:'50%', background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center', color:item.color, fontFamily:'Bebas Neue', fontSize:18, flexShrink:0 }}>{item.step}</div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>{item.title}</span>
                    {pill(item.label, item.color)}
                  </div>
                  <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6, margin:0 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ ...pStyle, color:'#8B949E', fontSize:13 }}>
          <strong style={{ color:GOLD }}>Key point:</strong> The diagnostic is the sales tool. The treatment is the revenue.
          We show them they're sick for free. They pay us to cure them.
        </p>
      </div>

      {/* ══════════════ WHY ══════════════ */}
      <div id="section-why" style={sectionStyle}>
        <h2 style={h2Style}>WHY NOW?</h2>
        <p style={pStyle}>
          The promotional products industry does <strong style={{ color:GOLD }}>$26.6 billion</strong> per year in the US alone.
          Zero companies have AI-native operations. They run on spreadsheets, email, whiteboards, and phone calls.
        </p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {[
            { label:'Industry Size', value:'$26.6B', sub:'US annual revenue' },
            { label:'AI Adoption', value:'0%', sub:'No AI-native platforms exist' },
            { label:'Avg Quote Time', value:'24h+', sub:'Manual price lookups' },
            { label:'Avg Proof Cycle', value:'3-5 days', sub:'Email back and forth' },
            { label:'Missed Call Rate', value:'30-40%', sub:'No after-hours coverage' },
            { label:'Reorder Detection', value:'None', sub:'Customers leave silently' },
          ].map((s, i) => (
            <div key={i} style={{ background:CARD, borderRadius:10, padding:14, border:`1px solid ${BORDER}`, textAlign:'center' }}>
              <div style={{ color:i < 2 ? GOLD : RED, fontSize:24, fontFamily:'Bebas Neue' }}>{s.value}</div>
              <div style={{ color:'#E6EDF3', fontSize:12, fontWeight:600, marginTop:2 }}>{s.label}</div>
              <div style={{ color:'#8B949E', fontSize:11, marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ background:CARD, borderRadius:10, padding:16, border:`1px solid ${GOLD}33` }}>
          <p style={{ color:'#C9D1D9', fontSize:14, lineHeight:1.7, margin:0 }}>
            <strong style={{ color:GOLD }}>CJ Schmidt, CEO of Hit Promotional Products</strong> ($655M revenue, ASI #5):
            <br /><em style={{ color:'#8B949E' }}>"2025 and 2026 should focus on efficiency on all levels of our business."</em>
            <br /><br />He's building an 800,000 sq ft facility. He's hiring tech executives. He's already investing in AI and robotics.
            The door is wide open.
          </p>
        </div>
      </div>

      {/* ══════════════ WHEN ══════════════ */}
      <div id="section-when" style={sectionStyle}>
        <h2 style={h2Style}>WHEN DOES IT WORK?</h2>
        <p style={pStyle}>
          The sales cycle is simple. The diagnostic is the demo. The demo sells itself.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {[
            { time:'Day 0', title:'THE HOOK', desc:'Show them the Neural dashboard with demo data. "Imagine this with YOUR real numbers."', color:BLUE },
            { time:'Day 1-3', title:'THE PROOF', desc:'They upload a CSV — customer list, order history, call log. Neural analyzes their real data. Findings appear instantly.', color:GREEN },
            { time:'Week 1', title:'THE SHOCK', desc:'"You have 312 dormant accounts with $4.2M in lifetime value. You missed 47 calls worth $70K. Your proof cycle averages 4.3 days."', color:RED },
            { time:'Week 2-3', title:'THE CLOSE', desc:'They see the treatment workflows. "Activate missed call recovery." "Activate dormant reactivation." Each activation = monthly recurring revenue.', color:GOLD },
            { time:'Month 2+', title:'THE EXPAND', desc:'Start with 2-3 agents. Add more as they see results. Layer 2 (voice AI), Layer 3 (market data), Layer 4 (production). Revenue compounds.', color:GOLD },
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', gap:16, padding:'16px 0' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:48 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:item.color, border:`2px solid ${item.color}` }} />
                {i < 4 && <div style={{ width:2, flex:1, background:'#21262D', marginTop:4 }} />}
              </div>
              <div style={{ flex:1, paddingBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  {pill(item.time, item.color)}
                  <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>{item.title}</span>
                </div>
                <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6, margin:0 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════ HOW ══════════════ */}
      <div id="section-how" style={sectionStyle}>
        <h2 style={h2Style}>HOW DOES IT WORK?</h2>
        <p style={pStyle}>
          5 data layers feed Neural Intelligence + 11 AI agents.
          The client doesn't need to change anything about how they work — we plug into their existing systems.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
          {[
            { num:'L1', name:'ERP Data', desc:'Customers, quotes, orders, invoices, inventory — from their existing system', status:'BUILT', color:BLUE },
            { num:'L2', name:'Communications', desc:'Calls, emails, chat, SMS — Voice AI generates this automatically', status:'PLANNED', color:GREEN },
            { num:'L3', name:'Market & Industry', desc:'ASI/SAGE product feeds, supplier stock, trade shows, competitor intel', status:'PLANNED', color:GOLD },
            { num:'L4', name:'Production & Sensors', desc:'Machine OEE, QC vision, barcode tracking, shipping events', status:'PLANNED', color:RED },
            { num:'L5', name:'Behavioral', desc:'Website activity, email engagement, search queries, churn prediction', status:'PLANNED', color:'#A371F7' },
          ].map((layer, i) => (
            <div key={i} style={{ display:'flex', gap:12, padding:14, background:CARD, borderRadius:10, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${layer.color}`, alignItems:'center' }}>
              <div style={{ minWidth:36, height:36, borderRadius:8, background:layer.color+'22', display:'flex', alignItems:'center', justifyContent:'center', color:layer.color, fontFamily:'Bebas Neue', fontSize:14, flexShrink:0 }}>{layer.num}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:700 }}>{layer.name}</div>
                <div style={{ color:'#8B949E', fontSize:12, marginTop:2 }}>{layer.desc}</div>
              </div>
              {pill(layer.status, layer.status === 'BUILT' ? GREEN : '#484F58')}
            </div>
          ))}
        </div>

        <div style={{ background:CARD, borderRadius:10, padding:16, border:`1px solid ${BORDER}` }}>
          <div style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:16, marginBottom:8 }}>THE 11 AI AGENTS</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {[
              'Catalog Intelligence', 'Quote Engine', 'Art Director', 'Production Orchestrator',
              'Supply Chain', 'QC Vision', 'Fulfillment', 'Customer Voice (Rachel)',
              'Sales Intelligence', 'Finance & Billing', 'Compliance'
            ].map((a, i) => (
              <div key={i} style={{ color:'#8B949E', fontSize:12, padding:'4px 0', borderBottom:'1px solid #21262D' }}>{a}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════ ROI ══════════════ */}
      <div id="section-roi" style={{ ...sectionStyle, borderBottom:'none' }}>
        <h2 style={h2Style}>ROI — THE NUMBERS</h2>
        <p style={pStyle}>
          Pricing scales with company revenue. The bigger the company, the bigger the savings — and the bigger our deal.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
          {[
            { size:'$50M Company', monthly:'$17,500/mo', annual:'$210K/yr', savings:'$560K/yr', roi:'2.7x', payback:'5 months', color:GREEN },
            { size:'$200M Company', monthly:'$43,000/mo', annual:'$516K/yr', savings:'$1.6M/yr', roi:'3.1x', payback:'4 months', color:BLUE },
            { size:'$655M Company (Hit)', monthly:'$120K/mo', annual:'$1.44M/yr', savings:'$5.1M/yr', roi:'3.5x', payback:'3 months', color:GOLD },
          ].map((tier, i) => (
            <div key={i} style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${tier.color}` }}>
              <div style={{ fontFamily:'Bebas Neue', color:tier.color, fontSize:18, marginBottom:12 }}>{tier.size}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
                <div><div style={{ color:'#8B949E', fontSize:11 }}>Monthly</div><div style={{ color:'#E6EDF3', fontSize:16, fontFamily:'Bebas Neue' }}>{tier.monthly}</div></div>
                <div><div style={{ color:'#8B949E', fontSize:11 }}>Annual</div><div style={{ color:'#E6EDF3', fontSize:16, fontFamily:'Bebas Neue' }}>{tier.annual}</div></div>
                <div><div style={{ color:'#8B949E', fontSize:11 }}>Savings Generated</div><div style={{ color:GREEN, fontSize:16, fontFamily:'Bebas Neue' }}>{tier.savings}</div></div>
                <div><div style={{ color:'#8B949E', fontSize:11 }}>ROI / Payback</div><div style={{ color:GOLD, fontSize:16, fontFamily:'Bebas Neue' }}>{tier.roi} / {tier.payback}</div></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:`linear-gradient(135deg, ${GOLD}15, ${GREEN}10)`, borderRadius:12, padding:20, border:`1px solid ${GOLD}33`, textAlign:'center' }}>
          <div style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:20, marginBottom:8 }}>THE ONE-LINER</div>
          <p style={{ color:'#E6EDF3', fontSize:16, lineHeight:1.7, margin:0 }}>
            "We take your business temperature for free.
            <br />Show you exactly where you're losing money.
            <br />Then you pay us to fix it."
          </p>
        </div>
      </div>

      {/* ── RACHEL VOICE ASSISTANT (Floating Button) ── */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:100 }}>
        {!rachelOpen ? (
          <button onClick={() => setRachelOpen(true)}
            style={{ width:56, height:56, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, border:'none', cursor:'pointer', boxShadow:'0 4px 20px rgba(200,150,42,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
        ) : (
          <div style={{ width:320, maxWidth:'90vw', background:CARD, borderRadius:16, border:`1px solid ${BORDER}`, boxShadow:'0 8px 40px rgba(0,0,0,0.5)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'12px 16px', background:'#21262D', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>Ask Rachel</div>
                <div style={{ color:'#8B949E', fontSize:11 }}>ImprintIQ Sales Assistant</div>
              </div>
              <button onClick={() => { disconnectRachel(); setRachelOpen(false); }}
                style={{ background:'none', border:'none', color:'#8B949E', fontSize:18, cursor:'pointer', padding:4 }}>x</button>
            </div>

            {/* Transcript */}
            <div ref={transcriptRef} style={{ height:200, overflowY:'auto', padding:12, background:'#0D1117' }}>
              {transcript.length === 0 && (
                <div style={{ color:'#484F58', fontSize:12, textAlign:'center', marginTop:60 }}>
                  Press Start to talk with Rachel.
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

            {/* Controls */}
            <div style={{ padding:12, borderTop:'1px solid #21262D', display:'flex', gap:8, justifyContent:'center' }}>
              {rachelStatus === 'idle' || rachelStatus === 'error' ? (
                <button onClick={connectRachel}
                  style={{ flex:1, padding:'10px', background:`linear-gradient(135deg,${GOLD},#A67A1E)`, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  Start Conversation
                </button>
              ) : rachelStatus === 'connecting' ? (
                <div style={{ color:'#8B949E', fontSize:12, padding:10 }}>Connecting to Rachel...</div>
              ) : (
                <button onClick={disconnectRachel}
                  style={{ flex:1, padding:'10px', background:RED+'33', color:RED, border:`1px solid ${RED}44`, borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  End Conversation
                </button>
              )}
            </div>
            {rachelStatus === 'connected' && (
              <div style={{ textAlign:'center', padding:'0 0 8px' }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:GREEN, animation:'pulse 1.5s infinite' }} />
                  <span style={{ color:GREEN, fontSize:11 }}>Rachel is listening...</span>
                </div>
              </div>
            )}
            {rachelStatus === 'error' && (
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

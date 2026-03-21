import React, { useState } from 'react';

const GOLD = '#C8962A';
const RED = '#F85149';
const GREEN = '#238636';
const BLUE = '#1A9FE0';
const PURPLE = '#A371F7';
const CARD = '#161B22';
const BORDER = '#30363D';
const BG = '#0D1117';

const CURRENT_STEPS = [
  { area: 'Lead Capture', people: 'Receptionist + Sales Rep', tools: 'Phone, Email, Spreadsheet', time: '2-4 hours', pain: 'Missed calls go nowhere. Leads lost in email. No follow-up tracking.', cost: 55000 },
  { area: 'Quoting', people: 'Inside Sales Rep', tools: 'Excel, Email, PDF templates', time: '4-24 hours', pain: 'Manual price lookups. Copy-paste errors. No margin visibility until later.', cost: 180000 },
  { area: 'Artwork & Proofing', people: 'Art Department (3-5 people)', tools: 'Email, Illustrator, manual review', time: '2-5 days', pain: '#1 bottleneck. Bad art delays everything. 3+ revision cycles average.', cost: 250000 },
  { area: 'Order Entry', people: 'Order Processing Team', tools: 'ERP, manual data entry', time: '1-2 hours per order', pain: 'Re-keying data from quote to order. Errors cause production mistakes.', cost: 120000 },
  { area: 'Production', people: 'Production Manager + Operators', tools: 'Whiteboard, paper tickets, tribal knowledge', time: 'Varies', pain: 'No real-time visibility. Bottlenecks discovered too late. Manual scheduling.', cost: 350000 },
  { area: 'Quality Control', people: 'QC Inspector (1-2 people)', tools: 'Eyes, ruler, Pantone book', time: '15-30 min per job', pain: 'Subjective. Defects caught late. Reprints cost time and materials.', cost: 95000 },
  { area: 'Shipping', people: 'Shipping Clerk', tools: 'Carrier websites, manual labels', time: '30-60 min per order', pain: 'No carrier optimization. Manual tracking updates. Split shipments chaos.', cost: 85000 },
  { area: 'Invoicing', people: 'Accounting (2-3 people)', tools: 'QuickBooks / ERP', time: '1-3 days after ship', pain: 'Invoice delays = payment delays. Manual collections. 45+ day DSO.', cost: 140000 },
  { area: 'Customer Follow-Up', people: 'Sales Rep (if they remember)', tools: 'Memory, maybe CRM', time: 'Often never', pain: 'No reorder detection. Customers leave without anyone noticing.', cost: 200000 },
  { area: 'Reporting', people: 'Controller / Ops Manager', tools: 'Excel, ERP exports, manual compilation', time: '1-2 days per month', pain: 'Backward-looking. No real-time visibility. Data in 10 different places.', cost: 75000 },
];

const TARGET_STEPS = [
  { area: 'Lead Capture', agent: 'Customer Voice Agent', how: 'Rachel/Ana answers every call 24/7. Auto-creates customer record, captures intent, generates quote if requested.', time: 'Instant', savings: '95%' },
  { area: 'Quoting', agent: 'Quote Engine Agent', how: '"500 pens under $3 for a trade show" → instant 3-tier quote with pricing, decoration, volume breaks, margin analysis.', time: '< 30 seconds', savings: '90%' },
  { area: 'Artwork & Proofing', agent: 'Art Director Agent', how: 'Upload → AI validates DPI, vectors, colors in 2 sec. Auto-generates virtual mockup. Customer approves with 1 click.', time: '< 5 minutes', savings: '85%' },
  { area: 'Order Entry', agent: 'Quote Engine + Production', how: 'Quote approved → order auto-created. Zero re-keying. All specs flow from quote to production ticket.', time: 'Instant', savings: '100%' },
  { area: 'Production', agent: 'Production Orchestrator', how: 'AI routes jobs to optimal line. Real-time Kanban board. Bottleneck prediction before it happens.', time: 'Auto-scheduled', savings: '60%' },
  { area: 'Quality Control', agent: 'QC Vision Agent', how: 'Camera compares finished product to approved proof. Color delta measurement. Automatic pass/fail.', time: '< 3 seconds', savings: '80%' },
  { area: 'Shipping', agent: 'Fulfillment Agent', how: 'AI selects cheapest carrier for delivery date. Auto-generates labels. Customer gets tracking instantly.', time: '< 1 minute', savings: '75%' },
  { area: 'Invoicing', agent: 'Finance Agent', how: 'Ship confirmed → invoice auto-generated → auto-sent. Overdue? AI calls their AP department.', time: 'Instant on ship', savings: '90%' },
  { area: 'Customer Follow-Up', agent: 'Sales Intel + Catalog Agent', how: 'AI detects reorder patterns. Voice agent calls 30 days before predicted need. "Ready to lock in pricing?"', time: 'Proactive', savings: '95%' },
  { area: 'Reporting', agent: 'Neural Intelligence', how: '6 health panels updating in real-time. 15 analyzers running continuously. Findings with dollar impact. Zero manual work.', time: 'Real-time', savings: '100%' },
];

export default function ProcessModel() {
  const [view, setView] = useState('side-by-side');
  const [revenue, setRevenue] = useState(655);
  const [expanded, setExpanded] = useState(null);

  // Scale ops cost with company size (bigger company = more people doing this manually)
  const sizeMultiplier = Math.max(0.5, Math.min(5, revenue / 100));
  const totalCurrentCost = Math.round(CURRENT_STEPS.reduce((s, st) => s + st.cost, 0) * sizeMultiplier);

  // ImprintIQ pricing — scales smoothly with revenue
  const pricing = {
    platform:    Math.round(1500 + revenue * 30),        // $1,500 base + $30/M rev → $3K at $50M, $21K at $655M
    agents:      Math.round(3000 + revenue * 80),        // $3,000 base + $80/M rev → $7K at $50M, $55K at $655M
    treatments:  Math.round(1500 + revenue * 25),        // $1,500 base + $25/M rev → $2.7K at $50M, $18K at $655M
    integrations:Math.round(1000 + revenue * 15),        // $1,000 base + $15/M rev → $1.7K at $50M, $11K at $655M
    managed:     Math.round(2000 + revenue * 20),        // $2,000 base + $20/M rev → $3K at $50M, $15K at $655M
  };
  const monthlyTotal = pricing.platform + pricing.agents + pricing.treatments + pricing.integrations + pricing.managed;
  const platformCost = monthlyTotal * 12;

  const savingsRate = 0.72;
  const annualSavings = Math.round(totalCurrentCost * savingsRate);
  const netROI = annualSavings - platformCost;
  const roiPct = Math.round((netROI / platformCost) * 100);
  const paybackMonths = Math.max(1, Math.round((platformCost / annualSavings) * 12));

  const pill = (text, color) => (
    <span style={{ fontSize:10, padding:'3px 10px', borderRadius:10, background:color+'22', color, fontWeight:600, whiteSpace:'nowrap' }}>{text}</span>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24, display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:28, margin:0, letterSpacing:2 }}>PROCESS TRANSFORMATION</h2>
          <p style={{ color:'#8B949E', fontSize:13, marginTop:4 }}>Current State vs ImprintIQ Target State — with ROI</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['side-by-side','current','target','roi'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:'8px 16px', borderRadius:6, border:`1px solid ${view === v ? GOLD : BORDER}`, background: view === v ? GOLD+'22' : 'transparent', color: view === v ? GOLD : '#8B949E', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
              {v === 'side-by-side' ? 'Compare' : v === 'roi' ? 'ROI Calculator' : v}
            </button>
          ))}
        </div>
      </div>

      {/* Side-by-Side View */}
      {view === 'side-by-side' && (
        <div>
          {/* Legend */}
          <div style={{ display:'flex', gap:20, marginBottom:20, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}><div style={{ width:12, height:12, borderRadius:2, background:RED }} /> <span style={{ color:'#8B949E', fontSize:12 }}>Current State — Manual, Slow, Error-Prone</span></div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}><div style={{ width:12, height:12, borderRadius:2, background:GREEN }} /> <span style={{ color:'#8B949E', fontSize:12 }}>ImprintIQ — AI-Automated, Instant, Accurate</span></div>
          </div>

          {CURRENT_STEPS.map((curr, i) => {
            const tgt = TARGET_STEPS[i];
            const isOpen = expanded === i;
            return (
              <div key={i} onClick={() => setExpanded(isOpen ? null : i)} style={{ cursor:'pointer', marginBottom:12 }}>
                {/* Step Header */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 1fr', gap:0, alignItems:'stretch' }}>
                  {/* Current */}
                  <div style={{ background:CARD, borderRadius:'12px 0 0 12px', padding:16, border:`1px solid ${BORDER}`, borderRight:'none', borderLeft:`4px solid ${RED}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:600 }}>{curr.area}</span>
                      </div>
                      {pill(curr.time, RED)}
                    </div>
                    <div style={{ color:'#8B949E', fontSize:12, marginBottom:6 }}><strong style={{ color:'#C9D1D9' }}>Who:</strong> {curr.people}</div>
                    <div style={{ color:'#8B949E', fontSize:12 }}><strong style={{ color:'#C9D1D9' }}>Tools:</strong> {curr.tools}</div>
                    {isOpen && <div style={{ marginTop:10, padding:10, background:'#F8514911', borderRadius:6, color:RED, fontSize:12, lineHeight:1.5 }}>{curr.pain}</div>}
                  </div>

                  {/* Arrow */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'#21262D' }}>
                    <span style={{ fontSize:20, color:GOLD }}>→</span>
                  </div>

                  {/* Target */}
                  <div style={{ background:CARD, borderRadius:'0 12px 12px 0', padding:16, border:`1px solid ${BORDER}`, borderLeft:'none', borderRight:`4px solid ${GREEN}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:600 }}>{tgt.agent}</span>
                      </div>
                      {pill(tgt.time, GREEN)}
                    </div>
                    <div style={{ color:'#C9D1D9', fontSize:12, lineHeight:1.5 }}>{tgt.how}</div>
                    {isOpen && (
                      <div style={{ marginTop:10, display:'flex', gap:12, alignItems:'center' }}>
                        {pill(`${tgt.savings} time saved`, GREEN)}
                        {pill(`$${Math.round(curr.cost * parseInt(tgt.savings) / 100).toLocaleString()}/yr saved`, GOLD)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ textAlign:'center', color:'#484F58', fontSize:11, marginTop:8 }}>Click any row to expand details</div>
        </div>
      )}

      {/* Current State Only */}
      {view === 'current' && (
        <div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20, borderLeft:`4px solid ${RED}` }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:RED, fontSize:20, marginBottom:8 }}>CURRENT STATE: MANUAL OPERATIONS</h3>
            <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>
              10 operational areas running on spreadsheets, email, phone calls, whiteboards, and tribal knowledge.
              Data scattered across 8-10 systems. No real-time visibility. Errors at every handoff.
            </p>
            <div style={{ marginTop:12, display:'flex', gap:12, flexWrap:'wrap' }}>
              {pill(`${CURRENT_STEPS.length} manual processes`, RED)}
              {pill(`$${(totalCurrentCost/1000000).toFixed(1)}M annual labor cost`, RED)}
              {pill('45+ day DSO', RED)}
              {pill('3+ day proof cycle', RED)}
              {pill('24h+ quote turnaround', RED)}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
            {CURRENT_STEPS.map((s, i) => (
              <div key={i} style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${RED}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:600 }}>{s.area}</span>
                  </div>
                  {pill(s.time, RED)}
                </div>
                <div style={{ color:'#8B949E', fontSize:12, marginBottom:4 }}><strong style={{ color:'#C9D1D9' }}>People:</strong> {s.people}</div>
                <div style={{ color:'#8B949E', fontSize:12, marginBottom:4 }}><strong style={{ color:'#C9D1D9' }}>Tools:</strong> {s.tools}</div>
                <div style={{ color:'#8B949E', fontSize:12, marginBottom:8 }}><strong style={{ color:'#C9D1D9' }}>Annual Cost:</strong> <span style={{ color:GOLD }}>${s.cost.toLocaleString()}</span></div>
                <div style={{ padding:10, background:'#F8514911', borderRadius:6, color:RED, fontSize:11, lineHeight:1.5 }}>{s.pain}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target State Only */}
      {view === 'target' && (
        <div>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, marginBottom:20, borderLeft:`4px solid ${GREEN}` }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:GREEN, fontSize:20, marginBottom:8 }}>TARGET STATE: IMPRINTIQ AI ECOSYSTEM</h3>
            <p style={{ color:'#8B949E', fontSize:13, lineHeight:1.6 }}>
              11 AI agents handle every operational area autonomously. Neural Intelligence monitors everything in real-time.
              Data flows automatically from calls, portal, industry feeds, ERP, and shop floor.
            </p>
            <div style={{ marginTop:12, display:'flex', gap:12, flexWrap:'wrap' }}>
              {pill('11 AI agents', GREEN)}
              {pill('6 neural panels', BLUE)}
              {pill('15 diagnostic analyzers', PURPLE)}
              {pill('< 30 sec quotes', GREEN)}
              {pill('< 5 min proofs', GREEN)}
              {pill('Real-time reporting', GREEN)}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
            {TARGET_STEPS.map((s, i) => (
              <div key={i} style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${GREEN}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:600 }}>{s.agent}</span>
                  </div>
                  {pill(s.time, GREEN)}
                </div>
                <div style={{ color:'#C9D1D9', fontSize:12, lineHeight:1.6, marginBottom:8 }}>{s.how}</div>
                <div style={{ display:'flex', gap:8 }}>
                  {pill(`${s.savings} time saved`, GREEN)}
                  {pill(`$${Math.round(CURRENT_STEPS[i].cost * parseInt(s.savings) / 100).toLocaleString()}/yr saved`, GOLD)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROI Calculator */}
      {view === 'roi' && (
        <div>
          {/* Revenue Slider */}
          <div style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${BORDER}`, marginBottom:20 }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:20, marginBottom:16 }}>COMPANY REVENUE</h3>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <input type="range" min={10} max={1000} value={revenue} onChange={e => setRevenue(parseInt(e.target.value))}
                style={{ flex:1, accentColor:GOLD, height:6 }} />
              <span style={{ color:GOLD, fontSize:28, fontFamily:'Bebas Neue', minWidth:120, textAlign:'right' }}>${revenue}M</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', color:'#484F58', fontSize:10, marginTop:4 }}>
              <span>$10M (Mid-Market)</span><span>$500M+ (Enterprise)</span><span>$1B+</span>
            </div>
          </div>

          {/* Cost Comparison */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${BORDER}`, borderTop:`4px solid ${RED}` }}>
              <h3 style={{ fontFamily:'Bebas Neue', color:RED, fontSize:18, marginBottom:16 }}>CURRENT OPERATIONAL COST</h3>
              {CURRENT_STEPS.map((s, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid #21262D` }}>
                  <span style={{ color:'#8B949E', fontSize:12 }}>{s.area}</span>
                  <span style={{ color:RED, fontSize:12, fontFamily:'monospace' }}>${Math.round(s.cost * sizeMultiplier).toLocaleString()}/yr</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0 0', marginTop:8, borderTop:`2px solid ${RED}` }}>
                <span style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>TOTAL ANNUAL COST</span>
                <span style={{ color:RED, fontSize:18, fontFamily:'Bebas Neue' }}>${totalCurrentCost.toLocaleString()}/yr</span>
              </div>
            </div>

            <div style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${BORDER}`, borderTop:`4px solid ${GREEN}` }}>
              <h3 style={{ fontFamily:'Bebas Neue', color:GREEN, fontSize:18, marginBottom:16 }}>IMPRINTIQ INVESTMENT</h3>
              {[
                { label: 'Platform + Neural Intelligence', monthly: pricing.platform },
                { label: 'AI Agent Suite (11 agents)', monthly: pricing.agents },
                { label: 'Treatment Activations', monthly: pricing.treatments },
                { label: 'Integrations (ERP, ASI, CRM)', monthly: pricing.integrations },
                { label: 'Managed AI Operations', monthly: pricing.managed },
              ].map((item, idx) => (
                <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #21262D' }}>
                  <span style={{ color:'#8B949E', fontSize:12 }}>{item.label}</span>
                  <span style={{ color:GREEN, fontSize:12, fontFamily:'monospace' }}>${item.monthly.toLocaleString()}/mo</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 0', marginTop:8, borderTop:`2px solid ${GREEN}` }}>
                <div>
                  <div style={{ color:'#E6EDF3', fontSize:14, fontWeight:700 }}>TOTAL MONTHLY</div>
                  <div style={{ color:'#8B949E', fontSize:11, marginTop:2 }}>${platformCost.toLocaleString()}/yr</div>
                </div>
                <span style={{ color:GREEN, fontSize:22, fontFamily:'Bebas Neue' }}>${monthlyTotal.toLocaleString()}/mo</span>
              </div>
            </div>
          </div>

          {/* ROI Summary */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label: 'Annual Savings', value: `$${annualSavings.toLocaleString()}`, sub: `${Math.round(savingsRate*100)}% of current ops cost`, color: GREEN },
              { label: 'ImprintIQ Cost', value: `$${platformCost.toLocaleString()}`, sub: `${(platformCost/revenue/10000).toFixed(2)}% of revenue`, color: BLUE },
              { label: 'Net ROI', value: `$${netROI.toLocaleString()}`, sub: `${roiPct}% return on investment`, color: netROI > 0 ? GOLD : RED },
              { label: 'Payback Period', value: `${paybackMonths} months`, sub: paybackMonths <= 12 ? 'ROI in Year 1' : 'ROI in Year 2', color: paybackMonths <= 12 ? GREEN : GOLD }
            ].map((m, i) => (
              <div key={i} style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BORDER}`, borderTop:`4px solid ${m.color}`, textAlign:'center' }}>
                <div style={{ color:m.color, fontSize:28, fontFamily:'Bebas Neue' }}>{m.value}</div>
                <div style={{ color:'#E6EDF3', fontSize:13, fontWeight:600, marginTop:4 }}>{m.label}</div>
                <div style={{ color:'#8B949E', fontSize:11, marginTop:4 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Visual Bar Comparison */}
          <div style={{ background:CARD, borderRadius:12, padding:24, border:`1px solid ${BORDER}` }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:'#E6EDF3', fontSize:18, marginBottom:20 }}>COST COMPARISON BY AREA</h3>
            {CURRENT_STEPS.map((s, i) => {
              const tgt = TARGET_STEPS[i];
              const savedPct = parseInt(tgt.savings);
              const scaledCost = Math.round(s.cost * sizeMultiplier);
              const savedAmt = Math.round(scaledCost * savedPct / 100);
              const remaining = scaledCost - savedAmt;
              return (
                <div key={i} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ color:'#C9D1D9', fontSize:12 }}>{s.area}</span>
                    <span style={{ color:GREEN, fontSize:12 }}>-${savedAmt.toLocaleString()}/yr ({savedPct}%)</span>
                  </div>
                  <div style={{ display:'flex', height:20, borderRadius:4, overflow:'hidden', background:'#21262D' }}>
                    <div style={{ width:`${100-savedPct}%`, background:RED+'88', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {remaining > 30000 && <span style={{ fontSize:9, color:'#fff' }}>${(remaining/1000).toFixed(0)}K remains</span>}
                    </div>
                    <div style={{ width:`${savedPct}%`, background:GREEN+'88', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:9, color:'#fff' }}>${(savedAmt/1000).toFixed(0)}K saved by AI</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Line */}
          <div style={{ marginTop:20, background:`linear-gradient(135deg, ${GOLD}22, ${GREEN}22)`, borderRadius:12, padding:24, border:`1px solid ${GOLD}44`, textAlign:'center' }}>
            <h3 style={{ fontFamily:'Bebas Neue', color:GOLD, fontSize:24, marginBottom:8 }}>THE BOTTOM LINE</h3>
            <p style={{ color:'#E6EDF3', fontSize:16, lineHeight:1.6 }}>
              For a <strong>${revenue}M</strong> promotional products company, ImprintIQ delivers{' '}
              <strong style={{ color:GREEN }}>${annualSavings.toLocaleString()}</strong> in annual operational savings{' '}
              against a <strong style={{ color:BLUE }}>${platformCost.toLocaleString()}</strong> investment —{' '}
              a <strong style={{ color:GOLD }}>{roiPct}% ROI</strong> with payback in <strong style={{ color:GOLD }}>{paybackMonths} months</strong>.
            </p>
            <p style={{ color:'#8B949E', fontSize:12, marginTop:12 }}>
              This does not include revenue gains from recovered missed calls, proactive reorders, faster quoting, or reduced customer churn — which typically add 5-15% revenue uplift.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import api from '../services/api';

// Demo data generator
function generateDemoData() {
  const now = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });

  return {
    summary: {
      total_calls: 847,
      missed_calls: 126,
      missed_revenue: 38400,
      conversion_rate: 34.2,
      avg_response_time: '2m 14s',
      sentiment_score: 72,
      active_leads: 234,
      follow_ups_needed: 47,
      outbound_campaigns: 6,
      revenue_recovered: 12600,
    },
    call_analysis: {
      inbound: { total: 612, answered: 547, missed: 65, avg_duration: '4:32', conversion: 38.1 },
      outbound: { total: 235, connected: 189, missed: 46, avg_duration: '3:18', conversion: 26.4 },
      peak_hours: [
        { hour: '8AM', calls: 42 }, { hour: '9AM', calls: 78 }, { hour: '10AM', calls: 95 },
        { hour: '11AM', calls: 88 }, { hour: '12PM', calls: 54 }, { hour: '1PM', calls: 67 },
        { hour: '2PM', calls: 82 }, { hour: '3PM', calls: 91 }, { hour: '4PM', calls: 76 },
        { hour: '5PM', calls: 48 },
      ],
    },
    transcript_insights: [
      { type: 'objection', text: '"Your rates are too high compared to other brokers"', frequency: 23, impact: 'HIGH', recommendation: 'Emphasize value-adds: real-time tracking, dedicated dispatch, insurance coverage' },
      { type: 'intent_signal', text: '"We need capacity for next week\'s shipment"', frequency: 45, impact: 'HIGH', recommendation: 'Trigger immediate follow-up within 30 minutes' },
      { type: 'missed_upsell', text: 'Customer mentioned temperature-controlled needs but was quoted dry van only', frequency: 12, impact: 'MEDIUM', recommendation: 'Train agents to probe for equipment requirements early in conversation' },
      { type: 'sentiment', text: 'Negative sentiment detected around transit time promises', frequency: 18, impact: 'MEDIUM', recommendation: 'Set realistic expectations; under-promise and over-deliver on ETAs' },
      { type: 'competitor', text: 'Mentions of CH Robinson and Echo in 15% of lost deals', frequency: 31, impact: 'HIGH', recommendation: 'Develop competitive battle cards highlighting your differentiators' },
    ],
    lead_conversion: {
      stages: [
        { name: 'Initial Contact', count: 234, pct: 100 },
        { name: 'Qualified', count: 156, pct: 66.7 },
        { name: 'Rate Quoted', count: 112, pct: 47.9 },
        { name: 'Load Tendered', count: 80, pct: 34.2 },
        { name: 'Booked', count: 64, pct: 27.4 },
      ],
      drop_off_points: [
        { from: 'Initial Contact', to: 'Qualified', lost: 78, reason: 'No follow-up within 24 hours' },
        { from: 'Qualified', to: 'Rate Quoted', lost: 44, reason: 'Rate quote delayed >4 hours' },
        { from: 'Rate Quoted', to: 'Load Tendered', lost: 32, reason: 'Price objection / competitor won' },
      ],
    },
    lead_sources: [
      { source: 'DAT Load Board', leads: 89, conversions: 31, revenue: 142000, roi: 340, cost: 3200 },
      { source: 'Truckstop', leads: 67, conversions: 22, revenue: 98000, roi: 280, cost: 2800 },
      { source: 'Website / Inbound', leads: 45, conversions: 19, revenue: 87000, roi: 1200, cost: 650 },
      { source: 'Referral', leads: 28, conversions: 16, revenue: 72000, roi: 2400, cost: 0 },
      { source: 'Cold Outbound', leads: 52, conversions: 8, revenue: 34000, roi: 85, cost: 4200 },
      { source: 'LinkedIn / Social', leads: 18, conversions: 4, revenue: 18000, roi: 160, cost: 1100 },
    ],
    campaigns: [
      { name: 'Q1 Reefer Lane Push', type: 'outbound', calls: 145, connects: 98, bookings: 14, revenue: 63000, status: 'active' },
      { name: 'Dormant Shipper Reactivation', type: 'outbound', calls: 89, connects: 52, bookings: 8, revenue: 36000, status: 'active' },
      { name: 'New Carrier Onboarding', type: 'outbound', calls: 67, connects: 41, bookings: 22, revenue: 0, status: 'active' },
      { name: 'Rate Increase Notification', type: 'outbound', calls: 112, connects: 78, bookings: 0, revenue: 0, status: 'completed' },
      { name: 'Flatbed Capacity Drive', type: 'outbound', calls: 56, connects: 34, bookings: 6, revenue: 28000, status: 'paused' },
    ],
    scheduling: {
      total_pickups: 312,
      on_time: 278,
      late: 34,
      gaps: 18,
      utilization_pct: 84,
      optimal_windows: ['6AM-8AM', '10AM-12PM', '2PM-4PM'],
      bottlenecks: [
        { time: '8AM-10AM', issue: 'Dock congestion at major shippers', suggestion: 'Stagger appointments by 30 minutes' },
        { time: '12PM-2PM', issue: 'Driver lunch overlap', suggestion: 'Offer incentive for noon pickups' },
      ],
    },
    voice_scripts: {
      current_conversion: 34.2,
      recommended_changes: [
        { element: 'Opening', current: '"Hi, this is dispatch calling about your shipment"', suggested: '"Hi [Name], I have capacity available for your [City] lane this week"', impact: '+12% engagement' },
        { element: 'Rate Objection', current: '"That\'s our best rate for this lane"', suggested: '"I understand. Let me show you the value: dedicated tracking, 2-hour check calls, and guaranteed capacity"', impact: '+8% close rate' },
        { element: 'Closing', current: '"Would you like to book?"', suggested: '"I can lock this rate for 24 hours. Shall I send the rate confirmation now?"', impact: '+15% booking rate' },
      ],
      ab_tests: [
        { test: 'Opening: Name vs Generic', variant_a: 'Generic greeting', variant_b: 'Personalized with shipper name', winner: 'B', lift: '+18%' },
        { test: 'Rate Presentation: Single vs Range', variant_a: 'Single flat rate', variant_b: 'Rate range with recommendation', winner: 'B', lift: '+7%' },
      ],
    },
    follow_ups: [
      { contact: 'Acme Logistics', last_contact: '3 days ago', status: 'Rate quoted - no response', urgency: 'HIGH', action: 'Call back with adjusted rate', potential: 8500 },
      { contact: 'Pacific Foods Inc', last_contact: '5 days ago', status: 'Initial inquiry - reefer lane', urgency: 'HIGH', action: 'Send capacity confirmation', potential: 12000 },
      { contact: 'Midwest Steel Co', last_contact: '2 days ago', status: 'Pending carrier assignment', urgency: 'MEDIUM', action: 'Confirm carrier pickup window', potential: 6200 },
      { contact: 'Green Valley Produce', last_contact: '7 days ago', status: 'Lost to competitor', urgency: 'LOW', action: 'Follow up with new seasonal rates', potential: 4800 },
      { contact: 'Southwest Auto Parts', last_contact: '1 day ago', status: 'Negotiating terms', urgency: 'HIGH', action: 'Send revised contract', potential: 15000 },
    ],
    sentiment: {
      overall: 72,
      trend: '+4',
      breakdown: { positive: 48, neutral: 31, negative: 21 },
      themes: [
        { theme: 'Rate Competitiveness', score: 65, trend: '-3' },
        { theme: 'Communication Speed', score: 82, trend: '+6' },
        { theme: 'Tracking Updates', score: 78, trend: '+2' },
        { theme: 'Claims Handling', score: 58, trend: '-1' },
        { theme: 'Dispatch Responsiveness', score: 85, trend: '+8' },
      ],
    },
    revenue_forecast: {
      current_monthly: 284000,
      potential_recovery: 38400,
      actions: [
        { action: 'Follow up on 47 open leads within 24hrs', impact: 12600, difficulty: 'Easy' },
        { action: 'Reduce rate quote delay to <1 hour', impact: 8200, difficulty: 'Medium' },
        { action: 'Implement missed call auto-callback', impact: 9400, difficulty: 'Easy' },
        { action: 'Script optimization from transcript analysis', impact: 4800, difficulty: 'Medium' },
        { action: 'Reactivate dormant shipper accounts', impact: 3400, difficulty: 'Hard' },
      ],
    },
  };
}

export default function Neural() {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try API first, fall back to demo data
    api.get('/neural/insights').then(r => {
      setData(r.data.data || generateDemoData());
      setLoading(false);
    }).catch(() => {
      setData(generateDemoData());
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading Neural Intelligence...</div>;
  if (!data) return null;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'calls', label: 'Call Analysis' },
    { id: 'transcripts', label: 'Transcript AI' },
    { id: 'leads', label: 'Lead Conversion' },
    { id: 'sources', label: 'Lead Sources' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'scripts', label: 'Script AI' },
    { id: 'follow-ups', label: 'Follow-Ups' },
    { id: 'sentiment', label: 'Sentiment' },
    { id: 'revenue', label: 'Revenue' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
        <h1 style={S.title}>NEURAL INTELLIGENCE</h1>
        <div style={{ padding: '4px 12px', background: '#8B5CF622', color: '#8B5CF6', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>AI-POWERED</div>
      </div>
      <p style={S.sub}>AI-powered business intelligence analyzing calls, transcripts, leads, and revenue opportunities</p>

      {/* Tabs */}
      <div style={S.tabBar}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && <OverviewTab data={data} />}
      {activeTab === 'calls' && <CallsTab data={data} />}
      {activeTab === 'transcripts' && <TranscriptsTab data={data} />}
      {activeTab === 'leads' && <LeadsTab data={data} />}
      {activeTab === 'sources' && <SourcesTab data={data} />}
      {activeTab === 'campaigns' && <CampaignsTab data={data} />}
      {activeTab === 'scripts' && <ScriptsTab data={data} />}
      {activeTab === 'follow-ups' && <FollowUpsTab data={data} />}
      {activeTab === 'sentiment' && <SentimentTab data={data} />}
      {activeTab === 'revenue' && <RevenueTab data={data} />}
    </div>
  );
}

function OverviewTab({ data }) {
  const s = data.summary;
  const kpis = [
    { label: 'Total Calls', value: s.total_calls.toLocaleString(), color: '#0EA5E9' },
    { label: 'Missed Calls', value: s.missed_calls.toLocaleString(), color: '#EF4444' },
    { label: 'Missed Revenue', value: `$${(s.missed_revenue / 1000).toFixed(1)}K`, color: '#EF4444' },
    { label: 'Conversion Rate', value: `${s.conversion_rate}%`, color: '#22C55E' },
    { label: 'Avg Response', value: s.avg_response_time, color: '#F59E0B' },
    { label: 'Sentiment Score', value: s.sentiment_score, color: '#8B5CF6' },
    { label: 'Active Leads', value: s.active_leads, color: '#0EA5E9' },
    { label: 'Follow-Ups Needed', value: s.follow_ups_needed, color: '#F59E0B' },
  ];

  return (
    <div>
      {/* KPI Strip */}
      <div style={S.kpiStrip}>
        {kpis.map((k, i) => (
          <div key={i} style={S.kpiCard}>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={{ ...S.kpiVal, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue Recovery Banner */}
      <div style={S.revBanner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Revenue Opportunity Forecast</div>
            <div style={{ fontSize: 13, color: '#E6EDF3', lineHeight: 1.6 }}>
              Based on current trends, implementing all recommended actions could recover an estimated <span style={{ color: '#22C55E', fontWeight: 700 }}>${(s.missed_revenue / 1000).toFixed(1)}K/month</span> in missed revenue.
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '0 20px' }}>
            <div style={{ fontSize: 36, fontFamily: "'Bebas Neue',sans-serif", color: '#22C55E' }}>${(s.revenue_recovered / 1000).toFixed(1)}K</div>
            <div style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>Already Recovered</div>
          </div>
        </div>
      </div>

      {/* Quick Insights Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* Top Follow-Ups */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Priority Follow-Ups</h3>
            <div style={{ ...S.badge, background: '#EF444422', color: '#EF4444' }}>{s.follow_ups_needed} PENDING</div>
          </div>
          {data.follow_ups.filter(f => f.urgency === 'HIGH').slice(0, 3).map((f, i) => (
            <div key={i} style={S.listItem}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{f.contact}</span>
                <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>${f.potential.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{f.action}</div>
            </div>
          ))}
        </div>

        {/* Top Transcript Insights */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Transcript Insights</h3>
            <div style={{ ...S.badge, background: '#8B5CF622', color: '#8B5CF6' }}>AI ANALYSIS</div>
          </div>
          {data.transcript_insights.filter(t => t.impact === 'HIGH').slice(0, 3).map((t, i) => (
            <div key={i} style={S.listItem}>
              <div style={{ fontSize: 12, color: '#E6EDF3', fontStyle: 'italic' }}>{t.text}</div>
              <div style={{ fontSize: 11, color: '#0EA5E9', marginTop: 4 }}>{t.recommendation}</div>
            </div>
          ))}
        </div>

        {/* Sentiment Overview */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Sentiment Analysis</h3>
            <div style={{ fontSize: 14, fontWeight: 700, color: data.sentiment.overall >= 70 ? '#22C55E' : '#F59E0B' }}>{data.sentiment.overall}/100 <span style={{ fontSize: 11, color: data.sentiment.trend.startsWith('+') ? '#22C55E' : '#EF4444' }}>{data.sentiment.trend}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            <div style={{ flex: data.sentiment.breakdown.positive, background: '#22C55E', borderRadius: 4, padding: 6, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{data.sentiment.breakdown.positive}% Pos</div>
            <div style={{ flex: data.sentiment.breakdown.neutral, background: '#F59E0B', borderRadius: 4, padding: 6, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{data.sentiment.breakdown.neutral}% Neutral</div>
            <div style={{ flex: data.sentiment.breakdown.negative, background: '#EF4444', borderRadius: 4, padding: 6, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{data.sentiment.breakdown.negative}% Neg</div>
          </div>
          {data.sentiment.themes.slice(0, 3).map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #21262D' }}>
              <span style={{ fontSize: 12, color: '#E6EDF3' }}>{t.theme}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.score >= 70 ? '#22C55E' : t.score >= 50 ? '#F59E0B' : '#EF4444' }}>{t.score} <span style={{ fontSize: 10, color: t.trend.startsWith('+') ? '#22C55E' : '#EF4444' }}>{t.trend}</span></span>
            </div>
          ))}
        </div>

        {/* Lead Source Quick */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Top Lead Sources</h3>
            <div style={{ ...S.badge, background: '#22C55E22', color: '#22C55E' }}>ROI</div>
          </div>
          {data.lead_sources.sort((a, b) => b.roi - a.roi).slice(0, 4).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262D' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{s.source}</div>
                <div style={{ fontSize: 11, color: '#8B949E' }}>{s.leads} leads / {s.conversions} converted</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>{s.roi}% ROI</div>
                <div style={{ fontSize: 11, color: '#8B949E' }}>${(s.revenue / 1000).toFixed(0)}K rev</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CallsTab({ data }) {
  const c = data.call_analysis;
  const maxCalls = Math.max(...c.peak_hours.map(h => h.calls));
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Inbound */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Inbound Calls</h3>
            <div style={{ ...S.badge, background: '#0EA5E922', color: '#0EA5E9' }}>INBOUND</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MetricBox label="Total" value={c.inbound.total} color="#0EA5E9" />
            <MetricBox label="Answered" value={c.inbound.answered} color="#22C55E" />
            <MetricBox label="Missed" value={c.inbound.missed} color="#EF4444" />
            <MetricBox label="Conversion" value={`${c.inbound.conversion}%`} color="#22C55E" />
            <MetricBox label="Avg Duration" value={c.inbound.avg_duration} color="#F59E0B" />
            <MetricBox label="Answer Rate" value={`${Math.round(c.inbound.answered / c.inbound.total * 100)}%`} color="#22C55E" />
          </div>
        </div>

        {/* Outbound */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Outbound Calls</h3>
            <div style={{ ...S.badge, background: '#F59E0B22', color: '#F59E0B' }}>OUTBOUND</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MetricBox label="Total" value={c.outbound.total} color="#F59E0B" />
            <MetricBox label="Connected" value={c.outbound.connected} color="#22C55E" />
            <MetricBox label="No Answer" value={c.outbound.missed} color="#EF4444" />
            <MetricBox label="Conversion" value={`${c.outbound.conversion}%`} color="#22C55E" />
            <MetricBox label="Avg Duration" value={c.outbound.avg_duration} color="#F59E0B" />
            <MetricBox label="Connect Rate" value={`${Math.round(c.outbound.connected / c.outbound.total * 100)}%`} color="#22C55E" />
          </div>
        </div>
      </div>

      {/* Peak Hours Chart */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Call Volume by Hour</h3>
          <div style={{ ...S.badge }}>PEAK ANALYSIS</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '10px 0' }}>
          {c.peak_hours.map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: '#8B949E', fontWeight: 600 }}>{h.calls}</div>
              <div style={{
                width: '100%', maxWidth: 40,
                height: `${(h.calls / maxCalls) * 120}px`,
                background: h.calls >= 85 ? '#0EA5E9' : h.calls >= 60 ? '#0EA5E988' : '#0EA5E944',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s ease',
              }} />
              <div style={{ fontSize: 9, color: '#8B949E' }}>{h.hour}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Missed Revenue */}
      <div style={{ ...S.revBanner, marginTop: 16, borderColor: '#EF4444' }}>
        <div style={{ fontSize: 11, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Missed Call Revenue Impact</div>
        <div style={{ fontSize: 13, color: '#E6EDF3' }}>
          <strong>{data.summary.missed_calls}</strong> missed calls this month represent an estimated <span style={{ color: '#EF4444', fontWeight: 700 }}>${data.summary.missed_revenue.toLocaleString()}</span> in potential revenue.
          Implementing auto-callback could recover <span style={{ color: '#22C55E', fontWeight: 700 }}>$9,400/month</span>.
        </div>
      </div>
    </div>
  );
}

function TranscriptsTab({ data }) {
  const impactColor = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#22C55E' };
  const typeIcon = { objection: 'O', intent_signal: 'I', missed_upsell: 'U', sentiment: 'S', competitor: 'C' };
  const typeColor = { objection: '#EF4444', intent_signal: '#22C55E', missed_upsell: '#F59E0B', sentiment: '#8B5CF6', competitor: '#0EA5E9' };

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>AI Transcript Analysis</h3>
          <div style={{ ...S.badge, background: '#8B5CF622', color: '#8B5CF6' }}>NEURAL AI</div>
        </div>
        <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16, lineHeight: 1.5 }}>
          Neural AI reads every call transcript to detect objections, intent signals, missed upsells, sentiment patterns, and competitor mentions.
        </p>

        {data.transcript_insights.map((t, i) => (
          <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 16, marginBottom: 10, borderLeft: `3px solid ${typeColor[t.type]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: `${typeColor[t.type]}22`, color: typeColor[t.type], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{typeIcon[t.type]}</div>
                <span style={{ fontSize: 10, color: typeColor[t.type], textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{t.type.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#8B949E' }}>{t.frequency}x detected</span>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${impactColor[t.impact]}22`, color: impactColor[t.impact] }}>{t.impact}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#E6EDF3', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.5 }}>{t.text}</div>
            <div style={{ fontSize: 12, color: '#0EA5E9', padding: '8px 10px', background: '#0EA5E911', borderRadius: 6 }}>
              Recommendation: {t.recommendation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadsTab({ data }) {
  const lc = data.lead_conversion;
  return (
    <div>
      {/* Funnel */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Lead Conversion Funnel</h3>
          <div style={{ ...S.badge, background: '#22C55E22', color: '#22C55E' }}>FUNNEL</div>
        </div>
        <div style={{ padding: '20px 0' }}>
          {lc.stages.map((stage, i) => (
            <div key={i} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 140, fontSize: 12, color: '#E6EDF3', textAlign: 'right' }}>{stage.name}</div>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ width: `${stage.pct}%`, background: `hsl(${200 - i * 30}, 70%, 50%)`, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 12, transition: 'width 0.5s ease', minWidth: 80 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{stage.count} ({stage.pct}%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drop-off Analysis */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Drop-Off Analysis</h3>
          <div style={{ ...S.badge, background: '#EF444422', color: '#EF4444' }}>LEAKS</div>
        </div>
        {lc.drop_off_points.map((d, i) => (
          <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 14, marginBottom: 8, borderLeft: '3px solid #EF4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{d.from} &rarr; {d.to}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>-{d.lost} leads lost</span>
            </div>
            <div style={{ fontSize: 12, color: '#F59E0B' }}>Root cause: {d.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesTab({ data }) {
  const maxRev = Math.max(...data.lead_sources.map(s => s.revenue));
  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <h3 style={S.cardTitle}>Lead Source Intelligence</h3>
        <div style={{ ...S.badge, background: '#22C55E22', color: '#22C55E' }}>ROI ANALYSIS</div>
      </div>
      <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16 }}>Identifies which channels deliver the highest-converting leads and best ROI.</p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Source', 'Leads', 'Conversions', 'Conv %', 'Revenue', 'Cost', 'ROI'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #21262D' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lead_sources.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #21262D' }}>
                <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{s.source}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#E6EDF3' }}>{s.leads}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#22C55E' }}>{s.conversions}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#E6EDF3' }}>{Math.round(s.conversions / s.leads * 100)}%</td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: `${s.revenue / maxRev * 100}%`, height: 6, background: '#22C55E', borderRadius: 3, minWidth: 20 }} />
                    <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>${(s.revenue / 1000).toFixed(0)}K</span>
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: 13, color: '#8B949E' }}>{s.cost > 0 ? `$${s.cost.toLocaleString()}` : 'Free'}</td>
                <td style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: s.roi >= 500 ? '#22C55E' : s.roi >= 200 ? '#F59E0B' : '#EF4444' }}>{s.roi}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignsTab({ data }) {
  const statusColor = { active: '#22C55E', completed: '#0EA5E9', paused: '#F59E0B' };
  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <h3 style={S.cardTitle}>Outbound Campaign Performance</h3>
        <div style={{ ...S.badge, background: '#F59E0B22', color: '#F59E0B' }}>{data.campaigns.length} CAMPAIGNS</div>
      </div>
      <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16 }}>Measures outbound call and message performance. Shows which campaigns drive bookings and which waste budget.</p>

      {data.campaigns.map((c, i) => (
        <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>{c.name}</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${statusColor[c.status]}22`, color: statusColor[c.status], textTransform: 'uppercase' }}>{c.status}</span>
            </div>
            {c.revenue > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>${(c.revenue / 1000).toFixed(0)}K</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <MetricBox label="Calls" value={c.calls} color="#0EA5E9" small />
            <MetricBox label="Connects" value={c.connects} color="#22C55E" small />
            <MetricBox label="Bookings" value={c.bookings} color="#F59E0B" small />
            <MetricBox label="Connect %" value={`${Math.round(c.connects / c.calls * 100)}%`} color="#8B5CF6" small />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScriptsTab({ data }) {
  const vs = data.voice_scripts;
  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Voice Agent Script Intelligence</h3>
          <div style={{ ...S.badge, background: '#8B5CF622', color: '#8B5CF6' }}>AI OPTIMIZATION</div>
        </div>
        <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16 }}>Neural analyzes call transcripts to find script weaknesses and recommend language that converts better.</p>

        <div style={{ background: '#0D1117', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Conversion Rate</div>
          <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: '#F59E0B' }}>{vs.current_conversion}%</div>
        </div>

        {vs.recommended_changes.map((c, i) => (
          <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 16, marginBottom: 10, borderLeft: '3px solid #8B5CF6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 1 }}>{c.element}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: '#22C55E22', color: '#22C55E' }}>{c.impact}</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Current</div>
              <div style={{ fontSize: 12, color: '#8B949E', fontStyle: 'italic', padding: '6px 10px', background: '#EF444411', borderRadius: 6 }}>{c.current}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#22C55E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Suggested</div>
              <div style={{ fontSize: 12, color: '#E6EDF3', fontStyle: 'italic', padding: '6px 10px', background: '#22C55E11', borderRadius: 6 }}>{c.suggested}</div>
            </div>
          </div>
        ))}
      </div>

      {/* A/B Tests */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Script A/B Testing</h3>
          <div style={{ ...S.badge }}>RESULTS</div>
        </div>
        {vs.ab_tests.map((t, i) => (
          <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3', marginBottom: 8 }}>{t.test}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ padding: '8px 10px', background: '#161B22', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>Variant A</div>
                <div style={{ fontSize: 12, color: t.winner === 'A' ? '#22C55E' : '#8B949E', marginTop: 2 }}>{t.variant_a}</div>
              </div>
              <div style={{ padding: '8px 10px', background: '#161B22', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>Variant B</div>
                <div style={{ fontSize: 12, color: t.winner === 'B' ? '#22C55E' : '#8B949E', marginTop: 2 }}>{t.variant_b}</div>
              </div>
              <div style={{ padding: '8px 10px', background: '#22C55E22', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#22C55E', textTransform: 'uppercase', letterSpacing: 1 }}>Winner</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E', marginTop: 2 }}>{t.winner} ({t.lift})</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpsTab({ data }) {
  const urgencyColor = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#22C55E' };
  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <h3 style={S.cardTitle}>Follow-Up Opportunity Detection</h3>
        <div style={{ ...S.badge, background: '#F59E0B22', color: '#F59E0B' }}>{data.follow_ups.length} OPPORTUNITIES</div>
      </div>
      <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16 }}>Automatically flags prospects needing outreach before becoming inactive or selecting competitors.</p>

      {data.follow_ups.map((f, i) => (
        <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 16, marginBottom: 10, borderLeft: `3px solid ${urgencyColor[f.urgency]}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>{f.contact}</span>
              <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${urgencyColor[f.urgency]}22`, color: urgencyColor[f.urgency] }}>{f.urgency}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>${f.potential.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 4 }}>{f.status}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#0EA5E9' }}>Action: {f.action}</div>
            <div style={{ fontSize: 11, color: '#8B949E' }}>{f.last_contact}</div>
          </div>
        </div>
      ))}

      <div style={{ background: '#F59E0B11', border: '1px solid #F59E0B44', borderRadius: 8, padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600, marginBottom: 4 }}>Total Pipeline at Risk</div>
        <div style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: '#F59E0B' }}>
          ${data.follow_ups.reduce((s, f) => s + f.potential, 0).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function SentimentTab({ data }) {
  const sent = data.sentiment;
  return (
    <div>
      {/* Overall Score */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Sentiment Analysis</h3>
          <div style={{ ...S.badge, background: '#8B5CF622', color: '#8B5CF6' }}>NEURAL AI</div>
        </div>
        <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16 }}>Tracks emotional tone across all conversations, identifying negative themes and positive response patterns.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', border: `4px solid ${sent.overall >= 70 ? '#22C55E' : '#F59E0B'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: '#E6EDF3' }}>{sent.overall}</div>
            <div style={{ fontSize: 10, color: '#8B949E' }}>/ 100</div>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: sent.overall >= 70 ? '#22C55E' : '#F59E0B', marginBottom: 4 }}>
              {sent.overall >= 80 ? 'Excellent' : sent.overall >= 70 ? 'Good' : sent.overall >= 50 ? 'Needs Improvement' : 'Critical'}
            </div>
            <div style={{ fontSize: 12, color: '#8B949E' }}>Trend: <span style={{ color: sent.trend.startsWith('+') ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{sent.trend} points</span> this month</div>
          </div>
        </div>

        {/* Breakdown Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ flex: sent.breakdown.positive, background: '#22C55E', padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{sent.breakdown.positive}%</div>
            <div style={{ fontSize: 9, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>Positive</div>
          </div>
          <div style={{ flex: sent.breakdown.neutral, background: '#F59E0B', padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{sent.breakdown.neutral}%</div>
            <div style={{ fontSize: 9, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>Neutral</div>
          </div>
          <div style={{ flex: sent.breakdown.negative, background: '#EF4444', padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{sent.breakdown.negative}%</div>
            <div style={{ fontSize: 9, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>Negative</div>
          </div>
        </div>

        {/* Theme Scores */}
        <h4 style={{ fontSize: 14, fontFamily: "'Bebas Neue',sans-serif", color: '#E6EDF3', letterSpacing: 1, marginBottom: 10 }}>THEME BREAKDOWN</h4>
        {sent.themes.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #21262D' }}>
            <div style={{ width: 150, fontSize: 13, color: '#E6EDF3' }}>{t.theme}</div>
            <div style={{ flex: 1 }}>
              <div style={{ width: '100%', height: 8, background: '#21262D', borderRadius: 4 }}>
                <div style={{ width: `${t.score}%`, height: '100%', background: t.score >= 70 ? '#22C55E' : t.score >= 50 ? '#F59E0B' : '#EF4444', borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
            </div>
            <div style={{ width: 40, fontSize: 13, fontWeight: 700, color: t.score >= 70 ? '#22C55E' : t.score >= 50 ? '#F59E0B' : '#EF4444', textAlign: 'right' }}>{t.score}</div>
            <div style={{ width: 30, fontSize: 11, color: t.trend.startsWith('+') ? '#22C55E' : '#EF4444', textAlign: 'right' }}>{t.trend}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueTab({ data }) {
  const rf = data.revenue_forecast;
  const difficultyColor = { Easy: '#22C55E', Medium: '#F59E0B', Hard: '#EF4444' };
  const totalRecovery = rf.actions.reduce((s, a) => s + a.impact, 0);

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}>
          <h3 style={S.cardTitle}>Revenue Opportunity Forecasting</h3>
          <div style={{ ...S.badge, background: '#22C55E22', color: '#22C55E' }}>FORECAST</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#0D1117', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Monthly</div>
            <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: '#0EA5E9' }}>${(rf.current_monthly / 1000).toFixed(0)}K</div>
          </div>
          <div style={{ background: '#0D1117', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Potential Recovery</div>
            <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: '#22C55E' }}>+${(rf.potential_recovery / 1000).toFixed(1)}K</div>
          </div>
          <div style={{ background: '#0D1117', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>If All Actions Taken</div>
            <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: '#F59E0B' }}>${((rf.current_monthly + totalRecovery) / 1000).toFixed(0)}K</div>
          </div>
        </div>

        <h4 style={{ fontSize: 14, fontFamily: "'Bebas Neue',sans-serif", color: '#E6EDF3', letterSpacing: 1, marginBottom: 10 }}>RECOMMENDED ACTIONS</h4>
        {rf.actions.map((a, i) => (
          <div key={i} style={{ background: '#0D1117', borderRadius: 8, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#E6EDF3', marginBottom: 4 }}>{a.action}</div>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${difficultyColor[a.difficulty]}22`, color: difficultyColor[a.difficulty] }}>{a.difficulty}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: '#22C55E' }}>+${(a.impact / 1000).toFixed(1)}K</div>
              <div style={{ fontSize: 10, color: '#8B949E' }}>per month</div>
            </div>
          </div>
        ))}

        <div style={{ background: '#22C55E11', border: '1px solid #22C55E44', borderRadius: 8, padding: 14, marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#22C55E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Recovery Potential</div>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: '#22C55E' }}>${(totalRecovery / 1000).toFixed(1)}K / month</div>
          <div style={{ fontSize: 12, color: '#8B949E', marginTop: 4 }}>${(totalRecovery * 12 / 1000).toFixed(0)}K annually</div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color, small }) {
  return (
    <div style={{ background: '#0D1117', borderRadius: 6, padding: small ? '8px 10px' : '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: small ? 16 : 20, fontWeight: 700, color, fontFamily: "'Bebas Neue',sans-serif", marginTop: 2 }}>{value}</div>
    </div>
  );
}

const S = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#8B5CF6', letterSpacing: 2, marginBottom: 4 },
  sub: { color: '#8B949E', fontSize: 14, marginBottom: 20 },
  tabBar: { display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', padding: '4px 0' },
  tab: { padding: '8px 16px', background: '#161B22', border: '1px solid #21262D', borderRadius: 8, color: '#8B949E', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' },
  tabActive: { background: '#8B5CF622', borderColor: '#8B5CF6', color: '#8B5CF6' },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 20 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#E6EDF3', letterSpacing: 1 },
  badge: { padding: '3px 10px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  kpiCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: '14px 16px', textAlign: 'center' },
  kpiLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiVal: { fontSize: 24, fontFamily: "'Bebas Neue',sans-serif", fontWeight: 700 },
  revBanner: { background: '#161B22', border: '1px solid #8B5CF644', borderRadius: 12, padding: 20 },
  listItem: { padding: '10px 0', borderBottom: '1px solid #21262D' },
};

import React, { useState, useEffect } from 'react';
import { sponsors } from '../../api';

export default function SponsorDashboard() {
  const [sponsor, setSponsor] = useState(null);
  const [impact, setImpact] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    sponsors.me().then(d => setSponsor(d.sponsor)).catch(e => setError(e.message));
    sponsors.myImpact().then(d => setImpact(d.impact)).catch(() => {});
    sponsors.myMetrics().then(d => setMetrics(d.metrics)).catch(() => {});
  }, []);

  if (error) return <div className="p-8 text-coral">{error}</div>;

  const tierColor = (t) => {
    const map = { founding:'text-gold', lead:'text-teal-neon', program:'text-blue-400', supporter:'text-white/60', in_kind:'text-coral' };
    return map[t] || 'text-white/50';
  };

  return (
    <div className="p-8">
      <div className="flex justify-center mb-8">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-32" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-8">Sponsor Dashboard</h1>

      {sponsor && (
        <>
          <div className="glass-card mb-8">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-2xl font-bold text-white">{sponsor.company_name}</div>
                <div className="text-white/40">{sponsor.contact_name} -- {sponsor.contact_title}</div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold uppercase tracking-wider ${tierColor(sponsor.tier)}`}>{sponsor.tier} Sponsor</div>
                <div className="text-teal-neon font-mono text-xl">${Number(sponsor.contribution_amount || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="stat-card"><div className="stat-value">{metrics.named_fellows}</div><div className="stat-label">Named Fellows</div></div>
              <div className="stat-card"><div className="stat-value">{metrics.opportunities_posted}</div><div className="stat-label">Opportunities Posted</div></div>
              <div className="stat-card"><div className="stat-value">{metrics.total_community_reach?.toLocaleString()}</div><div className="stat-label">Community Reach</div></div>
            </div>
          )}
        </>
      )}

      {/* Named Fellows */}
      {impact?.named_fellows && impact.named_fellows.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Your Named Fellows</h2>
          <div className="space-y-3">
            {impact.named_fellows.map(f => (
              <div key={f.id} className="glass-card flex justify-between items-center">
                <div>
                  <div className="font-semibold text-white">{f.member?.first_name} {f.member?.last_name}</div>
                  <div className="text-white/40 text-sm">{f.member?.country}</div>
                </div>
                <span className={`badge-pill ${f.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>{f.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {impact?.opportunities && impact.opportunities.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Your Posted Opportunities</h2>
          <div className="space-y-3">
            {impact.opportunities.map(o => (
              <div key={o.id} className="glass-card flex justify-between items-center">
                <div>
                  <div className="font-semibold text-white">{o.title}</div>
                  <div className="text-white/40 text-sm">{o.type} -- {o.location || 'Remote'}</div>
                </div>
                <span className={`badge-pill ${o.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ESG Attribution */}
      <div className="glass-card mt-8">
        <h3 className="text-lg font-bold text-white mb-3">ESG/CSR Attribution</h3>
        <div className="text-white/50 text-sm space-y-2">
          <div>UN SDG 4 -- Quality Education</div>
          <div>UN SDG 8 -- Decent Work and Economic Growth</div>
          <div>UN SDG 10 -- Reduced Inequalities</div>
        </div>
      </div>
    </div>
  );
}

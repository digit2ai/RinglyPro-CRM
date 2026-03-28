import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Billing() {
  const [claims, setClaims] = useState([]);
  const [cptCodes, setCptCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('claims'); // claims | dashboard

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [claimsData, dashboardData] = await Promise.all([
        api.get('/billing/claims?limit=100'),
        api.get('/billing/dashboard').catch(() => ({ data: {} }))
      ]);
      setClaims(claimsData.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getStatusColor = (status) => ({
    draft: 'bg-dark-700 text-dark-300',
    submitted: 'bg-blue-500/20 text-blue-400',
    accepted: 'bg-cyan-500/20 text-cyan-400',
    denied: 'bg-red-500/20 text-red-400',
    appealed: 'bg-yellow-500/20 text-yellow-400',
    paid: 'bg-green-500/20 text-green-400'
  }[status] || 'bg-dark-700 text-dark-400');

  if (loading) return <div className="text-center py-12 text-dark-400">Loading billing...</div>;

  const statusGroups = ['draft', 'submitted', 'accepted', 'denied', 'paid'];
  const grouped = statusGroups.reduce((acc, s) => {
    acc[s] = claims.filter(c => c.status === s);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Claims</h1>
          <p className="text-dark-400 text-sm mt-1">Manage insurance claims and revenue</p>
        </div>
        <div className="flex gap-2">
          {['claims', 'dashboard'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-msk-600/20 text-msk-400' : 'text-dark-400 hover:text-white'}`}>
              {t === 'claims' ? 'Claims' : 'Revenue'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'claims' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            {statusGroups.map(s => (
              <div key={s} className="card text-center py-3">
                <p className="text-2xl font-bold text-white">{grouped[s]?.length || 0}</p>
                <p className="text-dark-400 text-xs capitalize">{s}</p>
              </div>
            ))}
          </div>

          {/* Claims list */}
          {claims.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-4xl mb-4">💰</div>
              <p className="text-dark-400">No claims yet</p>
              <p className="text-dark-500 text-sm mt-1">Claims are generated from completed consultations</p>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map(c => (
                <div key={c.id} className="card hover:border-dark-500 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">{c.claim_number}</span>
                        <span className={`badge text-xs ${getStatusColor(c.status)}`}>{c.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 text-sm text-dark-400">
                        {c.payer_name && <span>Payer: {c.payer_name}</span>}
                        <span>Date: {new Date(c.created_at).toLocaleDateString()}</span>
                        {c.cpt_codes && <span>CPT: {(c.cpt_codes || []).map(x => x.code).join(', ')}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">${((c.billed_amount || 0) / 100).toFixed(2)}</p>
                      {c.paid_amount > 0 && <p className="text-green-400 text-xs">Paid: ${(c.paid_amount / 100).toFixed(2)}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-white font-semibold mb-4">Revenue Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-dark-400">Total Billed</span>
                <span className="text-white font-bold">${claims.reduce((s, c) => s + (c.billed_amount || 0), 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Total Collected</span>
                <span className="text-green-400 font-bold">${claims.reduce((s, c) => s + (c.paid_amount || 0), 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Outstanding</span>
                <span className="text-yellow-400 font-bold">${claims.filter(c => !['paid', 'denied'].includes(c.status)).reduce((s, c) => s + (c.billed_amount || 0), 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-white font-semibold mb-4">Denial Rate</h3>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-white">
                {claims.length > 0 ? ((claims.filter(c => c.status === 'denied').length / claims.length) * 100).toFixed(1) : '0'}%
              </p>
              <p className="text-dark-400 text-sm mt-1">
                {claims.filter(c => c.status === 'denied').length} denied of {claims.length} total
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

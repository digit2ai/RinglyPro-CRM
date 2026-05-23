import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Step 4 — Market Profile: competitive landscape, peer hospitals, market share

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '--'
  const v = Number(n)
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

export default function MarketProfilePage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [peers, setPeers] = useState([])
  const [bedDayCost, setBedDayCost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([api.getProject(id), api.getPeerHospitals(id).catch(() => ({ data: { peers: [], target_state_bed_day_cost: null } }))])
      .then(([projRes, peerRes]) => {
        setProject(projRes.project)
        setPeers(peerRes.data?.peers || [])
        setBedDayCost(peerRes.data?.target_state_bed_day_cost)
      }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading market profile...</div>

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 4 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Market Profile — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Competitive landscape · Peer hospitals · Market opportunity</p>
        </div>
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Clinical Outcomes →
        </button>
      </div>

      {/* Local market context */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">State</div>
          <div className="text-2xl font-bold text-white mt-1">{project?.state || '--'}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Bed-Day Cost (state-local)</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{bedDayCost ? '$' + fmt(bedDayCost) : '--'}</div>
          <div className="text-[10px] text-slate-500">kff.org non-profit avg</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hospital Type</div>
          <div className="text-xl font-bold text-white mt-1 capitalize">{project?.hospital_type || '--'}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Bed Tier</div>
          <div className="text-xl font-bold text-white mt-1">{parseInt(project?.bed_count) > 500 ? 'Large' : parseInt(project?.bed_count) > 250 ? 'Mid' : 'Small'}</div>
        </div>
      </div>

      {/* Peer hospital comparison */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
        <h3 className="font-bold text-white mb-1">Peer Hospital Comparison</h3>
        <p className="text-xs text-slate-500 mb-4">Comparable academic / community medical centers within ±30% bed count, same US Census region. Bed-day savings estimated from CMS Medicare Inpatient DRG volume × historical 30% robotic conversion × procedure-specific LOS deltas.</p>

        {peers.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No peer data available yet. Peer hospitals are sourced from the CMS IntuitiveHospital + DRG volume datasets.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Peer Hospital</th>
                <th className="text-left pb-2">State</th>
                <th className="text-right pb-2">Beds</th>
                <th className="text-right pb-2">Robotic Procs (est)</th>
                <th className="text-right pb-2">Bed Days Saved</th>
                <th className="text-right pb-2">$ Impact</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((p, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white font-semibold">{p.hospital_name}</td>
                  <td className="py-2 text-slate-400">{p.state}</td>
                  <td className="py-2 text-right text-slate-300">{fmt(p.beds)}</td>
                  <td className="py-2 text-right text-cyan-300">{fmt(p.robotic_procedures_estimated)}</td>
                  <td className="py-2 text-right text-emerald-300 font-semibold">{fmt(p.bed_days_saved_estimated)}</td>
                  <td className="py-2 text-right text-amber-300 font-semibold">{fmtMoneyShort(p.dollar_savings_estimated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/robotics-program/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Robotics Program</button>
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Clinical Outcomes →
        </button>
      </div>
    </div>
  )
}

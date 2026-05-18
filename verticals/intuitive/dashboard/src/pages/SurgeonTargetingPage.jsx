import React, { useState, useMemo, useEffect, useRef } from 'react'
import { api } from '../lib/api'

// AcuityMD-style territory intelligence — public CMS data only

const SPECIALTY_OPTIONS = [
  { key: 'all',        label: 'All Surgical Specialties' },
  { key: 'urology',    label: 'Urology' },
  { key: 'gynecology', label: 'OB / GYN' },
  { key: 'general',    label: 'General Surgery' },
  { key: 'thoracic',   label: 'Thoracic / Cardiothoracic' },
  { key: 'colorectal', label: 'Colon & Rectal' },
  { key: 'head_neck',  label: 'Head & Neck (ENT)' },
]

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR']

const fmtUSD = (n) => '$' + (Number(n) || 0).toLocaleString()
const fmtNum = (n) => (Number(n) || 0).toLocaleString()
const ago = (d) => {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days < 30) return days + 'd ago'
  if (days < 365) return Math.floor(days / 30) + 'mo ago'
  return Math.floor(days / 365) + 'y ago'
}

function KpiCard({ label, value, sublabel, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className={`text-2xl md:text-3xl font-black ${color}`}>{value}</div>
      <div className="text-[10px] md:text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">{label}</div>
      {sublabel && <div className="text-xs text-slate-500 mt-1">{sublabel}</div>}
    </div>
  )
}

function TierBadge({ tier, color }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: color + '22', color, border: `1px solid ${color}55` }}
    >
      {tier}
    </span>
  )
}

function ScoreBar({ score }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#0ea5e9' : score >= 25 ? '#eab308' : '#64748b'
  return (
    <div className="flex items-center gap-2">
      <div className="font-black text-base" style={{ color, minWidth: 28 }}>{score}</div>
      <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
        <div style={{ width: score + '%', background: color, height: '100%' }} />
      </div>
    </div>
  )
}

export default function SurgeonTargetingPage() {
  const [mode, setMode] = useState('territory') // 'territory' | 'hospital'
  const [state, setState] = useState('FL')
  const [zips, setZips] = useState('')
  const [specialty, setSpecialty] = useState('all')
  const [enrichKol, setEnrichKol] = useState(false)
  // Hospital-mode state
  const [hospitalQuery, setHospitalQuery] = useState('')
  const [hospitalSuggestions, setHospitalSuggestions] = useState([])
  const [selectedHospital, setSelectedHospital] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [sortBy, setSortBy] = useState('target_score')
  const [tierFilter, setTierFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Hospital autocomplete — fires when user types in hospital mode
  useEffect(() => {
    if (mode !== 'hospital' || hospitalQuery.length < 2) {
      setHospitalSuggestions([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.searchHospitalsForTargeting(hospitalQuery)
        setHospitalSuggestions(r.hospitals || [])
        setShowSuggestions(true)
      } catch (e) {
        setHospitalSuggestions([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [hospitalQuery, mode])

  useEffect(() => {
    function close(e) { if (suggestionRef.current && !suggestionRef.current.contains(e.target)) setShowSuggestions(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function runSearch() {
    setLoading(true)
    setError(null)
    try {
      let r
      if (mode === 'hospital') {
        if (!selectedHospital) {
          setError('Pick a hospital from the suggestions first.')
          setLoading(false)
          return
        }
        r = await api.surgeonsByHospital({
          hospital_ccn: selectedHospital.hospital_ccn,
          hospital_name: selectedHospital.hospital_name,
          specialty,
        })
      } else {
        const params = {
          state,
          zips: zips.split(/[\s,]+/).map(z => z.trim()).filter(Boolean),
          specialty,
          limit: 200,
          enrich: enrichKol,
          enrich_top: 25,
        }
        r = await api.searchSurgeonTargets(params)
        if (r.enriched_count > 0) setSortBy('composite_score')
      }
      setResult(r)
    } catch (e) {
      setError(e.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!result || !result.targets) return []
    let rows = [...result.targets]
    if (tierFilter !== 'all') {
      rows = rows.filter(r => r.tier.startsWith(tierFilter))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.npi || '').includes(q) ||
        (r.practice_address || '').toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
    return rows
  }, [result, sortBy, tierFilter, search])

  function exportCSV() {
    if (!filtered.length) return
    const headers = ['Rank', 'NPI', 'Name', 'Credential', 'Specialty', 'Target Score', 'Tier',
      'Hospital', 'Hospital CCN', 'Group Practice', 'Medical School', 'Grad Year',
      'Robotic Cases (CMS MPUP)', 'Volume Year', 'Intuitive $ 2yr', 'Last Payment', 'Champion Score',
      'Publications 5yr', 'Active Trials', 'Intuitive Trials', 'KOL Score', 'KOL Badge', 'Composite Score',
      'Identity Confidence', 'Practice Address']
    const rows = filtered.map((r, i) => [
      i + 1, r.npi, r.full_name, r.credential, r.specialty, r.target_score, r.tier,
      r.hospital_name || '', r.hospital_ccn || '', r.group_legal_name || '',
      r.medical_school || '', r.graduation_year || '',
      r.robotic_cases_last_yr, r.volume_year || '', r.intuitive_dollars_2yr,
      r.last_intuitive_payment || '', r.champion_score,
      r.publications_5yr ?? '', r.active_trials ?? '', r.intuitive_trials ?? '',
      r.kol_score ?? '', r.kol_badge || '', r.composite_score ?? r.target_score,
      r.identity_confidence ?? '', r.practice_address,
    ])
    const csv = [headers, ...rows].map(row =>
      row.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `surgeon-targets-${state}-${specialty}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white">Surgeon Targeting</h1>
        <p className="text-slate-400 text-sm mt-1">
          Territory intelligence on public CMS data — NPPES, MPUP, Open Payments, Care Compare affiliations.
          Search by territory (state + ZIPs) or directly by hospital. Optional KOL enrichment adds PubMed + ClinicalTrials.gov signals.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => { setMode('territory'); setResult(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${mode === 'territory' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >By Territory</button>
        <button
          onClick={() => { setMode('hospital'); setResult(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${mode === 'hospital' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >By Hospital</button>
        <span className="text-xs text-slate-500 ml-2">
          {mode === 'territory' ? 'NPPES roster → MPUP + Open Payments + Care Compare affiliation' : 'Care Compare → MPUP + Open Payments (sub-second indexed join)'}
        </span>
      </div>

      {/* Search controls */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5 mb-6">
        {mode === 'territory' ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">State</label>
              <select
                value={state} onChange={e => setState(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                ZIP codes <span className="text-slate-500 normal-case">(comma-separated, leave blank for state-wide)</span>
              </label>
              <input
                type="text" value={zips} onChange={e => setZips(e.target.value)}
                placeholder="33133, 33134, 33135"
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Specialty</label>
              <select
                value={specialty} onChange={e => setSpecialty(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                {SPECIALTY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <button
                onClick={runSearch} disabled={loading}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg transition"
              >
                {loading ? (enrichKol ? 'Searching CMS + KOL…' : 'Searching CMS…') : 'Find Surgeons'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-7 relative" ref={suggestionRef}>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Hospital</label>
              <input
                type="text" value={hospitalQuery}
                onChange={e => { setHospitalQuery(e.target.value); setSelectedHospital(null) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Start typing a hospital — e.g. Baptist, Mount Sinai, Cleveland Clinic"
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
              {showSuggestions && hospitalSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {hospitalSuggestions.map(h => (
                    <button
                      key={h.hospital_ccn || h.hospital_name}
                      onClick={() => {
                        setSelectedHospital(h)
                        setHospitalQuery(h.hospital_name)
                        setShowSuggestions(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm text-white border-b border-slate-700/50"
                    >
                      <div className="font-semibold">{h.hospital_name}</div>
                      <div className="text-xs text-slate-400">{h.hospital_state} · CCN {h.hospital_ccn} · {h.surgeon_count} surgeons</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Specialty</label>
              <select
                value={specialty} onChange={e => setSpecialty(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                {SPECIALTY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <button
                onClick={runSearch} disabled={loading || !selectedHospital}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg transition"
              >
                {loading ? 'Searching…' : 'Rank Surgeons'}
              </button>
            </div>
          </div>
        )}
        {mode === 'territory' && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox" checked={enrichKol} onChange={e => setEnrichKol(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
              />
              <span className="font-semibold">KOL enrichment</span>
              <span className="text-slate-500">— PubMed publications (5yr) + ClinicalTrials.gov active PI status for top 25. Adds ~15s.</span>
            </label>
          </div>
        )}
        {error && (
          <div className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <KpiCard label="Surgeons Found" value={fmtNum(result.total)} sublabel={result.elapsed_ms + 'ms'} />
            <KpiCard label="Tier A — Convert Now" value={result.summary?.tier_a || 0} color="text-emerald-400" />
            <KpiCard label="Tier B — Develop" value={result.summary?.tier_b || 0} color="text-sky-400" />
            <KpiCard label="Total Robotic Cases" value={fmtNum(result.summary?.total_robotic_cases)} sublabel="CMS MPUP, last year" />
            <KpiCard
              label="Intuitive $ Exposure"
              value={fmtUSD(Math.round((result.summary?.total_intuitive_dollars_2yr || 0) / 1000)) + 'K'}
              sublabel="Open Payments, 2yr"
              color="text-purple-400"
            />
            <KpiCard
              label="Affiliation Coverage"
              value={(result.summary?.affiliation_coverage_pct ?? 0) + '%'}
              sublabel={`${result.summary?.unique_hospitals || 0} unique hospitals`}
              color="text-teal-300"
            />
          </div>

          {/* KOL KPIs — only when enrichment ran */}
          {result.enriched_count > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard label="KOLs Identified" value={result.summary?.kol_count || 0} sublabel={`top ${result.enriched_count} enriched`} color="text-purple-300" />
              <KpiCard label="Publications (5yr)" value={fmtNum(result.summary?.total_publications_5yr)} sublabel="PubMed indexed" color="text-indigo-300" />
              <KpiCard label="Active Trials" value={fmtNum(result.summary?.total_active_trials)} sublabel="ClinicalTrials.gov PIs" color="text-fuchsia-300" />
              <KpiCard label="Enrichment Time" value={(result.enrichment_ms / 1000).toFixed(1) + 's'} sublabel="cached for 7 days" />
            </div>
          )}

          {/* Filter bar */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-semibold uppercase">Tier:</span>
              {['all', 'A', 'B', 'C', 'D'].map(t => (
                <button
                  key={t} onClick={() => setTierFilter(t)}
                  className={`px-3 py-1 rounded-md font-semibold ${tierFilter === t ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {t === 'all' ? 'All' : t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs ml-auto">
              <span className="text-slate-400 font-semibold uppercase">Sort:</span>
              <select
                value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white rounded-md px-2 py-1"
              >
                {result.enriched_count > 0 && <option value="composite_score">Composite (Target+KOL)</option>}
                <option value="target_score">Target Score</option>
                <option value="robotic_cases_last_yr">Robotic Volume</option>
                <option value="intuitive_dollars_2yr">Intuitive $ Exposure</option>
                <option value="champion_score">Champion Score</option>
                {result.enriched_count > 0 && <option value="kol_score">KOL Score</option>}
                {result.enriched_count > 0 && <option value="publications_5yr">Publications</option>}
                {result.enriched_count > 0 && <option value="active_trials">Active Trials</option>}
              </select>
            </div>
            <input
              type="text" placeholder="Search name, NPI, address…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1 text-xs w-56"
            />
            <button
              onClick={exportCSV}
              className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-white font-semibold"
            >
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-3 py-3 w-12">#</th>
                  <th className="px-3 py-3">Surgeon</th>
                  <th className="px-3 py-3">Hospital</th>
                  <th className="px-3 py-3">Specialty</th>
                  <th className="px-3 py-3 text-right">Robotic Cases</th>
                  <th className="px-3 py-3 text-right">Intuitive $ (2yr)</th>
                  <th className="px-3 py-3">Last Pmt</th>
                  {result.enriched_count > 0 && <th className="px-3 py-3 text-right">Pubs (5yr)</th>}
                  {result.enriched_count > 0 && <th className="px-3 py-3 text-right">Trials</th>}
                  <th className="px-3 py-3">Target</th>
                  {result.enriched_count > 0 && <th className="px-3 py-3">KOL</th>}
                  <th className="px-3 py-3">Tier</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.npi} className="border-t border-slate-700/50 hover:bg-slate-900/30">
                    <td className="px-3 py-3 text-slate-500 font-mono">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-white">{r.full_name} {r.credential && <span className="text-slate-500 font-normal">, {r.credential}</span>}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">NPI {r.npi}{r.medical_school ? ` · ${r.medical_school}${r.graduation_year ? ` '${String(r.graduation_year).slice(-2)}` : ''}` : ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      {r.hospital_name ? (
                        <div>
                          <div className="text-slate-200 text-xs font-semibold leading-tight">{r.hospital_name}</div>
                          {r.all_hospital_affiliations?.length > 1 && (
                            <div className="text-[10px] text-teal-400 mt-0.5">+{r.all_hospital_affiliations.length - 1} more</div>
                          )}
                          {r.group_legal_name && (
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]" title={r.group_legal_name}>{r.group_legal_name}</div>
                          )}
                        </div>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{r.specialty}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-white">{fmtNum(r.robotic_cases_last_yr)}</div>
                      {r.volume_year && <div className="text-[10px] text-slate-500">FY{r.volume_year}</div>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-purple-300">{fmtUSD(r.intuitive_dollars_2yr)}</div>
                      {r.payment_categories?.length > 0 && (
                        <div className="text-[10px] text-slate-500">{r.payment_categories.slice(0, 2).join(', ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{ago(r.last_intuitive_payment)}</td>
                    {result.enriched_count > 0 && (
                      <td className="px-3 py-3 text-right">
                        {r.publications_5yr != null ? (
                          <a href={r.pubmed_url} target="_blank" rel="noreferrer" className="font-bold text-indigo-300 hover:text-indigo-200">{fmtNum(r.publications_5yr)}</a>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                    )}
                    {result.enriched_count > 0 && (
                      <td className="px-3 py-3 text-right">
                        {r.active_trials != null ? (
                          <a href={r.clinicaltrials_url} target="_blank" rel="noreferrer" className="font-bold text-fuchsia-300 hover:text-fuchsia-200">
                            {fmtNum(r.active_trials)}
                            {r.intuitive_trials > 0 && <span className="ml-1 text-[10px] text-emerald-400" title="Intuitive-sponsored trial">★</span>}
                          </a>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-3"><ScoreBar score={r.target_score} /></td>
                    {result.enriched_count > 0 && (
                      <td className="px-3 py-3">
                        {r.kol_badge ? (
                          <TierBadge tier={r.kol_badge} color={r.kol_badge_color} />
                        ) : r.kol_score != null ? (
                          <span className="text-xs text-slate-500">{r.kol_score}</span>
                        ) : <span className="text-slate-700 text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-3"><TierBadge tier={r.tier} color={r.tier_color} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={result.enriched_count > 0 ? 12 : 9} className="px-3 py-10 text-center text-slate-500">No surgeons match current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Data sources footer */}
          <div className="mt-4 text-[11px] text-slate-500 flex flex-wrap gap-3">
            <span className="font-semibold uppercase tracking-wide">Data sources:</span>
            {result.data_sources?.map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="hover:text-sky-400 underline-offset-2 hover:underline">{s.name}</a>
            ))}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-xl p-10 text-center text-slate-400">
          <div className="text-sm">Enter a territory above and click <span className="text-sky-400 font-semibold">Find Surgeons</span> to rank prospects.</div>
          <div className="text-xs mt-2 text-slate-500">
            Target score = Medicare volume (50pts) + Intuitive $ exposure (35pts) + recency (15pts).
            <br />KOL score (if enrichment on) = publications 5yr (50pts) + active trials (35pts) + Intuitive-sponsored trial (15pts).
          </div>
        </div>
      )}
    </div>
  )
}

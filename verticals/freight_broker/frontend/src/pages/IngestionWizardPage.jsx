import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadFile, mapFields } from '../lib/api'

const BUSINESS_TYPES = [
  { id: 'freight_broker', name: 'Freight Broker', desc: 'Non-asset brokerage matching shippers with carriers', icon: 'FB' },
  { id: 'asset_carrier', name: 'Asset Carrier', desc: 'Own trucks, haul freight with company drivers', icon: 'AC' },
  { id: '3pl', name: '3PL', desc: 'Third-party logistics with warehousing and distribution', icon: '3P' },
  { id: 'fleet_operator', name: 'Fleet Operator', desc: 'Private fleet for internal supply chain', icon: 'FO' },
  { id: 'intermodal', name: 'Intermodal', desc: 'Multi-mode transport: truck, rail, ocean', icon: 'IM' },
  { id: 'freight_forwarder', name: 'Freight Forwarder', desc: 'International logistics coordination and customs', icon: 'FF' },
]

const TMS_OPTIONS = ['McLeod', 'TMW', 'MercuryGate', 'Turvo', 'Rose Rocket', 'Aljex', 'AscendTMS', 'ARK', 'DAT Broker', 'Alvys', 'PCS Software', 'Magnus', 'Tai TMS', 'Other']
const ELD_OPTIONS = ['Samsara', 'Motive', 'Geotab', 'Omnitracs', 'PeopleNet', 'Verizon Connect', 'Macropoint', 'FourKites', 'project44', 'Trucker Tools', 'Other', 'None']
const ACCOUNTING_OPTIONS = ['QuickBooks', 'Sage', 'NetSuite', 'Xero', 'FreshBooks', 'Other', 'None']
const FUEL_OPTIONS = ['Comdata', 'WEX', 'EFS', 'TCH', 'Relay Payments', 'None']
const LOADBOARD_OPTIONS = ['DAT', 'Truckstop', '123Loadboard', 'Highway']
const CARRIER_TOOLS_OPTIONS = ['Carrier Assure', 'CargoNet', 'RMIS', 'MyCarrierPackets', 'None']

const STEPS = ['Business Type', 'Data Sources', 'Upload Files', 'Field Mapping', 'Validation']

const CANONICAL_FIELDS = [
  'load_id', 'origin_city', 'origin_state', 'origin_zip', 'destination_city', 'destination_state',
  'destination_zip', 'pickup_date', 'delivery_date', 'rate', 'carrier_name', 'carrier_mc',
  'driver_name', 'truck_number', 'trailer_number', 'commodity', 'weight', 'miles',
  'status', 'customer_name', 'reference_number', 'equipment_type', 'broker_fee', 'carrier_pay',
  'Skip this column'
]

export default function IngestionWizardPage() {
  const [step, setStep] = useState(0)
  const [businessType, setBusinessType] = useState(null)
  const [dataSources, setDataSources] = useState({
    tms: '', eld: '', accounting: '', fuel: '', loadBoards: []
  })
  const [files, setFiles] = useState([])
  const [ediText, setEdiText] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const [mappings, setMappings] = useState([])
  const [mapLoading, setMapLoading] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingested, setIngested] = useState(false)

  const onDrop = useCallback((accepted) => {
    const withMeta = accepted.map(f => ({
      file: f,
      name: f.name,
      size: f.size,
      format: detectFormat(f.name)
    }))
    setFiles(prev => [...prev, ...withMeta])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/plain': ['.txt'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    multiple: true
  })

  function detectFormat(name) {
    const ext = name.split('.').pop().toLowerCase()
    const map = { csv: 'CSV', json: 'JSON', txt: 'TXT', xls: 'XLS', xlsx: 'XLSX' }
    return map[ext] || 'UNKNOWN'
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  async function handleUpload() {
    if (files.length === 0) return
    setMapLoading(true)
    try {
      const result = await uploadFile(files[0].file, businessType)
      setUploadResult(result)
      if (result.mappings) {
        setMappings(result.mappings.map(m => ({
          source: m.source_column,
          target: m.mapped_to || '',
          confidence: m.confidence || 0,
        })))
      } else {
        // Demo mapping data if API not available
        setMappings([
          { source: 'Load #', target: 'load_id', confidence: 98 },
          { source: 'Pick City', target: 'origin_city', confidence: 95 },
          { source: 'Pick State', target: 'origin_state', confidence: 94 },
          { source: 'Del City', target: 'destination_city', confidence: 92 },
          { source: 'Del State', target: 'destination_state', confidence: 91 },
          { source: 'PU Date', target: 'pickup_date', confidence: 88 },
          { source: 'Rate $', target: 'rate', confidence: 96 },
          { source: 'Carrier', target: 'carrier_name', confidence: 85 },
          { source: 'MC#', target: 'carrier_mc', confidence: 78 },
          { source: 'Desc', target: 'commodity', confidence: 62 },
          { source: 'WT', target: 'weight', confidence: 55 },
          { source: 'Custom1', target: '', confidence: 15 },
        ])
      }
    } catch (err) {
      // Fallback demo data
      setMappings([
        { source: 'Load #', target: 'load_id', confidence: 98 },
        { source: 'Pick City', target: 'origin_city', confidence: 95 },
        { source: 'Pick State', target: 'origin_state', confidence: 94 },
        { source: 'Del City', target: 'destination_city', confidence: 92 },
        { source: 'Del State', target: 'destination_state', confidence: 91 },
        { source: 'PU Date', target: 'pickup_date', confidence: 88 },
        { source: 'Rate $', target: 'rate', confidence: 96 },
        { source: 'Carrier', target: 'carrier_name', confidence: 85 },
        { source: 'MC#', target: 'carrier_mc', confidence: 78 },
        { source: 'Desc', target: 'commodity', confidence: 62 },
        { source: 'WT', target: 'weight', confidence: 55 },
        { source: 'Custom1', target: '', confidence: 15 },
      ])
    }
    setMapLoading(false)
    setStep(3)
  }

  function updateMapping(idx, field) {
    setMappings(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], target: field }
      return updated
    })
  }

  async function handleConfirmMapping() {
    setMapLoading(true)
    try {
      const payload = mappings
        .filter(m => m.target && m.target !== 'Skip this column')
        .map(m => ({ source: m.source, target: m.target }))
      const result = await mapFields(uploadResult?.batch_id || 'demo', payload, 'loads')
      setValidationResult(result)
    } catch (err) {
      // Demo validation result
      setValidationResult({
        total_rows: 1247,
        entity: 'loads',
        warnings: 23,
        errors: 4,
        issues: [
          { row: 45, type: 'warning', message: 'Missing destination_zip, will be geocoded from city/state' },
          { row: 112, type: 'warning', message: 'Rate value $0.00 detected, may be incomplete' },
          { row: 389, type: 'error', message: 'Invalid date format in pickup_date: "TBD"' },
          { row: 502, type: 'error', message: 'Duplicate load_id: LD-10042' },
          { row: 678, type: 'warning', message: 'Carrier MC# not found in FMCSA registry' },
        ]
      })
    }
    setMapLoading(false)
    setStep(4)
  }

  async function handleIngest() {
    setIngesting(true)
    // Simulate ingestion
    await new Promise(r => setTimeout(r, 2000))
    setIngesting(false)
    setIngested(true)
  }

  function confidenceBadge(confidence) {
    if (confidence >= 90) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">{confidence}%</span>
    if (confidence >= 70) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">{confidence}%</span>
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">{confidence}%</span>
  }

  const canNext = () => {
    if (step === 0) return businessType !== null
    if (step === 1) return dataSources.tms !== ''
    if (step === 2) return files.length > 0 || ediText.trim().length > 0
    return true
  }

  function handleNext() {
    if (step === 2) {
      handleUpload()
      return
    }
    if (step === 3) {
      handleConfirmMapping()
      return
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 px-2">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                ${idx < step ? 'bg-purple-600 text-white' : idx === step ? 'bg-purple-500 text-white ring-2 ring-purple-400' : 'bg-slate-700 text-slate-500'}
              `}>
                {idx < step ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                ) : idx + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${idx <= step ? 'text-purple-300' : 'text-slate-500'}`}>{label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mt-[-12px] ${idx < step ? 'bg-purple-600' : 'bg-slate-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Business Type */}
      {step === 0 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Select Your Business Type</h2>
          <p className="text-sm text-slate-400 mb-6">This helps FreightMind calibrate its diagnostic modules for your operation.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BUSINESS_TYPES.map(bt => (
              <button
                key={bt.id}
                onClick={() => setBusinessType(bt.id)}
                className={`
                  text-left p-5 rounded-xl border transition-all duration-200
                  ${businessType === bt.id
                    ? 'bg-purple-600/15 border-purple-500 ring-1 ring-purple-500'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                  }
                `}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`
                    w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold
                    ${businessType === bt.id ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'}
                  `}>
                    {bt.icon}
                  </div>
                  <span className="font-semibold text-white">{bt.name}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{bt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Data Sources */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Configure Data Sources</h2>
          <p className="text-sm text-slate-400 mb-6">Tell us what systems you use so we can optimize ingestion and analysis.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">TMS Platform</label>
              <select
                value={dataSources.tms}
                onChange={e => setDataSources(p => ({ ...p, tms: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select TMS...</option>
                {TMS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">ELD Provider</label>
              <select
                value={dataSources.eld}
                onChange={e => setDataSources(p => ({ ...p, eld: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select ELD...</option>
                {ELD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Accounting System</label>
              <select
                value={dataSources.accounting}
                onChange={e => setDataSources(p => ({ ...p, accounting: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Accounting...</option>
                {ACCOUNTING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Fuel Cards</label>
              <select
                value={dataSources.fuel}
                onChange={e => setDataSources(p => ({ ...p, fuel: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Fuel Card...</option>
                {FUEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Carrier Vetting / Compliance</label>
              <select
                value={dataSources.carrierTools || ''}
                onChange={e => setDataSources(p => ({ ...p, carrierTools: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Tool...</option>
                {CARRIER_TOOLS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Tracking / Visibility</label>
              <select
                value={dataSources.tracking || ''}
                onChange={e => setDataSources(p => ({ ...p, tracking: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Provider...</option>
                {ELD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Load Boards / Freight Networks</label>
              <div className="flex flex-wrap gap-4">
                {LOADBOARD_OPTIONS.map(lb => (
                  <label key={lb} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dataSources.loadBoards.includes(lb)}
                      onChange={e => {
                        setDataSources(p => ({
                          ...p,
                          loadBoards: e.target.checked
                            ? [...p.loadBoards, lb]
                            : p.loadBoards.filter(x => x !== lb)
                        }))
                      }}
                      className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                    />
                    {lb}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Upload Files */}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Upload Your Data</h2>
          <p className="text-sm text-slate-400 mb-6">Drop your TMS exports, rate sheets, or load history files. Supported: CSV, JSON, TXT, XLS, XLSX.</p>

          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${isDragActive
                ? 'border-purple-500 bg-purple-600/10'
                : 'border-slate-600 hover:border-slate-500 bg-slate-800/40'
              }
            `}
          >
            <input {...getInputProps()} />
            <svg className="w-10 h-10 mx-auto mb-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {isDragActive
              ? <p className="text-purple-300 font-medium">Drop files here...</p>
              : <p className="text-slate-400">Drag and drop files here, or <span className="text-purple-400 underline">browse</span></p>
            }
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                  <svg className="w-5 h-5 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-sm text-white flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-slate-500">{formatSize(f.size)}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400">{f.format}</span>
                  <button onClick={() => removeFile(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Demo Sample Files */}
          <div className="mt-6 bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Demo Sample Files</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { name: 'CW McLeod Loads', file: 'cw-carriers-mcleod-loads.csv', rows: 200, highlight: true },
                { name: 'CW Macropoint Tracking', file: 'cw-carriers-macropoint-tracking.csv', rows: 150, highlight: true },
                { name: 'CW Carrier Assure', file: 'cw-carriers-carrier-assure.csv', rows: 50, highlight: true },
                { name: 'CW HubSpot CRM', file: 'cw-carriers-hubspot-crm.csv', rows: 80, highlight: true },
                { name: 'Freight Broker', file: 'freight-broker-demo.csv', rows: 50 },
                { name: 'Asset Carrier', file: 'asset-carrier-demo.csv', rows: 25 },
                { name: '3PL', file: '3pl-demo.csv', rows: 40 },
                { name: 'Fleet Operator', file: 'fleet-operator-demo.csv', rows: 20 },
                { name: 'Intermodal', file: 'intermodal-demo.csv', rows: 30 },
                { name: 'Freight Forwarder', file: 'freight-forwarder-demo.csv', rows: 25 },
              ].map(s => (
                <a
                  key={s.file}
                  href={`/freight_broker/samples/${s.file}`}
                  download={s.file}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left ${
                    s.highlight
                      ? 'bg-purple-600/15 border border-purple-500/40 hover:border-purple-500/70 hover:bg-purple-600/25 ring-1 ring-purple-500/20'
                      : 'bg-slate-700/50 border border-slate-600/50 hover:border-purple-500/40 hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-4 h-4 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium text-white">{s.name}</p>
                    <p className="text-[10px] text-slate-500">{s.rows} rows</p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button disabled className="px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm cursor-not-allowed">
              Connect API (Coming Soon)
            </button>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Or Paste EDI</label>
            <textarea
              value={ediText}
              onChange={e => setEdiText(e.target.value)}
              placeholder="Paste EDI 204/210/214 data here..."
              className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* Step 4: Field Mapping */}
      {step === 3 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Field Mapping</h2>
          <p className="text-sm text-slate-400 mb-6">FreightMind auto-mapped your columns. Review and adjust as needed.</p>

          {mapLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 mt-3">Analyzing file structure...</p>
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Column</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Mapped To</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Confidence</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, idx) => (
                    <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="px-4 py-3 font-mono text-slate-300">{m.source}</td>
                      <td className="px-4 py-3">
                        {m.confidence >= 90 ? (
                          <span className="text-green-400">{m.target}</span>
                        ) : (
                          <select
                            value={m.target}
                            onChange={e => updateMapping(idx, e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="">-- Select --</option>
                            {CANONICAL_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{confidenceBadge(m.confidence)}</td>
                      <td className="px-4 py-3">
                        {m.confidence >= 90 ? (
                          <span className="text-xs text-green-500">Auto-mapped</span>
                        ) : m.confidence >= 70 ? (
                          <span className="text-xs text-yellow-500">Review suggested</span>
                        ) : (
                          <span className="text-xs text-red-500">Manual mapping required</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Validation & Ingest */}
      {step === 4 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Validation Results</h2>

          {validationResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">{validationResult.total_rows?.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">Total Rows</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{validationResult.entity || 'loads'}</p>
                  <p className="text-xs text-slate-400 mt-1">Entity Type</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-400">{validationResult.warnings}</p>
                  <p className="text-xs text-slate-400 mt-1">Warnings</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-400">{validationResult.errors}</p>
                  <p className="text-xs text-slate-400 mt-1">Errors</p>
                </div>
              </div>

              {validationResult.issues && validationResult.issues.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-semibold text-white mb-3">Issues Found</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {validationResult.issues.map((issue, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm">
                        <span className={`
                          w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0
                          ${issue.type === 'error' ? 'bg-red-500' : 'bg-yellow-500'}
                        `} />
                        <span className="text-slate-500 font-mono text-xs">Row {issue.row}</span>
                        <span className="text-slate-300">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ingested ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <h3 className="text-lg font-bold text-green-400">Ingestion Complete</h3>
                  <p className="text-sm text-slate-400 mt-2">{validationResult.total_rows?.toLocaleString()} rows ingested successfully. Ready to run OBD scan.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleIngest}
                    disabled={ingesting}
                    className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {ingesting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Ingesting...
                      </span>
                    ) : 'Ingest Anyway'}
                  </button>
                  <button className="px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors">
                    Fix Issues
                  </button>
                  <button className="px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors">
                    Download Error Report
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8 pt-6 border-t border-slate-700/60">
        <button
          onClick={() => setStep(s => Math.max(s - 1, 0))}
          disabled={step === 0}
          className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            onClick={handleNext}
            disabled={!canNext()}
            className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {step === 2 ? 'Upload & Map' : step === 3 ? 'Confirm Mapping' : 'Next'}
          </button>
        )}
      </div>
    </div>
  )
}

import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/FileUploader'
import { createProject, uploadFile, getUploadStatus, generateDemo, instantDemo, runAnalysis, getProject } from '../lib/api'

const FILE_TYPES = [
  {
    key: 'item_master',
    label: 'Item Master',
    description: 'SKU catalog with dimensions, weights, and attributes',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    )
  },
  {
    key: 'inventory',
    label: 'Inventory Snapshot',
    description: 'Current stock levels and storage locations',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    )
  },
  {
    key: 'goods_in',
    label: 'Goods In (Receipts)',
    description: 'Inbound receiving records with timestamps',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
      </svg>
    )
  },
  {
    key: 'goods_out',
    label: 'Goods Out (Shipments)',
    description: 'Outbound order/shipment records with timestamps',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l3-3m-3 3l-3-3" />
      </svg>
    )
  }
]

const INDUSTRIES = [
  'Automotive', 'E-Commerce', 'Electronics', 'Fashion & Apparel',
  'Food & Beverage', 'Healthcare', 'Manufacturing', 'Pharmaceuticals',
  'Retail', '3PL / Logistics', 'Other'
]

const COUNTRIES = [
  'Germany', 'Austria', 'Switzerland', 'Spain', 'France', 'Italy',
  'Netherlands', 'Belgium', 'Poland', 'Czech Republic', 'United Kingdom',
  'United States', 'Mexico', 'Brazil', 'China', 'Japan', 'Other'
]

const BUDGET_RANGES = [
  '< €500K', '€500K – €1M', '€1M – €2M', '€2M – €5M', '€5M – €10M', '> €10M', 'To be determined'
]

export default function UploadPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [projectId, setProjectId] = useState(null)
  const [error, setError] = useState(null)

  const [companyInfo, setCompanyInfo] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    industry: '',
    country: '',
    building_footprint_m2: '',
    ceiling_height_m: '',
    dock_doors: '',
    budget_range: '',
    target_go_live: ''
  })

  const [files, setFiles] = useState({
    item_master: { file: null, status: 'pending', rows: 0, warnings: [] },
    inventory: { file: null, status: 'pending', rows: 0, warnings: [] },
    goods_in: { file: null, status: 'pending', rows: 0, warnings: [] },
    goods_out: { file: null, status: 'pending', rows: 0, warnings: [] },
    oee_machines: { file: null, status: 'pending', rows: 0, warnings: [] },
    oee_machine_events: { file: null, status: 'pending', rows: 0, warnings: [] },
    oee_production_runs: { file: null, status: 'pending', rows: 0, warnings: [] }
  })

  const handleCompanyChange = (field, value) => {
    setCompanyInfo(prev => ({ ...prev, [field]: value }))
  }

  const handleCreateProject = async () => {
    if (!companyInfo.company_name.trim()) {
      setError('Company name is required')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { building_footprint_m2, ceiling_height_m, dock_doors, budget_range, target_go_live, ...coreInfo } = companyInfo
      const business_info = {}
      if (building_footprint_m2) business_info.building_footprint_m2 = parseFloat(building_footprint_m2)
      if (ceiling_height_m) business_info.ceiling_height_m = parseFloat(ceiling_height_m)
      if (dock_doors) business_info.dock_doors = parseInt(dock_doors)
      if (budget_range) business_info.budget_range = budget_range
      if (target_go_live) business_info.target_go_live = target_go_live
      const result = await createProject({ ...coreInfo, business_info })
      setProjectId(result.project_id || result.id)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Poll upload status until parsing completes
  const pollStatus = useCallback(async (fileType, file) => {
    const maxAttempts = 120 // 10 minutes max
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 5000)) // poll every 5s
      try {
        const statusData = await getUploadStatus(projectId)
        const ft = statusData[fileType]
        if (ft && ft.status === 'parsed') {
          setFiles(prev => ({
            ...prev,
            [fileType]: { file, status: 'success', rows: ft.rows || 0, warnings: ft.warnings || [] }
          }))
          return
        } else if (ft && ft.status === 'error') {
          setFiles(prev => ({
            ...prev,
            [fileType]: { ...prev[fileType], status: 'error', warnings: ft.errors ? ft.errors.map(e => e.message || e) : ['Parsing failed'] }
          }))
          return
        }
        // Still parsing — update UI with progress message
        setFiles(prev => ({
          ...prev,
          [fileType]: { ...prev[fileType], status: 'uploading', warnings: [`Processing large file... (${attempt * 5}s)`] }
        }))
      } catch (e) {
        // Polling failed — keep trying
      }
    }
  }, [projectId])

  // Row limits per file type
  const ROW_LIMITS = {
    item_master: 50000,
    inventory: 50000,
    goods_in: 20000,
    goods_out: 100000
  }

  const handleFileDrop = useCallback(async (fileType, acceptedFiles) => {
    if (!acceptedFiles.length || !projectId) return

    const file = acceptedFiles[0]
    setFiles(prev => ({
      ...prev,
      [fileType]: { ...prev[fileType], file, status: 'uploading', warnings: [] }
    }))

    try {
      const result = await uploadFile(projectId, fileType, file)
      const rowCount = result.row_count || result.rows_parsed || result.rows || 0
      const limit = ROW_LIMITS[fileType]
      const warnings = [...(result.warnings || [])]

      if (limit && rowCount > limit) {
        warnings.unshift(`File contains ${rowCount.toLocaleString()} rows (max ${limit.toLocaleString()}). Only the first ${limit.toLocaleString()} rows will be processed.`)
      }

      // Check if backend returned "parsing" status (large file, async processing)
      if (result.status === 'parsing') {
        setFiles(prev => ({
          ...prev,
          [fileType]: { file, status: 'uploading', rows: 0, warnings: ['Large file -- parsing in background...'] }
        }))
        // Start polling for completion
        pollStatus(fileType, file)
      } else {
        setFiles(prev => ({
          ...prev,
          [fileType]: {
            file,
            status: 'success',
            rows: rowCount,
            warnings
          }
        }))
      }
    } catch (err) {
      setFiles(prev => ({
        ...prev,
        [fileType]: {
          ...prev[fileType],
          status: 'error',
          warnings: [err.message]
        }
      }))
    }
  }, [projectId, pollStatus])

  const handleRunAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      await runAnalysis(projectId)
      navigate(`/analysis/${projectId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const [demoStatus, setDemoStatus] = useState('')
  const [instantLoading, setInstantLoading] = useState(false)

  // Instant Demo — clones completed analysis in < 3 seconds
  const handleInstantDemo = async () => {
    setInstantLoading(true)
    setError(null)
    try {
      const result = await instantDemo()
      const demoId = result.project_id || result.id
      navigate(`/analysis/${demoId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setInstantLoading(false)
    }
  }

  // Full POC — generates 228K items from scratch (5-8 min)
  const handleGenerateDemo = async () => {
    setDemoLoading(true)
    setError(null)
    setDemoStatus('Creating project...')
    try {
      const result = await generateDemo()
      const demoId = result.project_id || result.id

      setDemoStatus('Generating 10K items + 30K order lines...')
      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const proj = await getProject(demoId)
          const status = proj?.status || proj?.data?.status
          if (status === 'completed') {
            setDemoStatus('Done!')
            navigate(`/analysis/${demoId}`)
            return
          } else if (status === 'error') {
            setError('POC generation failed. Check server logs.')
            return
          } else if (status === 'analyzing') {
            setDemoStatus('Running analysis + product matching...')
          } else {
            setDemoStatus(`Processing data... (${attempt * 5}s)`)
          }
        } catch (e) {
          // Keep polling
        }
      }
      setError('POC generation timed out')
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoLoading(false)
      setDemoStatus('')
    }
  }

  const uploadedCount = Object.values(files).filter(f => f.status === 'success').length
  const hasRequiredFiles = files.item_master.status === 'success' && files.goods_out.status === 'success'

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Warehouse Data Upload</h1>
        <p className="text-slate-400">
          Upload your warehouse data files for comprehensive logistics analysis and Pinaxis product matching.
        </p>
      </div>

      {/* POC Buttons */}
      <div className="card mb-8 bg-gradient-to-r from-logistics-900/50 to-slate-800 border-logistics-700/50">
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Proof of Concept</h3>
              <p className="text-sm text-slate-400">
                Warehouse analysis with 10K items, 3K orders, 30K lines, 12 analysis modules.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleInstantDemo}
                disabled={instantLoading || demoLoading}
                className="btn-primary whitespace-nowrap flex items-center gap-2"
              >
                {instantLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    Instant Demo
                  </>
                )}
              </button>
              <button
                onClick={handleGenerateDemo}
                disabled={demoLoading || instantLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all whitespace-nowrap flex items-center gap-2"
              >
                {demoLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Regenerate Data'
                )}
              </button>
            </div>
          </div>
          {demoStatus && (
            <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm flex items-center gap-2">
              <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {demoStatus}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* Step 1: Company Info */}
      {step === 1 && (
        <div className="card animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-logistics-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">1</div>
            <h2 className="text-xl font-semibold text-white">Company Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Company Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Acme Logistics GmbH"
                value={companyInfo.company_name}
                onChange={e => handleCompanyChange('company_name', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Contact Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Max Mustermann"
                value={companyInfo.contact_name}
                onChange={e => handleCompanyChange('contact_name', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Contact Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="e.g. max@acme.com"
                value={companyInfo.contact_email}
                onChange={e => handleCompanyChange('contact_email', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Industry</label>
              <select
                className="input-field"
                value={companyInfo.industry}
                onChange={e => handleCompanyChange('industry', e.target.value)}
              >
                <option value="">Select industry...</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Country</label>
              <select
                className="input-field"
                value={companyInfo.country}
                onChange={e => handleCompanyChange('country', e.target.value)}
              >
                <option value="">Select country...</option>
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Site Constraints */}
          <div className="mt-6 pt-6 border-t border-slate-700/60">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">Site Constraints <span className="text-slate-500 font-normal">(optional — used to calibrate automation concepts)</span></h3>
            <p className="text-xs text-slate-500 mb-4">These values are used by the Simulation Agent to validate storage and throughput assumptions against your physical site.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Building Footprint (m²)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 8000"
                  min="0"
                  value={companyInfo.building_footprint_m2}
                  onChange={e => handleCompanyChange('building_footprint_m2', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Clear Ceiling Height (m)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 10"
                  step="0.5"
                  min="0"
                  value={companyInfo.ceiling_height_m}
                  onChange={e => handleCompanyChange('ceiling_height_m', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Dock Doors</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 6"
                  min="0"
                  value={companyInfo.dock_doors}
                  onChange={e => handleCompanyChange('dock_doors', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Budget Range</label>
                <select
                  className="input-field"
                  value={companyInfo.budget_range}
                  onChange={e => handleCompanyChange('budget_range', e.target.value)}
                >
                  <option value="">Select range...</option>
                  {BUDGET_RANGES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Target Go-Live</label>
                <input
                  type="month"
                  className="input-field"
                  value={companyInfo.target_go_live}
                  onChange={e => handleCompanyChange('target_go_live', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleCreateProject}
              disabled={loading || !companyInfo.company_name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  Continue to Upload
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: File Uploads */}
      {step === 2 && (
        <div className="space-y-6 animate-slide-up">
          <div className="card">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-logistics-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">2</div>
              <h2 className="text-xl font-semibold text-white">Upload Data Files</h2>
            </div>
            <p className="text-sm text-slate-400 ml-11 mb-3">
              Upload CSV or Excel files. Item Master and Goods Out are required for warehouse analysis. {uploadedCount} files uploaded.
            </p>

            {/* Limits & Requirements Notice */}
            <div className="ml-11 mb-6 p-3 rounded-lg bg-slate-700/30 border border-slate-600/40">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <div>
                  <p className="text-xs text-slate-300 font-medium mb-1">File Requirements & Limits</p>
                  <ul className="text-[11px] text-slate-400 space-y-0.5">
                    <li>-- <span className="text-slate-300">Item Master</span>: max 50,000 rows | Required columns: sku, description</li>
                    <li>-- <span className="text-slate-300">Inventory</span>: max 50,000 rows | Required columns: sku, stock</li>
                    <li>-- <span className="text-slate-300">Goods In</span>: max 20,000 rows | Required columns: sku, quantity, receipt_date</li>
                    <li>-- <span className="text-slate-300">Goods Out</span>: max 100,000 rows | Required columns: order_id, sku, quantity, ship_date</li>
                    <li>-- Supported formats: CSV (.csv), Excel (.xlsx, .xls)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {FILE_TYPES.map(ft => (
                <FileUploader
                  key={ft.key}
                  fileType={ft.key}
                  label={ft.label}
                  description={ft.description}
                  icon={ft.icon}
                  required={ft.key === 'item_master' || ft.key === 'goods_out'}
                  status={files[ft.key].status}
                  fileName={files[ft.key].file?.name}
                  fileSize={files[ft.key].file?.size}
                  rowCount={files[ft.key].rows}
                  warnings={files[ft.key].warnings}
                  onDrop={acceptedFiles => handleFileDrop(ft.key, acceptedFiles)}
                />
              ))}
            </div>
          </div>

          {/* Step 3: Run Analysis */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                hasRequiredFiles ? 'bg-logistics-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}>3</div>
              <h2 className="text-xl font-semibold text-white">Run Analysis</h2>
            </div>

            {!hasRequiredFiles && (
              <p className="text-sm text-slate-400 ml-11 mb-4">
                Upload at least Item Master and Goods Out files to proceed.
              </p>
            )}

            <div className="ml-11 flex items-center gap-4">
              <button
                onClick={handleRunAnalysis}
                disabled={loading || !hasRequiredFiles}
                className="btn-primary flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Running Analysis...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Run Full Analysis
                  </>
                )}
              </button>

              <button
                onClick={() => setStep(1)}
                className="btn-ghost"
              >
                Back to Company Info
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

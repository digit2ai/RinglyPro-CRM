import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/FileUploader'
import { createProject, uploadFile, getUploadStatus, generateDemo, runAnalysis } from '../lib/api'

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
    industry: '',
    country: ''
  })

  const [files, setFiles] = useState({
    item_master: { file: null, status: 'pending', rows: 0, warnings: [] },
    inventory: { file: null, status: 'pending', rows: 0, warnings: [] },
    goods_in: { file: null, status: 'pending', rows: 0, warnings: [] },
    goods_out: { file: null, status: 'pending', rows: 0, warnings: [] }
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
      const result = await createProject(companyInfo)
      setProjectId(result.project_id || result.id)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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
      setFiles(prev => ({
        ...prev,
        [fileType]: {
          file,
          status: 'success',
          rows: result.row_count || result.rows || 0,
          warnings: result.warnings || []
        }
      }))
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
  }, [projectId])

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

  const handleGenerateDemo = async () => {
    setDemoLoading(true)
    setError(null)
    try {
      const result = await generateDemo()
      const demoId = result.project_id || result.id
      navigate(`/analysis/${demoId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoLoading(false)
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
          Upload your warehouse data files for comprehensive logistics analysis and GEBHARDT product matching.
        </p>
      </div>

      {/* Demo Button */}
      <div className="card mb-8 bg-gradient-to-r from-pinaxis-900/50 to-slate-800 border-pinaxis-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Quick Demo</h3>
            <p className="text-sm text-slate-400">
              Generate a demo project with synthetic warehouse data to explore the full analysis pipeline.
            </p>
          </div>
          <button
            onClick={handleGenerateDemo}
            disabled={demoLoading}
            className="btn-primary whitespace-nowrap flex items-center gap-2"
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
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Generate Demo
              </>
            )}
          </button>
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
            <div className="w-8 h-8 bg-pinaxis-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">1</div>
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
              <div className="w-8 h-8 bg-pinaxis-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">2</div>
              <h2 className="text-xl font-semibold text-white">Upload Data Files</h2>
            </div>
            <p className="text-sm text-slate-400 ml-11 mb-6">
              Upload CSV or Excel files. Item Master and Goods Out are required. {uploadedCount}/4 files uploaded.
            </p>

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
                hasRequiredFiles ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400'
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

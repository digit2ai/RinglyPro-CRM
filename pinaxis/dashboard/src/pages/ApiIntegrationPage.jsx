import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, generateApiKey, getApiKeyStatus, revokeApiKey } from '../lib/api'

const BASE_URL = window.location.origin + '/pinaxis/api/v1'

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/ingest/:projectId/item-master',
    description: 'Ingest item master / SKU catalog records',
    bodySchema: {
      records: [{ sku: 'ABC-001', description: 'Widget A', length_mm: 300, width_mm: 200, height_mm: 150, weight_kg: 1.5, category: 'Parts' }],
      mode: 'upsert'
    },
    required: ['sku']
  },
  {
    method: 'POST',
    path: '/ingest/:projectId/inventory',
    description: 'Ingest current inventory / stock snapshot',
    bodySchema: {
      records: [{ sku: 'ABC-001', stock: 150, location: 'Zone-A', storage_space: 'A-01-03', snapshot_date: '2026-03-04' }],
      mode: 'upsert'
    },
    required: ['sku']
  },
  {
    method: 'POST',
    path: '/ingest/:projectId/goods-in',
    description: 'Ingest goods receiving / inbound records',
    bodySchema: {
      records: [{ sku: 'ABC-001', receipt_date: '2026-03-04', receipt_id: 'REC-001', quantity: 50, supplier: 'Supplier Co' }],
      mode: 'upsert'
    },
    required: ['sku', 'receipt_date']
  },
  {
    method: 'POST',
    path: '/ingest/:projectId/goods-out',
    description: 'Ingest goods shipment / outbound records',
    bodySchema: {
      records: [{ sku: 'ABC-001', order_id: 'ORD-001', ship_date: '2026-03-04', quantity: 5, customer_id: 'CUST-100' }],
      mode: 'upsert'
    },
    required: ['sku', 'ship_date', 'order_id']
  },
  {
    method: 'GET',
    path: '/ingest/:projectId/status',
    description: 'Get row counts and last sync time for all data types',
    bodySchema: null,
    required: []
  },
  {
    method: 'DELETE',
    path: '/ingest/:projectId/:dataType',
    description: 'Clear all data of a given type (item-master, inventory, goods-in, goods-out)',
    bodySchema: null,
    required: []
  }
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={handleCopy} className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function EndpointCard({ endpoint, projectId }) {
  const [expanded, setExpanded] = useState(false)
  const path = endpoint.path.replace(':projectId', projectId)
  const methodColor = {
    GET: 'bg-emerald-500/20 text-emerald-400',
    POST: 'bg-blue-500/20 text-blue-400',
    DELETE: 'bg-red-500/20 text-red-400'
  }[endpoint.method] || 'bg-slate-500/20 text-slate-400'

  const curlCmd = endpoint.method === 'GET'
    ? `curl -X GET "${BASE_URL}${path}" \\\n  -H "X-API-Key: YOUR_API_KEY"`
    : endpoint.method === 'DELETE'
    ? `curl -X DELETE "${BASE_URL}${path}" \\\n  -H "X-API-Key: YOUR_API_KEY"`
    : `curl -X POST "${BASE_URL}${path}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -d '${JSON.stringify(endpoint.bodySchema, null, 2)}'`

  return (
    <div className="card border-slate-700 mb-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 text-left">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor}`}>{endpoint.method}</span>
        <code className="text-sm text-slate-300 flex-1 font-mono">{path}</code>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <p className="text-sm text-slate-400 mt-2">{endpoint.description}</p>

      {expanded && (
        <div className="mt-4 space-y-3">
          {endpoint.required.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium mb-1">Required Fields</p>
              <div className="flex gap-2">
                {endpoint.required.map(f => (
                  <span key={f} className="px-2 py-0.5 bg-amber-500/15 text-amber-400 text-xs rounded font-mono">{f}</span>
                ))}
              </div>
            </div>
          )}

          {endpoint.bodySchema && (
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium mb-1">Request Body</p>
              <pre className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto">
                {JSON.stringify(endpoint.bodySchema, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500 uppercase font-medium">Curl Example</p>
              <CopyButton text={curlCmd} />
            </div>
            <pre className="bg-slate-900 rounded-lg p-3 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
              {curlCmd}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ApiIntegrationPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [keyStatus, setKeyStatus] = useState(null)
  const [newKey, setNewKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    try {
      setLoading(true)
      const [proj, ks] = await Promise.all([
        getProject(projectId),
        getApiKeyStatus(projectId)
      ])
      setProject(proj)
      setKeyStatus(ks)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    try {
      setGenerating(true)
      const result = await generateApiKey(projectId, 'Production API Key')
      setNewKey(result.key)
      setKeyStatus({ has_key: true, key_prefix: result.prefix, label: result.label, request_count: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke() {
    if (!confirm('Are you sure you want to revoke this API key? Any systems using it will lose access.')) return
    try {
      setRevoking(true)
      await revokeApiKey(projectId)
      setKeyStatus({ has_key: false })
      setNewKey(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Production API Integration</h1>
        <p className="text-slate-400 mt-1">
          {project?.company_name} — Connect your WMS/ERP for live data feeds
        </p>
      </div>

      {error && (
        <div className="card border-red-500/30 bg-red-500/10 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400/70 mt-1 hover:text-red-300">Dismiss</button>
        </div>
      )}

      {/* Dual Mode Banner */}
      <div className="card border-pinaxis-500/30 bg-gradient-to-br from-pinaxis-900/20 to-slate-800 mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Data Ingestion Pipeline</h2>
        <p className="text-sm text-slate-400 mb-4">Dual-mode data ingestion: file upload for POC, live API feeds for production.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-white">POC Phase — File Upload</h3>
            </div>
            <p className="text-xs text-slate-400">CSV/XLSX file uploads through the dashboard. Auto-detects delimiter (; or ,), UTF-8. Max 50 MB per file.</p>
            <div className="mt-2 flex gap-2">
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">CSV</span>
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">XLSX</span>
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">50 MB max</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold text-white">Production Phase — API Feeds</h3>
            </div>
            <p className="text-xs text-slate-400">REST API with JSON payloads. Authenticated via API key. Supports single and batch records with upsert mode.</p>
            <div className="mt-2 flex gap-2">
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">JSON</span>
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">X-API-Key</span>
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">Upsert</span>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Management */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">API Key Management</h2>

        {newKey && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <p className="text-sm font-semibold text-emerald-400">API Key Generated — Save it now!</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-900 px-3 py-2 rounded font-mono text-sm text-white break-all">{newKey}</code>
              <CopyButton text={newKey} />
            </div>
            <p className="text-xs text-amber-400 mt-2">This key will not be shown again. Store it securely.</p>
          </div>
        )}

        {keyStatus?.has_key ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-white font-medium">Active Key</span>
                <code className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">{keyStatus.key_prefix}••••••••</code>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span>Requests: {keyStatus.request_count || 0}</span>
                {keyStatus.last_used_at && <span>Last used: {new Date(keyStatus.last_used_at).toLocaleString()}</span>}
              </div>
            </div>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="btn-secondary text-sm text-red-400 hover:text-red-300 border-red-500/30 hover:border-red-500/50"
            >
              {revoking ? 'Revoking...' : 'Revoke Key'}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400 mb-3">No active API key for this project.</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary"
            >
              {generating ? 'Generating...' : 'Generate API Key'}
            </button>
          </div>
        )}
      </div>

      {/* Data Types Table */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Production Data Tables</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-700">
                <th className="pb-2 pr-4">Data Type</th>
                <th className="pb-2 pr-4">API Endpoint</th>
                <th className="pb-2 pr-4">Required Fields</th>
                <th className="pb-2">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-b border-slate-800">
                <td className="py-3 pr-4 font-medium text-white">Item Master</td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-blue-400">/item-master</code></td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-amber-400">sku</code></td>
                <td className="py-3 text-xs text-slate-400">SKU catalog with dimensions, weight, category</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 pr-4 font-medium text-white">Inventory</td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-blue-400">/inventory</code></td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-amber-400">sku</code></td>
                <td className="py-3 text-xs text-slate-400">Current stock levels, locations, storage spaces</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 pr-4 font-medium text-white">Goods In</td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-blue-400">/goods-in</code></td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-amber-400">sku, receipt_date</code></td>
                <td className="py-3 text-xs text-slate-400">Inbound receiving records, suppliers</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-white">Goods Out</td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-blue-400">/goods-out</code></td>
                <td className="py-3 pr-4"><code className="text-xs font-mono text-amber-400">sku, ship_date, order_id</code></td>
                <td className="py-3 text-xs text-slate-400">Outbound orders, shipments, customer data</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* API Reference */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">API Reference</h2>
        <div className="mb-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <p className="text-sm text-slate-300 mb-2">All ingest endpoints require authentication:</p>
          <code className="text-xs font-mono text-pinaxis-400">X-API-Key: pnx_your_api_key_here</code>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span>Rate limit: 60 req/min</span>
            <span>Max batch: 10,000 records</span>
            <span>Default mode: upsert</span>
          </div>
        </div>

        {ENDPOINTS.map((ep, i) => (
          <EndpointCard key={i} endpoint={ep} projectId={projectId} />
        ))}
      </div>
    </div>
  )
}

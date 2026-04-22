const BASE = '/pinaxis/api/v1'

async function request(path, options = {}) {
  const url = `${BASE}${path}`
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type']
  }

  const res = await fetch(url, config)

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(errorBody.error || `Request failed: ${res.status}`)
  }

  // Handle blob responses (PDF downloads)
  if (options.responseType === 'blob') {
    return res.blob()
  }

  const json = await res.json()
  // Unwrap { success, data } envelope if present
  if (json && json.success && json.data !== undefined) {
    return json.data
  }
  return json
}

/**
 * Create a new analysis project
 */
export async function createProject(data) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * Get project details by ID or project_code
 */
export async function getProject(projectId) {
  return request(`/projects/${projectId}`)
}

/**
 * Upload a file to a project
 * Backend: POST /upload/:projectId/:fileType
 */
export async function uploadFile(projectId, fileType, file) {
  const formData = new FormData()
  formData.append('file', file)

  return request(`/upload/${projectId}/${fileType}`, {
    method: 'POST',
    body: formData
  })
}

/**
 * Get upload/parse status for all files in a project
 * Backend: GET /upload/:projectId/status
 */
export async function getUploadStatus(projectId) {
  return request(`/upload/${projectId}/status`)
}

/**
 * Trigger analysis run for a project
 * Backend: POST /analysis/:projectId/run
 */
export async function runAnalysis(projectId) {
  return request(`/analysis/${projectId}/run`, {
    method: 'POST'
  })
}

/**
 * Get all analysis results for a project
 * Backend: GET /analysis/:projectId/all
 */
export async function getAnalysisAll(projectId) {
  return request(`/analysis/${projectId}/all`)
}

/**
 * Trigger product matching for a project
 * Backend: POST /products/:projectId/match
 */
export async function matchProducts(projectId) {
  return request(`/products/${projectId}/match`, {
    method: 'POST'
  })
}

/**
 * Get product recommendations
 * Backend: GET /products/:projectId/recommendations
 */
export async function getRecommendations(projectId) {
  return request(`/products/${projectId}/recommendations`)
}

/**
 * Generate a Proof of Concept project with synthetic data
 * Backend: POST /demo/generate
 */
export async function generateDemo(companyName) {
  return request('/demo/generate', {
    method: 'POST',
    body: JSON.stringify({ company_name: companyName || 'Pinaxis POC Warehouse' })
  })
}

/**
 * Instant demo — clones a completed project's analysis results (< 3 seconds)
 * Backend: POST /demo/instant
 */
export async function instantDemo(companyName) {
  return request('/demo/instant', {
    method: 'POST',
    body: JSON.stringify({ company_name: companyName || 'Pinaxis POC Warehouse' })
  })
}

/**
 * Generate PDF report for a project
 * Backend: POST /reports/:projectId/generate
 */
export async function generateReport(projectId) {
  return request(`/reports/${projectId}/generate`, {
    method: 'POST'
  })
}

/**
 * Download the PDF report for a project
 * Backend: GET /reports/:projectId/download
 */
export async function downloadReport(projectId) {
  return request(`/reports/${projectId}/download`, {
    responseType: 'blob'
  })
}

/**
 * Compute benefit projections for a project
 * Backend: POST /benefits/:projectId/compute
 */
export async function computeBenefits(projectId) {
  return request(`/benefits/${projectId}/compute`, {
    method: 'POST'
  })
}

/**
 * Get stored benefit projections
 * Backend: GET /benefits/:projectId
 */
export async function getBenefits(projectId) {
  return request(`/benefits/${projectId}`)
}

// ============================================================================
// API KEY MANAGEMENT (Production API)
// ============================================================================

/**
 * Generate a new API key for a project
 * Backend: POST /projects/:projectId/api-key
 */
export async function generateApiKey(projectId, label) {
  return request(`/projects/${projectId}/api-key`, {
    method: 'POST',
    body: JSON.stringify({ label })
  })
}

/**
 * Get API key status for a project (masked)
 * Backend: GET /projects/:projectId/api-key
 */
export async function getApiKeyStatus(projectId) {
  return request(`/projects/${projectId}/api-key`)
}

/**
 * Revoke active API key for a project
 * Backend: DELETE /projects/:projectId/api-key
 */
export async function revokeApiKey(projectId) {
  return request(`/projects/${projectId}/api-key`, {
    method: 'DELETE'
  })
}

// ============================================================================
// TELEMETRY / OBSERVABILITY
// ============================================================================

/**
 * Get live operational health for a project
 * Backend: GET /telemetry/:projectId/health
 */
export async function getTelemetryHealth(projectId) {
  return request(`/telemetry/${projectId}/health`)
}

/**
 * Query telemetry events with optional filters
 * Backend: GET /telemetry/:projectId/events
 */
export async function getTelemetryEvents(projectId, filters = {}) {
  const params = new URLSearchParams()
  if (filters.event_type) params.set('event_type', filters.event_type)
  if (filters.source) params.set('source', filters.source)
  if (filters.severity) params.set('severity', filters.severity)
  if (filters.hours) params.set('hours', filters.hours)
  if (filters.limit) params.set('limit', filters.limit)
  const qs = params.toString()
  return request(`/telemetry/${projectId}/events${qs ? '?' + qs : ''}`)
}

/**
 * Seed demo telemetry data for a project
 * Backend: POST /telemetry/:projectId/demo-seed
 */
export async function seedDemoTelemetry(projectId) {
  return request(`/telemetry/${projectId}/demo-seed`, {
    method: 'POST'
  })
}

/**
 * Get system architecture readiness analysis
 * Backend: GET /analysis/:projectId/system-architecture (via all endpoint)
 */
export async function getSystemArchitecture(projectId) {
  const all = await getAnalysisAll(projectId)
  return all?.system_architecture || null
}

// ============================================================================
// SIMULATION AGENT
// ============================================================================

/**
 * Run simulation scenarios for a project
 * Backend: POST /simulation/:projectId/run
 */
export async function runSimulation(projectId) {
  return request(`/simulation/${projectId}/run`, { method: 'POST' })
}

/**
 * Get stored simulation package
 * Backend: GET /simulation/:projectId
 */
export async function getSimulation(projectId) {
  return request(`/simulation/${projectId}`)
}

// ============================================================================
// PRICING SNAPSHOT SERVICE
// ============================================================================

/**
 * Get the current active (approved) pricing snapshot
 * Backend: GET /pricing-snapshot/active
 */
export async function getActivePricingSnapshot() {
  return request('/pricing-snapshot/active')
}

/**
 * List all pricing snapshots
 * Backend: GET /pricing-snapshot
 */
export async function listPricingSnapshots() {
  return request('/pricing-snapshot')
}

/**
 * Create a new pricing snapshot
 * Backend: POST /pricing-snapshot
 */
export async function createPricingSnapshot(data) {
  return request('/pricing-snapshot', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * Approve a pricing snapshot
 * Backend: PATCH /pricing-snapshot/:id/approve
 */
export async function approvePricingSnapshot(id, approvedBy) {
  return request(`/pricing-snapshot/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ approved_by: approvedBy })
  })
}

// ============================================================================
// HUMAN REVIEW GATES / APPROVALS
// ============================================================================

/**
 * Record an approval for a stage
 * Backend: POST /approvals/:projectId
 * stage: 'concept' | 'simulation' | 'pricing' | 'final'
 */
export async function recordApproval(projectId, stage, approvedBy, notes = '') {
  return request(`/approvals/${projectId}`, {
    method: 'POST',
    body: JSON.stringify({ stage, approved_by: approvedBy, notes })
  })
}

/**
 * Get approval status for all gates on a project
 * Backend: GET /approvals/:projectId/status
 */
export async function getApprovalStatus(projectId) {
  return request(`/approvals/${projectId}/status`)
}

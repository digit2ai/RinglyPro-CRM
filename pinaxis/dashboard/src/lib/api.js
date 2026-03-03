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

  return res.json()
}

/**
 * Create a new analysis project
 * @param {{ company_name: string, contact_name: string, industry: string, country: string }} data
 */
export async function createProject(data) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * Get project details by ID
 * @param {string} projectId
 */
export async function getProject(projectId) {
  return request(`/projects/${projectId}`)
}

/**
 * Upload a file to a project
 * @param {string} projectId
 * @param {string} fileType - item_master | inventory | goods_in | goods_out
 * @param {File} file
 */
export async function uploadFile(projectId, fileType, file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('file_type', fileType)

  return request(`/projects/${projectId}/upload`, {
    method: 'POST',
    body: formData
  })
}

/**
 * Get upload/parse status for all files in a project
 * @param {string} projectId
 */
export async function getUploadStatus(projectId) {
  return request(`/projects/${projectId}/uploads`)
}

/**
 * Trigger analysis run for a project
 * @param {string} projectId
 */
export async function runAnalysis(projectId) {
  return request(`/projects/${projectId}/analyze`, {
    method: 'POST'
  })
}

/**
 * Get all analysis results for a project
 * @param {string} projectId
 */
export async function getAnalysisAll(projectId) {
  return request(`/projects/${projectId}/analysis`)
}

/**
 * Trigger product matching for a project
 * @param {string} projectId
 */
export async function matchProducts(projectId) {
  return request(`/projects/${projectId}/match`, {
    method: 'POST'
  })
}

/**
 * Get product recommendations
 * @param {string} projectId
 */
export async function getRecommendations(projectId) {
  return request(`/projects/${projectId}/recommendations`)
}

/**
 * Generate a demo project with synthetic data
 */
export async function generateDemo() {
  return request('/demo', {
    method: 'POST'
  })
}

/**
 * Download the PDF report for a project
 * @param {string} projectId
 */
export async function downloadReport(projectId) {
  return request(`/projects/${projectId}/report`, {
    responseType: 'blob'
  })
}

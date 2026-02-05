import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const message = error.response?.data?.error?.message || error.message;
    console.error('API Error:', message);
    return Promise.reject(error);
  }
);

// ============================================================================
// Dashboard API
// ============================================================================

export const dashboardApi = {
  getOverview: (date) => api.get('/api/v1/dashboard/overview', { params: { date } }),
  getStoresRequiringAction: (date) => api.get('/api/v1/dashboard/stores-requiring-action', { params: { date } }),
  getCriticalStores: (date, limit) => api.get('/api/v1/dashboard/critical-stores', { params: { date, limit } }),
  getKpiTrends: (days, kpi_code) => api.get('/api/v1/dashboard/kpi-trends', { params: { days, kpi_code } }),
  getTopIssues: (date, limit) => api.get('/api/v1/dashboard/top-issues', { params: { date, limit } }),
  getKpiBreakdown: (kpi_code, date) => api.get(`/api/v1/dashboard/kpi-breakdown/${kpi_code}`, { params: { date } }),
};

// ============================================================================
// Store API
// ============================================================================

export const storeApi = {
  getAll: (params) => api.get('/api/v1/stores', { params }),
  getById: (id) => api.get(`/api/v1/stores/${id}`),
  getHealth: (id, date) => api.get(`/api/v1/stores/${id}/health`, { params: { date } }),
  getHealthHistory: (id, days) => api.get(`/api/v1/stores/${id}/health/history`, { params: { days } }),
  getKpis: (id, date) => api.get(`/api/v1/stores/${id}/kpis`, { params: { date } }),
  getKpiHistory: (id, kpi_code, days) => api.get(`/api/v1/stores/${id}/kpis/history`, { params: { kpi_code, days } }),
  getAlerts: (id, params) => api.get(`/api/v1/stores/${id}/alerts`, { params }),
  getTasks: (id, params) => api.get(`/api/v1/stores/${id}/tasks`, { params }),
  getEscalations: (id) => api.get(`/api/v1/stores/${id}/escalations`),
  getAiCalls: (id) => api.get(`/api/v1/stores/${id}/ai-calls`),
};

// ============================================================================
// Alert API
// ============================================================================

export const alertApi = {
  getAll: (params) => api.get('/api/v1/alerts', { params }),
  getById: (id) => api.get(`/api/v1/alerts/${id}`),
  acknowledge: (id, acknowledged_by) => api.post(`/api/v1/alerts/${id}/acknowledge`, { acknowledged_by }),
  resolve: (id) => api.post(`/api/v1/alerts/${id}/resolve`),
  getOverdue: () => api.get('/api/v1/alerts/status/overdue'),
};

// ============================================================================
// Task API
// ============================================================================

export const taskApi = {
  getAll: (params) => api.get('/api/v1/tasks', { params }),
  getById: (id) => api.get(`/api/v1/tasks/${id}`),
  complete: (id, completed_by, outcome) => api.post(`/api/v1/tasks/${id}/complete`, { completed_by, outcome }),
  updateStatus: (id, status) => api.post(`/api/v1/tasks/${id}/update-status`, { status }),
  getPending: () => api.get('/api/v1/tasks/status/pending'),
  getOverdue: () => api.get('/api/v1/tasks/status/overdue'),
};

// ============================================================================
// Escalation API
// ============================================================================

export const escalationApi = {
  getAll: (params) => api.get('/api/v1/escalations', { params }),
  getById: (id) => api.get(`/api/v1/escalations/${id}`),
  acknowledge: (id, acknowledged_by) => api.post(`/api/v1/escalations/${id}/acknowledge`, { acknowledged_by }),
  resolve: (id, resolution) => api.post(`/api/v1/escalations/${id}/resolve`, { resolution }),
  getPending: () => api.get('/api/v1/escalations/status/pending'),
  monitor: () => api.post('/api/v1/escalations/monitor'),
};

// ============================================================================
// Voice Call API
// ============================================================================

export const voiceApi = {
  getAll: (params) => api.get('/api/v1/voice/calls', { params }),
  getById: (id) => api.get(`/api/v1/voice/calls/${id}`),
  testCall: (phone_number, message) => api.post('/api/v1/voice/test', { phone_number, message }),
};

// ============================================================================
// KPI API
// ============================================================================

export const kpiApi = {
  calculate: (data) => api.post('/api/v1/kpis/calculate', data),
  batchCalculate: (data) => api.post('/api/v1/kpis/batch-calculate', data),
  getDefinitions: (params) => api.get('/api/v1/kpis/definitions', { params }),
  getThresholds: (params) => api.get('/api/v1/kpis/thresholds', { params }),
  getMetrics: (params) => api.get('/api/v1/kpis/metrics', { params }),
};

// ============================================================================
// Health Check
// ============================================================================

export const healthApi = {
  check: () => api.get('/health'),
};

export default api;

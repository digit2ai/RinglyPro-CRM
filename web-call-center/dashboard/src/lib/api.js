import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
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
    if (error.response?.status === 401) {
      window.location.href = '/login?redirect=/webcallcenter/';
      return;
    }
    const message = error.response?.data?.error?.message || error.message;
    console.error('API Error:', message);
    return Promise.reject(error);
  }
);

// ============================================================================
// Dashboard API
// ============================================================================

export const dashboardApi = {
  getStats: () => api.get('/webcallcenter/api/v1/dashboard/stats'),
};

// ============================================================================
// Calls API
// ============================================================================

export const callsApi = {
  list: (params) => api.get('/webcallcenter/api/v1/calls', { params }),
  getById: (id) => api.get(`/webcallcenter/api/v1/calls/${id}`),
};

// ============================================================================
// Widget API
// ============================================================================

export const widgetApi = {
  get: () => api.get('/webcallcenter/api/v1/widget'),
  update: (data) => api.put('/webcallcenter/api/v1/widget', data),
};

// ============================================================================
// Knowledge Base API
// ============================================================================

export const knowledgeBaseApi = {
  list: () => api.get('/webcallcenter/api/v1/knowledge-base'),
  getById: (id) => api.get(`/webcallcenter/api/v1/knowledge-base/${id}`),
  create: (data) => api.post('/webcallcenter/api/v1/knowledge-base', data),
  update: (id, data) => api.put(`/webcallcenter/api/v1/knowledge-base/${id}`, data),
  delete: (id) => api.delete(`/webcallcenter/api/v1/knowledge-base/${id}`),
};

// ============================================================================
// Usage API
// ============================================================================

export const usageApi = {
  get: () => api.get('/webcallcenter/api/v1/usage'),
};

// ============================================================================
// Health Check
// ============================================================================

export const healthApi = {
  check: () => api.get('/webcallcenter/health'),
};

export default api;

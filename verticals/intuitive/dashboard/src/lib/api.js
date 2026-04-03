const BASE = '/intuitive/api/v1';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Projects
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  listProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Analysis
  runAnalysis: (projectId) => request(`/analysis/${projectId}/run`, { method: 'POST' }),
  getResults: (projectId) => request(`/analysis/${projectId}/all`),
  getSystems: () => request('/analysis/systems'),

  // Demo
  generateDemo: () => request('/demo/generate', { method: 'POST' }),
  generateSingleDemo: () => request('/demo/generate-single', { method: 'POST' }),
};

/**
 * v2 API client — wraps fetch with JWT from the existing v1 auth service.
 * Base URL: /Torna_Idioma/api/v2
 *
 * Learners log in via the existing v1 /Torna_Idioma/api/auth/login endpoint.
 * The same token (stored in localStorage by services/auth.js) is reused here.
 */

const V2_BASE = '/Torna_Idioma/api/v2';
const TOKEN_KEY = 'ti_token'; // matches frontend/src/services/auth.js (sessionStorage)

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${V2_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: 'Invalid JSON response' };
  }

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const v2Api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  // Typed helpers
  learner: {
    me: () => request('GET', '/learner/me'),
    update: (fields) => request('PATCH', '/learner/me', fields),
    stats: () => request('GET', '/learner/stats')
  },

  health: () => request('GET', '/health')
};

export default v2Api;

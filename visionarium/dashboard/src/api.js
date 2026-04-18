const BASE = '/visionarium/api/v1';

function getToken() {
  return localStorage.getItem('visionarium_token');
}

function setToken(token) {
  localStorage.setItem('visionarium_token', token);
}

function clearToken() {
  localStorage.removeItem('visionarium_token');
  localStorage.removeItem('visionarium_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('visionarium_user'));
  } catch { return null; }
}

function setUser(user) {
  localStorage.setItem('visionarium_user', JSON.stringify(user));
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const lang = localStorage.getItem('visionarium_lang') || 'en';
  headers['X-Lang'] = lang;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    clearToken();
    window.location.href = '/visionarium/';
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const auth = {
  register: (body) => api('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) { setToken(data.token); setUser(data.user); }
    return data;
  },
  logout: () => { clearToken(); window.location.href = '/visionarium/'; },
  me: () => api('/auth/me'),
  getUser, getToken
};

export const community = {
  stats: () => api('/community/stats'),
  members: (params) => api(`/community/members?${new URLSearchParams(params)}`)
};

export const cohorts = {
  list: () => api('/cohorts'),
  get: (id) => api(`/cohorts/${id}`),
  create: (body) => api('/cohorts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/cohorts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/cohorts/${id}`, { method: 'DELETE' })
};

export const fellows = {
  me: () => api('/fellows/me'),
  myBadges: () => api('/fellows/me/badges'),
  myMentor: () => api('/fellows/me/mentor'),
  myProject: () => api('/fellows/me/project'),
  updateProject: (body) => api('/fellows/me/project', { method: 'PUT', body: JSON.stringify(body) }),
  mySchedule: () => api('/fellows/me/schedule'),
  list: (params) => api(`/fellows?${new URLSearchParams(params)}`),
  create: (body) => api('/fellows', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/fellows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/fellows/${id}`, { method: 'DELETE' })
};

export const mentors = {
  me: () => api('/mentors/me'),
  myFellows: () => api('/mentors/me/fellows'),
  linaBriefings: () => api('/mentors/me/lina-briefings'),
  sessionNotes: (id, body) => api(`/mentors/sessions/${id}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  updateAvailability: (hours) => api('/mentors/availability', { method: 'PUT', body: JSON.stringify({ hours }) }),
  list: () => api('/mentors'),
  create: (body) => api('/mentors', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/mentors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/mentors/${id}`, { method: 'DELETE' })
};

export const sponsors = {
  me: () => api('/sponsors/me'),
  myImpact: () => api('/sponsors/me/impact'),
  myFellows: () => api('/sponsors/me/fellows'),
  pipeline: () => api('/sponsors/me/pipeline'),
  postOpportunity: (body) => api('/sponsors/opportunities', { method: 'POST', body: JSON.stringify(body) }),
  myMetrics: () => api('/sponsors/me/metrics'),
  list: () => api('/sponsors'),
  create: (body) => api('/sponsors', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/sponsors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/sponsors/${id}`, { method: 'DELETE' })
};

export const applications = {
  submit: (body) => api('/applications', { method: 'POST', body: JSON.stringify(body) }),
  mine: () => api('/applications/me'),
  list: (params) => api(`/applications?${new URLSearchParams(params)}`),
  update: (id, body) => api(`/applications/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/applications/${id}`, { method: 'DELETE' })
};

export const events = {
  pub: () => api('/events/public'),
  list: (params) => api(`/events?${new URLSearchParams(params || {})}`),
  create: (body) => api('/events', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/events/${id}`, { method: 'DELETE' }),
  rsvp: (id) => api(`/events/${id}/rsvp`, { method: 'POST' })
};

export const opportunities = {
  list: (params) => api(`/opportunities?${new URLSearchParams(params || {})}`),
  apply: (id) => api(`/opportunities/${id}/apply`, { method: 'POST' }),
  create: (body) => api('/opportunities', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (id) => api(`/opportunities/${id}`, { method: 'DELETE' })
};

export const impact = {
  pub: (cohortId) => api(`/impact/public/${cohortId}`),
  list: (cohortId) => api(`/impact/${cohortId}`),
  create: (body) => api('/impact', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/impact/${id}`, { method: 'PUT', body: JSON.stringify(body) })
};

export const lina = {
  analytics: () => api('/lina/analytics'),
  briefing: (fellowId) => api(`/lina/briefing/${fellowId}`)
};

export const admin = {
  dashboard: () => api('/admin/dashboard'),
  communityAnalytics: () => api('/admin/community/analytics'),
  badges: () => api('/admin/badges'),
  createBadge: (body) => api('/admin/badges', { method: 'POST', body: JSON.stringify(body) }),
  updateBadge: (id, body) => api(`/admin/badges/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBadge: (id) => api(`/admin/badges/${id}`, { method: 'DELETE' }),
  awardBadge: (community_member_id, badge_id) => api('/admin/badges/award', { method: 'POST', body: JSON.stringify({ community_member_id, badge_id }) })
};

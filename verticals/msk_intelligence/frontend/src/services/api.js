const BASE_URL = '/msk/api/v1';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('msk_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('msk_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('msk_token');
    localStorage.removeItem('msk_user');
  }

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${BASE_URL}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        this.clearToken();
        window.location.href = '/msk/login';
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  del(path) { return this.request('DELETE', path); }

  // Auth
  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    if (data.mfaRequired) {
      // Don't store token yet — MFA challenge pending
      return data;
    }
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('msk_user', JSON.stringify(data.user));
    }
    return data;
  }

  completeMfaLogin(data) {
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('msk_user', JSON.stringify(data.user));
    }
  }

  async register(userData) {
    const data = await this.post('/auth/register', userData);
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('msk_user', JSON.stringify(data.user));
    }
    return data;
  }

  getUser() {
    const u = localStorage.getItem('msk_user');
    return u ? JSON.parse(u) : null;
  }

  isAuthenticated() {
    return !!this.token;
  }

  logout() {
    this.clearToken();
  }

  // Patient management
  searchPatients(query) {
    return this.get(`/patients/search?q=${encodeURIComponent(query)}`);
  }

  registerPatient(data) {
    return this.post('/patients/register', data);
  }

  getPatient(id) {
    return this.get(`/patients/${id}`);
  }

  updatePatient(id, data) {
    return this.put(`/patients/${id}`, data);
  }

  sendRegistrationLink(data) {
    return this.post('/patients/send-registration-link', data);
  }

  // PACS
  getPACSConnections() { return this.get('/pacs/connections'); }
  createPACSConnection(data) { return this.post('/pacs/connections', data); }
  updatePACSConnection(id, data) { return this.put(`/pacs/connections/${id}`, data); }
  deletePACSConnection(id) { return this.del(`/pacs/connections/${id}`); }
  pollPACSConnection(id) { return this.post(`/pacs/connections/${id}/poll`); }
  getDICOMStudies(params) { return this.get(`/pacs/studies${params ? '?' + params : ''}`); }

  // Referring Providers
  getReferringProviders(params) { return this.get(`/referring/providers${params ? '?' + params : ''}`); }
  createReferringProvider(data) { return this.post('/referring/providers', data); }
  updateReferringProvider(id, data) { return this.put(`/referring/providers/${id}`, data); }
  deleteReferringProvider(id) { return this.del(`/referring/providers/${id}`); }
  searchReferringProviders(q) { return this.get(`/referring/search?q=${encodeURIComponent(q)}`); }

  // Teleradiology
  getTeleradiologyRequests(params) { return this.get(`/teleradiology/requests${params ? '?' + params : ''}`); }
  createTeleradiologyRequest(data) { return this.post('/teleradiology/requests', data); }
  updateTeleradiologyRequest(id, data) { return this.put(`/teleradiology/requests/${id}`, data); }
  getTeleradiologyStats() { return this.get('/teleradiology/stats'); }

  // Report Delivery
  getReportDeliveries(params) { return this.get(`/report-delivery${params ? '?' + params : ''}`); }
  createReportDelivery(data) { return this.post('/report-delivery', data); }
  updateReportDelivery(id, data) { return this.put(`/report-delivery/${id}`, data); }
  retryReportDelivery(id) { return this.post(`/report-delivery/${id}/retry`); }
}

export default new ApiService();

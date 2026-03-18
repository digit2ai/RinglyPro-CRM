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
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('msk_user', JSON.stringify(data.user));
    }
    return data;
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
}

export default new ApiService();

import axios from 'axios';

const API_BASE = '/imprint_iq/api/auth';

export function isAuthenticated() {
  return !!localStorage.getItem('iq_auth_token');
}

export function getUser() {
  const user = localStorage.getItem('iq_auth_user');
  return user ? JSON.parse(user) : null;
}

export async function login(email, password) {
  const response = await axios.post(`${API_BASE}/login`, { email, password });
  if (response.data.success) {
    localStorage.setItem('iq_auth_token', response.data.token);
    localStorage.setItem('iq_auth_user', JSON.stringify(response.data.user));
  }
  return response.data;
}

export function logout() {
  localStorage.removeItem('iq_auth_token');
  localStorage.removeItem('iq_auth_user');
}

export function getToken() {
  return localStorage.getItem('iq_auth_token');
}

export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

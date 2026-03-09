import api from './api';

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password });
  if (res.data.success) {
    sessionStorage.setItem('cw_token', res.data.token);
    sessionStorage.setItem('cw_user', JSON.stringify(res.data.user));
  }
  return res.data;
}

export function logout() {
  sessionStorage.removeItem('cw_token');
  sessionStorage.removeItem('cw_user');
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('cw_user'));
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return !!sessionStorage.getItem('cw_token');
}

export function getToken() {
  return sessionStorage.getItem('cw_token');
}

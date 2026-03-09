import axios from 'axios';

const api = axios.create({
  baseURL: '/cw_carriers/api'
});

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('cw_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('cw_token');
      sessionStorage.removeItem('cw_user');
      window.location.href = '/cw_carriers/login';
    }
    return Promise.reject(err);
  }
);

export default api;

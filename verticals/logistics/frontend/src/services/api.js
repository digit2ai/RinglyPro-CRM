import axios from 'axios';

const api = axios.create({ baseURL: '/logistics/api' });

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('lg_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('lg_token');
      sessionStorage.removeItem('lg_user');
      window.location.href = '/logistics/login';
    }
    return Promise.reject(err);
  }
);

export default api;

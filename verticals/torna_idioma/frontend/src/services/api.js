import axios from 'axios';

const api = axios.create({ baseURL: '/Torna_Idioma/api' });

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('ti_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('ti_token');
      sessionStorage.removeItem('ti_user');
      window.location.href = '/Torna_Idioma/login';
    }
    return Promise.reject(err);
  }
);

export default api;

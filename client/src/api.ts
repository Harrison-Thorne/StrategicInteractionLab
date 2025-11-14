import axios from 'axios';

// Normalize base to avoid double "/api" when env is set to "/api"
const rawBase = (import.meta.env.VITE_API_BASE as string | undefined);
const base = !rawBase || rawBase === '/api' ? '' : rawBase;

export const api = axios.create({
  baseURL: base,
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const path = window.location.pathname;
    if (status === 401 && path !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

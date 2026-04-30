import axios from 'axios';

const API = axios.create({
  baseURL: '/api'
});

// Attach token automatically
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = token;
  }
  return req;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error;

    if (
      status === 401 &&
      message &&
      (
        message === 'Invalid token' ||
        message === 'Access denied' ||
        message === 'User no longer exists. Please sign in again.'
      )
    ) {
      localStorage.removeItem('token');

      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  }
);

export default API;

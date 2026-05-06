import API from '../api';

// LOGIN
export const login = (data) =>
  API.post('/auth/login', data);

// REGISTER
export const register = (data) =>
  API.post('/auth/register', data);

// DELETE ACCOUNT (optional reuse)
export const deleteAccount = (data) =>
  API.delete('/auth/account', { data });
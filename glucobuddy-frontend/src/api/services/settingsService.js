import API from '../api';

// GET settings
export const getSettings = () =>
  API.get('/settings');

// UPDATE settings
export const updateSettings = (data) =>
  API.put('/settings', data);
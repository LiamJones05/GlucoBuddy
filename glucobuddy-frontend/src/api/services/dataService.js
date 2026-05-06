import API from '../api';

// EXPORT (download)
export const exportData = () =>
  API.get('/data/export', { responseType: 'blob' });

// PREVIEW import
export const previewImport = (data) =>
  API.post('/data/preview', data);

// CONFIRM import
export const importData = (data) =>
  API.post('/data/import', data);
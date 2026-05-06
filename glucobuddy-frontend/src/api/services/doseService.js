import API from '../api';

export const calculateDose = (data) =>
  API.post('/dose/calculate', data);
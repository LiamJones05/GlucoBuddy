import API from '../api';

export const logInsulin = (data) =>
  API.post('/insulin', data);

export const getInsulinByDate = (date) =>
  API.get(`/insulin?date=${date}`);
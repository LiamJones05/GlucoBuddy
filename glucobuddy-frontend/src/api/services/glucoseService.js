import API from '../api';

// CREATE glucose
export const createGlucose = (data) =>
  API.post('/glucose', data);

// GET glucose by date
export const getGlucoseByDate = (date) =>
  API.get(`/glucose?date=${date}`);

// GET averages
export const getGlucoseAverages = (days) =>
  API.get(`/glucose/averages?days=${days}`);

// GET insights
export const getGlucoseInsights = (days) =>
  API.get(`/glucose/insights?days=${days}`);
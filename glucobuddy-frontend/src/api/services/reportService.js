import API from '../api';

export const getReportSummary = (startDate, endDate) =>
  API.get(`/reports/summary?startDate=${startDate}&endDate=${endDate}`);
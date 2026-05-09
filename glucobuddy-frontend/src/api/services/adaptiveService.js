/**
 * adaptiveService.js
 *
 * Frontend API service for the adaptive engine endpoints.
 * Follows the same pattern as your existing services (authService, doseService, etc.)
 */

import api from '../api';

/**
 * Fetch the user's current adaptive parameters and status.
 * Used by Settings to display the adaptive panel.
 */
export const getAdaptiveParams = async () => {
  const response = await api.get('/adaptive/params');
  return response.data;
};

/**
 * Check whether a pending outcome prompt should be shown.
 * Called by Dashboard on mount and on a timed interval.
 *
 * @returns {{ hasPending: boolean, dose: object|null }}
 */
export const getPendingOutcome = async () => {
  const response = await api.get('/adaptive/pending');
  return response.data;
};

/**
 * Submit a post-meal glucose outcome reading.
 *
 * @param {number} doseId
 * @param {number} outcomeGlucose - mmol/L
 */
export const submitOutcome = async (doseId, outcomeGlucose) => {
  const response = await api.post('/adaptive/outcome', { doseId, outcomeGlucose });
  return response.data;
};

/**
 * Enable or disable adaptive mode.
 *
 * @param {boolean} enabled
 */
export const toggleAdaptiveMode = async (enabled) => {
  const response = await api.post('/adaptive/toggle', { enabled });
  return response.data;
};

/**
 * Reset all learned adaptive parameters back to the user's manual baseline.
 */
export const resetAdaptiveParams = async () => {
  const response = await api.post('/adaptive/reset');
  return response.data;
};

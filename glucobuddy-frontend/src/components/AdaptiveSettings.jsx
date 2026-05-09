import { useState, useEffect, useCallback } from 'react';
import {
  getAdaptiveParams,
  toggleAdaptiveMode,
  resetAdaptiveParams,
} from '../api/services/adaptiveService';

const MIN_OUTCOMES = 5;

export default function AdaptiveSettings() {
  const [params, setParams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const fetchParams = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await getAdaptiveParams();
      setParams(data);
    } catch {
      setError('Failed to load adaptive settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParams();
  }, [fetchParams]);

  const handleToggle = async () => {
    if (!params) return;
    setToggling(true);
    try {
      await toggleAdaptiveMode(!params.adaptiveEnabled);
      await fetchParams();
    } catch {
      setError('Failed to update adaptive mode.');
    } finally {
      setToggling(false);
    }
  };

  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setResetting(true);
    try {
      await resetAdaptiveParams();
      setResetConfirm(false);
      await fetchParams();
    } catch {
      setError('Failed to reset adaptive parameters.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="adaptive-settings adaptive-settings--loading">
        <p>Loading adaptive settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="adaptive-settings adaptive-settings--error">
        <p>{error}</p>
        <button onClick={fetchParams} className="adaptive-btn adaptive-btn--secondary">
          Retry
        </button>
      </div>
    );
  }

  const bands = ['morning', 'afternoon', 'evening'];
  const bandLabels = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

  return (
    <div className="adaptive-settings">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="adaptive-settings__header">
        <div className="adaptive-settings__title-row">
          <h3 className="adaptive-settings__title">Adaptive Dosing</h3>
          {params.adaptiveEnabled && (
            <span className="adaptive-badge">
              {params.frozen ? '❄ Frozen' : params.ready ? '● Active' : '◌ Learning'}
            </span>
          )}
        </div>
        <p className="adaptive-settings__description">
          When enabled, GlucoBuddy gradually adjusts your insulin ratios based on
          your post-meal glucose outcomes. Changes are small, conservative, and
          always capped relative to your configured baseline.
        </p>
      </div>

      {/* ── Toggle ─────────────────────────────────────────────────────────── */}
      <div className="adaptive-settings__toggle-row">
        <span className="adaptive-settings__toggle-label">
          {params.adaptiveEnabled ? 'Adaptive mode on' : 'Adaptive mode off'}
        </span>
        <button
          className={`adaptive-toggle ${params.adaptiveEnabled ? 'adaptive-toggle--on' : ''}`}
          onClick={handleToggle}
          disabled={toggling}
          aria-pressed={params.adaptiveEnabled}
          aria-label="Toggle adaptive mode"
        >
          <span className="adaptive-toggle__thumb" />
        </button>
      </div>

      {/* ── Hypo freeze warning ─────────────────────────────────────────────── */}
      {params.adaptiveEnabled && params.frozen && (
        <div className="adaptive-settings__warning">
          <span className="adaptive-settings__warning-icon">⚠</span>
          <span>
            A hypoglycaemic outcome was detected. Learning is paused for 48 hours
            as a safety measure. Your existing ratios remain in use.
          </span>
        </div>
      )}

      {/* ── Ratio comparison table ──────────────────────────────────────────── */}
      {params.adaptiveEnabled && (
        <div className="adaptive-settings__ratios">
          <h4 className="adaptive-settings__section-title">Carb Ratios</h4>
          <div className="adaptive-ratios-table">
            <div className="adaptive-ratios-table__header">
              <span>Period</span>
              <span>Baseline</span>
              <span>Adapted</span>
              <span>Evidence</span>
            </div>
            {bands.map((band) => {
              const count = params.outcomeCount?.[band] ?? 0;
              const baseline = params.baseline.carbRatios[band];
              const adapted = params.adapted.carbRatios[band];
              const delta = adapted - baseline;
              const ready = count >= MIN_OUTCOMES;

              return (
                <div key={band} className="adaptive-ratios-table__row">
                  <span className="adaptive-ratios-table__band">{bandLabels[band]}</span>
                  <span>1:{baseline}g</span>
                  <span className={`adaptive-ratios-table__adapted ${!ready ? 'adaptive-ratios-table__adapted--pending' : ''}`}>
                    {ready ? (
                      <>
                        1:{adapted}g
                        {delta !== 0 && (
                          <span className={`adaptive-ratios-table__delta ${delta < 0 ? 'adaptive-ratios-table__delta--down' : 'adaptive-ratios-table__delta--up'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="adaptive-ratios-table__pending-text">Learning…</span>
                    )}
                  </span>
                  <span>
                    <div
                      className="adaptive-progress"
                      title={`${count} of ${MIN_OUTCOMES} outcomes`}
                      aria-label={`${count} of ${MIN_OUTCOMES} outcomes collected`}
                    >
                      <div
                        className="adaptive-progress__bar"
                        style={{ width: `${Math.min(100, (count / MIN_OUTCOMES) * 100)}%` }}
                      />
                    </div>
                    <span className="adaptive-progress__label">{count}/{MIN_OUTCOMES}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Correction factor */}
          <h4 className="adaptive-settings__section-title adaptive-settings__section-title--mt">
            Correction Factor
          </h4>
          <div className="adaptive-ratios-table">
            <div className="adaptive-ratios-table__header">
              <span>Parameter</span>
              <span>Baseline</span>
              <span>Adapted</span>
              <span>Evidence</span>
            </div>
            <div className="adaptive-ratios-table__row">
              <span>Correction</span>
              <span>{params.baseline.correctionFactor}</span>
              <span>
                {(params.outcomeCount?.correction ?? 0) >= MIN_OUTCOMES
                  ? params.adapted.correctionFactor
                  : <span className="adaptive-ratios-table__pending-text">Learning…</span>
                }
              </span>
              <span>
                <div className="adaptive-progress">
                  <div
                    className="adaptive-progress__bar"
                    style={{
                      width: `${Math.min(100, ((params.outcomeCount?.correction ?? 0) / MIN_OUTCOMES) * 100)}%`,
                    }}
                  />
                </div>
                <span className="adaptive-progress__label">
                  {params.outcomeCount?.correction ?? 0}/{MIN_OUTCOMES}
                </span>
              </span>
            </div>
          </div>

          {params.lastUpdated && (
            <p className="adaptive-settings__last-updated">
              Last updated: {new Date(params.lastUpdated).toLocaleString()}
            </p>
          )}

          {/* Reset */}
          <div className="adaptive-settings__reset-row">
            <button
              className="adaptive-btn adaptive-btn--danger"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetConfirm
                ? 'Confirm reset — this cannot be undone'
                : resetting
                ? 'Resetting…'
                : 'Reset to baseline'}
            </button>
            {resetConfirm && (
              <button
                className="adaptive-btn adaptive-btn--secondary"
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import API from '../api/api';
import '../styles/dashboard.css';
import { INSULIN_ACTION_HOURS } from '../utils/iob';

function getLocalDateValue(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getLocalTimeValue(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

function toSafeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export default function Calculator() {
  const today = getLocalDateValue();
  const [calculatorError, setCalculatorError] = useState('');
  const [calculatorSuccess, setCalculatorSuccess] = useState('');
  const [calculatorWarning, setCalculatorWarning] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isConfirmingDose, setIsConfirmingDose] = useState(false);
  const [doseResult, setDoseResult] = useState(null);
  const [finalDose, setFinalDose] = useState('');
  const [showAdvancedInputs, setShowAdvancedInputs] = useState(false);
  const [calculatorDate, setCalculatorDate] = useState(today);
  const [calculatorTime, setCalculatorTime] = useState(getLocalTimeValue());
  const [calculatorGlucose, setCalculatorGlucose] = useState('');
  const [calculatorCarbs, setCalculatorCarbs] = useState('');
  const [calculatorProtein, setCalculatorProtein] = useState('');
  const [calculatorFat, setCalculatorFat] = useState('');
  const [calculatorAlcohol, setCalculatorAlcohol] = useState('');
  const [calculatorRecentExercise, setCalculatorRecentExercise] = useState('');
  const [calculatorPlannedExercise, setCalculatorPlannedExercise] = useState('');

  useEffect(() => {
    if (!doseResult) {
      return;
    }

    setCalculatorWarning(null);
    setDoseResult(null);
    setFinalDose('');
    setCalculatorSuccess('');
  }, [
    calculatorDate,
    calculatorTime,
    calculatorGlucose,
    calculatorCarbs,
    calculatorProtein,
    calculatorFat,
    calculatorAlcohol,
    calculatorRecentExercise,
    calculatorPlannedExercise,
  ]);

  const handleCalculateDose = async () => {
    const numericGlucose = Number(calculatorGlucose);
    const numericCarbs = Number(calculatorCarbs);

    if (!Number.isFinite(numericGlucose) || numericGlucose <= 0) {
      setCalculatorError('Enter a valid glucose value for the calculation.');
      return;
    }

    if (!Number.isFinite(numericCarbs) || numericCarbs < 0) {
      setCalculatorError('Enter carbs as zero or greater.');
      return;
    }

    if (!calculatorDate || !calculatorTime) {
      setCalculatorError('Select both a calculation date and time.');
      return;
    }

    setIsCalculating(true);
    setCalculatorError('');
    setCalculatorSuccess('');

    try {
      const res = await API.post('/dose/calculate', {
        glucose: numericGlucose,
        carbs: numericCarbs,
        calculation_time: `${calculatorDate}T${calculatorTime}:00`,
        protein_grams: Number(calculatorProtein || 0),
        fat_grams: Number(calculatorFat || 0),
        alcohol_units: Number(calculatorAlcohol || 0),
        recent_exercise_minutes: Number(calculatorRecentExercise || 0),
        planned_exercise_minutes: Number(calculatorPlannedExercise || 0),
      });

      setDoseResult(res.data);
      setFinalDose(String(res.data.recommendedDose));
      setCalculatorWarning(res.data.warning || null);
    } catch (err) {
      console.error('Error calculating dose:', err);
      setDoseResult(null);
      setFinalDose('');
      setCalculatorError(err.response?.data?.error || 'Unable to calculate dose.');
      setCalculatorWarning(null);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfirmDose = async () => {
    const numericFinalDose = Number(finalDose);

    if (!doseResult) {
      setCalculatorError('Calculate a dose before confirming it.');
      return;
    }

    if (!Number.isFinite(numericFinalDose) || numericFinalDose <= 0) {
      setCalculatorError('Enter a final dose greater than zero before logging.');
      return;
    }

    setIsConfirmingDose(true);
    setCalculatorError('');
    setCalculatorSuccess('');

    try {
      await API.post('/insulin', {
        units: numericFinalDose,
        insulin_type: 'rapid-acting',
        logged_at: `${calculatorDate}T${calculatorTime}:00`,
        glucose_level: Number(calculatorGlucose),
      });

      setCalculatorSuccess(
        `Logged ${numericFinalDose} units and a ${calculatorGlucose} mmol/L reading for ${calculatorDate} at ${calculatorTime}.`
      );
      setDoseResult(null);
      setFinalDose('');
      setCalculatorCarbs('');
    } catch (err) {
      console.error('Error confirming insulin dose:', err);
      setCalculatorError(err.response?.data?.error || 'Unable to log insulin dose.');
    } finally {
      setIsConfirmingDose(false);
    }
  };

  const breakdown = doseResult?.breakdown ?? {};
  const advancedBreakdown = breakdown.advanced ?? {};
  const carbDose = toSafeNumber(breakdown.carbDose);
  const correctionDose = toSafeNumber(breakdown.correctionDose);
  const proteinDose = toSafeNumber(advancedBreakdown.proteinDose);
  const fatDose = toSafeNumber(advancedBreakdown.fatDose);
  const alcoholReduction = toSafeNumber(advancedBreakdown.alcoholReduction);
  const recentExerciseReduction = toSafeNumber(advancedBreakdown.recentExerciseReduction);
  const plannedExerciseReduction = toSafeNumber(advancedBreakdown.plannedExerciseReduction);
  const iobAvailable = toSafeNumber(breakdown.iobAvailable, toSafeNumber(breakdown.iob));
  const iobApplied = toSafeNumber(breakdown.iobApplied, Math.min(iobAvailable, correctionDose));
  const netCorrectionDose = toSafeNumber(
    breakdown.netCorrectionDose,
    Math.max(0, correctionDose - iobApplied)
  );
  const advancedAssumptions = Array.isArray(advancedBreakdown.assumptions)
    ? advancedBreakdown.assumptions
    : [];
  const advancedFlags = Array.isArray(advancedBreakdown.flags) ? advancedBreakdown.flags : [];
  const advancedUsed = Boolean(
    doseResult?.advancedUsed ||
    proteinDose > 0 ||
    fatDose > 0 ||
    alcoholReduction > 0 ||
    recentExerciseReduction > 0 ||
    plannedExerciseReduction > 0
  );

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Insulin Calculator</h1>

      <div className="dashboard-grid dashboard-grid--calculator">
        <section className="card card--wide">
          <h3>Calculate Dose</h3>
          <p className="card-copy">
            Educational support only. Review the recommendation, adjust if needed, then confirm to log insulin and glucose.
          </p>

          <div className="insulin-form">
            <label>
              Calculation date
              <input
                type="date"
                value={calculatorDate}
                onChange={(e) => setCalculatorDate(e.target.value)}
              />
            </label>

            <label>
              Calculation time
              <input
                type="time"
                value={calculatorTime}
                onChange={(e) => setCalculatorTime(e.target.value)}
              />
            </label>

            <label>
              Current glucose
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="mmol/L"
                value={calculatorGlucose}
                onChange={(e) => setCalculatorGlucose(e.target.value)}
              />
            </label>

            <label>
              Carbs
              <input
                type="number"
                step="1"
                min="0"
                placeholder="grams"
                value={calculatorCarbs}
                onChange={(e) => setCalculatorCarbs(e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="button-tertiary"
            onClick={() => setShowAdvancedInputs((current) => !current)}
          >
            {showAdvancedInputs ? 'Hide advanced inputs' : 'Show advanced inputs'}
          </button>

          {showAdvancedInputs ? (
            <div className="insulin-form insulin-form--advanced">
              <label>
                Protein
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="grams"
                  value={calculatorProtein}
                  onChange={(e) => setCalculatorProtein(e.target.value)}
                />
              </label>

              <label>
                Fat
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="grams"
                  value={calculatorFat}
                  onChange={(e) => setCalculatorFat(e.target.value)}
                />
              </label>

              <label>
                Alcohol
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="units"
                  value={calculatorAlcohol}
                  onChange={(e) => setCalculatorAlcohol(e.target.value)}
                />
              </label>

              <label>
                Recent exercise
                <input
                  type="number"
                  step="5"
                  min="0"
                  placeholder="minutes"
                  value={calculatorRecentExercise}
                  onChange={(e) => setCalculatorRecentExercise(e.target.value)}
                />
              </label>

              <label>
                Expected exercise
                <input
                  type="number"
                  step="5"
                  min="0"
                  placeholder="minutes"
                  value={calculatorPlannedExercise}
                  onChange={(e) => setCalculatorPlannedExercise(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <p className="card-copy card-copy--tight">
            Advanced inputs affect this recommendation only. They are not stored when the dose is confirmed.
          </p>

          <div className="insulin-actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleCalculateDose}
              disabled={isCalculating}
            >
              {isCalculating ? 'Calculating...' : 'Calculate dose'}
            </button>

            <button
              type="button"
              className="button-secondary"
              onClick={handleConfirmDose}
              disabled={isConfirmingDose || !doseResult || doseResult?.hypo}
            >
              {isConfirmingDose ? 'Logging...' : 'Confirm and log'}
            </button>
          </div>

          {calculatorError ? <p className="form-error">{calculatorError}</p> : null}
          {calculatorSuccess ? <p className="form-success">{calculatorSuccess}</p> : null}
          {calculatorWarning?.type === 'hypo' ? (
            <div className="warning-hypo">
              <strong>{calculatorWarning.message}</strong>
              <p>{calculatorWarning.action}</p>
            </div>
          ) : null}
        </section>

        <section className="card card--wide">
          <h3>Recommendation</h3>

          {doseResult?.hypo ? (
            <div className="dose-summary">
              <div className="dose-summary__header">
                <h4>Recommendation</h4>
                <strong>Do not take insulin</strong>
              </div>

              <p className="insulin-note">
                Treat low blood sugar with fast-acting carbohydrates before taking insulin.
              </p>
            </div>
          ) : doseResult ? (
            <div className="dose-summary">
              <div className="dose-summary__header">
                <h4>Recommended dose</h4>
                <strong>{doseResult.recommendedDose} units</strong>
              </div>

              <label>
                Final dose to log
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={finalDose}
                  onChange={(e) => setFinalDose(e.target.value)}
                />
              </label>

              <div className="dose-breakdown">
                <p>Carb coverage: {carbDose.toFixed(2)} units</p>
                <p>Correction before IOB: {correctionDose.toFixed(2)} units</p>
                <p>Time sensitivity multiplier: {toSafeNumber(breakdown.sensitivityMultiplier, 1).toFixed(2)}</p>

                {proteinDose > 0 ? <p>Protein adjustment: +{proteinDose.toFixed(2)} units</p> : null}
                {fatDose > 0 ? <p>Fat adjustment: +{fatDose.toFixed(2)} units</p> : null}
                {alcoholReduction > 0 ? <p>Alcohol reduction: -{alcoholReduction.toFixed(2)} units</p> : null}
                {recentExerciseReduction > 0 ? <p>Recent exercise reduction: -{recentExerciseReduction.toFixed(2)} units</p> : null}
                {plannedExerciseReduction > 0 ? <p>Expected exercise reduction: -{plannedExerciseReduction.toFixed(2)} units</p> : null}

                <p>IOB available: {iobAvailable.toFixed(2)} units</p>
                <p>IOB applied to correction: -{iobApplied.toFixed(2)} units</p>
                <p>Correction after IOB: {netCorrectionDose.toFixed(2)} units</p>
                <p>Carb ratio used: 1:{doseResult?.carbRatio ? doseResult.carbRatio.toFixed(2) : '-'}</p>
              </div>

              {advancedFlags.map((flag) => (
                <p className="form-error" key={flag}>{flag}</p>
              ))}

              {advancedUsed ? (
                <div className="dose-assumptions">
                  <p className="dose-assumptions__title">Advanced assumptions used</p>
                  {advancedAssumptions.map((assumption) => (
                    <p key={assumption}>{assumption}</p>
                  ))}
                </div>
              ) : null}

              <p className="insulin-note">
                IOB uses a {doseResult.insulinActionHours || INSULIN_ACTION_HOURS}-hour non-linear rapid-acting insulin curve and is only applied against correction insulin, not meal coverage.
              </p>
            </div>
          ) : (
            <p className="chart-empty">Enter glucose and carbs, then calculate a dose.</p>
          )}
        </section>
      </div>
    </div>
  );
}

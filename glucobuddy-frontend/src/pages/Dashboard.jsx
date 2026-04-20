import { useEffect, useState } from 'react';
import API from '../api/api';
import '../styles/dashboard.css';
import GlucoseChart from '../components/GlucoseChart';
import { buildChartData, INSULIN_ACTION_HOURS } from '../utils/iob';

function getLocalDateValue(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getLocalTimeValue(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

function parseMinutesSinceMidnight(timeText) {
  const [hours = '0', minutes = '0'] = timeText.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function toSafeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export default function Dashboard() {
  const today = getLocalDateValue();
  const [glucoseData, setGlucoseData] = useState([]);
  const [insulinLogs, setInsulinLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [calculatorError, setCalculatorError] = useState('');
  const [calculatorSuccess, setCalculatorSuccess] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isConfirmingDose, setIsConfirmingDose] = useState(false);
  const [doseResult, setDoseResult] = useState(null);
  const [finalDose, setFinalDose] = useState('');
  const [showAdvancedInputs, setShowAdvancedInputs] = useState(false);

  const [glucoseValue, setGlucoseValue] = useState('');
  const [viewDate, setViewDate] = useState(today);
  const [readingDate, setReadingDate] = useState(today);
  const [readingTime, setReadingTime] = useState(getLocalTimeValue());
  const [calculatorDate, setCalculatorDate] = useState(today);
  const [calculatorTime, setCalculatorTime] = useState(getLocalTimeValue());
  const [calculatorGlucose, setCalculatorGlucose] = useState('');
  const [calculatorCarbs, setCalculatorCarbs] = useState('');
  const [calculatorProtein, setCalculatorProtein] = useState('');
  const [calculatorFat, setCalculatorFat] = useState('');
  const [calculatorAlcohol, setCalculatorAlcohol] = useState('');
  const [calculatorRecentExercise, setCalculatorRecentExercise] = useState('');
  const [calculatorPlannedExercise, setCalculatorPlannedExercise] = useState('');

  const fetchData = async (dateToLoad = viewDate) => {
    setLoading(true);
    setFetchError('');

    try {
      const [glucoseRes, insulinRes] = await Promise.all([
        API.get(`/glucose?date=${dateToLoad}`),
        API.get(`/insulin?date=${dateToLoad}`),
      ]);

      const formattedGlucose = glucoseRes.data
        .map((entry) => ({
          id: entry.id,
          time: entry.logged_time.slice(0, 5),
          glucose: Number(entry.glucose_level),
          minutesSinceMidnight: parseMinutesSinceMidnight(entry.logged_time),
          loggedAt: entry.logged_at,
        }))
        .filter((entry) => Number.isFinite(entry.glucose))
        .sort((a, b) => a.minutesSinceMidnight - b.minutesSinceMidnight);

      const formattedInsulin = insulinRes.data
        .map((entry) => ({
          id: entry.id,
          units: Number(entry.units),
          insulinType: entry.insulin_type,
          loggedAt: entry.logged_at,
        }))
        .filter((entry) => Number.isFinite(entry.units) && entry.loggedAt)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

      setGlucoseData(formattedGlucose);
      setInsulinLogs(formattedInsulin);
    } catch (err) {
      console.error('Error fetching glucose data:', err);
      setFetchError('Unable to load glucose or insulin data for that day.');
      setGlucoseData([]);
      setInsulinLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(viewDate);
  }, [viewDate]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await API.get('/settings');
        setSettings({
          target_min: Number(res.data.target_min),
          target_max: Number(res.data.target_max),
        });
      } catch (err) {
        console.error('Error fetching settings:', err);
        setSettings(null);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    if (!doseResult) {
      return;
    }

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

  const handleAddGlucose = async () => {
    const numericGlucose = Number(glucoseValue);

    if (!Number.isFinite(numericGlucose) || numericGlucose <= 0) {
      setSaveError('Enter a valid glucose value.');
      return;
    }

    if (!readingDate || !readingTime) {
      setSaveError('Select both a reading date and time.');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      await API.post('/glucose', {
        glucose_level: numericGlucose,
        logged_at: `${readingDate}T${readingTime}:00`,
      });

      setGlucoseValue('');
      setReadingTime(getLocalTimeValue());

      if (readingDate !== viewDate) {
        setViewDate(readingDate);
      } else {
        await fetchData(readingDate);
      }
    } catch (err) {
      console.error('Error saving glucose reading:', err);
      setSaveError(err.response?.data?.error || 'Unable to save glucose reading.');
    } finally {
      setIsSaving(false);
    }
  };

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
    } catch (err) {
      console.error('Error calculating dose:', err);
      setDoseResult(null);
      setFinalDose('');
      setCalculatorError(err.response?.data?.error || 'Unable to calculate dose.');
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

      if (calculatorDate !== viewDate) {
        setViewDate(calculatorDate);
      } else {
        await fetchData(calculatorDate);
      }
    } catch (err) {
      console.error('Error confirming insulin dose:', err);
      setCalculatorError(err.response?.data?.error || 'Unable to log insulin dose.');
    } finally {
      setIsConfirmingDose(false);
    }
  };

  const chartData = buildChartData(glucoseData, insulinLogs, viewDate);
  const hasChartData = chartData.length > 0;
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
  const iobApplied = toSafeNumber(
    breakdown.iobApplied,
    Math.min(iobAvailable, correctionDose)
  );
  const netCorrectionDose = toSafeNumber(
    breakdown.netCorrectionDose,
    Math.max(0, correctionDose - iobApplied)
  );
  const advancedAssumptions = Array.isArray(advancedBreakdown.assumptions)
    ? advancedBreakdown.assumptions
    : [];
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
      <h1 className="dashboard-title">Dashboard</h1>

      <div className="dashboard-grid">
        <div className="card card--wide">
          <div className="glucose-controls glucose-controls--view">
            <label>
              View date
              <input
                type="date"
                value={viewDate}
                onChange={(e) => setViewDate(e.target.value)}
              />
            </label>
          </div>

          <div className="glucose-controls glucose-controls--entry">
            <label>
              Reading date
              <input
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
              />
            </label>

            <label>
              Reading time
              <input
                type="time"
                value={readingTime}
                onChange={(e) => setReadingTime(e.target.value)}
              />
            </label>

            <label>
              Glucose
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="mmol/L"
                value={glucoseValue}
                onChange={(e) => setGlucoseValue(e.target.value)}
              />
            </label>

            <button onClick={handleAddGlucose} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Add reading'}
            </button>
          </div>

          {saveError ? <p className="form-error">{saveError}</p> : null}
          {fetchError ? <p className="form-error">{fetchError}</p> : null}

          {loading ? (
            <p>Loading chart...</p>
          ) : !hasChartData ? (
            <p>No glucose or insulin data for {viewDate}</p>
          ) : (
            <GlucoseChart
              data={chartData}
              selectedDate={viewDate}
              targetMin={settings?.target_min}
              targetMax={settings?.target_max}
            />
          )}
        </div>

        <div className="card">
          <h3>Insulin Calculator</h3>
          <p className="card-copy">
            Educational support only. Review the recommendation, adjust if needed, then confirm to log insulin and update IOB on the chart.
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
            Advanced inputs affect the recommendation only. They are not stored in the database when you confirm the dose.
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
              disabled={isConfirmingDose || !doseResult}
            >
              {isConfirmingDose ? 'Logging...' : 'Confirm and log'}
            </button>
          </div>

          {calculatorError ? <p className="form-error">{calculatorError}</p> : null}
          {calculatorSuccess ? <p className="form-success">{calculatorSuccess}</p> : null}

          {doseResult ? (
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
                {proteinDose > 0 ? (
                  <p>Protein adjustment: +{proteinDose.toFixed(2)} units</p>
                ) : null}
                {fatDose > 0 ? (
                  <p>Fat adjustment: +{fatDose.toFixed(2)} units</p>
                ) : null}
                {alcoholReduction > 0 ? (
                  <p>Alcohol reduction: -{alcoholReduction.toFixed(2)} units</p>
                ) : null}
                {recentExerciseReduction > 0 ? (
                  <p>Recent exercise reduction: -{recentExerciseReduction.toFixed(2)} units</p>
                ) : null}
                {plannedExerciseReduction > 0 ? (
                  <p>Expected exercise reduction: -{plannedExerciseReduction.toFixed(2)} units</p>
                ) : null}
                <p>IOB available: {iobAvailable.toFixed(2)} units</p>
                <p>IOB applied to correction: -{iobApplied.toFixed(2)} units</p>
                <p>Correction after IOB: {netCorrectionDose.toFixed(2)} units</p>
                <p>Carb ratio used: 1:{doseResult.carbRatio.toFixed(2)}</p>
              </div>

              {advancedUsed ? (
                <div className="dose-assumptions">
                  <p className="dose-assumptions__title">Advanced assumptions used</p>
                  {advancedAssumptions.map((assumption) => (
                    <p key={assumption}>{assumption}</p>
                  ))}
                </div>
              ) : null}

              <p className="insulin-note">
                IOB uses a {doseResult.insulinActionHours || INSULIN_ACTION_HOURS}-hour linear decay model and is only applied against correction insulin, not meal coverage.
              </p>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3>Daily Summary</h3>
          <p>Coming soon</p>
        </div>
      </div>
    </div>
  );
}

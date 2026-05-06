import { useEffect, useState } from 'react';
import {
  getGlucoseByDate,
  createGlucose,
} from '../api/services/glucoseService';

import { getInsulinByDate } from '../api/services/insulinService';
import { getSettings } from '../api/services/settingsService';
import '../styles/dashboard.css';
import GlucoseChart from '../components/GlucoseChart';
import { buildChartData } from '../utils/iob';

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

export default function GlucoseLogging() {
  const today = getLocalDateValue();
  const [glucoseData, setGlucoseData] = useState([]);
  const [insulinLogs, setInsulinLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [glucoseValue, setGlucoseValue] = useState('');
  const [viewDate, setViewDate] = useState(today);
  const [readingDate, setReadingDate] = useState(today);
  const [readingTime, setReadingTime] = useState(getLocalTimeValue());

  const fetchData = async (dateToLoad = viewDate) => {
    setLoading(true);
    setFetchError('');

    try {
      const [glucoseRes, insulinRes] = await Promise.all([
        getGlucoseByDate(dateToLoad),
        getInsulinByDate(dateToLoad),
      ]);

      const formattedGlucose = glucoseRes.data
        .map((entry) => ({
          id: entry.id,
          time: entry.logged_time?.slice(0, 5) || '00:00',
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
        const res = await getSettings();
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
    setSaveSuccess('');

    try {
      await createGlucose({
        glucose_level: numericGlucose,
        logged_at: `${readingDate}T${readingTime}:00`,
      });

      setGlucoseValue('');
      setReadingTime(getLocalTimeValue());
      setSaveSuccess(`Logged ${numericGlucose} mmol/L for ${readingDate} at ${readingTime}.`);

      if (readingDate !== viewDate) {
        setViewDate(readingDate);
      } else {
        await fetchData(readingDate);
      }
    } catch (err) {
      console.error('Error saving glucose reading:', err);
      setSaveError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Unable to save glucose reading.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const chartData = buildChartData(glucoseData, insulinLogs, viewDate);
  const hasChartData = chartData.length > 0;

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Glucose Logging</h1>

      <div className="dashboard-grid dashboard-grid--logging">
        <section className="card">
          <h3>Add Reading</h3>
          <p className="card-copy">Record a glucose value with the exact reading date and time.</p>

          <div className="glucose-controls glucose-controls--entry glucose-controls--stacked">
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
          {saveSuccess ? <p className="form-success">{saveSuccess}</p> : null}
        </section>

        <section className="card card--wide">
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
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import API from '../api/api';
import '../styles/dashboard.css';
import GlucoseAverageChart from '../components/GlucoseAverageChart';
import InsightList from '../components/InsightList';
import { createReportChartImageDataUrl } from '../utils/reportChart';
import { downloadReportPdf } from '../utils/reportPdf';

const AVERAGE_WINDOWS = [14, 30, 90];
const INSIGHT_WINDOW = 30;
const MAX_REPORT_DAYS = 90;

function getLocalDateValue(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getDateDaysAgoValue(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return getLocalDateValue(date);
}

function calculateInclusiveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatMetric(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${value}${suffix}` : 'No data';
}

function formatDelta(value, suffix = '') {
  if (!Number.isFinite(Number(value))) {
    return 'No comparison';
  }

  const numericValue = Number(value);
  return `${numericValue > 0 ? '+' : ''}${numericValue}${suffix}`;
}

export default function Dashboard() {
  const today = getLocalDateValue();
  const [averageWindow, setAverageWindow] = useState(14);
  const [averageData, setAverageData] = useState([]);
  const [averageMetrics, setAverageMetrics] = useState(null);
  const [trendComparison, setTrendComparison] = useState(null);
  const [dataQuality, setDataQuality] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [insights, setInsights] = useState([]);
  const [settings, setSettings] = useState(null);
  const [averageLoading, setAverageLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);
  const [averageError, setAverageError] = useState('');
  const [insightError, setInsightError] = useState('');
  const [reportStartDate, setReportStartDate] = useState(getDateDaysAgoValue(13));
  const [reportEndDate, setReportEndDate] = useState(today);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const fetchAverageData = async (daysToLoad = averageWindow) => {
    setAverageLoading(true);
    setAverageError('');

    try {
      const res = await API.get(`/glucose/averages?days=${daysToLoad}`);
      setAverageData(Array.isArray(res.data?.intervals) ? res.data.intervals : []);
      setAverageMetrics(res.data?.metrics || null);
      setTrendComparison(res.data?.trendComparison || null);
      setDataQuality(res.data?.dataQuality || null);
    } catch (err) {
      console.error('Error fetching glucose averages:', err);
      setAverageError('Unable to load average glucose trends.');
      setAverageData([]);
      setAverageMetrics(null);
      setTrendComparison(null);
    } finally {
      setAverageLoading(false);
    }
  };

  const fetchInsights = async () => {
    setInsightLoading(true);
    setInsightError('');

    try {
      const res = await API.get(`/glucose/insights?days=${INSIGHT_WINDOW}`);
      setInsights(Array.isArray(res.data?.insights) ? res.data.insights : []);
      setPrediction(res.data?.prediction || null);
      setDataQuality((current) => res.data?.dataQuality || current);
    } catch (err) {
      console.error('Error fetching glucose insights:', err);
      setInsightError('Unable to load pattern-based recommendations.');
      setInsights([]);
      setPrediction(null);
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    fetchAverageData(averageWindow);
  }, [averageWindow]);

  useEffect(() => {
    fetchInsights();
  }, []);

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
    setReportError('');
    setReportSuccess('');
  }, [reportStartDate, reportEndDate]);

  const handleGenerateReport = async () => {
    if (!reportStartDate || !reportEndDate) {
      setReportError('Select both a start and end date for the report.');
      return;
    }

    if (reportEndDate < reportStartDate) {
      setReportError('End date must be on or after the start date.');
      return;
    }

    const dayCount = calculateInclusiveDayCount(reportStartDate, reportEndDate);
    if (dayCount > MAX_REPORT_DAYS) {
      setReportError(`Report range must be ${MAX_REPORT_DAYS} days or fewer.`);
      return;
    }

    setIsGeneratingReport(true);
    setReportError('');
    setReportSuccess('');

    try {
      const res = await API.get(
        `/reports/summary?startDate=${reportStartDate}&endDate=${reportEndDate}`
      );
      const report = res.data;
      const chartImageDataUrl = await createReportChartImageDataUrl(report);
      const fileName = await downloadReportPdf(report, chartImageDataUrl);
      setReportSuccess(`Downloaded ${fileName}.`);
    } catch (err) {
      console.error('Error generating report:', err);
      setReportError(err.response?.data?.error || 'Unable to generate the PDF report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const latestPrediction = prediction?.points?.[1] || prediction?.points?.[0] || null;

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Analytics</h1>

      <div className="dashboard-grid dashboard-grid--analytics">
        <section className="card card--wide overview-card">
          <div>
            <h3>Clinical Overview</h3>
            <p className="card-copy">Key metrics from the selected aggregation window.</p>
          </div>

          <div className="metrics-grid">
            <div><span>Avg glucose</span><strong>{formatMetric(averageMetrics?.averageGlucose, ' mmol/L')}</strong></div>
            <div><span>Time In Range</span><strong>{formatMetric(averageMetrics?.timeInRangePercent, '%')}</strong></div>
            <div><span>Time Below Range</span><strong>{formatMetric(averageMetrics?.timeBelowRangePercent, '%')}</strong></div>
            <div><span>Time Above Range</span><strong>{formatMetric(averageMetrics?.timeAboveRangePercent, '%')}</strong></div>
            <div><span>Standard Deviation</span><strong>{formatMetric(averageMetrics?.standardDeviation, ' mmol/L')}</strong></div>
            <div><span>Coefficient Variation</span><strong>{formatMetric(averageMetrics?.coefficientOfVariation, '%')}</strong></div>
          </div>

          <div className="overview-meta">
            <span>Compared with previous {averageWindow} days: TIR {formatDelta(trendComparison?.timeInRangeDelta, '%')}, hypos {formatDelta(trendComparison?.hypoCountDelta)}</span>
            {dataQuality?.confidence ? <span className={`confidence-pill confidence-pill--${dataQuality.confidence}`}>{dataQuality.confidence} confidence</span> : null}
          </div>

          {latestPrediction ? (
            <p className="prediction-copy">Predicted glucose in {latestPrediction.minutesAhead} minutes: <strong>{latestPrediction.predictedGlucose} mmol/L</strong> ({prediction.confidence} confidence).</p>
          ) : null}

          {dataQuality?.warnings?.length ? (
            <p className="report-note">{dataQuality.warnings[0]}</p>
          ) : null}
        </section>

        <section className="card card--wide">
          <div className="averages-header">
            <div>
              <h3>Time-of-Day Averages</h3>
              <p className="card-copy">Average glucose across each 2-hour interval over recent history.</p>
            </div>

            <div className="window-toggle" role="tablist" aria-label="Average glucose time window">
              {AVERAGE_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`window-toggle__button ${averageWindow === days ? 'window-toggle__button--active' : ''}`}
                  onClick={() => setAverageWindow(days)}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          {averageError ? <p className="form-error">{averageError}</p> : null}

          {averageLoading ? (
            <p>Loading averages...</p>
          ) : (
            <GlucoseAverageChart
              data={averageData}
              days={averageWindow}
              targetMin={settings?.target_min}
              targetMax={settings?.target_max}
            />
          )}
        </section>

        <section className="card">
          <h3>Pattern-Based Insights</h3>
          <p className="card-copy">Rule-based observations from the last {INSIGHT_WINDOW} days.</p>

          {insightError ? <p className="form-error">{insightError}</p> : null}

          {insightLoading ? (
            <p>Loading insights...</p>
          ) : (
            <InsightList insights={insights} days={INSIGHT_WINDOW} />
          )}
        </section>

        <section className="card">
          <h3>Clinical Report</h3>
          <p className="card-copy">Generate a PDF with metrics, insights, a glucose chart, and time-of-day averages.</p>

          <div className="report-controls report-controls--stacked">
            <label>
              Start date
              <input
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
              />
            </label>

            <label>
              End date
              <input
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="button-primary"
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
            >
              {isGeneratingReport ? 'Generating...' : 'Generate report'}
            </button>
          </div>

          {reportError ? <p className="form-error">{reportError}</p> : null}
          {reportSuccess ? <p className="form-success">{reportSuccess}</p> : null}

          <p className="report-note">Reports are limited to {MAX_REPORT_DAYS} days and only include your signed-in data.</p>
        </section>
      </div>
    </div>
  );
}

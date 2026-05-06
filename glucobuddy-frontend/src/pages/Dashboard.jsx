import { useEffect, useState } from 'react';
import { getGlucoseAverages, getGlucoseInsights } from '../api/services/glucoseService';
import { getSettings } from '../api/services/settingsService';
import { getReportSummary } from '../api/services/reportService';
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
  if (!Number.isFinite(Number(value))) return 'No comparison';
  const numericValue = Number(value);
  return `${numericValue > 0 ? '+' : ''}${numericValue}${suffix}`;
}

// 🔥 NEW: overall status logic
function getOverallStatus(metrics) {
  if (!metrics) return null;

  if (metrics.timeAboveRangePercent > 40) {
    return { label: 'Above target range', level: 'high' };
  }

  if (metrics.timeInRangePercent > 70) {
    return { label: 'Good control', level: 'good' };
  }

  return { label: 'Moderate control', level: 'moderate' };
}

// 🔥 NEW: find peak interval
function getPeakInterval(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const max = data.reduce((prev, curr) =>
    curr.average > prev.average ? curr : prev
  );

  return max?.label || null;
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
      const res = await getGlucoseAverages(daysToLoad);

      setAverageData(res.data?.intervals || []);
      setAverageMetrics(res.data?.metrics || null);
      setTrendComparison(res.data?.trendComparison || null);
      setDataQuality(res.data?.dataQuality || null);
    } catch (err) {
      console.error(err);
      setAverageError('Unable to load average glucose trends.');
      setAverageData([]);
      setAverageMetrics(null);
    } finally {
      setAverageLoading(false);
    }
  };

  const fetchInsights = async () => {
    setInsightLoading(true);
    setInsightError('');

    try {
      const res = await getGlucoseInsights(INSIGHT_WINDOW);
      setInsights(res.data?.insights || []);
      setPrediction(res.data?.prediction || null);
      setDataQuality((current) => res.data?.dataQuality || current);
    } catch (err) {
      console.error(err);
      setInsightError('Unable to load pattern-based recommendations.');
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
    getSettings()
      .then(res => setSettings(res.data))
      .catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    setReportError('');
    setReportSuccess('');
  }, [reportStartDate, reportEndDate]);

  const handleGenerateReport = async () => {
    if (!reportStartDate || !reportEndDate) {
      setReportError('Select both dates.');
      return;
    }

    if (reportEndDate < reportStartDate) {
      setReportError('End date must be after start.');
      return;
    }

    const days = calculateInclusiveDayCount(reportStartDate, reportEndDate);

    if (days > MAX_REPORT_DAYS) {
      setReportError(`Max ${MAX_REPORT_DAYS} days.`);
      return;
    }

    setIsGeneratingReport(true);

    try {
      const res = await getReportSummary(reportStartDate, reportEndDate);
      const chart = await createReportChartImageDataUrl(res.data);
      const file = await downloadReportPdf(res.data, chart);
      setReportSuccess(`Downloaded ${file}`);
    } catch (err) {
      setReportError('Failed to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const latestPrediction =
    prediction?.points?.[1] || prediction?.points?.[0];

  const overallStatus = getOverallStatus(averageMetrics);
  const peakInterval = getPeakInterval(averageData);

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Analytics</h1>

      {/* 🔥 DATA QUALITY BANNER */}
      {dataQuality?.warnings?.length ? (
        <div className="data-warning">
          ⚠️ {dataQuality.warnings[0]}
        </div>
      ) : null}

      <div className="dashboard-grid dashboard-grid--analytics">

        {/* OVERVIEW */}
        <section className="card card--wide overview-card">
          <h3>Clinical Overview</h3>

          
          {overallStatus && (
            <p className={`overall-status overall-status--${overallStatus.level}`}>
              Overall status: {overallStatus.label}
            </p>
          )}

          <div className="metrics-grid">
            <div>
              <span>Avg glucose</span>
              <strong>{formatMetric(averageMetrics?.averageGlucose, ' mmol/L')}</strong>
            </div>

            <div>
              <span>Time In Range</span>
              <strong>{formatMetric(averageMetrics?.timeInRangePercent, '%')}</strong>
            </div>

            <div>
              <span>Time Below</span>
              <strong>{formatMetric(averageMetrics?.timeBelowRangePercent, '%')}</strong>
            </div>

            <div>
              <span>Time Above</span>
              <strong>{formatMetric(averageMetrics?.timeAboveRangePercent, '%')}</strong>
            </div>

            <div>
              <span>SD</span>
              <strong>{formatMetric(averageMetrics?.standardDeviation, ' mmol/L')}</strong>
            </div>

            <div>
              <span>CV</span>
              <strong>{formatMetric(averageMetrics?.coefficientOfVariation, '%')}</strong>
            </div>
          </div>

          {/* 🔥 CLEAN COMPARISON */}
          <div className="overview-meta">
            <p>
              Compared to previous {averageWindow} days:
            </p>
            <ul>
              <li>TIR: {formatDelta(trendComparison?.timeInRangeDelta, '%')}</li>
              <li>Hypos: {formatDelta(trendComparison?.hypoCountDelta)}</li>
            </ul>
          </div>

          {/* 🔥 CLEAN PREDICTION */}
          {latestPrediction && (
            <p className="prediction-copy">
              Predicted glucose ({latestPrediction.minutesAhead / 60}h):{' '}
              <strong>{latestPrediction.predictedGlucose} mmol/L</strong>
            </p>
          )}
        </section>

        {/* AVERAGES */}
        <section className="card card--wide">
          <div className="averages-header">
            <h3>Time-of-Day Averages</h3>

            <div className="window-toggle">
              {AVERAGE_WINDOWS.map(days => (
                <button
                  key={days}
                  onClick={() => setAverageWindow(days)}
                  className={`window-toggle__button ${
                    averageWindow === days ? 'window-toggle__button--active' : ''
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          {/* 🔥 TARGET RANGE LABEL */}
          {settings && (
            <p className="target-range">
              Target range: {settings.target_min} – {settings.target_max} mmol/L
            </p>
          )}

          {averageLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <GlucoseAverageChart
                data={averageData}
                days={averageWindow}
                targetMin={settings?.target_min}
                targetMax={settings?.target_max}
              />

              {/* 🔥 PEAK INSIGHT */}
              {peakInterval && (
                <p className="chart-insight">
                  Highest average glucose: {peakInterval}
                </p>
              )}
            </>
          )}
        </section>

        {/* INSIGHTS */}
        <section className="card">
          <h3>Pattern-Based Insights</h3>

          {insightLoading ? (
            <p>Loading...</p>
          ) : (
            <InsightList insights={insights} />
          )}
        </section>

        {/* REPORT */}
        <section className="card">
          <h3>Clinical Report</h3>
          <p className="card-copy card-copy--tight">
            Generate a PDF with metrics, insights, and glucose trends for a selected date range.
          </p>

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

          {reportError && <p className="form-error">{reportError}</p>}
          {reportSuccess && <p className="form-success">{reportSuccess}</p>}
        </section>

      </div>
    </div>
  );
}
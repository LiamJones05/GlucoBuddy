import { useEffect, useState } from 'react';
import { getGlucoseAverages, getGlucoseInsights } from '../api/services/glucoseService';
import { getSettings } from '../api/services/settingsService';
import { getReportSummary } from '../api/services/reportService';
import '../styles/dashboard.css';
import GlucoseAverageChart from '../components/GlucoseAverageChart';
import InsightList from '../components/InsightList';
import TIRDonutChart from '../components/TIRDonutChart';
import { createReportChartImageDataUrl } from '../utils/reportChart';
import { downloadReportPdf } from '../utils/reportPdf';
import OutcomePromptCard from '../components/OutcomePromptCard';

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
  const end   = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatMetric(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${value}${suffix}` : '—';
}

function formatDelta(value, suffix = '') {
  if (!Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return { value: `${Math.abs(n)}${suffix}`, direction: n > 0 ? 'up' : n < 0 ? 'down' : 'flat', raw: n };
}

function getOverallStatus(metrics) {
  if (!metrics) return null;
  if (metrics.timeAboveRangePercent > 40) return { label: 'Above target range', level: 'high' };
  if (metrics.timeInRangePercent > 70)    return { label: 'Good control',        level: 'good' };
  return { label: 'Moderate control', level: 'moderate' };
}

function getPeakInterval(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.reduce((prev, curr) => curr.average > prev.average ? curr : prev)?.label || null;
}

function DeltaIndicator({ delta, positiveIsGood = true }) {
  if (!delta) return <span className="delta delta--neutral">No comparison</span>;
  const isGood = positiveIsGood ? delta.raw > 0 : delta.raw < 0;
  const isFlat = delta.raw === 0;
  const cls = isFlat ? 'neutral' : isGood ? 'good' : 'bad';
  const arrow = isFlat ? '→' : delta.raw > 0 ? '↑' : '↓';
  return (
    <span className={`delta delta--${cls}`}>
      {arrow} {delta.value}
    </span>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="stat-tile" style={{ '--tile-accent': accent }}>
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value">{value}</strong>
    </div>
  );
}

export default function Dashboard() {
  const today = getLocalDateValue();

  const [averageWindow,    setAverageWindow]    = useState(14);
  const [averageData,      setAverageData]      = useState([]);
  const [averageMetrics,   setAverageMetrics]   = useState(null);
  const [trendComparison,  setTrendComparison]  = useState(null);
  const [dataQuality,      setDataQuality]      = useState(null);
  const [prediction,       setPrediction]       = useState(null);
  const [insights,         setInsights]         = useState([]);
  const [settings,         setSettings]         = useState(null);

  const [averageLoading, setAverageLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);
  const [averageError,   setAverageError]   = useState('');
  const [insightError,   setInsightError]   = useState('');

  const [reportStartDate,     setReportStartDate]     = useState(getDateDaysAgoValue(13));
  const [reportEndDate,       setReportEndDate]       = useState(today);
  const [reportError,         setReportError]         = useState('');
  const [reportSuccess,       setReportSuccess]       = useState('');
  const [isGeneratingReport,  setIsGeneratingReport]  = useState(false);

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
      setDataQuality(current => res.data?.dataQuality || current);
    } catch (err) {
      console.error(err);
      setInsightError('Unable to load pattern-based recommendations.');
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => { fetchAverageData(averageWindow); }, [averageWindow]);
  useEffect(() => { fetchInsights(); },                []);
  useEffect(() => {
    getSettings().then(res => setSettings(res.data)).catch(() => setSettings(null));
  }, []);
  useEffect(() => { setReportError(''); setReportSuccess(''); }, [reportStartDate, reportEndDate]);

  const handleGenerateReport = async () => {
    if (!reportStartDate || !reportEndDate) { setReportError('Select both dates.'); return; }
    if (reportEndDate < reportStartDate)    { setReportError('End date must be after start.'); return; }
    const days = calculateInclusiveDayCount(reportStartDate, reportEndDate);
    if (days > MAX_REPORT_DAYS)             { setReportError(`Max ${MAX_REPORT_DAYS} days.`); return; }
    setIsGeneratingReport(true);
    try {
      const res   = await getReportSummary(reportStartDate, reportEndDate);
      const chart = await createReportChartImageDataUrl(res.data);
      const file  = await downloadReportPdf(res.data, chart);
      setReportSuccess(`Downloaded ${file}`);
    } catch {
      setReportError('Failed to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const latestPrediction = prediction?.points?.[1] || prediction?.points?.[0];
  const overallStatus    = getOverallStatus(averageMetrics);
  const peakInterval     = getPeakInterval(averageData);
  const tirDelta         = formatDelta(trendComparison?.timeInRangeDelta, '%');
  const hypoDelta        = formatDelta(trendComparison?.hypoCountDelta);

  return (
    <div className="dashboard">
      <OutcomePromptCard onOutcomeSubmitted={() => fetchAverageData(averageWindow)} />
      <h1 className="dashboard-title">Analytics</h1>

      {dataQuality?.warnings?.length ? (
        <div className="data-warning">{dataQuality.warnings[0]}</div>
      ) : null}

      <div className="dashboard-grid dashboard-grid--analytics">

        {/* ── OVERVIEW ── */}
        <section className="card card--wide overview-card">
          <div className="overview-card__header">
            <div>
              <h3>Clinical Overview</h3>
              {overallStatus && (
                <span className={`status-pill status-pill--${overallStatus.level}`}>
                  {overallStatus.label}
                </span>
              )}
            </div>

            {latestPrediction && (
              <div className="prediction-callout">
                <span className="prediction-callout__label">
                  Predicted ({latestPrediction.minutesAhead / 60}h)
                </span>
                <span className="prediction-callout__value">
                  {latestPrediction.predictedGlucose} mmol/L
                </span>
              </div>
            )}
          </div>

          <div className="overview-card__body">
            {/* Donut */}
            <div className="overview-card__donut">
              <TIRDonutChart metrics={averageMetrics} />
            </div>

            {/* Stat tiles + comparison */}
            <div className="overview-card__stats">
              <div className="stat-tiles">
                <StatTile
                  label="Avg Glucose"
                  value={formatMetric(averageMetrics?.averageGlucose, ' mmol/L')}
                  accent="#3b82f6"
                />
                <StatTile
                  label="Std Deviation"
                  value={formatMetric(averageMetrics?.standardDeviation, ' mmol/L')}
                  accent="#8b5cf6"
                />
                <StatTile
                  label="CV"
                  value={formatMetric(averageMetrics?.coefficientOfVariation, '%')}
                  accent="#6366f1"
                />
              </div>

              <div className="comparison-block">
                <p className="comparison-block__title">vs previous {averageWindow} days</p>
                <div className="comparison-block__rows">
                  <div className="comparison-block__row">
                    <span>Time in range</span>
                    <DeltaIndicator delta={tirDelta} positiveIsGood={true} />
                  </div>
                  <div className="comparison-block__row">
                    <span>Hypos</span>
                    <DeltaIndicator delta={hypoDelta} positiveIsGood={false} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── AVERAGES ── */}
        <section className="card card--wide">
          <div className="averages-header">
            <h3>Time-of-Day Averages</h3>
            <div className="window-toggle">
              {AVERAGE_WINDOWS.map(days => (
                <button
                  key={days}
                  onClick={() => setAverageWindow(days)}
                  className={`window-toggle__button${averageWindow === days ? ' window-toggle__button--active' : ''}`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          {settings && (
            <p className="target-range">
              Target range: {settings.target_min} – {settings.target_max} mmol/L
            </p>
          )}

          {averageLoading ? <p>Loading...</p> : (
            <>
              <GlucoseAverageChart
                data={averageData}
                days={averageWindow}
                targetMin={settings?.target_min}
                targetMax={settings?.target_max}
              />
              {peakInterval && (
                <p className="chart-insight">Highest average glucose: {peakInterval}</p>
              )}
            </>
          )}
        </section>

        {/* ── INSIGHTS ── */}
        <section className="card">
          <h3>Pattern-Based Insights</h3>
          {insightLoading ? <p>Loading...</p> : <InsightList insights={insights} />}
          {insightError ? <p className="form-error">{insightError}</p> : null}
        </section>

        {/* ── REPORT ── */}
        <section className="card">
          <h3>Clinical Report</h3>
          <p className="card-copy card-copy--tight">
            Generate a PDF with metrics, insights, and glucose trends for a selected date range.
          </p>

          <div className="report-controls report-controls--stacked">
            <label>
              Start date
              <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
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

          {reportError   && <p className="form-error">{reportError}</p>}
          {reportSuccess && <p className="form-success">{reportSuccess}</p>}
        </section>

      </div>
    </div>
  );
}
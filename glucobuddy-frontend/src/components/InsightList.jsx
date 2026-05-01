function formatConfidence(value) {
  if (!Number.isFinite(Number(value))) {
    return 'Confidence unavailable';
  }

  return `${Math.round(Number(value) * 100)}% confidence`;
}

export default function InsightList({ insights, days }) {
  if (!insights.length) {
    return (
      <p className="chart-empty">
        No clear glucose patterns stand out over the last {days} days yet.
      </p>
    );
  }

  return (
    <div className="insights-list">
      {insights.map((insight) => {
        const category = insight.category === 'safety' ? 'safety' : 'trend';
        const severity = insight.severity || 'low';

        return (
          <article
            key={insight.id}
            className={`insight-card insight-card--${category} insight-card--${severity}`}
          >
            <div className="insight-card__meta">
              <span className={`insight-badge insight-badge--${category}`}>
                {category === 'safety' ? 'Safety' : 'Trend'}
              </span>
              <span className={`insight-severity insight-severity--${severity}`}>
                {severity} risk
              </span>
            </div>
            <p>{insight.message}</p>
            <small>
              {formatConfidence(insight.confidence)}
              {insight.evidence?.text ? ` · ${insight.evidence.text}` : ''}
            </small>
          </article>
        );
      })}
    </div>
  );
}

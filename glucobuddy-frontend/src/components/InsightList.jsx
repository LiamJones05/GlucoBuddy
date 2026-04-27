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
      {insights.map((insight) => (
        <article
          key={insight.id}
          className={`insight-card insight-card--${insight.category}`}
        >
          <span className={`insight-badge insight-badge--${insight.category}`}>
            {insight.category === 'safety' ? 'Safety' : 'Trend'}
          </span>
          <p>{insight.message}</p>
        </article>
      ))}
    </div>
  );
}

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function getYDomain(data, targetMin, targetMax) {
  const values = data
    .map((entry) => entry.averageGlucose)
    .filter((value) => Number.isFinite(value));

  if (Number.isFinite(targetMin)) {
    values.push(targetMin);
  }

  if (Number.isFinite(targetMax)) {
    values.push(targetMax);
  }

  if (values.length === 0) {
    return [0, 10];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? 1 : Math.max(0.5, (max - min) * 0.15);

  return [
    Math.max(0, Number((min - padding).toFixed(1))),
    Number((max + padding).toFixed(1)),
  ];
}

function getBarColor(value, targetMin, targetMax) {
  if (!Number.isFinite(value)) {
    return '#cbd5e1';
  }

  if (Number.isFinite(targetMin) && value < targetMin) {
    return '#ef4444';
  }

  if (Number.isFinite(targetMax) && value > targetMax) {
    return '#f59e0b';
  }

  return '#0f766e';
}

export default function GlucoseAverageChart({ data, days, targetMin, targetMax }) {
  const hasTargetRange =
    Number.isFinite(targetMin) &&
    Number.isFinite(targetMax) &&
    targetMin < targetMax;
  const hasAverageData = data.some((entry) => Number.isFinite(entry.averageGlucose));
  const yDomain = getYDomain(data, targetMin, targetMax);

  if (!hasAverageData) {
    return <p className="chart-empty">No glucose readings available in the last {days} days.</p>;
  }

  return (
    <div className="chart-container chart-container--averages">
      <p className="chart-subtitle">Average glucose for each 2-hour interval across the last {days} days</p>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />

          {hasTargetRange ? (
            <ReferenceArea
              y1={targetMin}
              y2={targetMax}
              fill="#86efac"
              fillOpacity={0.18}
              ifOverflow="extendDomain"
            />
          ) : null}

          <XAxis dataKey="label" tick={{ fontSize: 12 }} tickMargin={8} interval={0} />
          <YAxis domain={yDomain} tickCount={6} width={56} />

          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || ''}
            formatter={(value, _name, item) => {
              const readingCount = item?.payload?.readingCount ?? 0;

              if (!Number.isFinite(Number(value))) {
                return ['No readings', 'Average'];
              }

              return [`${Number(value).toFixed(1)} mmol/L from ${readingCount} readings`, 'Average'];
            }}
          />

          <Bar dataKey="averageGlucose" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.bucketIndex}
                fill={getBarColor(entry.averageGlucose, targetMin, targetMax)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="chart-footnote">Each bar combines readings recorded in the same 2-hour window over the selected period.</p>
    </div>
  );
}

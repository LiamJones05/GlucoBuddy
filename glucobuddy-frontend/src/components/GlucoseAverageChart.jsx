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

const isMobile = window.innerWidth < 768;

function getYDomain(data, targetMin, targetMax) {
  const numericTargetMin = Number(targetMin);
  const numericTargetMax = Number(targetMax);
  const values = data
    .map((entry) => Number(entry.averageGlucose))
    .filter((value) => Number.isFinite(value));

  if (Number.isFinite(numericTargetMin)) {
    values.push(numericTargetMin);
  }

  if (Number.isFinite(numericTargetMax)) {
    values.push(numericTargetMax);
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

function getBarColor(entry, targetMin, targetMax) {
  if (entry.status === 'below-range') {
    return '#ef4444';
  }

  if (entry.status === 'above-range') {
    return '#f59e0b';
  }

  if (entry.status === 'in-range') {
    return '#0f766e';
  }

  const value = Number(entry.averageGlucose);
  const numericTargetMin = Number(targetMin);
  const numericTargetMax = Number(targetMax);

  if (!Number.isFinite(value)) {
    return '#cbd5e1';
  }

  if (Number.isFinite(numericTargetMin) && value < numericTargetMin) {
    return '#ef4444';
  }

  if (Number.isFinite(numericTargetMax) && value > numericTargetMax) {
    return '#f59e0b';
  }

  return '#0f766e';
}

export default function GlucoseAverageChart({ data, days, targetMin, targetMax }) {
  const numericTargetMin = Number(targetMin);
  const numericTargetMax = Number(targetMax);
  const hasTargetRange =
    Number.isFinite(numericTargetMin) &&
    Number.isFinite(numericTargetMax) &&
    numericTargetMin < numericTargetMax;
  const hasAverageData = data.some((entry) => Number.isFinite(Number(entry.averageGlucose)));
  const yDomain = getYDomain(data, numericTargetMin, numericTargetMax);

  if (!hasAverageData) {
    return <p className="chart-empty">No glucose readings available in the last {days} days.</p>;
  }

  return (
    <div className="chart-container chart-container--averages">
      <p className="chart-subtitle">Average glucose for each 2-hour interval across the last {days} days</p>

      <ResponsiveContainer 
      width="100%" 
      height={isMobile ? 320 : 400}>
        <BarChart
          data={data}
          margin={{
            top: 16,
            right: isMobile ? 4 : 16,
            bottom: isMobile ? 40 : 8,
            left: isMobile ? -12 : 0,
          }}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />

          {hasTargetRange ? (
            <ReferenceArea
              y1={numericTargetMin}
              y2={numericTargetMax}
              fill="#86efac"
              fillOpacity={0.18}
              ifOverflow="extendDomain"
            />
          ) : null}

          <XAxis
            dataKey="label"
            tick={{ fontSize: isMobile ? 9 : 12 }}
            tickMargin={isMobile ? 12 : 8}
            interval={isMobile? 1: 0 }
          />
          <YAxis
            domain={yDomain}
            tickCount={isMobile ? 4 : 6}
            width={isMobile ? 36 : 56}
            tick={{ fontSize: isMobile ? 10 : 12 }}
          />

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
                fill={getBarColor(entry, numericTargetMin, numericTargetMax)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="chart-footnote">Each bar combines readings recorded in the same 2-hour window over the selected period.</p>
    </div>
  );
}
